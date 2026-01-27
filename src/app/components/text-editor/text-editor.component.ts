import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorComponent } from 'ngx-monaco-editor-v2';

declare const monaco: any;

@Component({
  selector: 'app-text-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, EditorComponent],
  templateUrl: './text-editor.component.html',
  styleUrls: ['./text-editor.component.css']
})
export class TextEditorComponent implements OnChanges, OnDestroy {
  @Input() content: string = '';
  @Input() language: string = 'plaintext';
  @Input() readOnly: boolean = false;
  @Input() theme: string = 'vs-light';

  @Output() contentChange = new EventEmitter<string>();
  @Output() save = new EventEmitter<void>();

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
      this.editorOptions = { ...this.editorOptions, language: this.language };
    }
    if (changes['readOnly']) {
      this.editorOptions = { ...this.editorOptions, readOnly: this.readOnly };
    }
    if (changes['theme']) {
      this.editorOptions = { ...this.editorOptions, theme: this.theme };
    }
  }

  editor: any;

  onInit(editor: any) {
    this.editor = editor;
    // Add Ctrl+S binding
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      this.save.emit();
    });
  }

  onContentChange(value: string) {
    this.content = value;
    this.contentChange.emit(value);
  }

  ngOnDestroy(): void {
    if (this.editor) {
      // Manually dispose the model to prevent "Canceled" error on component destruction
      const model = this.editor.getModel();
      if (model) {
        model.dispose();
      }
    }
  }
}
