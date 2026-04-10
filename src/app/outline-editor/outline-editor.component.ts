import { Component, AfterViewInit, ElementRef, ViewChild, OnDestroy, ViewEncapsulation, NgZone, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SafeUrlPipe } from '../safe-url.pipe';
import Quill from 'quill';

@Component({
  selector: 'app-outline-editor',
  standalone: true,
  imports: [CommonModule, SafeUrlPipe],
  templateUrl: './outline-editor.component.html',
  styleUrl: './outline-editor.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class OutlineEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorContainer') editorContainer!: ElementRef<HTMLDivElement>;

  quill!: Quill;
  previewUrl = '';
  previewHtml = '';
  previewTitle = 'Source Preview';
  showPreview = false;
  previewLoading = false;

  // Drag state tracked in component — avoids dataTransfer cross-element issues
  draggedSource: any = null;
  editorDragOver = false;

  sampleSources = [
    { title: 'Mars Exploration Program — NASA', url: 'https://mars.nasa.gov/', author: 'NASA', date: '2024' },
    { title: 'Mars 2020 Perseverance Rover', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/', author: 'NASA Science', date: '2024' },
    { title: 'Water on Mars — Wikipedia', url: 'https://en.wikipedia.org/wiki/Water_on_Mars', author: 'Wikipedia contributors', date: '2024' },
    { title: 'SpaceX Starship', url: 'https://www.spacex.com/vehicles/starship/', author: 'SpaceX', date: '2024' },
  ];

  headingHandles: { el: HTMLElement; top: number; index: number }[] = [];
  draggedHeadingIndex: number | null = null;

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit() {
    this.quill = new Quill(this.editorContainer.nativeElement, {
      theme: 'bubble',
      placeholder: 'Start your outline...',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ indent: '-1' }, { indent: '+1' }],
          ['bold', 'italic', 'underline'],
          ['blockquote', 'link'],
          ['clean'],
        ],
        keyboard: {
          bindings: {
            tab: { key: 'Tab', handler: () => { this.quill.format('indent', '+1'); return false; } },
            shiftTab: { key: 'Tab', shiftKey: true, handler: () => { this.quill.format('indent', '-1'); return false; } },
          }
        },
        history: { delay: 500, maxStack: 100, userOnly: true },
      },
    });

    // Intercept drop events in capture phase BEFORE Quill's clipboard module sees them
    const editorEl = this.editorContainer.nativeElement.querySelector('.ql-editor') as HTMLElement;
    if (editorEl) {
      editorEl.addEventListener('dragover', (e: DragEvent) => {
        if (this.draggedSource || this.draggedHeadingIndex !== null) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (e.dataTransfer) e.dataTransfer.dropEffect = this.draggedSource ? 'copy' : 'move';
        }
      }, true); // capture phase

      editorEl.addEventListener('drop', (e: DragEvent) => {
        if (this.draggedSource) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.handleSourceDrop(e);
        } else if (this.draggedHeadingIndex !== null) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.handleHeadingDrop(e);
        }
      }, true); // capture phase
    }

    this.loadDemoContent();
    setTimeout(() => this.updateHeadingHandles(), 300);

    this.quill.on('text-change', () => {
      requestAnimationFrame(() => this.updateHeadingHandles());
    });
  }

  ngOnDestroy() {}

  // --- Source Preview ---
  openPreview(source: { title: string; url: string }) {
    this.previewUrl = source.url;
    this.previewTitle = source.title;
    this.showPreview = true;
    this.previewLoading = true;
    this.previewHtml = '';

    // Try corsproxy.io first, then allorigins as fallback
    this.fetchWithProxy(source.url)
      .then(html => {
        const base = `<base href="${source.url}"><style>body{font-family:system-ui,sans-serif;}</style>`;
        this.zone.run(() => {
          this.previewHtml = html.replace(/<head[^>]*>/i, `$&${base}`);
          this.previewLoading = false;
        });
      })
      .catch(() => {
        this.zone.run(() => {
          this.previewHtml = '';
          this.previewLoading = false;
        });
      });
  }

  private async fetchWithProxy(url: string): Promise<string> {
    // Try multiple CORS proxies in order
    const proxies = [
      `https://corsproxy.io/?${encodeURIComponent(url)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    ];
    for (const proxyUrl of proxies) {
      try {
        const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
        if (r.ok) return await r.text();
      } catch {}
    }
    throw new Error('All proxies failed');
  }

  closePreview() {
    this.showPreview = false;
    this.previewUrl = '';
    this.previewHtml = '';
  }

  goBackToSources() {
    this.previewUrl = '';
    this.previewHtml = '';
    this.previewTitle = 'Source Preview';
  }

  // --- Citation Drag & Drop (component-state approach) ---
  onSourceDragStart(event: DragEvent, source: any) {
    this.draggedSource = source;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', this.formatMLA(source));
    }
  }

  onSourceDragEnd() {
    this.draggedSource = null;
    this.editorDragOver = false;
  }

  onEditorDragOver(event: DragEvent) {
    if (!this.draggedSource) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.editorDragOver = true;
  }

  onEditorDragLeave() {
    this.editorDragOver = false;
  }

  onEditorDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.editorDragOver = false;

    if (!this.draggedSource) return;
    const source = this.draggedSource;
    this.draggedSource = null;

    const citation = this.formatMLA(source);

    // Find insert position from drop coordinates
    let insertIndex = this.quill.getLength() - 1;
    try {
      const caretRange = (document as any).caretRangeFromPoint(event.clientX, event.clientY);
      if (caretRange) {
        const blot = this.quill.scroll.find(caretRange.startContainer, true);
        if (blot) {
          const blotIndex = this.quill.getIndex(blot as any);
          const [line] = this.quill.getLine(blotIndex);
          if (line) {
            insertIndex = this.quill.getIndex(line as any) + line.length();
          }
        }
      }
    } catch {}

    // Insert citation as blockquote
    this.quill.insertText(insertIndex, '\n', 'user');
    this.quill.insertText(insertIndex + 1, citation, { blockquote: true, italic: true }, 'user');
    this.quill.insertText(insertIndex + 1 + citation.length, '\n', 'user');
    this.quill.setSelection(insertIndex + 2 + citation.length, 0);
  }

  // "Cite" button fallback — always works
  insertCitation(source: any) {
    const citation = this.formatMLA(source);
    const sel = this.quill.getSelection();
    let insertIndex = sel ? sel.index : this.quill.getLength() - 1;

    // Go to end of current line
    try {
      const [line] = this.quill.getLine(insertIndex);
      if (line) insertIndex = this.quill.getIndex(line as any) + line.length();
    } catch {}

    this.quill.insertText(insertIndex, '\n', 'user');
    this.quill.insertText(insertIndex + 1, citation, { blockquote: true, italic: true }, 'user');
    this.quill.insertText(insertIndex + 1 + citation.length, '\n', 'user');
    this.quill.setSelection(insertIndex + 2 + citation.length, 0);
    this.quill.focus();
  }

  formatMLA(source: any): string {
    const author = source.author || 'Unknown';
    const title = `\u201c${source.title}\u201d`;
    const date = source.date || new Date().getFullYear().toString();
    const accessed = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${author}. ${title}. ${date}. Web. ${accessed}.`;
  }

  // --- Heading Drag (within editor) ---
  onHeadingDragStart(event: DragEvent, handle: any) {
    this.draggedHeadingIndex = handle.index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', ''); // required for Firefox
    }
  }

  onHeadingDragEnd() {
    this.draggedHeadingIndex = null;
  }

  private handleSourceDrop(event: DragEvent) {
    const source = this.draggedSource;
    this.draggedSource = null;
    this.editorDragOver = false;
    if (!source) return;

    const citation = this.formatMLA(source);
    let insertIndex = this.quill.getLength() - 1;
    try {
      const range = (document as any).caretRangeFromPoint(event.clientX, event.clientY);
      if (range) {
        const blot = this.quill.scroll.find(range.startContainer, true);
        if (blot) {
          const bi = this.quill.getIndex(blot as any);
          const [line] = this.quill.getLine(bi);
          if (line) insertIndex = this.quill.getIndex(line as any) + line.length();
        }
      }
    } catch {}
    this.quill.insertText(insertIndex, '\n', 'user');
    this.quill.insertText(insertIndex + 1, citation, { blockquote: true, italic: true }, 'user');
    this.quill.insertText(insertIndex + 1 + citation.length, '\n', 'user');
  }

  private handleHeadingDrop(event: DragEvent) {
    const sourceIdx = this.draggedHeadingIndex;
    this.draggedHeadingIndex = null;
    if (sourceIdx === null) return;

    const section = this.getHeadingSectionRange(sourceIdx);
    if (!section) return;

    // Find target line from drop position
    let targetIndex = this.quill.getLength() - 1;
    try {
      const range = (document as any).caretRangeFromPoint(event.clientX, event.clientY);
      if (range) {
        const blot = this.quill.scroll.find(range.startContainer, true);
        if (blot) targetIndex = this.quill.getIndex(blot as any);
      }
    } catch {}

    // Don't drop inside the section being moved
    if (targetIndex >= section.start && targetIndex < section.start + section.length) return;

    const delta = this.quill.getContents(section.start, section.length);
    this.quill.deleteText(section.start, section.length, 'user');
    if (targetIndex > section.start) targetIndex -= section.length;
    if (targetIndex < 0) targetIndex = 0;
    this.quill.updateContents({
      ops: [...(targetIndex > 0 ? [{ retain: targetIndex }] : []), ...delta.ops!]
    } as any, 'user');

    requestAnimationFrame(() => this.updateHeadingHandles());
  }

  getHeadingSectionRange(startIndex: number): { start: number; length: number } | null {
    // Verify the start line is a heading
    const [startLine] = this.quill.getLine(startIndex);
    if (!startLine) return null;
    const startLineIdx = this.quill.getIndex(startLine as any);
    const startFmt = this.quill.getFormat(startLineIdx, (startLine as any).length());
    if (!startFmt['header']) return null;
    const sectionLevel = startFmt['header'] as number;

    // Walk forward line by line to find the end of this section
    let pos = startLineIdx + (startLine as any).length();
    const docLen = this.quill.getLength();

    while (pos < docLen) {
      const [nextLine] = this.quill.getLine(pos);
      if (!nextLine) break;
      const nextIdx = this.quill.getIndex(nextLine as any);
      const nextLen = (nextLine as any).length();
      const nextFmt = this.quill.getFormat(nextIdx, nextLen);

      if (nextFmt['header'] && (nextFmt['header'] as number) <= sectionLevel) {
        return { start: startLineIdx, length: nextIdx - startLineIdx };
      }
      pos = nextIdx + nextLen;
    }

    return { start: startLineIdx, length: docLen - startLineIdx };
  }

  updateHeadingHandles() {
    const editor = this.editorContainer.nativeElement.querySelector('.ql-editor');
    if (!editor) return;

    const handles: typeof this.headingHandles = [];
    const headings = editor.querySelectorAll('h1, h2, h3');
    const wrapperRect = this.editorContainer.nativeElement.closest('.editor-wrapper')?.getBoundingClientRect();
    if (!wrapperRect) return;

    headings.forEach((el: Element) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const blot = this.quill.scroll.find(el, true);
      if (blot) {
        handles.push({
          el: el as HTMLElement,
          top: rect.top - wrapperRect.top,
          index: this.quill.getIndex(blot as any),
        });
      }
    });
    this.headingHandles = handles;
    this.cdr.detectChanges();
  }

  // --- Export to Google Docs ---
  exportToGoogleDoc() {
    const htmlContent = this.quill.root.innerHTML;
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([htmlContent], { type: 'text/html' }),
        'text/plain': new Blob([this.quill.getText()], { type: 'text/plain' }),
      })
    ]).then(() => {
      window.open('https://docs.google.com/document/create', '_blank');
    }).catch(() => {
      const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${htmlContent}</body></html>`], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'outline.html';
      a.click();
    });
  }

  trackByIndex(index: number) { return index; }

  // --- Demo Content ---
  private loadDemoContent() {
    const delta = {
      ops: [
        { insert: 'Mars Colonization: Economic Feasibility Study' },
        { insert: '\n', attributes: { header: 1 } },
        { insert: 'Thesis' },
        { insert: '\n', attributes: { header: 2 } },
        { insert: 'The rapid advancement of reusable rocket technology has fundamentally altered the economic landscape of space exploration, making Mars colonization a realistic near-term goal.' },
        { insert: '\n', attributes: { list: 'bullet' } },
        { insert: 'Background' },
        { insert: '\n', attributes: { header: 2 } },
        { insert: 'NASA\'s Mars Exploration Program has systematically studied Mars since the 1990s with rovers, orbiters, and landers.' },
        { insert: '\n', attributes: { list: 'bullet' } },
        { insert: 'The Perseverance rover (2021) is designed to search for ancient microbial life and collect samples for Earth return.' },
        { insert: '\n', attributes: { list: 'bullet' } },
        { insert: 'NASA. \u201cMars 2020 Perseverance Rover.\u201d science.nasa.gov, 2024. Web.' },
        { insert: '\n', attributes: { blockquote: true } },
        { insert: 'Economic Feasibility' },
        { insert: '\n', attributes: { header: 2 } },
        { insert: 'Launch cost reduction' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: 'SpaceX Starship has reduced projected per-kg costs by two orders of magnitude vs. the Shuttle era.' },
        { insert: '\n', attributes: { list: 'bullet', indent: 1 } },
        { insert: 'Falcon 9 reusability demonstrated >200 successful landings.' },
        { insert: '\n', attributes: { list: 'bullet', indent: 1 } },
        { insert: 'In-situ resource utilization (ISRU)' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: 'Colonists could produce fuel, water, and building materials from Martian resources.' },
        { insert: '\n', attributes: { list: 'bullet', indent: 1 } },
        { insert: 'MOXIE experiment on Perseverance successfully produced oxygen from CO\u2082.' },
        { insert: '\n', attributes: { list: 'bullet', indent: 1 } },
        { insert: 'Conclusion' },
        { insert: '\n', attributes: { header: 2 } },
        { insert: 'The convergence of reduced launch costs, advancing life support, and international collaboration suggests a permanent Mars presence is achievable within two decades.' },
        { insert: '\n', attributes: { list: 'bullet' } },
      ]
    };
    this.quill.setContents(delta as any);
  }
}
