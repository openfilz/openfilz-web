import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { NgZone } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of } from 'rxjs';
import { Settings, SettingsService, aiModelMissing, aiNoModelOf, chatOffered } from './settings.service';
import { AI_NO_MODEL_RECHECK_INTERVAL_MS, AiNoModelService } from './ai-no-model.service';
import { AiChatService } from './ai-chat.service';

/**
 * "No AI model yet": when the chat is offered, when the panel shows, and the 409 AI_NO_MODEL.
 *   vitest run src/app/services/ai-no-model.service.spec.ts --globals (TestBed: jsdom + Angular setup file)
 */

function settings(patch: Partial<Settings>): Settings {
  return {
    emptyBinInterval: null, fileQuotaMB: null, userQuotaMB: null, thumbnailsActive: false,
    aiActive: true, aiChatActive: true, aiChatUnavailableReason: null, aiUserSettingsEnabled: false, ...patch
  } as Settings;
}

describe('chat visibility helpers', () => {
  it('offers the chat while AI is on and the assistant is not switched off, even with no model', () => {
    expect(chatOffered(settings({}))).toBe(true);
    expect(chatOffered(settings({ aiChatActive: false, aiChatUnavailableReason: 'NO_MODEL' }))).toBe(true);
    expect(chatOffered(settings({ aiChatActive: false, aiChatUnavailableReason: 'DISABLED' }))).toBe(false);
    expect(chatOffered(settings({ aiActive: false, aiChatActive: false }))).toBe(false);
    expect(chatOffered(null)).toBe(false);
    expect(chatOffered(settings({ aiChatActive: false, aiChatUnavailableReason: undefined }))).toBe(false);
    expect(chatOffered(settings({ aiChatActive: undefined, aiChatUnavailableReason: undefined }))).toBe(true);
  });

  it('shows the panel on aiModelSource NONE only, or on NO_MODEL from a backend without the source', () => {
    expect(aiModelMissing(settings({ aiModelSource: 'NONE', aiUserSettingsEnabled: true }))).toBe(true);
    for (const source of ['PERSONAL', 'ORGANISATION', 'DEPLOYMENT'] as const) {
      expect(aiModelMissing(settings({ aiModelSource: source }))).toBe(false);
    }
    expect(aiModelMissing(settings({ aiChatActive: false, aiChatUnavailableReason: 'NO_MODEL' }))).toBe(true);
    expect(aiModelMissing(settings({}))).toBe(false);
    expect(aiModelMissing(settings({ aiChatActive: false, aiChatUnavailableReason: 'DISABLED', aiModelSource: 'NONE' }))).toBe(false);
  });

  it('reads the 409 AI_NO_MODEL body and nothing else', () => {
    expect(aiNoModelOf(409, { code: 'AI_NO_MODEL', userKeysAllowed: true })).toEqual({ code: 'AI_NO_MODEL', userKeysAllowed: true });
    expect(aiNoModelOf(409, { code: 'AI_NO_MODEL' })).toEqual({ code: 'AI_NO_MODEL', userKeysAllowed: false });
    expect(aiNoModelOf(409, { code: 'OTHER' })).toBeNull();
    expect(aiNoModelOf(500, { code: 'AI_NO_MODEL', userKeysAllowed: true })).toBeNull();
    expect(aiNoModelOf(409, null)).toBeNull();
  });
});

