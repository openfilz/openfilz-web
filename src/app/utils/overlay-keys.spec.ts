// @vitest-environment jsdom
import { hasOpenDialog, isInOverlay } from './overlay-keys';

// Page shortcuts (Delete = delete the selected files) must never fire from, or behind, a dialog:
// Delete on a field of the signature dialog used to delete the file selected in the explorer.
describe('keyboard shortcuts behind dialogs', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  function overlayWithDialog(): HTMLElement {
    document.body.innerHTML = `
      <main><div id="row" tabindex="0"></div></main>
      <div class="cdk-overlay-container">
        <div class="mat-mdc-dialog-container"><div id="field" tabindex="0" role="button"></div></div>
      </div>`;
    return document.getElementById('field')!;
  }

  it('sees a key pressed inside a dialog as coming from an overlay', () => {
    expect(isInOverlay(overlayWithDialog())).toBe(true);
  });

  it('sees an open dialog even when the focus stayed on the page behind it', () => {
    overlayWithDialog();
    expect(isInOverlay(document.getElementById('row'))).toBe(false);
    expect(hasOpenDialog()).toBe(true);
  });

  it('lets page shortcuts work when no dialog is open', () => {
    document.body.innerHTML = '<main><div id="row" tabindex="0"></div></main><div class="cdk-overlay-container"></div>';
    expect(isInOverlay(document.getElementById('row'))).toBe(false);
    expect(hasOpenDialog()).toBe(false);
  });

  it('ignores a target that is not an element', () => {
    expect(isInOverlay(null)).toBe(false);
    expect(isInOverlay(document)).toBe(false);
  });
});
