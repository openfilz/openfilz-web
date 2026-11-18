import { beforeEach, describe, expect, it } from 'vitest';
import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { AiMessageComponent } from './ai-message.component';
import { AiMessage } from '../../models/ai-chat.models';

/**
 * The assistant's bubble: its markdown is sanitized before it reaches innerHTML (the text comes from a model
 * that reads other people's documents, and from error messages), the document links survive, and the HTML is
 * rendered once per text.
 *   vitest run src/app/components/ai-chat/ai-message.component.spec.ts --globals (TestBed: jsdom + Angular setup file)
 */
describe('AiMessageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZoneChangeDetection(), provideTranslateService(), { provide: Router, useValue: { navigate: () => Promise.resolve(true) } }]
    });
  });

  function render(content: string, type: AiMessage['type'] = 'MESSAGE') {
    const fixture = TestBed.createComponent(AiMessageComponent);
    fixture.componentInstance.message = { conversationId: 'c', content, type, role: 'assistant' };
    fixture.detectChanges();
    return fixture;
  }

  function activeContent(el: HTMLElement): string[] {
    const found: string[] = [];
    el.querySelectorAll('*').forEach(node => {
      if (['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'STYLE', 'FORM'].includes(node.tagName)) {
        found.push(node.tagName);
      }
      for (const attribute of Array.from(node.attributes)) {
        if (/^on/i.test(attribute.name) || /^\s*javascript:/i.test(attribute.value)) {
          found.push(`${node.tagName}[${attribute.name}]`);
        }
      }
    });
    return found;
  }

  const hostile = 'Summary <img src="x" onerror="window.pwned = 1"> <script>window.pwned = 2</script> '
    + '[open](javascript:window.pwned=3) <a href="https://example.com" onclick="window.pwned = 4">site</a> '
    + '<iframe src="https://example.com"></iframe>';

  for (const type of ['MESSAGE', 'ERROR'] as const) {
    it(`${type}: no script, event handler or javascript: link reaches the page`, () => {
      const bubble = render(hostile, type).nativeElement.querySelector('.markdown-content') as HTMLElement;
      expect(activeContent(bubble)).toEqual([]);
      // What is harmless stays readable
      expect(bubble.textContent).toContain('Summary');
      expect(bubble.querySelector('a[href="https://example.com"]')!.textContent).toBe('site');
    });
  }

  it('keeps the markdown, the highlighted code and the document links', () => {
    const id = '0a1b2c3d-0000-4000-8000-000000000001';
    const bubble = render(
      '**Found** it:\n\n```js\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n'
      + `See [[doc:${id}:root:FILE:Budget été "2026".xlsx]] and [[doc:${id}:${id}:FOLDER:Plans]].`
    ).nativeElement.querySelector('.markdown-content') as HTMLElement;
    expect(bubble.querySelector('strong')!.textContent).toBe('Found');
    expect(bubble.querySelector('pre code.hljs')!.textContent).toContain('const a = 1;');
    expect(bubble.querySelectorAll('table td').length).toBe(2);
    const links = bubble.querySelectorAll<HTMLElement>('a.doc-link');
    expect(links.length).toBe(2);
    expect(links[0].dataset['docId']).toBe(id);
    expect(links[0].dataset['parentId']).toBe('root');
    expect(links[0].dataset['type']).toBe('FILE');
    expect(links[0].textContent).toContain('Budget été "2026".xlsx');
    expect(links[1].dataset['type']).toBe('FOLDER');
    expect(bubble.textContent).not.toContain('[[doc:');
  });

  it('renders once per text: the same value until the message changes', () => {
    const fixture = render('first **answer**');
    const component = fixture.componentInstance;
    const rendered = component.renderedContent;
    fixture.detectChanges();
    expect(component.renderedContent).toBe(rendered);
    // The chat service appends the streamed chunks to the same message object
    component.message.content += ' and more';
    expect(component.renderedContent).not.toBe(rendered);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.markdown-content')!.textContent).toContain('and more');
  });
});
