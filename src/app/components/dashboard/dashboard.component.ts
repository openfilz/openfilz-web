import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DragDropDirective } from '../../directives/drag-drop.directive';
import { AuthImageDirective } from '../../directives/auth-image.directive';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DocumentApiService } from '../../services/document-api.service';
import { FileIconService } from '../../services/file-icon.service';
import { OnlyOfficeService } from '../../services/onlyoffice.service';
import { DocumentType, ElementInfo, FileItem } from '../../models/document.models';
import { environment } from '../../../environments/environment';

export interface DashboardFileItem extends FileItem {
  owner: string;
  lastModified: string;
}

export interface RecentFile {
  id: string;
  name: string;
  type: string;
  contentType: string; // Add contentType
  size: number;
  lastModified?: string;
  updatedAt: string;
  icon: string;
  thumbnailUrl?: string;
}

export interface FileTypeDistribution {
  type: string;
  count: number;
  percentage: number;
  color: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    DragDropDirective,
    AuthImageDirective,
    TranslatePipe,
    MatTooltipModule
],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private documentApi = inject(DocumentApiService);
  private fileIconService = inject(FileIconService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private router = inject(Router); // Inject Router
  private dialog = inject(MatDialog); // Inject MatDialog
  private onlyOfficeService = inject(OnlyOfficeService);

  recentlyEditedFiles: RecentFile[] = [];
  allFiles: DashboardFileItem[] = [];
  displayedColumns: string[] = ['name', 'size', 'owner', 'lastModified'];
  pageSize = 10;
  pageIndex = 0;
  totalItems = 0;
  fileOver = false;
  fileTypeDistribution: FileTypeDistribution[] = [];

  // Configurable limit for recent files
  recentFilesLimit = 15;

  // Storage stats
  storageUsed = 0;
  storageTotal = 0;
  documentsSize = 0;
  imagesSize = 0;
  videosSize = 0;
  audioSize = 0;
  otherSize = 0;

  // File counts
  totalFiles = 0;
  totalFolders = 0;

  // Loading states
  isLoadingDashboard = false;
  isLoadingRecentFiles = false;
  dashboardError: string | null = null;

  get storagePercentage(): number {
    if (this.storageTotal === 0) return 0;
    return Math.round((this.storageUsed / this.storageTotal) * 100);
  }

  @ViewChild('fileInput') fileInput!: ElementRef;

  constructor() { }

  ngOnInit() {
    this.loadDashboardData();
  }

  loadDashboardData() {
    this.isLoadingDashboard = true;
    this.dashboardError = null;

    // Load dashboard statistics
    this.documentApi.getDashboardStatistics().subscribe({
      next: (stats) => {
        // Update storage stats
        this.storageUsed = stats.storage.totalStorageUsed;
        this.storageTotal = stats.storage.totalStorageAvailable || 0;

        // Update storage breakdown
        stats.storage.fileTypeBreakdown.forEach(breakdown => {
          switch (breakdown.type) {
            case 'documents':
              this.documentsSize = breakdown.totalSize || 0;
              break;
            case 'images':
              this.imagesSize = breakdown.totalSize || 0;
              break;
            case 'videos':
              this.videosSize = breakdown.totalSize || 0;
              break;
            case 'audio':
              this.audioSize = breakdown.totalSize || 0;
              break;
            case 'others':
              this.otherSize = breakdown.totalSize || 0;
              break;
          }
        });

        // Update file type distribution
        const totalFilesCount = stats.fileTypeCounts.reduce((sum, ft) => sum + (ft.count || 0), 0);
        this.fileTypeDistribution = stats.fileTypeCounts.map(ft => ({
          type: ft.type.toLowerCase(), // Keep lowercase for translation keys
          count: ft.count || 0,
          percentage: totalFilesCount > 0 ? Math.round(((ft.count || 0) / totalFilesCount) * 100) : 0,
          color: this.getTypeColor(ft.type.toLowerCase())
        }));

        // Update file and folder counts
        this.totalFiles = stats.totalFiles || 0;
        this.totalFolders = stats.totalFolders || 0;

        this.isLoadingDashboard = false;
      },
      error: (error) => {
        console.error('Error loading dashboard statistics:', error);
        this.dashboardError = this.translate.instant('dashboard.error');
        this.isLoadingDashboard = false;
        this.snackBar.open(this.translate.instant('dashboard.error'), this.translate.instant('common.close'), { duration: 3000 });
      }
    });

    // Load recently edited files
    this.loadRecentlyEditedFiles();
  }

  loadRecentlyEditedFiles() {
    this.isLoadingRecentFiles = true;

    this.documentApi.getRecentlyEditedFiles(this.recentFilesLimit).subscribe({
      next: (files) => {
        this.recentlyEditedFiles = files.map(file => ({
          id: file.id,
          name: file.name,
          type: this.getFileTypeCategory(file.contentType || ''),
          contentType: file.contentType || '', // Populate contentType
          size: file.size || 0,
          updatedAt: file.updatedAt || '',
          icon: this.getIconForContentType(file.contentType || ''),
          thumbnailUrl: file.thumbnailUrl
        }));
        this.isLoadingRecentFiles = false;
      },
      error: (error) => {
        console.error('Error loading recently edited files:', error);
        this.isLoadingRecentFiles = false;
        this.snackBar.open(this.translate.instant('dashboard.loadingRecentError'), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private getFileTypeCategory(contentType: string): string {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'music';
    if (contentType.includes('zip') || contentType.includes('archive')) return 'archive';
    if (contentType.startsWith('application/')) return 'document';
    return 'file';
  }

  private getIconForContentType(contentType: string): string {
    return this.fileIconService.getContentTypeIcon(contentType);
  }

  getIconColor(file: RecentFile): string {
    return this.fileIconService.getContentTypeColor(file.contentType);
  }

  formatRelativeTime(dateString: string): string {
    if (!dateString) return 'Unknown';

    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return this.translate.instant('audit.time.justNow');
    if (diffMins < 60) return this.translate.instant('audit.time.minAgo', { count: diffMins });
    if (diffHours < 24) return this.translate.instant('audit.time.hourAgo', { count: diffHours });
    if (diffDays < 7) return this.translate.instant('audit.time.dayAgo', { count: diffDays });

    // Fallback to localized date
    return date.toLocaleDateString(this.translate.currentLang || 'en-US', { month: 'short', day: 'numeric' });
  }


  getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex === -1 ? '' : filename.substring(lastDotIndex);
  }

  getTypeColor(type: string): string {
    const colorMap: { [key: string]: string } = {
      'documents': '#667eea',
      'images': '#f093fb',
      'videos': '#4facfe',
      'music': '#f5576c',
      'audio': '#f5576c', // Handle both music and audio
      'archives': '#00f2fe',
      'others': '#764ba2',
      'other': '#764ba2'
    };
    return colorMap[type.toLowerCase()] || '#999999';
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    // Dashboard doesn't have pagination anymore since we're showing aggregated stats
  }

  onFilesDropped(files: FileList) {
    // Dashboard no longer handles uploads - redirect to file explorer
    this.snackBar.open(this.translate.instant('dashboard.uploadInfo'), this.translate.instant('common.close'), { duration: 3000 });
  }

  onFileOverChange(isOver: boolean) {
    this.fileOver = isOver;
  }

  getFileInitial(name: string): string {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  }

  formatFileSize(bytes?: number): string {
    return this.fileIconService.getFileSize(bytes ?? 0);
  }

  getGradientBackground(fileType: string): string {
    switch (fileType) {
      case 'image':
        return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      case 'document':
        return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
      case 'archive':
        return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
      default:
        return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
  }

  getFileIconClass(fileType: string): string {
    switch (fileType) {
      case 'image':
        return 'image';
      case 'document':
        return 'description';
      case 'archive':
        return 'folder_zip';
      default:
        return 'insert_drive_file';
    }
  }

  getFileCategory(fileType: string): string {
    switch (fileType) {
      case 'image':
        return this.translate.instant('dashboard.images');
      case 'document':
        return this.translate.instant('dashboard.documents');
      case 'archive':
        return this.translate.instant('mimeTypes.zip');
      default:
        return this.translate.instant('common.file');
    }
  }

  private formatDate(dateString: string): string {
    // Format the date to match the design (e.g., "Jun 12")
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // File Actions
  onOpenFile(file: RecentFile) {
    // Check if file is too large for preview
    if (file.size && this.isFileTooLargeForPreview(file)) {
      const isPdf = (file.contentType || '').toLowerCase() === 'application/pdf'
        || file.name.toLowerCase().endsWith('.pdf');
      const isOnlyOfficeFile = this.onlyOfficeService.isOnlyOfficeEnabled()
        && this.onlyOfficeService.isSupportedExtension(file.name);
      const maxSizeMB = isOnlyOfficeFile ? environment.onlyOffice.maxFileSize : 10;
      import('../../dialogs/file-too-large-dialog/file-too-large-dialog.component').then(m => {
        this.dialog.open(m.FileTooLargeDialogComponent, {
          width: '520px',
          maxWidth: '95vw',
          panelClass: 'file-too-large-dialog',
          data: { fileName: file.name, documentId: file.id, isPdf, maxSizeMB }
        });
      });
      return;
    }

    // Open file viewer dialog
    import('../../dialogs/file-viewer-dialog/file-viewer-dialog.component').then(m => {
      this.dialog.open(m.FileViewerDialogComponent, {
        width: '95vw',
        height: '95vh',
        maxWidth: '1400px',
        maxHeight: '900px',
        panelClass: 'file-viewer-dialog-container',
        data: {
          documentId: file.id,
          fileName: file.name,
          contentType: this.getFileContentType(file),
          fileSize: file.size
        }
      });
    });
  }

  private isFileTooLargeForPreview(file: RecentFile): boolean {
    if (!file.size) return false;
    const isOnlyOfficeFile = this.onlyOfficeService.isOnlyOfficeEnabled()
      && this.onlyOfficeService.isSupportedExtension(file.name);
    if (isOnlyOfficeFile) {
      return file.size > environment.onlyOffice.maxFileSize * 1024 * 1024;
    }
    return file.size > 10 * 1024 * 1024;
  }

  // Helper to infer content type since it might not be in RecentFile interface explicitly or normalized
  private getFileContentType(file: RecentFile): string {
    return file.contentType || ''; 
  }

  navigateToMyFolder() {
    this.router.navigate(['/my-folder']);
  }

  onGoToFile(file: RecentFile) {
    // Navigate to file explorer with targetFileId
    this.router.navigate(['/my-folder'], { queryParams: { targetFileId: file.id } });
  }

  onDownloadFile(file: RecentFile) {
    this.documentApi.downloadDocument(file.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('Download failed:', error);
        this.snackBar.open(this.translate.instant('errors.downloadFailed'), this.translate.instant('common.close'), { duration: 3000 });
      }
    });
  }

  /**
   * Handle thumbnail loading error by clearing the URL to show fallback icon
   */
  onThumbnailError(event: Event, file: RecentFile): void {
    file.thumbnailUrl = undefined;
  }

  // Circular progress methods for storage indicator
  getCircleDashArray(): string {
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    return `${circumference} ${circumference}`;
  }

  getCircleDashOffset(): number {
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (this.storagePercentage / 100) * circumference;
    return offset;
  }
}