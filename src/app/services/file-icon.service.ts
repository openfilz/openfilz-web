import {inject, Injectable} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';

@Injectable({
    providedIn: 'root'
})
export class FileIconService {

    private translate = inject(TranslateService);

    static ICON_MAP: { [key: string]: string } = {
        // Documents
        'pdf': 'picture_as_pdf',
        'doc': 'description',
        'docx': 'description',
        'txt': 'description',
        'rtf': 'description',

        // Spreadsheets
        'xls': 'grid_on',
        'xlsx': 'grid_on',
        'csv': 'grid_on',

        // Presentations
        'ppt': 'slideshow',
        'pptx': 'slideshow',

        // Images
        'jpg': 'image',
        'jpeg': 'image',
        'png': 'image',
        'gif': 'image',
        'bmp': 'image',
        'svg': 'image',
        'webp': 'image',

        // Videos
        'mp4': 'movie',
        'avi': 'movie',
        'mov': 'movie',
        'wmv': 'movie',
        'flv': 'movie',
        'webm': 'movie',

        // Audio
        'mp3': 'audiotrack',
        'wav': 'audiotrack',
        'flac': 'audiotrack',
        'ogg': 'audiotrack',
        'm4a': 'audiotrack',

        // Archives
        'zip': 'archive',
        'rar': 'archive',
        '7z': 'archive',
        'tar': 'archive',
        'gz': 'archive',

        // Code
        'html': 'code',
        'css': 'code',
        'js': 'code',
        'ts': 'code',
        'json': 'code',
        'xml': 'code',
        'sql': 'code',
        'py': 'code',
        'java': 'code',
        'cpp': 'code',
        'c': 'code',
        'php': 'code',
        'rb': 'code',
        'go': 'code',
        'rs': 'code',
    };

    // --- Color map by icon category ---
    static COLOR_MAP: { [icon: string]: string } = {
        'picture_as_pdf': '#ef4444',
        'description': '#3b82f6',
        'grid_on': '#10b981',
        'slideshow': '#f59e0b',
        'image': '#8b5cf6',
        'movie': '#ec4899',
        'audiotrack': '#f43f5e',
        'archive': '#f97316',
        'code': '#06b6d4',
        'article': '#6366f1',
        'folder': '#f59e0b',
        'insert_drive_file': '#6b7280',
    };

    getFileIcon(fileName: string, type: 'FILE' | 'FOLDER'): string {
        if (type === 'FOLDER') {
            return 'folder';
        }

        const extension = this.getFileExtension(fileName).toLowerCase();

        return this.toFileIcon(extension);
    }

    toFileIcon(extension: string) {
        return FileIconService.ICON_MAP[extension] || 'insert_drive_file';
    }

    /**
     * Returns the Material icon name for a given MIME content type.
     */
    getContentTypeIcon(mime: string): string {
        if (!mime) return 'insert_drive_file';
        if (mime.includes('pdf')) return 'picture_as_pdf';
        if ((mime.includes('word') || mime.includes('document')) && !mime.includes('spread') && !mime.includes('present')) return 'description';
        if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'grid_on';
        if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slideshow';
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('video/')) return 'movie';
        if (mime.startsWith('audio/')) return 'audiotrack';
        if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive') || mime.includes('tar') || mime.includes('rar')) return 'archive';
        if (mime.includes('json') || mime.includes('xml') || mime.includes('javascript') || mime.includes('html') || mime.includes('css') || mime.includes('sql')) return 'code';
        if (mime.startsWith('text/') || mime.includes('markdown')) return 'article';
        return 'insert_drive_file';
    }

    /**
     * Returns the brand color for a given MIME content type.
     */
    getContentTypeColor(mime: string): string {
        const icon = this.getContentTypeIcon(mime);
        return FileIconService.COLOR_MAP[icon] || '#6b7280';
    }

    /**
     * Returns the brand color for a given Material icon name.
     */
    getIconColor(icon: string): string {
        return FileIconService.COLOR_MAP[icon] || '#6b7280';
    }

    /**
     * Returns the brand color for a file based on name + type.
     * Uses extension-based icon lookup, then maps to the color.
     */
    getFileColor(fileName: string, type: 'FILE' | 'FOLDER'): string {
        const icon = this.getFileIcon(fileName, type);
        return FileIconService.COLOR_MAP[icon] || '#6b7280';
    }

    /**
     * Returns a short human-readable label for a MIME content type.
     */
    getContentTypeLabel(mime: string): string {
        if (!mime) return 'Unknown';
        if (mime.includes('pdf')) return 'PDF';
        if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'Word';
        if (mime.includes('spreadsheetml') || mime.includes('ms-excel')) return 'Excel';
        if (mime.includes('presentationml') || mime.includes('ms-powerpoint')) return 'PowerPoint';
        if (mime === 'image/jpeg' || mime === 'image/jpg') return 'JPEG';
        if (mime === 'image/png') return 'PNG';
        if (mime === 'image/gif') return 'GIF';
        if (mime === 'image/svg+xml') return 'SVG';
        if (mime === 'image/webp') return 'WebP';
        if (mime.startsWith('image/')) return mime.split('/')[1].toUpperCase();
        if (mime.startsWith('video/')) return mime.split('/')[1].toUpperCase();
        if (mime.startsWith('audio/')) return mime.split('/')[1].toUpperCase();
        if (mime.includes('zip') || mime.includes('x-zip-compressed')) return 'ZIP';
        if (mime.includes('gzip') || mime.includes('x-gzip')) return 'GZIP';
        if (mime.includes('x-rar') || mime.includes('rar')) return 'RAR';
        if (mime.includes('x-tar')) return 'TAR';
        if (mime.includes('x-7z')) return '7Z';
        if (mime.includes('json')) return 'JSON';
        if (mime.includes('xml')) return 'XML';
        if (mime.includes('javascript')) return 'JavaScript';
        if (mime.includes('html')) return 'HTML';
        if (mime.includes('css')) return 'CSS';
        if (mime.includes('sql')) return 'SQL';
        if (mime === 'text/plain') return 'Text';
        if (mime.includes('markdown')) return 'Markdown';
        if (mime.startsWith('text/')) return mime.split('/')[1];
        const sub = mime.split('/')[1] || mime;
        return sub.length > 12 ? sub.substring(0, 12) + '\u2026' : sub;
    }

    getFileExtension(fileName: string): string {
        const lastDotIndex = fileName.lastIndexOf('.');
        return lastDotIndex !== -1 ? fileName.substring(lastDotIndex + 1) : '';
    }

    getFileSize(bytes: number): string {
        if (bytes === 0) return '0 ' + this.translate.instant('fileSize.B');

        const unitKeys = ['fileSize.B', 'fileSize.KB', 'fileSize.MB', 'fileSize.GB', 'fileSize.TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const value = parseFloat((bytes / Math.pow(1024, i)).toFixed(2));

        return value + ' ' + this.translate.instant(unitKeys[i]);
    }
}
