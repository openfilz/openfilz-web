import { Directive, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CopyRequest, DocumentType, FileItem, MoveRequest, RenameRequest } from '../../models/document.models';
import { DocumentApiService } from '../../services/document-api.service';
import { RenameDialogComponent, RenameDialogData } from '../../dialogs/rename-dialog/rename-dialog.component';
import { FolderTreeDialogComponent } from '../../dialogs/folder-tree-dialog/folder-tree-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../dialogs/confirm-dialog/confirm-dialog.component';
import { UnsavedChangesDialogComponent, UnsavedChangesResult } from '../../dialogs/unsaved-changes-dialog/unsaved-changes-dialog.component';
import { MetadataPanelComponent } from '../metadata-panel/metadata-panel.component';
import { Observable } from "rxjs";
import { AppConfig } from '../../config/app.config';
import { Router } from "@angular/router";
import { UserPreferencesService } from '../../services/user-preferences.service';
import { SettingsService } from '../../services/settings.service';
import { PdfToolsAccessService } from '../../services/pdf-tools-access.service';
import { PdfToolsService } from '../../services/pdf-tools.service';
import { PdfToolActionId, PdfToolResult } from '../../models/pdf-tools.models';
import { SignatureAccessService } from '../../services/signature-access.service';
import { TranslateService } from '@ngx-translate/core';
import { isPdfItem } from '../../models/file-actions';
import type { RequestSignatureDialogData } from '../../dialogs/request-signature-dialog/request-signature-dialog.component';
import { isCompactViewport } from '../../utils/layout.util';

@Directive()
export abstract class FileOperationsComponent implements OnInit {
  viewMode: 'grid' | 'list' = 'grid';
  loading = false;
  isDownloading = false;
  items: FileItem[] = [];
  totalItems = 0;
  lastSelectedIndex = -1;
  protected shiftHeld = false;
  protected ctrlHeld = false;
  protected metaHeld = false;
  /**
   * True once the current selection was made via an explicit multi-select
   * gesture (checkbox, Shift-range, Ctrl/Cmd-click, or select-all). While
   * sticky, a plain click toggles items additively. While not sticky, a plain
   * click selects exactly one item (radio-style), replacing any prior
   * transient selection. Resets to false once nothing is selected.
   */
  protected selectionSticky = false;
  pageSize = AppConfig.pagination.defaultPageSize;
  pageIndex = 0;
  sortBy: string = 'name';
  sortOrder: 'ASC' | 'DESC' = 'ASC';

  // ===== Document properties (metadata) panel =====
  /** Whether the right-side details panel is currently shown. */
  metadataPanelOpen = false;
  /** Document currently shown in the details panel. */
  selectedDocumentForMetadata?: string;
  /** Panel instance, used to check for/flush pending inline metadata edits. */
  @ViewChild(MetadataPanelComponent) protected metadataPanel?: MetadataPanelComponent;

  /** Distinguish a single click (select + show details) from a double click (open). */
  private clickTimeout: any = null;
  private readonly CLICK_DELAY = 250; // milliseconds

  protected router = inject(Router);
  protected documentApi = inject(DocumentApiService);
  protected dialog = inject(MatDialog);
  protected snackBar = inject(MatSnackBar);
  protected userPreferencesService = inject(UserPreferencesService);
  protected settingsService = inject(SettingsService);
  protected signatureAccess = inject(SignatureAccessService);
  protected pdfToolsAccess = inject(PdfToolsAccessService);
  protected pdfTools = inject(PdfToolsService);
  protected translate = inject(TranslateService);

  constructor() {
    const prefs = this.userPreferencesService.getPreferences();
    this.pageSize = prefs.pageSize;
    this.sortBy = prefs.sortBy;
    this.sortOrder = prefs.sortOrder;
  }

  abstract reloadData(): void;

