/**
 * Descriptors driving every surface that renders file/folder actions:
 * the contextual selection toolbar (icon buttons + overflow menu), the
 * mobile selection bottom sheet, and the per-item kebab/context menus.
 *
 * Downstream forks (openfilz-web-ee) extend the UI by contributing extra
 * descriptors instead of forking the templates.
 */
export type FileActionId = 'open' | 'rename' | 'download' | 'move' | 'copy' | 'delete' | 'details';

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

/** Per-item kebab / right-click context menu actions (order = menu order) */
export const STANDARD_ITEM_ACTIONS: FileActionDescriptor[] = [
  { id: 'open', icon: 'visibility', labelKey: 'common.open', ariaKey: 'toolbar.openSelected', category: 'organize', placement: 'primary' },
  { id: 'download', icon: 'download', labelKey: 'common.download', ariaKey: 'toolbar.downloadSelected', category: 'transfer', placement: 'primary' },
  { id: 'rename', icon: 'edit', labelKey: 'common.rename', ariaKey: 'toolbar.renameSelected', category: 'organize', placement: 'primary' },
  { id: 'move', icon: 'drive_file_move', labelKey: 'toolbar.move', ariaKey: 'toolbar.moveSelected', category: 'organize', placement: 'primary' },
  { id: 'copy', icon: 'content_copy', labelKey: 'toolbar.copy', ariaKey: 'toolbar.copySelected', category: 'organize', placement: 'primary' },
  { id: 'details', icon: 'info', labelKey: 'common.details', ariaKey: 'fileList.viewProperties', category: 'organize', placement: 'primary' },
  { id: 'delete', icon: 'delete', labelKey: 'common.delete', ariaKey: 'toolbar.deleteSelected', category: 'danger', placement: 'primary', danger: true },
];

/** Bottom-sheet category grouping (order = sheet order) */
export const SHEET_CATEGORIES: { key: FileActionCategory; titleKey: string }[] = [
  { key: 'organize', titleKey: 'bottomSheet.organize' },
  { key: 'transfer', titleKey: 'bottomSheet.shareAndDownload' },
  { key: 'danger', titleKey: 'bottomSheet.dangerZone' },
];