describe('AiNoModelService + AiChatService', () => {
  let settingsService: SettingsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService(),
        { provide: OidcSecurityService, useValue: { getAccessToken: () => of('token') } }
      ]
    });
    settingsService = TestBed.inject(SettingsService);
  });

  function publish(s: Settings): void {
    (settingsService as unknown as { settingsSubject: { next(v: Settings): void } }).settingsSubject.next(s);
  }

  it('follows the settings: keys allowed or not', () => {
    const service = TestBed.inject(AiNoModelService);
    publish(settings({ aiModelSource: 'NONE', aiUserSettingsEnabled: true }));
    expect(service.noModel).toBe(true);
    expect(service.userKeysAllowed).toBe(true);
    publish(settings({ aiModelSource: 'NONE', aiChatActive: false, aiChatUnavailableReason: 'NO_MODEL', aiUserSettingsEnabled: false }));
    expect(service.userKeysAllowed).toBe(false);
    publish(settings({ aiModelSource: 'PERSONAL', aiUserSettingsEnabled: true }));
    expect(service.noModel).toBe(false);
  });

  it('a 409 shows the panel with its own keys-allowed answer until the settings are read again', () => {
    const service = TestBed.inject(AiNoModelService);
    publish(settings({ aiModelSource: 'DEPLOYMENT' }));
    service.reportServerRefusal({ code: 'AI_NO_MODEL', userKeysAllowed: true });
    expect(service.noModel).toBe(true);
    expect(service.userKeysAllowed).toBe(true);
    publish(settings({ aiModelSource: 'PERSONAL', aiUserSettingsEnabled: true }));
    expect(service.noModel).toBe(false);
  });

  it('the chat drops the unanswered turn and reports the 409 AI_NO_MODEL', async () => {
    publish(settings({ aiModelSource: 'DEPLOYMENT' }));
    const chat = TestBed.inject(AiChatService);
    const noModel = TestBed.inject(AiNoModelService);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'AI_NO_MODEL', userKeysAllowed: false }), {
      status: 409, headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await TestBed.inject(NgZone).run(() => chat.sendMessage('hello'));
      expect(chat.currentMessages$.value).toEqual([]);
      expect(chat.isStreaming$.value).toBe(false);
      expect(noModel.noModel).toBe(true);
      expect(noModel.userKeysAllowed).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opening the chat with a prompt sends nothing when no model answers', () => {
    publish(settings({ aiModelSource: 'NONE', aiUserSettingsEnabled: true }));
    const chat = TestBed.inject(AiChatService);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      chat.openWithPrompt('Propose a reorganisation of my documents');
      expect(chat.panelView$.value).toBe('chat');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('recheck reads the settings again: a model set meanwhile takes the panel away, no reload', () => {
    const http = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(AiNoModelService);
    publish(settings({ aiModelSource: 'DEPLOYMENT' }));
    service.recheck();
    http.expectNone(r => r.url.endsWith('/settings'));   // a model answers: nothing to ask

    publish(settings({ aiModelSource: 'NONE', aiUserSettingsEnabled: true }));
    service.recheck();
    service.recheck();                                    // one read at a time
    const read = http.expectOne(r => r.method === 'GET' && r.url.endsWith('/settings'));
    read.flush(settings({ aiModelSource: 'ORGANISATION' }));
    expect(service.noModel).toBe(false);
    http.verify();
  });

  it('recheck: a failed read changes nothing, and the next one waits a few seconds', () => {
    vi.useFakeTimers();
    try {
      const http = TestBed.inject(HttpTestingController);
      const service = TestBed.inject(AiNoModelService);
      const before = settings({ aiModelSource: 'NONE', aiUserSettingsEnabled: true, thumbnailsActive: true });
      publish(before);

      service.recheck();
      http.expectOne(r => r.url.endsWith('/settings')).flush('down', { status: 503, statusText: 'Service Unavailable' });
      // the page keeps what it had: still the panel, and no feature switched off by a network blip
      expect(settingsService.settings).toEqual(before);
      expect(service.noModel).toBe(true);
      expect(service.userKeysAllowed).toBe(true);

      service.recheck();
      http.expectNone(r => r.url.endsWith('/settings'));
      vi.advanceTimersByTime(AI_NO_MODEL_RECHECK_INTERVAL_MS);
      service.recheck();
      http.expectOne(r => r.url.endsWith('/settings')).flush(settings({ aiModelSource: 'PERSONAL', aiUserSettingsEnabled: true }));
      expect(service.noModel).toBe(false);
      http.verify();
    } finally {
      vi.useRealTimers();
    }
  });
});
