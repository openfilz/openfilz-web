import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { WorkflowService } from '../../../services/workflow.service';
import { DocumentApiService } from '../../../services/document-api.service';
import {
  TRANSITION_STYLES, WORKFLOW_COLORS, WorkflowAction, WorkflowActionType, WorkflowAssigneeType, WorkflowProblem, WorkflowSpec, WorkflowState,
  WorkflowStateKind, WorkflowTransition
} from '../../../models/workflow.models';
import { WorkflowDiagramComponent } from '../../../components/workflow-diagram/workflow-diagram.component';
import { FolderTreeDialogComponent } from '../../../dialogs/folder-tree-dialog/folder-tree-dialog.component';
import { WorkflowTemplateId, problemsByState, templateSpec, uniqueKey, validateSpec } from '../../../utils/workflow-spec';

/** Editable copy of a state: e-mails and metadata are edited as text and turned back into the spec on save. */
interface EditableAction {
  type: WorkflowActionType;
  folderId: string | null;
  folderName: string | null;
  entriesText: string;
  emailsText: string;
}

interface EditableState {
  key: string;
  keyLocked: boolean;
  label: string;
  kind: WorkflowStateKind;
  color: string;
  assigneeType: WorkflowAssigneeType;
  emailsText: string;
  role: string;
  question: string;
  dueInDays: number | null;
  transitions: WorkflowTransition[];
  onEnter: EditableAction[];
}

/**
 * The workflow editor (`/workflows/definitions/new?template=…` and `/workflows/definitions/:id`):
 * one card per status (label, kind, colour, assignees, due delay, transitions, on-enter actions),
 * the live diagram on the right, problems inline. Saves through the API's validation.
 */
