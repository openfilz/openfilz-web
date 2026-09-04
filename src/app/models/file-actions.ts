/**
 * Descriptors driving every surface that renders file/folder actions:
 * the contextual selection toolbar (icon buttons + overflow menu), the
 * mobile selection bottom sheet, and the per-item kebab/context menus.
 *
 * Downstream forks (openfilz-web-ee) extend the UI by contributing extra
 * descriptors instead of forking the templates.
 */
export type FileActionId = 'open' | 'rename' | 'download' | 'move' | 'copy' | 'delete' | 'details' | 'requestSignature'
  | 'organizePdf' | 'mergePdf' | 'splitPdf' | 'rotatePdf' | 'organizeWithAi';

export type FileActionCategory = 'organize' | 'transfer' | 'danger';

export interface FileActionDescriptor {
  id: FileActionId;
  icon: string;
  labelKey: string;
  /** Label used in the mobile bottom sheet when it differs from labelKey (e.g. "Move to...") */
  sheetLabelKey?: string;
  ariaKey: string;
  category: FileActionCategory;
  /** 'primary' renders as an icon button in the contextual bar; 'overflow' goes to the "more" menu */
  placement: 'primary' | 'overflow';
  /** Action only applies to a single selected item */
  singleOnly?: boolean;
  /** Action needs at least this many selected items (e.g. merge) */
  minSelection?: number;
  danger?: boolean;
}

/** Selection-bar actions (order defines rendering order per placement/category) */
export const STANDARD_SELECTION_ACTIONS: FileActionDescriptor[] = [
  { id: 'download', icon: 'download', labelKey: 'common.download', ariaKey: 'toolbar.downloadSelected', category: 'transfer', placement: 'primary' },
  { id: 'move', icon: 'drive_file_move', labelKey: 'toolbar.move', sheetLabelKey: 'bottomSheet.moveTo', ariaKey: 'toolbar.moveSelected', category: 'organize', placement: 'primary' },
  { id: 'copy', icon: 'content_copy', labelKey: 'toolbar.copy', sheetLabelKey: 'bottomSheet.copyTo', ariaKey: 'toolbar.copySelected', category: 'organize', placement: 'primary' },
  { id: 'delete', icon: 'delete', labelKey: 'common.delete', ariaKey: 'toolbar.deleteSelected', category: 'danger', placement: 'primary', danger: true },
  { id: 'open', icon: 'visibility', labelKey: 'common.open', ariaKey: 'toolbar.openSelected', category: 'organize', placement: 'overflow', singleOnly: true },
  { id: 'rename', icon: 'edit', labelKey: 'common.rename', ariaKey: 'toolbar.renameSelected', category: 'organize', placement: 'overflow', singleOnly: true },
  { id: 'details', icon: 'info', labelKey: 'common.details', ariaKey: 'fileList.viewProperties', category: 'organize', placement: 'overflow', singleOnly: true },
];

/**
 * e-Sign "Request signature" per-item action. Only offered for PDF files and only
 * when the API reports `signatureActive` — see `visibleItemActions()` in file-list/file-grid.
 */
export const REQUEST_SIGNATURE_ACTION: FileActionDescriptor = {
  id: 'requestSignature', icon: 'draw', labelKey: 'toolbar.requestSignature', ariaKey: 'toolbar.requestSignature', category: 'transfer', placement: 'primary', singleOnly: true
};

/**
 * "Organise with AI" on a folder: opens the assistant with a reorganisation request for that
 * folder. Folder-only, and only when the chat is on + the user is a CONTRIBUTOR — see
 * `AiOrganizeAccessService` and `visibleItemActions()` in file-list/file-grid.
 */
export const ORGANIZE_WITH_AI_ACTION: FileActionDescriptor = {
  id: 'organizeWithAi', icon: 'auto_awesome', labelKey: 'aiChat.organize.action', ariaKey: 'aiChat.organize.action', category: 'organize', placement: 'primary', singleOnly: true
};

/** True for folders. */
export function isFolderItem(item: { type?: string }): boolean {
  return item.type === 'FOLDER';
}

