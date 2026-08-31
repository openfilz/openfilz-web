import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { McpConnection, McpSnippet, buildMcpSnippets } from '../../models/mcp-settings.models';

/**
 * "Connect your AI tool" cheat sheet: one tab per MCP host, each holding a short snippet
 * already filled in with THIS deployment's endpoint, realm and client id.
 *
 * The same tabs exist on openfilz.com, but the site can only ship placeholders — it does not
 * know the reader's hostname. Pre-filling them here is the difference between a two-minute
 * substitution exercise and a copy/paste.
 */
@Component({
  selector: 'app-mcp-setup-dialog',
  standalone: true,
  templateUrl: './mcp-setup-dialog.component.html',
  styleUrls: ['./mcp-setup-dialog.component.css'],
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe]
})
export class McpSetupDialogComponent {

  private dialogRef = inject(MatDialogRef<McpSetupDialogComponent>);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  readonly connection: McpConnection = inject(MAT_DIALOG_DATA);
  readonly snippets: McpSnippet[] = buildMcpSnippets(this.connection);

  /** Index of the visible tab — Claude Code, i.e. the shortest path in. */
  activeIndex = 1;

  get activeSnippet(): McpSnippet {
    return this.snippets[this.activeIndex];
  }

  select(index: number): void {
    this.activeIndex = index;
  }

  copyActive(): void {
    navigator.clipboard.writeText(this.activeSnippet.code).then(() => {
      this.snackBar.open(
        this.translate.instant('settings.mcp.copied'),
        this.translate.instant('common.close'),
        { duration: 2000 });
    }).catch(() => {
      this.snackBar.open(
        this.translate.instant('settings.mcp.copyFailed'),
        this.translate.instant('common.close'),
        { duration: 2000 });
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
