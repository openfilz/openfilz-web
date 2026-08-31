import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../../services/settings.service';
import { McpConnection } from '../../models/mcp-settings.models';
import { McpSetupDialogComponent } from '../../dialogs/mcp-setup-dialog/mcp-setup-dialog.component';

/**
 * "MCP server" section of the personal settings page: the two values a user needs to point an
 * external AI agent (Claude Code/Desktop, Cursor, n8n, …) at this deployment — the endpoint and
 * the OAuth client id — plus the read-only/read-write posture and a per-tool cheat sheet.
 *
 * Read-only: the deployment owns this configuration, the page only reports it. Dedicated
 * component file to keep the enterprise fork merge simple, same as AiSettingsComponent.
 */
@Component({
  selector: 'app-mcp-settings',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, TranslatePipe],
  templateUrl: './mcp-settings.component.html',
  styleUrls: ['./mcp-settings.component.css']
})
export class McpSettingsComponent {

  private settingsService = inject(SettingsService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  get connection(): McpConnection | null {
    return this.settingsService.mcpConnection;
  }

  /** Agents can only read. Worth stating plainly: it explains why write tools are absent. */
  get isReadOnly(): boolean {
    return this.connection?.mode !== 'READ_WRITE';
  }

  copy(value: string): void {
    navigator.clipboard.writeText(value).then(() => {
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

  openSetupGuide(): void {
    const connection = this.connection;
    if (!connection) {
      return;
    }
    this.dialog.open(McpSetupDialogComponent, {
      data: connection,
      width: '760px',
      maxWidth: '95vw',
      autoFocus: false
    });
  }
}
