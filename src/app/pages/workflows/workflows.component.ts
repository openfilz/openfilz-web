import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, takeUntil } from 'rxjs';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowAccessService } from '../../services/workflow-access.service';
import { MyTasksComponent } from './my-tasks/my-tasks.component';
import { WorkflowMonitorComponent } from './monitor/workflow-monitor.component';
import { WorkflowDesignerComponent } from './designer/workflow-designer.component';

/**
 * The Workflows page: three tabs — My tasks, Monitor, Designer (the last one only for users who
 * may design). Deep-linkable: `?tab=tasks|monitor|designer`, `?task=<id>` (highlights a task),
 * `?instance=<id>` (opens an instance in the monitor).
 */
@Component({
  selector: 'app-workflows',
  standalone: true,
  imports: [AsyncPipe, MatIconModule, MatTabsModule, TranslatePipe, MyTasksComponent, WorkflowMonitorComponent, WorkflowDesignerComponent],
  templateUrl: './workflows.component.html',
  styleUrls: ['./workflows.component.css']
})
export class WorkflowsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private access = inject(WorkflowAccessService);
  readonly workflows = inject(WorkflowService);

  private static readonly TABS = ['tasks', 'monitor', 'designer'];
  selectedTab = 0;
  highlightTaskId: string | null = null;
  openInstanceId: string | null = null;
  private destroy$ = new Subject<void>();

  get canDesign(): boolean {
    return this.access.canDesign;
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(p => {
      const tab = p.get('tab');
      const idx = tab ? WorkflowsComponent.TABS.indexOf(tab) : -1;
      this.highlightTaskId = p.get('task');
      this.openInstanceId = p.get('instance');
      if (this.openInstanceId && !tab) {
        this.selectedTab = 1;
      } else if (idx >= 0 && (idx !== 2 || this.canDesign)) {
        this.selectedTab = idx;
      }
    });
    this.workflows.refreshMyTasksCount();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onTabChange(index: number): void {
    this.selectedTab = index;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: WorkflowsComponent.TABS[index], task: null, instance: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }
}
