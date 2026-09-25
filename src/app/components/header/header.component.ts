import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, ElementRef, HostListener, Input, OnDestroy, OnInit, Output, EventEmitter, ViewChild, inject } from "@angular/core";
import { APP_LANGUAGES, AppLanguage, applyDocumentLanguage, DEFAULT_LANGUAGE, findLanguage } from '../../i18n/languages';
import { LanguageFlagComponent } from '../../i18n/language-flag.component';
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { NavigationEnd, Router } from "@angular/router";
import { Subject, Subscription } from "rxjs";
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SearchService } from "../../services/search.service";
import { debounceTime, distinctUntilChanged, filter as rxFilter, switchMap, tap } from "rxjs/operators";
import { Suggestion, SearchFilters } from "../../models/document.models";
import { DocumentApiService } from "../../services/document-api.service";
import { SearchFiltersComponent } from "../search-filters/search-filters.component";
import { clearRecentSearches, countActiveFilters, highlightTerms, loadRecentSearches, removeRecentSearch, sanitizeSnippet as sanitizeSnippetHtml, saveRecentSearch } from "../../models/search-refine";
import { isCompactViewport } from "../../utils/layout.util";
import { TranslateService, TranslatePipe } from "@ngx-translate/core";
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchFiltersComponent, MatIconModule, MatTooltipModule, TranslatePipe, MatMenuModule, MatButtonModule, LanguageFlagComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  searchQuery: string = '';
  suggestions: Suggestion[] = [];
  showFilters = false;
  userInitials: string = '';
  currentFilters?: SearchFilters;
  suggestionTimeMs: number = 0;

  // ----- Search box state -----
  searchFocused = false;
  /** Suggestions / recent searches panel. */
  suggestionsOpen = false;
  /** Phones: the search takes the whole header while it is being used. */
  searchExpanded = false;
  /** Keyboard-highlighted option of the panel (-1: none). */
  activeIndex = -1;
  recentSearches: string[] = loadRecentSearches();

  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('searchBox') private searchBox?: ElementRef<HTMLElement>;
  private wasOnSearchPage = false;
  private subscriptions = new Subscription();

  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;
  private suggestionStartTime: number = 0;

  private searchService = inject(SearchService);
  private apiService = inject(DocumentApiService);
  private router = inject(Router);
  private elementRef = inject(ElementRef);
  private translate = inject(TranslateService);
  private sanitizer = inject(DomSanitizer);

  // Language selector — shared with the public signing page so the two never drift.
  availableLanguages = APP_LANGUAGES;
  currentLanguage = findLanguage(DEFAULT_LANGUAGE) ?? this.availableLanguages[0];

  @Input() hasSelection: boolean = false;
  @Input() set userData(value: any) {
    if (value) {
      const data = value.userData || value;
      this.calculateInitials(data);
    }
  }

  @Output() mobileMenuToggle = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  constructor() { }

  ngOnInit(): void {
    // Initialize language from localStorage or browser default
    this.initializeLanguage();

    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => this.suggestionStartTime = performance.now()),
      switchMap(query => this.searchService.getSuggestions(query))
    ).subscribe(suggestions => {
      this.suggestionTimeMs = Math.round(performance.now() - this.suggestionStartTime);
      this.suggestions = suggestions;
    });

    // Keep header filters in sync (e.g. when cleared from search results page)
    this.searchService.filters$.subscribe(filters => {
      this.currentFilters = filters;
    });

    // "All filters" on the results page opens this panel. Deferred: the click that asked for it
    // is still bubbling up to the document listener, which would close it again straight away.
    this.subscriptions.add(this.searchService.advancedFiltersRequested$.subscribe(() => {
      setTimeout(() => this.showFilters = true);
    }));

    // The box mirrors the query of the results page (Back / Forward, links), and empties once
    // the user leaves the results
    this.syncQueryWithUrl(this.router.url);
    this.subscriptions.add(this.router.events.pipe(rxFilter(e => e instanceof NavigationEnd)).subscribe(e => {
      this.syncQueryWithUrl((e as NavigationEnd).urlAfterRedirects);
    }));
  }

  private initializeLanguage(): void {
    const savedLang = localStorage.getItem('preferredLanguage');
    const browserLang = this.translate.getBrowserLang();
    const supportedLangs = ['en', 'fr', 'de', 'ar', 'es', 'pt', 'it', 'nl'];
    const defaultLang = savedLang || (browserLang && supportedLangs.includes(browserLang) ? browserLang : 'en');

    this.currentLanguage = this.availableLanguages.find(l => l.code === defaultLang) || this.availableLanguages[0];
    this.translate.use(this.currentLanguage.code);
    this.updateDocumentDirection(this.currentLanguage.code);
  }

  switchLanguage(lang: AppLanguage): void {
    this.currentLanguage = lang;
    this.translate.use(lang.code);
    localStorage.setItem('preferredLanguage', lang.code);
    this.updateDocumentDirection(lang.code);
  }

  private updateDocumentDirection(langCode: string): void {
    applyDocumentLanguage(langCode);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.suggestionsOpen && this.searchBox) {
      const insideBox = event.composedPath().includes(this.searchBox.nativeElement);
      if (!insideBox) {
        this.closeSuggestions();
      }
    }
    if (this.showFilters) {
      // composedPath(): a control that re-renders itself on click is detached by now.
      const clickedInside = event.composedPath().includes(this.elementRef.nativeElement);
      if (!clickedInside) {
        this.showFilters = false;
      }
    }
  }

  /** "/" or Ctrl/Cmd+K anywhere (outside a text field) puts the cursor in the search box. */
  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent) {
    const isSlash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey;
    const isCtrlK = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k';
    if (!isSlash && !isCtrlK) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (typing && !isCtrlK) {
      return;
    }
    if (document.querySelector('.cdk-overlay-container .cdk-overlay-pane .mat-mdc-dialog-container')) {
      return; // a dialog is open: leave its keyboard alone
    }
    event.preventDefault();
    this.focusSearch();
  }

  focusSearch(): void {
    this.searchInput?.nativeElement.focus();
    this.searchInput?.nativeElement.select();
  }

  /** Items of the panel, in keyboard order. */
  private get optionCount(): number {
    if (!this.searchQuery.trim()) {
      return this.recentSearches.length;
    }
    return 1 + this.suggestions.length;
  }

  get dropdownOpen(): boolean {
    if (!this.suggestionsOpen || this.showFilters) {
      return false;
    }
    return this.searchQuery.trim() ? true : this.recentSearches.length > 0;
  }

  get activeOptionId(): string | null {
    return this.dropdownOpen && this.activeIndex >= 0 ? 'header-search-option-' + this.activeIndex : null;
  }

  get activeFilterCount(): number {
    return countActiveFilters(this.currentFilters);
  }

  onSearchFocus(): void {
    this.searchFocused = true;
    this.suggestionsOpen = true;
    this.activeIndex = -1;
    this.recentSearches = loadRecentSearches();
    if (isCompactViewport()) {
      this.searchExpanded = true;
    }
    if (this.searchQuery.trim() && this.suggestions.length === 0) {
      // A query already in the box (e.g. back on the results page): offer its quick matches
      this.searchSubject.next(this.searchQuery);
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.suggestionsOpen = true;
        if (this.optionCount > 0) {
          this.activeIndex = (this.activeIndex + 1) % this.optionCount;
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.optionCount > 0) {
          this.activeIndex = this.activeIndex <= 0 ? this.optionCount - 1 : this.activeIndex - 1;
        }
        break;
      case 'Enter':
        event.preventDefault();
        this.activateOption();
        break;
      case 'Escape':
        if (this.dropdownOpen) {
          event.preventDefault();
          event.stopPropagation();
          this.closeSuggestions();
        } else {
          this.collapseSearch();
        }
        break;
      case 'Tab':
        this.closeSuggestions();
        break;
    }
  }

  /** Enter: the highlighted option, or the full search. */
  private activateOption(): void {
    const query = this.searchQuery.trim();
    if (!query) {
      const recent = this.recentSearches[this.activeIndex];
      if (recent) {
        this.runSearch(recent);
      }
      return;
    }
    if (this.activeIndex >= 1 && this.suggestions[this.activeIndex - 1]) {
      this.selectSuggestion(this.suggestions[this.activeIndex - 1]);
      return;
    }
    this.onSearch();
  }

  onSearchInput(): void {
    this.suggestionsOpen = true;
    this.activeIndex = -1;
    this.searchSubject.next(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.suggestions = [];
    this.searchSubject.next('');
    this.activeIndex = -1;
    this.searchInput?.nativeElement.focus();
  }

  onSearch(): void {
    this.runSearch(this.searchQuery);
  }

  runSearch(query: string): void {
    const value = query.trim();
    if (!value) {
      return;
    }
    this.searchQuery = value;
    this.recentSearches = saveRecentSearch(value);
    this.router.navigate(['/search'], { queryParams: { q: value } });
    this.suggestions = [];
    this.closeSuggestions();
    this.collapseSearch();
  }

  onRemoveRecent(query: string, event: Event): void {
    event.stopPropagation();
    this.recentSearches = removeRecentSearch(query);
    this.activeIndex = -1;
  }

  onClearRecent(event: Event): void {
    event.stopPropagation();
    clearRecentSearches();
    this.recentSearches = [];
  }

  closeSuggestions(): void {
    this.suggestionsOpen = false;
    this.activeIndex = -1;
  }

  /** Phones: back to the normal header. */
  collapseSearch(): void {
    this.closeSuggestions();
    this.searchFocused = false;
    this.searchExpanded = false;
    this.searchInput?.nativeElement.blur();
  }

  @HostListener('focusout', ['$event'])
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (this.searchBox && next && this.searchBox.nativeElement.contains(next)) {
      return;
    }
    if (event.target === this.searchInput?.nativeElement) {
      this.searchFocused = false;
      if (!isCompactViewport()) {
        this.searchExpanded = false;
      }
    }
  }

  private syncQueryWithUrl(url: string): void {
    const onSearchPage = url.startsWith('/search');
    if (onSearchPage) {
      this.searchQuery = this.router.parseUrl(url).queryParams['q'] ?? '';
    } else if (this.wasOnSearchPage) {
      this.searchQuery = '';
      this.suggestions = [];
    }
    this.wasOnSearchPage = onSearchPage;
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
    if (this.showFilters) {
      this.closeSuggestions();
    }
  }

  closeFilters() {
    this.showFilters = false;
  }

  onMobileMenuToggle() {
    this.mobileMenuToggle.emit();
  }

  hasActiveFilters(): boolean {
    if (!this.currentFilters) return false;

    return !!(
      this.currentFilters.type ||
      (this.currentFilters.fileType && this.currentFilters.fileType !== 'any') ||
      (this.currentFilters.dateModified && this.currentFilters.dateModified !== 'any') ||
      this.currentFilters.owner ||
      (this.currentFilters.metadata && this.currentFilters.metadata.length > 0) ||
      this.currentFilters.category || this.currentFilters.language
    );
  }

  onFiltersChanged(filters: SearchFilters) {
    this.currentFilters = filters;
    this.searchService.updateFilters(filters);

    // A query typed in the box (not yet searched): filters + query = a search
    const typedQuery = this.searchQuery.trim();
    if (typedQuery && !this.router.url.startsWith('/search')) {
      this.recentSearches = saveRecentSearch(typedQuery);
      this.router.navigate(['/search'], { queryParams: { q: typedQuery } });
      return;
    }

    // For broad scope searches, navigate to search results page if not already on file-explorer or search
    if (filters.scope === 'ALL' || filters.scope === 'CURRENT_AND_SUBFOLDERS') {
      const currentUrl = this.router.url;
      if (!currentUrl.startsWith('/my-folder') && !currentUrl.startsWith('/search')) {
        // From dashboard or other pages, navigate to search with scope (root folder)
        const queryParams: any = { scope: filters.scope };
        this.router.navigate(['/search'], { queryParams });
      }
    }
  }

  selectSuggestion(suggestion: Suggestion): void {
    // Clear suggestions and search query
    this.suggestions = [];
    this.searchQuery = '';
    this.collapseSearch();

    // ext is undefined/null for folders, string (possibly empty) for files
    const isFolder = suggestion.ext == null;

    if (isFolder) {
      // Navigate to folder with folderId param
      this.router.navigate(['/my-folder'], {
        queryParams: { folderId: suggestion.id }
      });
    } else {
      // Navigate to file's parent folder with target file info
      this.router.navigate(['/my-folder'], {
        queryParams: { targetFileId: suggestion.id }
      });
    }
  }

  ngOnDestroy(): void {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
    this.subscriptions.unsubscribe();
  }

  getIconForExtension(ext: string | undefined): string {
    if (ext == null) {
      return 'fa-solid fa-folder'; // Folder icon
    }

    switch (ext.toLowerCase()) {
      case 'pdf':
        return 'fa-solid fa-file-pdf';
      case 'doc':
      case 'docx':
        return 'fa-solid fa-file-word';
      case 'xls':
      case 'xlsx':
        return 'fa-solid fa-file-excel';
      case 'ppt':
      case 'pptx':
        return 'fa-solid fa-file-powerpoint';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return 'fa-solid fa-file-image';
      case 'zip':
      case 'rar':
        return 'fa-solid fa-file-zipper';
      case 'txt':
        return 'fa-solid fa-file-lines';
      default:
        return 'fa-solid fa-file'; // Generic file icon
    }
  }

  protected onDownload(suggestion: Suggestion, event: MouseEvent) {
    event.stopPropagation();

    console.log(`Downloading document with ID: ${suggestion.id}`);
    this.apiService.downloadDocument(suggestion.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        if (suggestion.ext == null) {
          a.download = suggestion.s + ".zip";
        } else if (suggestion.ext.length > 0) {
          a.download = suggestion.s + "." + suggestion.ext;
        } else {
          a.download = suggestion.s;
        }
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.debug(error);
      }
    });

    this.suggestions = [];
    this.closeSuggestions();
  }

  protected onOpen(suggestion: Suggestion, event: MouseEvent) {
    event.stopPropagation();

    // Clear suggestions and search query
    this.suggestions = [];
    this.searchQuery = '';
    this.collapseSearch();

    // ext is undefined/null for folders, string (possibly empty) for files
    const isFolder = suggestion.ext == null;

    if (isFolder) {
      // Open folder in file explorer (same as clicking folder icon/name)
      this.router.navigate(['/my-folder'], { queryParams: { folderId: suggestion.id } });
    } else {
      // Navigate to file's parent folder, focus the file, and open file viewer
      this.router.navigate(['/my-folder'], {
        queryParams: { targetFileId: suggestion.id, openViewer: 'true' }
      });
    }
  }

  private calculateInitials(userData: any) {
    if (!userData) return;
    const name = userData.name || userData.preferred_username || 'User';

    if (userData.given_name && userData.family_name) {
      this.userInitials = (userData.given_name[0] + userData.family_name[0]).toUpperCase();
    } else if (name.includes(' ')) {
      const parts = name.split(' ');
      if (parts.length >= 2) {
        this.userInitials = (parts[0][0] + parts[1][0]).toUpperCase();
      } else {
        this.userInitials = name.substring(0, 2).toUpperCase();
      }
    } else {
      this.userInitials = name.substring(0, 2).toUpperCase();
    }
  }

  sanitizeSnippet(snippet: string): SafeHtml {
    // Everything escaped except the engine's <mark> tags
    return this.sanitizer.bypassSecurityTrustHtml(sanitizeSnippetHtml(snippet));
  }

  getFullName(suggestion: Suggestion): string {
    if (suggestion.ext == null) return suggestion.s;
    if (suggestion.ext.length === 0) return suggestion.s;
    return `${suggestion.s}.${suggestion.ext}`;
  }

  highlightMatch(suggestion: Suggestion): SafeHtml {
    // Escaped name, query terms wrapped in <mark>
    return this.sanitizer.bypassSecurityTrustHtml(highlightTerms(this.getFullName(suggestion), this.searchQuery));
  }

  getFileTypeLabel(ext: string | undefined): string {
    if (ext == null) return 'Folder';
    switch (ext.toLowerCase()) {
      case 'pdf': return 'PDF';
      case 'doc': case 'docx': return 'Word';
      case 'xls': case 'xlsx': return 'Excel';
      case 'ppt': case 'pptx': return 'PowerPoint';
      case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': return 'Image';
      case 'zip': case 'rar': case '7z': case 'tar': case 'gz': return 'Archive';
      case 'txt': return 'Text';
      case 'md': return 'Markdown';
      case 'json': return 'JSON';
      case 'xml': return 'XML';
      case 'html': case 'htm': return 'HTML';
      case 'css': return 'CSS';
      case 'js': case 'ts': return 'Code';
      case 'sql': return 'SQL';
      case 'mp4': case 'avi': case 'mov': case 'mkv': return 'Video';
      case 'mp3': case 'wav': case 'ogg': case 'flac': return 'Audio';
      default: return ext.toUpperCase();
    }
  }

  navigateToSettings() {
    this.router.navigate(['/settings']);
  }

  onLogout() {
    this.logout.emit();
  }
}