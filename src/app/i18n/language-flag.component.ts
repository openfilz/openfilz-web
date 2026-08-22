import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/**
 * Flag of a UI language, drawn as inline SVG.
 *
 * Flag *emoji* (🇫🇷 …) are not an option: Windows ships no emoji-flag glyphs, so Chrome falls
 * back to rendering the two regional-indicator letters ("FR") — which is exactly the code we
 * already show next to it. These simple shapes render identically on every platform, need no
 * font, no network and no third-party asset licence.
 */
@Component({
  selector: 'app-language-flag',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg class="flag" [attr.viewBox]="'0 0 24 16'" width="24" height="16" role="img"
         [attr.aria-label]="label ?? null" [attr.aria-hidden]="label ? null : 'true'"
         preserveAspectRatio="xMidYMid slice">
      <defs>
        <clipPath [attr.id]="'flagClip-' + code">
          <rect x="0" y="0" width="24" height="16" rx="2.5"></rect>
        </clipPath>
      </defs>
      <g [attr.clip-path]="'url(#flagClip-' + code + ')'">
        @switch (code) {
          @case ('fr') {
            <rect width="8" height="16" fill="#002654"></rect>
            <rect x="8" width="8" height="16" fill="#fff"></rect>
            <rect x="16" width="8" height="16" fill="#ce1126"></rect>
          }
          @case ('en') {
            <rect width="24" height="16" fill="#012169"></rect>
            <path d="M0 0 L24 16 M24 0 L0 16" stroke="#fff" stroke-width="3.2"></path>
            <path d="M0 0 L24 16 M24 0 L0 16" stroke="#c8102e" stroke-width="1.8"></path>
            <path d="M12 0 V16 M0 8 H24" stroke="#fff" stroke-width="5.4"></path>
            <path d="M12 0 V16 M0 8 H24" stroke="#c8102e" stroke-width="3.2"></path>
          }
          @case ('de') {
            <rect width="24" height="5.34" fill="#000"></rect>
            <rect y="5.34" width="24" height="5.33" fill="#dd0000"></rect>
            <rect y="10.67" width="24" height="5.33" fill="#ffce00"></rect>
          }
          @case ('es') {
            <rect width="24" height="16" fill="#aa151b"></rect>
            <rect y="4" width="24" height="8" fill="#f1bf00"></rect>
          }
          @case ('it') {
            <rect width="8" height="16" fill="#008c45"></rect>
            <rect x="8" width="8" height="16" fill="#fff"></rect>
            <rect x="16" width="8" height="16" fill="#cd212a"></rect>
          }
          @case ('nl') {
            <rect width="24" height="5.34" fill="#ae1c28"></rect>
            <rect y="5.34" width="24" height="5.33" fill="#fff"></rect>
            <rect y="10.67" width="24" height="5.33" fill="#21468b"></rect>
          }
          @case ('pt') {
            <rect width="24" height="16" fill="#da291c"></rect>
            <rect width="9.6" height="16" fill="#046a38"></rect>
            <circle cx="9.6" cy="8" r="3.6" fill="#ffe900" stroke="#046a38" stroke-width="0.6"></circle>
            <circle cx="9.6" cy="8" r="1.7" fill="#fff" stroke="#da291c" stroke-width="0.7"></circle>
          }
          @case ('ar') {
            <rect width="24" height="16" fill="#046307"></rect>
            <rect x="4" y="5.6" width="16" height="1.5" rx="0.75" fill="#fff"></rect>
            <rect x="4" y="9.6" width="16" height="1.1" rx="0.55" fill="#fff"></rect>
            <circle cx="5.4" cy="10.15" r="0.9" fill="#fff"></circle>
          }
          @default {
            <rect width="24" height="16" fill="var(--bg-tertiary, #e2e8f0)"></rect>
          }
        }
      </g>
      <rect x="0.35" y="0.35" width="23.3" height="15.3" rx="2.2" fill="none"
            stroke="rgba(15, 23, 42, .22)" stroke-width="0.7"></rect>
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; }
    .flag { display: block; border-radius: 3px; }
  `]
})
export class LanguageFlagComponent {
  /** Language code — one of the codes in APP_LANGUAGES. */
  @Input({ required: true }) code!: string;
  /** Accessible name; omit for a decorative flag sitting next to its language name. */
  @Input() label?: string;
}
