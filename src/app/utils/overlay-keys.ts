/**
 * Page shortcuts (Delete = delete the selected files) must never act from, or behind, a dialog:
 * Delete on a field of the signature dialog used to delete the file selected in the explorer.
 */

/** True when the key press comes from inside a CDK overlay (dialog, menu, bottom sheet). */
export function isInOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('.cdk-overlay-container');
}

/** True while a Material dialog is open, wherever the focus is. */
export function hasOpenDialog(doc: Document = document): boolean {
  return !!doc.querySelector('.cdk-overlay-container .mat-mdc-dialog-container');
}
