import { Component, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Event as RouterEvent, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { OidcSecurityService, PublicEventsService, EventTypes } from 'angular-auth-oidc-client';
import { TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs/operators';
import { environment } from '../environments/environment';

import { SidebarComponent } from './components/sidebar/sidebar.component';
import { HeaderComponent } from './components/header/header.component';
import { BreadcrumbComponent } from './components/breadcrumb/breadcrumb.component';
import { DownloadProgressComponent } from "./components/download-progress/download-progress.component";
import { UploadProgressComponent } from "./components/upload-progress/upload-progress.component";
import { ElementInfo } from "./models/document.models";
import { BreadcrumbService } from "./services/breadcrumb.service";
import { SearchService } from "./services/search.service";
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-main',
  standalone: true,
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css'],
  imports: [
    CommonModule,
    MatSnackBarModule,
    MatProgressBarModule,
    SidebarComponent,
    HeaderComponent,
    BreadcrumbComponent,
    DownloadProgressComponent,
    UploadProgressComponent,
    RouterOutlet
  ],
})
export class MainComponent implements OnInit {
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private breadcrumbService = inject(BreadcrumbService);
  private oidcSecurityService = inject(OidcSecurityService);
  private themeService = inject(ThemeService);
  private publicEventsService = environment.authentication.enabled ? inject(PublicEventsService) : null;
  private translateService = inject(TranslateService);
  private searchService = inject(SearchService);

  userData$ = this.oidcSecurityService.userData$;
  isAuthenticated$ = this.oidcSecurityService.isAuthenticated$;
  isDownloading = false;
  breadcrumbs: ElementInfo[] = [];
  currentRoute = '';
  isWipRoute = false;
  isSidebarCollapsed = false;
  isMobileMenuOpen = false;
  hasActiveFilters = false;
  private isRedirectingToLogin = false;

  // This is needed for the header component
  get hasSelectedItems(): boolean {
    // This will be implemented in child components that actually have selected items
    return false;
  }

  constructor() { }

  ngOnInit() {
    console.log('MainComponent ngOnInit - isMobileMenuOpen:', this.isMobileMenuOpen);

    // Ensure mobile menu starts closed
    this.isMobileMenuOpen = false;

    // Track active filters for breadcrumb clear-filters chip
    this.searchService.filters$.subscribe(filters => {
      this.hasActiveFilters = !!(
        filters.type ||
        (filters.fileType && filters.fileType !== 'any') ||
        (filters.dateModified && filters.dateModified !== 'any') ||
        filters.owner ||
        (filters.metadata && filters.metadata.length > 0)
      );
    });

    // Initialize the current route based on the URL
    this.updateCurrentRoute();

    // Subscribe to router events to update the route when it changes
    this.router.events.subscribe((event: RouterEvent) => {
      if (event instanceof NavigationEnd) {
        this.updateCurrentRoute();
      }
    });

    // Subscribe to breadcrumb changes from child components
    this.breadcrumbService.currentBreadcrumbs.subscribe(breadcrumbs => {
      this.breadcrumbs = breadcrumbs;
    });

    // Listen for silent renew failures (expired refresh token) and redirect to login.
    //
    // Why we pass {@code prompt: 'login'} to {@code authorize()}:
    //
    // When the refresh token expires on our side, the Keycloak browser session has
    // usually expired on its side too. Without an explicit prompt, the OIDC lib
    // redirects to Keycloak's authz endpoint which then inspects KC's own cookies
    // and, finding a dead session, renders a "login timeout — start over" error
    // banner on its login page. That banner is confusing: the user just wants to
    // log in again, they didn't do anything wrong.
    //
    // {@code prompt=login} is the OIDC-standard way to say "force a fresh login
    // regardless of any existing session" — Keycloak skips the session check and
    // renders a clean login form. Users see the login page, log in, and are
    // returned to wherever they were.
    this.publicEventsService?.registerForEvents()
      .pipe(filter(event => event.type === EventTypes.SilentRenewFailed))
      .subscribe(() => {
        if (this.isRedirectingToLogin) return;
        this.isRedirectingToLogin = true;
        console.warn('Silent renew failed — session expired, redirecting to login');
        const message = this.translateService.instant('errors.sessionExpired');
        this.snackBar.open(message, this.translateService.instant('common.ok'), { duration: 3000 });
        // Short delay so the snackbar paints before the redirect unmounts the view.
        // 1 s is plenty; the previous 2 s felt like the app was frozen.
        setTimeout(
          () => this.oidcSecurityService.authorize(undefined, {
            customParams: { prompt: 'login' }
          }),
          1000
        );
      });
  }

  updateCurrentRoute() {
    // Remove query params before extracting the route path
    const urlWithoutParams = this.router.url.split('?')[0];
    const path = urlWithoutParams.split('/')[1]; // Get the first part of the URL after the slash
    this.currentRoute = path || 'dashboard'; // Default to 'dashboard' if path is empty (root route)
    this.isWipRoute = ['recycle-bin', 'settings'].includes(this.currentRoute);
  }

  onNavigate(item: any) {
    // Handle navigation events from breadcrumb
    // Determine the target route based on current route
    let targetRoute = '/my-folder'; // Default

    if (this.currentRoute === 'favorites') {
      targetRoute = '/favorites';
    } else if (this.currentRoute === 'recycle-bin') {
      targetRoute = '/recycle-bin';
    }

    if (item && item.id === '0') { // Root.INSTANCE has id of '0'
      this.router.navigate([targetRoute]).then(() => {
        // Trigger breadcrumb reset in current context
        this.breadcrumbService.navigateTo(null);
      });
    } else if (item && item.id) {
      this.router.navigate([targetRoute]).then(() => {
        // Trigger navigation to specific folder
        this.breadcrumbService.navigateTo(item);
      });
    }
  }

  onClearFilters() {
    this.searchService.updateFilters({
      type: undefined,
      dateModified: 'any',
      owner: '',
      fileType: 'any',
      metadata: [],
      scope: 'CURRENT_ONLY'
    });
  }


  onSidebarCollapsedChange(collapsed: boolean) {
    this.isSidebarCollapsed = collapsed;
  }

  toggleMobileMenu() {
    console.log('toggleMobileMenu called, current state:', this.isMobileMenuOpen);
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    console.log('toggleMobileMenu new state:', this.isMobileMenuOpen);
  }

  closeMobileMenu() {
    console.log('closeMobileMenu called');
    this.isMobileMenuOpen = false;
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    // Close mobile menu when resizing to ensure clean state
    if (window.innerWidth > 768 && this.isMobileMenuOpen) {
      console.log('Window resized to desktop, closing mobile menu');
      this.isMobileMenuOpen = false;
    }
  }

  logout() {
    this.oidcSecurityService.logoff().subscribe((result) => console.log(result));
  }
}