@Component({
  selector: 'app-workflow-editor',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatMenuModule,
    MatProgressSpinnerModule, MatSelectModule, MatSlideToggleModule, MatTooltipModule, TranslatePipe, WorkflowDiagramComponent],
  templateUrl: './workflow-editor.component.html',
  styleUrls: ['./workflow-editor.component.css']
})
export class WorkflowEditorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private workflows = inject(WorkflowService);
  private documentApi = inject(DocumentApiService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  readonly colors = WORKFLOW_COLORS;
  readonly styles = TRANSITION_STYLES;
  readonly kinds: WorkflowStateKind[] = ['START', 'STEP', 'END'];
  readonly assigneeTypes: WorkflowAssigneeType[] = ['INITIATOR', 'USERS', 'ROLE', 'CHOSEN_AT_START'];
  readonly actionTypes: WorkflowActionType[] = ['MOVE_TO_FOLDER', 'SET_METADATA', 'NOTIFY'];

  id: string | null = null;
  loading = true;
  saving = false;
  name = '';
  description = '';
  active = true;
  triggerFolders: { id: string; name: string }[] = [];
  states: EditableState[] = [];
  selectedIndex = 0;
  problems: WorkflowProblem[] = [];
  problemsByState = new Map<number, WorkflowProblem[]>();
  serverProblems: WorkflowProblem[] = [];
  dirty = false;

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id');
    if (this.id && this.id !== 'new') {
      this.workflows.getDefinition(this.id).subscribe({
        next: def => {
          this.name = def.name;
          this.description = def.description ?? '';
          this.active = def.active;
          this.states = def.spec.states.map(s => this.toEditable(s, true));
          this.triggerFolders = def.triggerFolderIds.map(id => ({ id, name: '…' }));
          this.triggerFolders.forEach(f => this.documentApi.getDocumentInfo(f.id).subscribe({ next: i => f.name = i.name, error: () => f.name = f.id }));
          this.loading = false;
          this.revalidate();
        },
        error: err => { this.loading = false; this.toastError(err, 'workflow.errors.notFound'); this.back(); }
      });
    } else {
      this.id = null;
      const template = (this.route.snapshot.queryParamMap.get('template') ?? 'approval') as WorkflowTemplateId;
      const spec = templateSpec(template, key => this.translate.instant('workflow.designer.labels.' + key));
      this.states = spec.states.map(s => this.toEditable(s, false));
      this.name = template === 'blank' ? '' : this.translate.instant('workflow.designer.templates.' + template);
      this.loading = false;
      this.revalidate();
    }
  }

  // ── model ↔ editable ────────────────────────────────────────────────

  private toEditable(s: WorkflowState, keyLocked: boolean): EditableState {
    const a = s.assignees ?? { type: 'INITIATOR' as const };
    return {
      key: s.key, keyLocked, label: s.label, kind: s.kind, color: s.color || '#94a3b8',
      assigneeType: a.type, emailsText: (a.emails ?? []).join(', '), role: a.role ?? 'CONTRIBUTOR', question: a.label ?? '',
      dueInDays: s.dueInDays ?? null,
      transitions: (s.transitions ?? []).map(t => ({ ...t })),
      onEnter: (s.onEnter ?? []).map(act => ({
        type: act.type, folderId: act.folderId ?? null, folderName: null,
        entriesText: Object.entries(act.entries ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'),
        emailsText: (act.emails ?? []).join(', ')
      }))
    };
  }

  private toAction(a: EditableAction): WorkflowAction {
    switch (a.type) {
      case 'MOVE_TO_FOLDER': return { type: a.type, folderId: a.folderId };
      case 'SET_METADATA': {
        const entries: Record<string, string> = {};
        a.entriesText.split(/\r?\n/).map(l => l.trim()).filter(l => l).forEach(l => {
          const i = l.indexOf('=');
          if (i > 0) entries[l.slice(0, i).trim()] = l.slice(i + 1).trim(); else entries[l] = '';
        });
        return { type: a.type, entries };
      }
      case 'NOTIFY': return { type: a.type, emails: splitEmails(a.emailsText) };
    }
  }

  get spec(): WorkflowSpec {
    return {
      states: this.states.map(s => ({
        key: s.key, label: s.label, kind: s.kind, color: s.color,
        assignees: s.kind === 'END' ? null : assignmentOf(s),
        dueInDays: s.kind === 'END' ? null : s.dueInDays || null,
        transitions: s.kind === 'END' ? [] : s.transitions.map(t => ({ ...t })),
        onEnter: s.onEnter.map(a => this.toAction(a))
      }))
    };
  }

  // ── editing ─────────────────────────────────────────────────────────

  get selected(): EditableState | undefined {
    return this.states[this.selectedIndex];
  }

  select(i: number): void {
    this.selectedIndex = i;
    setTimeout(() => document.getElementById('state-card-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  onDiagramClick(key: string): void {
    const i = this.states.findIndex(s => s.key === key);
    if (i >= 0) this.select(i);
  }

  onLabelChange(s: EditableState): void {
    if (!s.keyLocked) s.key = uniqueKey(s.label, this.states.filter(x => x !== s).map(x => x.key));
    this.touch();
  }

  addState(kind: WorkflowStateKind = 'STEP'): void {
    const label = this.translate.instant('workflow.editor.newStatus');
    const s: EditableState = {
      key: uniqueKey(label, this.states.map(x => x.key)), keyLocked: false, label, kind,
      color: this.colors[this.states.length % this.colors.length], assigneeType: 'INITIATOR', emailsText: '', role: 'CONTRIBUTOR', question: '',
      dueInDays: null, transitions: [], onEnter: []
    };
    // A new step is inserted before the first END so the picture reads left to right.
    const firstEnd = this.states.findIndex(x => x.kind === 'END');
    const at = kind === 'END' || firstEnd < 0 ? this.states.length : firstEnd;
    this.states.splice(at, 0, s);
    this.select(at);
    this.touch();
  }

  removeState(i: number): void {
    const removed = this.states.splice(i, 1)[0];
    this.states.forEach(s => s.transitions = s.transitions.filter(t => t.to !== removed.key));
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.states.length - 1));
    this.touch();
  }

  move(i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= this.states.length) return;
    [this.states[i], this.states[j]] = [this.states[j], this.states[i]];
    this.selectedIndex = j;
    this.touch();
  }

  onKindChange(s: EditableState): void {
    if (s.kind === 'START') this.states.filter(x => x !== s && x.kind === 'START').forEach(x => x.kind = 'STEP');
    if (s.kind === 'END') { s.transitions = []; s.dueInDays = null; }
    this.touch();
  }

  addTransition(s: EditableState): void {
    const target = this.states.find(x => x !== s && x.kind === 'END') ?? this.states.find(x => x !== s);
    const label = this.translate.instant('workflow.editor.newTransition');
    s.transitions.push({ key: uniqueKey(label, s.transitions.map(t => t.key)), label, to: target?.key ?? '', style: 'PRIMARY', requireComment: false });
    this.touch();
  }

  onTransitionLabelChange(s: EditableState, t: WorkflowTransition): void {
    t.key = uniqueKey(t.label, s.transitions.filter(x => x !== t).map(x => x.key));
    this.touch();
  }

  removeTransition(s: EditableState, i: number): void {
    s.transitions.splice(i, 1);
    this.touch();
  }

  addAction(s: EditableState, type: WorkflowActionType): void {
    s.onEnter.push({ type, folderId: null, folderName: null, entriesText: '', emailsText: '' });
    this.touch();
  }

  removeAction(s: EditableState, i: number): void {
    s.onEnter.splice(i, 1);
    this.touch();
  }

  pickFolder(a: EditableAction): void {
    this.dialog.open(FolderTreeDialogComponent, {
      width: '560px', maxWidth: '96vw',
      data: { title: 'workflow.editor.chooseFolder', actionType: 'move', excludeIds: [] }
    }).afterClosed().subscribe(folderId => {
      if (folderId === undefined) return;
      a.folderId = folderId || null;
      a.folderName = null;
      if (a.folderId) this.documentApi.getDocumentInfo(a.folderId).subscribe({ next: i => a.folderName = i.name, error: () => a.folderName = null });
      this.touch();
    });
  }

  folderLabel(a: EditableAction): string {
    if (!a.folderId) return this.translate.instant('workflow.editor.chooseFolder');
    if (a.folderName === null) {
      a.folderName = '…';
      this.documentApi.getDocumentInfo(a.folderId).subscribe({ next: i => a.folderName = i.name, error: () => a.folderName = a.folderId });
    }
    return a.folderName;
  }

  addTriggerFolder(): void {
    this.dialog.open(FolderTreeDialogComponent, {
      width: '560px', maxWidth: '96vw',
      data: { title: 'workflow.editor.chooseTriggerFolder', actionType: 'move', excludeIds: this.triggerFolders.map(f => f.id) }
    }).afterClosed().subscribe(folderId => {
      if (!folderId || this.triggerFolders.some(f => f.id === folderId)) return;
      const entry = { id: folderId as string, name: '…' };
      this.triggerFolders.push(entry);
      this.documentApi.getDocumentInfo(entry.id).subscribe({ next: i => entry.name = i.name, error: () => entry.name = entry.id });
      this.touch();
    });
  }

  removeTriggerFolder(i: number): void {
    this.triggerFolders.splice(i, 1);
    this.touch();
  }

  touch(): void {
    this.dirty = true;
    this.serverProblems = [];
    this.revalidate();
  }

  revalidate(): void {
    this.problems = validateSpec(this.spec, this.triggerFolders.map(f => f.id));
    this.problemsByState = problemsByState(this.problems);
  }

  problemsFor(i: number): WorkflowProblem[] {
    return this.problemsByState.get(i) ?? [];
  }

  get globalProblems(): WorkflowProblem[] {
    return [...(this.problemsByState.get(-1) ?? []), ...this.serverProblems];
  }

  transitionTargets(s: EditableState): EditableState[] {
    return this.states.filter(x => x !== s || true);
  }

  // ── save ────────────────────────────────────────────────────────────

  get canSave(): boolean {
    return !this.saving && this.name.trim().length > 0 && this.problems.length === 0;
  }

  save(): void {
    if (!this.canSave) return;
    this.saving = true;
    const req = {
      name: this.name.trim(), description: this.description.trim() || null, active: this.active, spec: this.spec,
      triggerFolderIds: this.triggerFolders.map(f => f.id)
    };
    const call = this.id ? this.workflows.updateDefinition(this.id, req) : this.workflows.createDefinition(req);
    call.subscribe({
      next: def => {
        this.saving = false;
        this.dirty = false;
        this.id = def.id;
        this.states.forEach(s => s.keyLocked = true);
        this.snackBar.open(this.translate.instant('workflow.editor.saved', { name: def.name }), this.translate.instant('common.close'), { duration: 4000 });
        this.router.navigate(['/workflows'], { queryParams: { tab: 'designer' } });
      },
      error: err => {
        this.saving = false;
        const body = (err as { error?: { problems?: WorkflowProblem[] } })?.error;
        if (body?.problems?.length) {
          this.serverProblems = body.problems;
        }
        this.toastError(err, 'workflow.editor.saveError');
      }
    });
  }

  back(): void {
    this.router.navigate(['/workflows'], { queryParams: { tab: 'designer' } });
  }

  trackIndex(i: number): number {
    return i;
  }

  private toastError(err: unknown, fallback: string): void {
    const detail = WorkflowService.serverMessage(err);
    const msg = this.translate.instant(WorkflowService.errorKey(err, fallback));
    this.snackBar.open(detail ? `${msg} — ${detail}` : msg, this.translate.instant('common.close'), { duration: 6000 });
  }
}

function splitEmails(text: string): string[] {
  return text.split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(e => e);
}

function assignmentOf(s: EditableState): WorkflowState['assignees'] {
  switch (s.assigneeType) {
    case 'USERS': return { type: 'USERS', emails: splitEmails(s.emailsText) };
    case 'ROLE': return { type: 'ROLE', role: s.role.trim() };
    case 'CHOSEN_AT_START': return { type: 'CHOSEN_AT_START', label: s.question.trim() || undefined };
    default: return { type: 'INITIATOR' };
  }
}
