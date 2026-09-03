import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, OnDestroy, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorComponent } from 'ngx-monaco-editor-v2';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TouchDetectionService } from '../../services/touch-detection.service';
import { MonacoTouchSelection } from './monaco-touch-selection';

declare const monaco: any;

@Component({
  selector: 'app-text-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, EditorComponent, MatIconModule, MatTooltipModule, TranslatePipe],
  templateUrl: './text-editor.component.html',
  styleUrls: ['./text-editor.component.css']
})
export class TextEditorComponent implements OnChanges, OnDestroy {
  @Input() content: string = '';
  @Input() language: string = 'plaintext';
  @Input() readOnly: boolean = false;
  @Input() theme: string = 'vs-light';
  @Input() largeFile: boolean = false;

  @Output() contentChange = new EventEmitter<string>();
  @Output() save = new EventEmitter<void>();

  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private touchDetection = inject(TouchDetectionService);
  private zone = inject(NgZone);

  /** Touch devices get the long-press selection gesture and the selection action bar. */
  readonly touchDevice = this.touchDetection.isTouchDevice();
  /** Drives the action bar: there is no keyboard shortcut for copy/cut on a phone. */
  hasSelection = false;

  private touchSelection: MonacoTouchSelection | null = null;
  private selectionListener: { dispose(): void } | null = null;

  editorOptions = {
    theme: 'vs-light',
    language: 'plaintext',
    readOnly: false,
    automaticLayout: true,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    fontSize: 14,
    wordWrap: 'on'
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['language']) {
      this.editorOptions = { ...this.editorOptions, language: this.largeFile ? 'plaintext' : this.language };
    }
    if (changes['readOnly']) {
      this.editorOptions = { ...this.editorOptions, readOnly: this.readOnly };
    }
    if (changes['theme']) {
      this.editorOptions = { ...this.editorOptions, theme: this.theme };
    }
    if (changes['largeFile']) {
      this.editorOptions = {
        ...this.editorOptions,
        language: this.largeFile ? 'plaintext' : this.language,
        minimap: { enabled: !this.largeFile },
        wordWrap: this.largeFile ? 'off' : 'on'
      };
    }
  }

  editor: any;

  onInit(editor: any) {
    this.editor = editor;
    // Add Ctrl+S binding
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      this.save.emit();
    });

    if (this.touchDevice) {
      // Monaco cannot drag-select with a finger (see MonacoTouchSelection), so a phone user
      // can otherwise only ever select a single word. The editor itself lives outside the
      // Angular zone (ngx-monaco-editor-v2 defaults `insideNg` to false); keep the gesture out
      // of it too so a selection drag doesn't run change detection on every touchmove.
      this.zone.runOutsideAngular(() => {
        this.touchSelection = new MonacoTouchSelection(editor);
        this.selectionListener = editor.onDidChangeCursorSelection(() => this.refreshSelectionState());
      });
    }
  }

  onContentChange(value: string) {
    this.content = value;
    this.contentChange.emit(value);
  }

  // --- Selection action bar (touch devices only) -----------------------------------------

  /** Shows/hides the action bar. Re-enters the zone only when the state actually flips. */
  private refreshSelectionState(): void {
    const selection = this.editor?.getSelection();
    const hasSelection = !!selection && !selection.isEmpty();
    if (hasSelection !== this.hasSelection) {
      this.zone.run(() => this.hasSelection = hasSelection);
    }
  }

  copySelection(): void {
    const text = this.selectedText();
    if (text) {
      this.toClipboard(text);
    }
  }

  cutSelection(): void {
    const text = this.selectedText();
    if (!text || this.readOnly) {
      return;
    }
    this.toClipboard(text, () => {
      const selection = this.editor.getSelection();
      this.editor.executeEdits('touch-cut', [{ range: selection, text: '', forceMoveMarkers: true }]);
      this.editor.pushUndoStop();
    });
  }

  pasteAtSelection(): void {
    if (this.readOnly) {
      return;
    }
    if (!navigator.clipboard?.readText) {
      this.notify('textEditor.clipboardUnavailable');
      return;
    }
    navigator.clipboard.readText()
      .then(text => {
        if (!text) {
          return;
        }
        const selection = this.editor.getSelection();
        this.editor.executeEdits('touch-paste', [{ range: selection, text, forceMoveMarkers: true }]);
        this.editor.pushUndoStop();
      })
      .catch(() => this.notify('textEditor.clipboardUnavailable'));
  }

  selectAll(): void {
    const model = this.editor?.getModel();
    if (model) {
      this.editor.setSelection(model.getFullModelRange());
    }
  }

  clearSelection(): void {
    const selection = this.editor?.getSelection();
    if (selection) {
      this.editor.setPosition({ lineNumber: selection.endLineNumber, column: selection.endColumn });
    }
  }

  private selectedText(): string {
    const selection = this.editor?.getSelection();
    const model = this.editor?.getModel();
    if (!selection || !model || selection.isEmpty()) {
      return '';
    }
    return model.getValueInRange(selection);
  }

  /**
   * `navigator.clipboard` is unavailable on insecure origins (plain-http deployments), which is
   * exactly where a phone user is most likely to hit this, so keep the execCommand fallback.
   */
  private toClipboard(text: string, onCopied?: () => void): void {
    const succeeded = () => {
      onCopied?.();
      this.notify('textEditor.copied');
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(succeeded)
        .catch(() => {
          if (this.legacyCopy(text)) {
            succeeded();
          } else {
            this.notify('textEditor.clipboardUnavailable');
          }
        });
      return;
    }

    if (this.legacyCopy(text)) {
      succeeded();
    } else {
      this.notify('textEditor.clipboardUnavailable');
    }
  }

  private legacyCopy(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  private notify(key: string): void {
    this.snackBar.open(
      this.translate.instant(key),
      this.translate.instant('common.close'),
      { duration: 2000 });
  }

  ngOnDestroy(): void {
    this.touchSelection?.dispose();
    this.touchSelection = null;
    this.selectionListener?.dispose();
    this.selectionListener = null;
    if (this.editor) {
      // Manually dispose the model to prevent "Canceled" error on component destruction
      const model = this.editor.getModel();
      if (model) {
        model.dispose();
      }
    }
  }
}
