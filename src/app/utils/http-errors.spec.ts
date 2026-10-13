import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { API_UNREACHABLE_KEY, httpErrorKey, isApiUnreachable } from './http-errors';

describe('http-errors', () => {
  const unreachable = new HttpErrorResponse({ status: 0, url: 'http://localhost:8081/api/v1/folders' });
  const forbidden = new HttpErrorResponse({ status: 403 });

  it('flags a status-0 HttpErrorResponse as unreachable', () => {
    expect(isApiUnreachable(unreachable)).toBe(true);
    expect(isApiUnreachable(forbidden)).toBe(false);
  });

  it('finds the HttpErrorResponse wrapped by Apollo', () => {
    expect(isApiUnreachable({ message: 'wrapped', cause: unreachable })).toBe(true);
    expect(isApiUnreachable({ networkError: unreachable })).toBe(true);
    expect(isApiUnreachable({ cause: forbidden })).toBe(false);
  });

  it('ignores anything else', () => {
    expect(isApiUnreachable(undefined)).toBe(false);
    expect(isApiUnreachable(new Error('boom'))).toBe(false);
    expect(isApiUnreachable({ status: 0 })).toBe(false);
  });

  it('picks the key to show', () => {
    expect(httpErrorKey(unreachable, 'fileExplorer.folderCreateError')).toBe(API_UNREACHABLE_KEY);
    expect(httpErrorKey(forbidden, 'fileExplorer.folderCreateError')).toBe('fileExplorer.folderCreateError');
  });
});