  ngOnInit(): void {
    // Subscribe to preferences changes to keep UI in sync
    this.userPreferencesService.preferences$.subscribe(prefs => {
      let needsReload = false;
      if (this.pageSize !== prefs.pageSize) {
        this.pageSize = prefs.pageSize;
        this.pageIndex = 0; // Reset to first page on page size change
        needsReload = true;
      }
      if (this.sortBy !== prefs.sortBy || this.sortOrder !== prefs.sortOrder) {
        this.sortBy = prefs.sortBy;
        this.sortOrder = prefs.sortOrder;
        needsReload = true;
      }

      if (needsReload) {
        this.reloadData();
      }
    });

    // A PDF tool run from inside the file viewer creates/replaces documents without this
    // listing ever seeing a dialog result — refresh on its notification instead.
    this.pdfTools.documentsChanged$.subscribe(() => this.reloadData());
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Shift') this.shiftHeld = true;
    if (event.key === 'Control') this.ctrlHeld = true;
    if (event.key === 'Meta') this.metaHeld = true;
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    if (event.key === 'Shift') this.shiftHeld = false;
    if (event.key === 'Control') this.ctrlHeld = false;
    if (event.key === 'Meta') this.metaHeld = false;
  }

  @HostListener('window:blur')
  onWindowBlur() {
    this.shiftHeld = false;
    this.ctrlHeld = false;
    this.metaHeld = false;
  }

  get hasSelectedItems(): boolean {
    return this.items.some(item => item.selected);
  }

  get selectedItems(): FileItem[] {
    return this.items.filter(item => item.selected);
  }

  onViewModeChange(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
  }

  onSortChange(event: { sortBy: string, sortOrder: 'ASC' | 'DESC' }) {
    this.sortBy = event.sortBy;
    this.sortOrder = event.sortOrder;
    this.userPreferencesService.setSort(this.sortBy, this.sortOrder);
    this.reloadData();
  }

  protected applySelection(item: FileItem, selected: boolean, shiftKey: boolean): void {
    const currentIndex = this.items.indexOf(item);

    if (shiftKey && this.lastSelectedIndex >= 0 && this.lastSelectedIndex < this.items.length && currentIndex >= 0) {
      const start = Math.min(this.lastSelectedIndex, currentIndex);
      const end = Math.max(this.lastSelectedIndex, currentIndex);
      for (let i = start; i <= end; i++) {
        this.items[i].selected = selected;
      }
    } else {
      item.selected = selected;
    }

    if (currentIndex >= 0) {
      this.lastSelectedIndex = currentIndex;
    }
  }

  /**
   * Apply a single click on an item's box (not the checkbox).
   *
   * - Plain click, transient mode: exclusive, radio-style selection — selects
   *   only this item and clears any previously transient-selected item. Clicking
   *   the lone selected item again clears the selection.
   * - Plain click, sticky mode: toggles this item while keeping the rest — the
   *   explicit multi-select started via checkbox/Shift/Ctrl stays in effect.
   * - Shift click: selects the contiguous range from the anchor (enters sticky).
   * - Ctrl/Cmd click: toggles this item additively (enters sticky).
   */
  protected selectItem(item: FileItem, shiftKey: boolean, ctrlOrMeta: boolean): void {
    if (shiftKey) {
      this.selectionSticky = true;
      this.applySelection(item, true, true);
      return;
    }

    if (ctrlOrMeta || this.selectionSticky) {
      this.selectionSticky = true;
      this.applySelection(item, !item.selected, false);
      this.resetStickyIfEmpty();
      return;
    }

    // Transient mode: select exactly this item, replacing any prior selection.
    const collapseToNone = item.selected && this.selectedItems.length === 1;
    this.items.forEach(i => i.selected = false);
    if (collapseToNone) {
      this.lastSelectedIndex = -1;
    } else {
      item.selected = true;
      this.lastSelectedIndex = this.items.indexOf(item);
    }
  }

  /** After a deselect, drop back to transient mode once nothing is selected. */
  protected resetStickyIfEmpty(): void {
    if (!this.hasSelectedItems) {
      this.selectionSticky = false;
      this.lastSelectedIndex = -1;
    }
  }

  /**
   * Drop multi-select (sticky) mode and the range anchor. Call whenever the
   * displayed item list is replaced — folder navigation, reload, pagination,
   * search — so a fresh view always starts in transient single-select mode
   * instead of inheriting a stale multi-select from the previous view.
   */
  protected resetSelectionMode(): void {
    this.selectionSticky = false;
    this.lastSelectedIndex = -1;
  }

