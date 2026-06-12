/**
 * Pure mime/extension → viewer mode logic, extracted from FileViewerDialogComponent
 * so the audit version actions can check "is this file previewable" without
 * instantiating the dialog. Dedicated file for openfilz-web-ee merge friendliness.
 */

export type ViewerMode = 'pdf' | 'image' | 'text' | 'office' | 'onlyoffice' | 'unsupported';

/**
 * Determine the viewer mode for a file.
 *
 * @param fileName        the file name (extension fallback)
 * @param contentType     the MIME type
 * @param allowOnlyOffice pass true only when OnlyOffice is enabled AND supports the
 *                        extension AND the live document is being viewed (never for
 *                        an immutable historical version)
 */
export function determineViewerMode(fileName?: string, contentType?: string, allowOnlyOffice: boolean = false): ViewerMode {
  const ct = contentType?.toLowerCase() || '';
  const fn = fileName?.toLowerCase() || '';

  if (allowOnlyOffice) {
    return 'onlyoffice';
  }

  // PDF
  if (ct === 'application/pdf' || fn.endsWith('.pdf')) {
    return 'pdf';
  }
  // Images
  if (ct.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fn)) {
    return 'image';
  }
  // Text/Code files
  if (ct.startsWith('text/') ||
    ct === 'application/json' ||
    ct === 'application/xml' ||
    /\.(txt|json|xml|html|css|js|ts|java|py|md|yml|yaml|sh|bat|log|sql|dat)$/i.test(fn)) {
    return 'text';
  }
  // Office documents (in-app mammoth/xlsx renderers)
  if (ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ct === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    /\.(docx|xlsx)$/i.test(fn)) {
    return 'office';
  }
  return 'unsupported';
}

/**
 * Whether a historical version of this file can be previewed in-app
 * (OnlyOffice is intentionally excluded — it edits the live document).
 */
export function isPreviewableVersion(fileName?: string, contentType?: string): boolean {
  return determineViewerMode(fileName, contentType, false) !== 'unsupported';
}
