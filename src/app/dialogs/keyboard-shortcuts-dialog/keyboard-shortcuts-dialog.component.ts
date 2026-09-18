import { Component, inject } from '@angular/core';

import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { KeyboardShortcutsService } from '../../services/keyboard-shortcuts.service';

interface ShortcutGroup {
  category: string;
  shortcuts: Array<{
    keys: string;
    description: string;
  }>;
}

@Component({
  selector: 'app-keyboard-shortcuts-dialog',
  standalone: true,
  templateUrl: './keyboard-shortcuts-dialog.component.html',
  styleUrls: ['./keyboard-shortcuts-dialog.component.css'],
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    TranslatePipe
]
})
export class KeyboardShortcutsDialogComponent {
  shortcutGroups: ShortcutGroup[] = [
    {
      category: 'shortcuts.categories.fileManagement',
      shortcuts: [
        { keys: 'Ctrl+U', description: 'shortcuts.items.upload' },
        { keys: 'Ctrl+N', description: 'shortcuts.items.newFolder' },
        { keys: 'Ctrl+D', description: 'shortcuts.items.download' },
        { keys: 'F2', description: 'shortcuts.items.rename' },
        { keys: 'Delete', description: 'shortcuts.items.delete' }
      ]
    },
    {
      category: 'shortcuts.categories.selection',
      shortcuts: [
        { keys: 'Ctrl+A', description: 'shortcuts.items.selectAll' },
        { keys: 'Escape', description: 'shortcuts.items.clearSelection' },
        { keys: 'Space', description: 'shortcuts.items.toggleSelection' }
      ]
    },
    {
      category: 'shortcuts.categories.copyMove',
      shortcuts: [
        { keys: 'Ctrl+Shift+C', description: 'shortcuts.items.copy' },
        { keys: 'Ctrl+X', description: 'shortcuts.items.move' }
      ]
    },
    {
      category: 'shortcuts.categories.navigation',
      shortcuts: [
        { keys: '↑ ↓ ← →', description: 'shortcuts.items.navigateItems' },
        { keys: 'Enter', description: 'shortcuts.items.open' },
        { keys: 'Home', description: 'shortcuts.items.first' },
        { keys: 'End', description: 'shortcuts.items.last' }
      ]
    },
    {
      category: 'shortcuts.categories.general',
      shortcuts: [
        { keys: '?', description: 'shortcuts.items.showShortcuts' },
        { keys: 'Escape', description: 'shortcuts.items.closeDialogs' }
      ]
    }
  ];

  public dialogRef = inject(MatDialogRef<KeyboardShortcutsDialogComponent>);

  constructor() { }

  onClose(): void {
    this.dialogRef.close();
  }

  // Parse keyboard shortcut string to separate keys
  parseShortcutKeys(keys: string): string[] {
    return keys.split('+').map(key => key.trim());
  }
}