/** True for PDF documents (by content type, falling back to the extension). */
export function isPdfItem(item: { name?: string; contentType?: string; type?: string }): boolean {
  if (item.type === 'FOLDER') return false;
  return item.contentType === 'application/pdf' || /\.pdf$/i.test(item.name ?? '');
}

/**
 * PDF tools (merge / split / rotate / organize pages). Offered only when every selected item is a
 * PDF and the API reports `pdfToolsActive` (plus the CONTRIBUTOR role) — see
 * `PdfToolsAccessService` and `canUsePdfToolsForSelection()` in FileOperationsComponent.
 */
export const PDF_TOOLS_SELECTION_ACTIONS: FileActionDescriptor[] = [
  { id: 'organizePdf', icon: 'dashboard_customize', labelKey: 'pdfTools.actions.organize', ariaKey: 'pdfTools.actions.organize', category: 'organize', placement: 'primary', singleOnly: true },
  { id: 'mergePdf', icon: 'merge', labelKey: 'pdfTools.actions.merge', ariaKey: 'pdfTools.actions.merge', category: 'organize', placement: 'primary', minSelection: 2 },
  { id: 'splitPdf', icon: 'call_split', labelKey: 'pdfTools.actions.split', ariaKey: 'pdfTools.actions.split', category: 'organize', placement: 'overflow', singleOnly: true },
  { id: 'rotatePdf', icon: 'rotate_90_degrees_cw', labelKey: 'pdfTools.actions.rotate', ariaKey: 'pdfTools.actions.rotate', category: 'organize', placement: 'overflow' },
];

/** The single-item PDF tools shown in the per-item kebab / context menu (merge needs several items). */
export const PDF_TOOLS_ITEM_ACTIONS: FileActionDescriptor[] = PDF_TOOLS_SELECTION_ACTIONS
  .filter(a => a.id !== 'mergePdf')
  .map(a => ({ ...a, placement: 'primary' as const }));

export function isPdfToolsAction(id: FileActionId): boolean {
  return id === 'organizePdf' || id === 'mergePdf' || id === 'splitPdf' || id === 'rotatePdf';
}

/** Per-item kebab / right-click context menu actions (order = menu order) */
export const STANDARD_ITEM_ACTIONS: FileActionDescriptor[] = [
  { id: 'open', icon: 'visibility', labelKey: 'common.open', ariaKey: 'toolbar.openSelected', category: 'organize', placement: 'primary' },
  { id: 'download', icon: 'download', labelKey: 'common.download', ariaKey: 'toolbar.downloadSelected', category: 'transfer', placement: 'primary' },
  { id: 'rename', icon: 'edit', labelKey: 'common.rename', ariaKey: 'toolbar.renameSelected', category: 'organize', placement: 'primary' },
  { id: 'move', icon: 'drive_file_move', labelKey: 'toolbar.move', ariaKey: 'toolbar.moveSelected', category: 'organize', placement: 'primary' },
  { id: 'copy', icon: 'content_copy', labelKey: 'toolbar.copy', ariaKey: 'toolbar.copySelected', category: 'organize', placement: 'primary' },
  REQUEST_SIGNATURE_ACTION,
  ...PDF_TOOLS_ITEM_ACTIONS,
  ORGANIZE_WITH_AI_ACTION,
  { id: 'details', icon: 'info', labelKey: 'common.details', ariaKey: 'fileList.viewProperties', category: 'organize', placement: 'primary' },
  { id: 'delete', icon: 'delete', labelKey: 'common.delete', ariaKey: 'toolbar.deleteSelected', category: 'danger', placement: 'primary', danger: true },
];

/** Bottom-sheet category grouping (order = sheet order) */
export const SHEET_CATEGORIES: { key: FileActionCategory; titleKey: string }[] = [
  { key: 'organize', titleKey: 'bottomSheet.organize' },
  { key: 'transfer', titleKey: 'bottomSheet.shareAndDownload' },
  { key: 'danger', titleKey: 'bottomSheet.dangerZone' },
];
