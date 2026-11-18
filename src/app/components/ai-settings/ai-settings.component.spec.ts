import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AiSettingsComponent } from './ai-settings.component';
import { AiSettingsService } from '../../services/ai-settings.service';
import { AiNoModelService } from '../../services/ai-no-model.service';
import { AiUserSettings } from '../../models/ai-settings.models';

/**
 * Settings > AI with a saved key the server can no longer read (`keyUnreadable` on load, 409 AI_KEY_UNREADABLE
 * on test / save): the form asks for the key again and stops offering to keep the stored one.
 *   vitest run src/app/components/ai-settings/ai-settings.component.spec.ts --globals (TestBed: jsdom + Angular setup file)
 */
describe('AiSettingsComponent: saved key unreadable', () => {
  const stored: AiUserSettings = {
    enabled: true, provider: 'OPENAI', model: 'gpt-x', baseUrl: null, hasApiKey: true, keySuffix: '6789',
    defaultProvider: 'ollama', defaultModel: 'm'
  };
  const unreadable = { status: 409, error: { code: 'AI_KEY_UNREADABLE', message: 'Your saved key can no longer be read, save it again' } };
  const api = {
    settings: null as AiUserSettings | null,
    loadSettings: vi.fn(), listModels: vi.fn(), testConnection: vi.fn(), saveSettings: vi.fn(), resetSettings: vi.fn()
  };
  const clearKeyUnreadable = vi.fn();

  function open(loaded: AiUserSettings): AiSettingsComponent {
    api.loadSettings.mockReturnValue(of(loaded));
    const component = TestBed.runInInjectionContext(() => new AiSettingsComponent());
    component.ngOnInit();
    return component;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    api.listModels.mockReturnValue(of({ provider: 'OPENAI', models: ['gpt-x'], source: 'FALLBACK' }));
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        { provide: AiSettingsService, useValue: api },
        { provide: AiNoModelService, useValue: { clearKeyUnreadable } }
      ]
    });
  });

  it('a readable stored key can be kept: the field may stay empty', () => {
    const component = open(stored);
    expect(component.banner).toBeNull();
    expect(component.hasStoredKey).toBe(true);
    expect(component.canSubmit).toBe(true);
    expect(component.apiKeyPlaceholder).toContain('6789');
  });

  it('on load: the error shows, the stored key no longer counts, saving and testing wait for a typed key', () => {
    const component = open({ ...stored, keySuffix: '', keyUnreadable: true });
    expect(component.banner).toEqual({ kind: 'error', text: 'settings.ai.keyUnreadable' });
    expect(component.hasStoredKey).toBe(false);          // no "leave empty to keep it"
    expect(component.canSubmit).toBe(false);
    component.onTest();
    component.onSave();
    expect(api.testConnection).not.toHaveBeenCalled();
    expect(api.saveSettings).not.toHaveBeenCalled();

    component.apiKey = 'sk-new';
    expect(component.canSubmit).toBe(true);
    api.saveSettings.mockReturnValue(of({ ...stored, keySuffix: '-new' }));
    component.onSave();
    expect(api.saveSettings).toHaveBeenCalledWith({ provider: 'OPENAI', model: 'gpt-x', baseUrl: null, apiKey: 'sk-new' });
    expect(clearKeyUnreadable).toHaveBeenCalledOnce();   // the chat's notice goes with it
    expect(component.banner?.kind).toBe('success');
    expect(component.hasStoredKey).toBe(true);
  });

  it('switching back to the server default needs no key', () => {
    const component = open({ ...stored, keySuffix: '', keyUnreadable: true });
    component.provider = 'DEFAULT';
    expect(component.canSubmit).toBe(true);
    api.resetSettings.mockReturnValue(of(undefined));
    component.onSave();
    expect(api.resetSettings).toHaveBeenCalledOnce();
    expect(clearKeyUnreadable).toHaveBeenCalledOnce();
  });

  for (const action of ['test', 'save'] as const) {
    it(`a 409 AI_KEY_UNREADABLE on ${action} (the key became unreadable after the page loaded): same state as on load`, () => {
      const component = open(stored);
      api.testConnection.mockReturnValue(throwError(() => unreadable));
      api.saveSettings.mockReturnValue(throwError(() => unreadable));
      if (action === 'test') {
        component.onTest();
      } else {
        component.onSave();
      }
      expect(component.banner).toEqual({ kind: 'error', text: 'settings.ai.keyUnreadable' });
      expect(component.hasStoredKey).toBe(false);
      expect(component.canSubmit).toBe(false);
      expect(component.apiKeyPlaceholder).toBe('settings.ai.apiKeyPlaceholder');
      expect(component.testing).toBe(false);
      expect(component.saving).toBe(false);
      expect(clearKeyUnreadable).not.toHaveBeenCalled();
    });
  }

  it('another 409 keeps its own message', () => {
    const component = open(stored);
    api.saveSettings.mockReturnValue(throwError(() => ({ status: 409, error: { code: 'OTHER', message: 'Something else' } })));
    component.onSave();
    expect(component.banner).toEqual({ kind: 'error', text: 'Something else' });
    expect(component.hasStoredKey).toBe(true);
  });
});
