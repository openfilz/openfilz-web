import { Injectable } from '@angular/core';
import { marked, Renderer } from 'marked';
import hljs from 'highlight.js';

@Injectable({ providedIn: 'root' })
export class AiMarkdownService {

  constructor() {
    const renderer = new Renderer();
    renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
      const language = lang && hljs.getLanguage(lang) ? lang : undefined;
      const highlighted = language
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;
      return `<pre><code class="hljs${language ? ` language-${language}` : ''}">${highlighted}</code></pre>`;
    };

    marked.use({ renderer, breaks: true, gfm: true });
  }

  render(markdown: string): string {
    if (!markdown) return '';
    return marked.parse(markdown) as string;
  }
}