  onItemClick(item: FileItem): void {
    // Cancel any pending single-click so a rapid second click becomes a double-click.
    this.cancelPendingItemClick();

    // Capture modifier state now (before the timeout fires).
    const shiftHeld = this.shiftHeld;
    const ctrlOrMeta = this.ctrlHeld || this.metaHeld;

    // Delay selection so a double-click (open) can pre-empt it.
    this.clickTimeout = setTimeout(() => {
      this.clickTimeout = null;
      this.selectItem(item, shiftHeld, ctrlOrMeta);
      this.syncMetadataPanelToClick(item, !shiftHeld && !ctrlOrMeta);
    }, this.CLICK_DELAY);
  }

  /** Clear the pending single-click timer (called by double-click handlers). */
  protected cancelPendingItemClick(): void {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }
  }

  onSelectionChange(event: { item: FileItem, selected: boolean }): void {
    // The checkbox is an explicit multi-select gesture → sticky mode.
    this.selectionSticky = true;
    this.applySelection(event.item, event.selected, this.shiftHeld);
    this.resetStickyIfEmpty();
    // Mirror the plain-click behavior: a checkbox that leaves exactly one item
    // selected shows that item's details; multi-select (or none) hides the panel.
    // Phones open the panel deliberately instead — see syncMetadataPanelToClick.
    if (isCompactViewport()) {
      return;
    }
    const selected = this.selectedItems;
    if (selected.length === 1) {
      this.switchMetadataPanel(selected[0].id);
    } else {
      this.attemptCloseMetadataPanel();
    }
  }

  // ===== Details panel: open on click, close on outside click (guarded) =====

  /**
   * After a plain single click, show the clicked item's details. Multi-select
   * gestures or a click that clears the selection close the panel instead.
   *
   * Phones are left out: there the panel is a bottom sheet covering the list
   * and the actions the user may actually be after, so it is opened
   * deliberately — from the selection sheet's Details action, or an item's own
   * Details menu entry — never as a side effect of picking an item.
   */
  private syncMetadataPanelToClick(clickedItem: FileItem, isPlainClick: boolean): void {
    if (isCompactViewport()) {
      return;
    }
    const selected = this.selectedItems;
    if (isPlainClick && selected.length === 1 && selected[0].id === clickedItem.id) {
      this.switchMetadataPanel(clickedItem.id);
    } else {
      this.attemptCloseMetadataPanel();
    }
  }

  openMetadataPanel(documentId: string): void {
    this.selectedDocumentForMetadata = documentId;
    this.metadataPanelOpen = true;
  }

  closeMetadataPanel(): void {
    this.metadataPanelOpen = false;
    this.selectedDocumentForMetadata = undefined;
  }

  onMetadataSaved(): void {
    // Reflect metadata changes (size, versions, etc.) in the listing.
    this.reloadData();
  }

  /**
   * e-Sign: open the envelope builder for a single PDF. Gated by the API's
   * `signatureActive` flag (same switch as the sidebar entry) and PDF-only.
   * The dialog is lazy-loaded so non-e-Sign deployments never ship pdf.js twice.
   */
  onRequestSignature(item: FileItem): void {
    if (!this.signatureAccess.canRequestSignature || !isPdfItem(item)) {
      return;
    }
    import('../../dialogs/request-signature-dialog/request-signature-dialog.component').then(m => {
      const dialogRef = this.dialog.open(m.RequestSignatureDialogComponent, {
        width: '1200px',
        maxWidth: '98vw',
        maxHeight: '94dvh',
        panelClass: 'request-signature-dialog-panel',
        autoFocus: false,
        data: { documentId: item.id, documentName: item.name } as RequestSignatureDialogData
      });
      dialogRef.afterClosed().subscribe(result => {
        if (result?.success) {
          this.router.navigate(['/signatures'], { queryParams: { tab: 'sent' } });
        }
      });
    });
  }

  // ===== PDF tools (merge / split / rotate / organize pages) =====

  /**
   * The PDF tools apply to the current selection: feature on (API `pdfToolsActive`), CONTRIBUTOR,
   * and every selected item is a PDF. Which tools are enabled for 1 vs. many items is decided by
   * the descriptors (`singleOnly` / `minSelection`).
   */
  get canUsePdfToolsForSelection(): boolean {
    const selected = this.selectedItems;
    return this.pdfToolsAccess.enabled && selected.length > 0 && selected.every(isPdfItem);
  }

  /** From the contextual selection toolbar / mobile sheet. */
  onPdfToolSelected(action: PdfToolActionId): void {
    this.openPdfTool(action, this.selectedItems);
  }

  /** From a per-item kebab / context menu. */
  onPdfToolItem(event: { item: FileItem; action: PdfToolActionId }): void {
    this.openPdfTool(event.action, [event.item]);
  }

  /**
   * Open the PDF tool dialog for `items`. The dialogs are lazy-loaded (they pull in pdf.js) and
   * live in dedicated files, so this base class only routes and refreshes on success.
   */
  protected openPdfTool(action: PdfToolActionId, items: FileItem[]): void {
    const pdfs = items.filter(isPdfItem);
    if (!this.pdfToolsAccess.enabled || pdfs.length === 0) {
      return;
    }
    const panel = { maxWidth: '98vw', maxHeight: '94dvh', panelClass: 'pdf-tools-dialog-panel', autoFocus: false };
    switch (action) {
      case 'mergePdf':
        if (pdfs.length < 2) return;
        import('../../dialogs/pdf-merge-dialog/pdf-merge-dialog.component').then(m => {
          const ref = this.dialog.open(m.PdfMergeDialogComponent, {
            ...panel, width: '820px', data: { items: pdfs.map(i => ({ id: i.id, name: i.name, size: i.size })) }
          });
          ref.afterClosed().subscribe(result => this.onPdfToolDone(result));
        });
        break;
      case 'splitPdf':
        import('../../dialogs/pdf-split-dialog/pdf-split-dialog.component').then(m => {
          const ref = this.dialog.open(m.PdfSplitDialogComponent, {
            ...panel, width: '900px', data: { documentId: pdfs[0].id, documentName: pdfs[0].name }
          });
          ref.afterClosed().subscribe(result => this.onPdfToolDone(result));
        });
        break;
      case 'organizePdf':
        import('../../dialogs/pdf-organizer-dialog/pdf-organizer-dialog.component').then(m => {
          const ref = this.dialog.open(m.PdfOrganizerDialogComponent, {
            ...panel, width: '1200px', height: '94dvh', data: { documentId: pdfs[0].id, documentName: pdfs[0].name }
          });
          ref.afterClosed().subscribe(result => this.onPdfToolDone(result));
        });
        break;
      case 'rotatePdf':
        import('../../dialogs/pdf-rotate-dialog/pdf-rotate-dialog.component').then(m => {
          const ref = this.dialog.open(m.PdfRotateDialogComponent, {
            ...panel, width: '560px', data: { items: pdfs.map(i => ({ id: i.id, name: i.name })) }
          });
          ref.afterClosed().subscribe(result => this.onPdfToolDone(result));
        });
        break;
    }
  }

  /** A PDF tool produced or replaced documents: refresh the listing (the dialog already toasted). */
  protected onPdfToolDone(result: PdfToolResult | undefined): void {
    if (result?.success) {
      this.reloadData();
    }
  }

  /**
   * Same action from the contextual selection toolbar: exactly one PDF selected.
   * Kept next to {@link onRequestSignature} so both entry points share the gating.
   */
  get canRequestSignatureForSelection(): boolean {
    const selected = this.selectedItems;
    return this.signatureAccess.canRequestSignature && selected.length === 1 && isPdfItem(selected[0]);
  }

  onRequestSignatureSelected(): void {
    const selected = this.selectedItems;
    if (selected.length === 1) {
      this.onRequestSignature(selected[0]);
    }
  }

  onViewProperties(item: FileItem): void {
    this.switchMetadataPanel(item.id);
  }

  onDetailsSelected(): void {
    const selected = this.selectedItems;
    if (selected.length === 1) {
      this.switchMetadataPanel(selected[0].id);
    }
  }

  /** Open the panel for a document, or switch to it, guarding unsaved edits on the current one. */
  protected switchMetadataPanel(documentId: string): void {
    if (this.metadataPanelOpen && this.selectedDocumentForMetadata === documentId) {
      return;
    }
    this.guardPendingMetadata(() => this.openMetadataPanel(documentId));
  }

  /** Close the details panel, guarding unsaved inline edits first. */
  attemptCloseMetadataPanel(): void {
    this.guardPendingMetadata(() => this.closeMetadataPanel());
  }

  /**
   * Run `proceed` immediately when there is nothing unsaved; otherwise prompt
   * the user to save / discard / keep editing and act on their choice.
   */
  private guardPendingMetadata(proceed: () => void): void {
    if (!this.metadataPanelOpen || !this.metadataPanel?.hasPendingChanges) {
      proceed();
      return;
    }
    const dialogRef = this.dialog.open(UnsavedChangesDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      disableClose: true
    });
    dialogRef.afterClosed().subscribe((result: UnsavedChangesResult | undefined) => {
      if (result === 'save') {
        this.metadataPanel?.savePendingChanges();
        proceed();
      } else if (result === 'discard') {
        this.metadataPanel?.discardPendingChanges();
        proceed();
      }
      // undefined → keep editing, leave the panel as-is
    });
  }

  /**
   * A click anywhere outside the open details panel closes it (like the panel's
   * own close button). Clicks on file/folder items are handled by their own
   * click flow (which switches the panel), and clicks inside overlays
   * (menus, dialogs, snackbars, the panel itself) are ignored.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClickOutsidePanel(event: MouseEvent): void {
    if (!this.metadataPanelOpen) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.metadata-panel')) return;
    // The mobile backdrop closes the panel itself via (click) — don't double-handle.
    if (target.closest('.metadata-panel-overlay')) return;
    if (target.closest('.file-item') || target.closest('.file-row')) return;
    if (target.closest('.cdk-overlay-container')) return;
    // The toolbar is a control surface for the current selection (its "Details"
    // button opens this very panel). Treat toolbar clicks as inside, so opening
    // the panel from the toolbar isn't immediately undone by this same click.
    if (target.closest('app-toolbar')) return;
    this.attemptCloseMetadataPanel();
  }

  onSelectAll(selected: boolean): void {
    this.items.forEach(item => item.selected = selected);
    this.lastSelectedIndex = -1;
    this.selectionSticky = selected;
  }

  onRenameItem(item: FileItem): void {
    const dialogRef = this.dialog.open(RenameDialogComponent, {
      width: '400px',
      data: { name: item.name, type: item.type } as RenameDialogData
    });

    dialogRef.afterClosed().subscribe(newName => {
      if (newName) {
        const request: RenameRequest = { newName };
        const renameObservable = item.type === 'FOLDER'
          ? this.documentApi.renameFolder(item.id, request)
          : this.documentApi.renameFile(item.id, request);

        renameObservable.subscribe({
          next: () => {
            this.snackBar.open(this.translate.instant('operations.renameSuccess'), this.translate.instant('common.close'), { duration: 3000 });
            this.reloadData();
          },
          error: () => this.snackBar.open(this.translate.instant('operations.renameError'), this.translate.instant('common.close'), { duration: 3000 })
        });
      }
    });
  }

  onDownloadItem(item: FileItem): void {
    this.isDownloading = true;
    item.selected = false;
    this.documentApi.downloadDocument(item.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.name + (item.type === 'FILE' ? '' : '.zip');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.isDownloading = false;
      },
      error: () => {
        this.snackBar.open(this.translate.instant('operations.downloadError'), this.translate.instant('common.close'), { duration: 3000 });
        this.isDownloading = false;
      }
    });
  }

  onMoveItem(item: FileItem): void {
    const dialogRef = this.dialog.open(FolderTreeDialogComponent, {
      width: '700px',
      data: { title: 'dialogs.folderTree.moveItem', actionType: 'move', excludeIds: [item.id] }
    });

    dialogRef.afterClosed().subscribe(targetFolderId => {
      if (targetFolderId !== undefined) {
        const request: MoveRequest = { documentIds: [item.id], targetFolderId: targetFolderId || undefined };
        const moveObservable = item.type === 'FOLDER'
          ? this.documentApi.moveFolders(request)
          : this.documentApi.moveFiles(request);
        moveObservable.subscribe({
          next: () => {
            this.snackBar.open(this.translate.instant('operations.moveSuccess'), this.translate.instant('common.close'), { duration: 3000 });
            this.reloadData();
          },
          error: () => this.snackBar.open(this.translate.instant('operations.moveError'), this.translate.instant('common.close'), { duration: 3000 })
        });
      }
    });
  }

  onCopyItem(item: FileItem): void {
    const dialogRef = this.dialog.open(FolderTreeDialogComponent, {
      width: '700px',
      data: { title: 'dialogs.folderTree.copyItem', actionType: 'copy', excludeIds: [] }
    });

    dialogRef.afterClosed().subscribe(targetFolderId => {
      if (targetFolderId !== undefined) {
        const request: CopyRequest = { documentIds: [item.id], targetFolderId: targetFolderId || undefined };
        const copyObservable: Observable<any> = item.type === DocumentType.FOLDER
          ? this.documentApi.copyFolders(request)
          : this.documentApi.copyFiles(request);
        copyObservable.subscribe({
          next: () => {
            this.snackBar.open(this.translate.instant('operations.copySuccess'), this.translate.instant('common.close'), { duration: 3000 });
            this.reloadData();
          },
          error: () => this.snackBar.open(this.translate.instant('operations.copyError'), this.translate.instant('common.close'), { duration: 3000 })
        });
      }
    });
  }

  onDeleteItem(item: FileItem): void {
    const isRecycleBinEnabled = this.settingsService.isRecycleBinEnabled;
    const emptyBinInterval = this.settingsService.emptyBinInterval;

    const dialogData: ConfirmDialogData = {
      title: isRecycleBinEnabled ? 'delete.deleteConfirmItem' : 'recycleBin.deleteConfirmItem',
      messageParams: { name: item.name },
      message: isRecycleBinEnabled ? 'delete.deleteConfirmItem' : 'recycleBin.deleteConfirmItem',
      details: isRecycleBinEnabled ? 'delete.deleteDetailsBin' : 'recycleBin.deleteDetails',
      detailsParams: isRecycleBinEnabled ? { emptyBinInterval: emptyBinInterval } : undefined,
      type: 'danger',
      confirmText: 'common.delete',
      cancelText: 'common.cancel'
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: dialogData
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.deleteItems([item]);
      }
    });
  }

  onDownloadSelected(): void {
    const selected = this.selectedItems;
    if (selected.length === 1) {
      this.onDownloadItem(selected[0]);
    } else if (selected.length > 1) {
      this.isDownloading = true;
      const documentIds = selected.map(item => item.id);
      this.selectedItems.forEach(item => item.selected = false);
      this.documentApi.downloadMultipleDocuments(documentIds).subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'documents.zip';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          this.isDownloading = false;
        },
        error: () => {
          this.snackBar.open(this.translate.instant('operations.downloadMultipleError'), this.translate.instant('common.close'), { duration: 3000 });
          this.isDownloading = false;
        }
      });
    }
  }

  onMoveSelected(): void {
    const selected = this.selectedItems;
    if (selected.length > 0) {
      const dialogRef = this.dialog.open(FolderTreeDialogComponent, {
        width: '700px',
        data: {
          title: 'dialogs.folderTree.moveItems',
          titleParams: { count: selected.length },
          actionType: 'move',
          excludeIds: selected.map(item => item.id)
        }
      });
      dialogRef.afterClosed().subscribe(targetFolderId => {
        if (targetFolderId !== undefined) {
          this.performBulkMove(selected, targetFolderId);
        }
      });
    }
  }

  onCopySelected(): void {
    const selected = this.selectedItems;
    if (selected.length > 0) {
      const dialogRef = this.dialog.open(FolderTreeDialogComponent, {
        width: '700px',
        data: {
          title: 'dialogs.folderTree.copyItems',
          titleParams: { count: selected.length },
          actionType: 'copy',
          excludeIds: []
        }
      });
      dialogRef.afterClosed().subscribe(targetFolderId => {
        if (targetFolderId !== undefined) {
          this.performBulkCopy(selected, targetFolderId);
        }
      });
    }
  }

  onRenameSelected(): void {
    if (this.selectedItems.length === 1) {
      this.onRenameItem(this.selectedItems[0]);
    }
  }

  onDeleteSelected(): void {
    const selected = this.selectedItems;
    if (selected.length > 0) {
      const isRecycleBinEnabled = this.settingsService.isRecycleBinEnabled;
      const emptyBinInterval = this.settingsService.emptyBinInterval;

      const dialogData: ConfirmDialogData = {
        title: isRecycleBinEnabled ? 'delete.deleteConfirmMessage' : 'recycleBin.deleteConfirmMessage',
        messageParams: { count: selected.length },
        message: isRecycleBinEnabled ? 'delete.deleteConfirmMessage' : 'recycleBin.deleteConfirmMessage',
        details: isRecycleBinEnabled ? 'delete.deleteDetailsBin' : 'recycleBin.deleteDetails',
        detailsParams: isRecycleBinEnabled ? { emptyBinInterval: emptyBinInterval } : undefined,
        type: 'danger',
        confirmText: 'common.delete',
        cancelText: 'common.cancel'
      };
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '450px',
        data: dialogData
      });
      dialogRef.afterClosed().subscribe(confirmed => {
        if (confirmed) {
          this.deleteItems(selected);
        }
      });
    }
  }

  private deleteItems(itemsToDelete: FileItem[]): void {
    const folders = itemsToDelete.filter(item => item.type === 'FOLDER');
    const files = itemsToDelete.filter(item => item.type === 'FILE');
    const observables = [];
    if (folders.length > 0) {
      observables.push(this.documentApi.deleteFolders({ documentIds: folders.map(f => f.id) }));
    }
    if (files.length > 0) {
      observables.push(this.documentApi.deleteFiles({ documentIds: files.map(f => f.id) }));
    }
    observables.forEach(obs => obs.subscribe({
      next: () => {
        this.snackBar.open(this.translate.instant('operations.deleteSuccess'), this.translate.instant('common.close'), { duration: 3000 });
        this.reloadData();
      },
      error: () => this.snackBar.open(this.translate.instant('operations.deleteError'), this.translate.instant('common.close'), { duration: 3000 })
    }));
  }

  private performBulkMove(itemsToMove: FileItem[], targetFolderId: string | null): void {
    const folders = itemsToMove.filter(item => item.type === 'FOLDER');
    const files = itemsToMove.filter(item => item.type === 'FILE');
    const request: MoveRequest = { documentIds: [], targetFolderId: targetFolderId || undefined };
    if (folders.length > 0) {
      this.documentApi.moveFolders({ ...request, documentIds: folders.map(f => f.id) }).subscribe(this.bulkOperationObserver('move'));
    }
    if (files.length > 0) {
      this.documentApi.moveFiles({ ...request, documentIds: files.map(f => f.id) }).subscribe(this.bulkOperationObserver('move'));
    }
  }

  private performBulkCopy(itemsToCopy: FileItem[], targetFolderId: string | null): void {
    const folders = itemsToCopy.filter(item => item.type === 'FOLDER');
    const files = itemsToCopy.filter(item => item.type === 'FILE');
    const request: CopyRequest = { documentIds: [], targetFolderId: targetFolderId || undefined };
    if (folders.length > 0) {
      this.documentApi.copyFolders({ ...request, documentIds: folders.map(f => f.id) }).subscribe(this.bulkOperationObserver('copy'));
    }
    if (files.length > 0) {
      this.documentApi.copyFiles({ ...request, documentIds: files.map(f => f.id) }).subscribe(this.bulkOperationObserver('copy'));
    }
  }

  private bulkOperationObserver(action: 'move' | 'copy') {
    const successKey = action === 'move' ? 'operations.moveMultipleSuccess' : 'operations.copyMultipleSuccess';
    const errorKey = action === 'move' ? 'operations.moveMultipleError' : 'operations.copyMultipleError';
    return {
      next: () => {
        this.snackBar.open(this.translate.instant(successKey), this.translate.instant('common.close'), { duration: 3000 });
        this.reloadData();
      },
      error: () => this.snackBar.open(this.translate.instant(errorKey), this.translate.instant('common.close'), { duration: 3000 })
    };
  }


  onClearSelection() {
    this.onSelectAll(false);
  }

  onPreviousPage() {
    if (this.pageIndex > 0) {
      this.pageIndex--;
      this.lastSelectedIndex = -1;
      this.loadItems();
    }
  }

  onNextPage() {
    const totalPages = Math.ceil(this.totalItems / this.pageSize);
    if (this.pageIndex < totalPages - 1) {
      this.pageIndex++;
      this.lastSelectedIndex = -1;
      this.loadItems();
    }
  }

  onPageSizeChange(newPageSize: number) {
    this.pageSize = newPageSize;
    this.userPreferencesService.setPageSize(newPageSize);
    this.pageIndex = 0;
    this.lastSelectedIndex = -1;
    this.loadItems();
  }

  onItemDoubleClick(item: FileItem): void {
    this.cancelPendingItemClick();
    this.closeMetadataPanel();
    if (item.type === 'FOLDER') {
      this.router.navigate(['/my-folder'], { queryParams: { folderId: item.id } });
    } else {
      this.onDownloadItem(item);
    }
  }

  abstract loadItems(): void;
}
