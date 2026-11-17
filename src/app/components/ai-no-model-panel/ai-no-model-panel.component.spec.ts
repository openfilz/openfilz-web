import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { AiNoModelPanelComponent } from './ai-no-model-panel.component';
import { AiNoModelService } from '../../services/ai-no-model.service';

/**
 * The "No AI model yet" panel: keys allowed / not, in the chat, the settings page and as a dialog.
 *   vitest run src/app/components/ai-no-model-panel/ai-no-model-panel.component.spec.ts --globals
 */
describe('AiNoModelPanelComponent', () => {
  const state = { keysAllowed: true };
  const navigate = vi.fn().mockResolvedValue(true);
  const close = vi.fn();

  function configure(asDialog = false) {
    TestBed.configureTestingModule({
      imports: [AiNoModelPanelComponent],
      providers: [
        provideZoneChangeDetection(),
        provideTranslateService(),
        { provide: Router, useValue: { navigate } },
        { provide: AiNoModelService, useValue: { get userKeysAllowed() { return state.keysAllowed; }, noModel: true } },
        ...(asDialog ? [{ provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close } }] : [])
      ]
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      aiNoModel: {
        title: 'No AI model is set up yet', intro: 'Two ways', forEveryone: 'For everyone', forEveryoneText: 'Admin picks',
        askAdmin: 'Ask your administrator.', justForYou: 'Just for you', justForYouText: 'Your own key',
        justForYouBelow: 'Your own key, below', setUp: 'Set up my AI model', worksWithout: 'Works'
      },
      aiChat: { organize: { action: 'Organise with AI' } },
      common: { close: 'Close' }
    });
    translate.use('en');
  }

  function render(variant: 'chat' | 'settings' = 'chat'): HTMLElement {
    const fixture = TestBed.createComponent(AiNoModelPanelComponent);
    fixture.componentInstance.variant = variant;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    state.keysAllowed = true;
    navigate.mockClear();
    close.mockClear();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('keys allowed: an administrator for everyone, and their own model through Settings > AI', () => {
    configure();
    const el = render();
    expect(el.querySelector('.nm-title')!.textContent).toContain('No AI model is set up yet');
    expect(el.querySelector('[data-ask="everyone"]')!.textContent).toContain('Ask your administrator.');
    expect(el.querySelector('a')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-action="setup"]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/settings'], { queryParams: { section: 'ai' } });
  });

  it('keys not allowed: no setup button, ask the administrator', () => {
    state.keysAllowed = false;
    configure();
    const el = render();
    expect(el.querySelector('[data-action="setup"]')).toBeNull();
    expect(el.querySelector('[data-ask="personal"]')!.textContent).toContain('Ask your administrator.');
  });

  it('in the settings page: no button to the settings, the form is below', () => {
    configure();
    const el = render('settings');
    expect(el.querySelector('[data-action="setup"]')).toBeNull();
    expect(el.querySelector('[data-way="personal"]')!.textContent).toContain('Your own key, below');
  });

  it('as a dialog from "Organise with AI": the setup button closes it and opens Settings > AI', () => {
    configure(true);
    const el = render();
    expect(el.querySelector('.dialog-title')!.textContent).toContain('No AI model is set up yet');
    el.querySelector<HTMLButtonElement>('[data-action="setup"]')!.click();
    expect(close).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/settings'], { queryParams: { section: 'ai' } });
  });
});
