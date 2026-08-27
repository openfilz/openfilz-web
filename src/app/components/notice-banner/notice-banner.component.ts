import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { NoticeBannerService } from './notice-banner.service';
import { IS_ENTERPRISE } from '../../edition';

/**
 * Demo-deployment notice bar shown under the header (backend demoMode flag).
 * CE demo: shared-visibility privacy warning + links to the EE demo and the open-source repo.
 * EE demo: demo note + "start a free trial" CTA, dismissible for the session.
 */
@Component({
  selector: 'app-notice-banner',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, TranslatePipe],
  templateUrl: './notice-banner.component.html',
  styleUrls: ['./notice-banner.component.css']
})
export class NoticeBannerComponent {
  readonly noticeBannerService = inject(NoticeBannerService);
  readonly isEnterprise = IS_ENTERPRISE;

  readonly eeDemoUrl = 'https://app.openfilz.com';
  readonly openSourceUrl = 'https://openfilz.org';
  readonly startTrialUrl = 'https://www.openfilz.com/portal/start-trial';
  readonly pricingUrl = 'https://www.openfilz.com/pricing';

  dismiss(): void {
    this.noticeBannerService.dismiss();
  }
}
