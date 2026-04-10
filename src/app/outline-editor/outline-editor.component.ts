import { Component, AfterViewInit, ElementRef, ViewChild, OnDestroy, ViewEncapsulation, NgZone, ChangeDetectorRef } from '@angular/core';
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

  sampleSources = [
    { title: 'Mars Exploration Program — NASA', url: 'https://mars.nasa.gov/', author: 'NASA', date: '2024', favicon: 'https://mars.nasa.gov/favicon.ico' },
    { title: 'Mars 2020 Perseverance Rover', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/', author: 'NASA Science', date: '2024', favicon: 'https://science.nasa.gov/favicon.ico' },
    { title: 'Water on Mars — Wikipedia', url: 'https://en.wikipedia.org/wiki/Water_on_Mars', author: 'Wikipedia contributors', date: '2024', favicon: 'https://en.wikipedia.org/favicon.ico' },
    { title: 'SpaceX Starship', url: 'https://www.spacex.com/vehicles/starship/', author: 'SpaceX', date: '2024', favicon: 'https://www.spacex.com/favicon.ico' },
  ];

  headingHandles: { el: HTMLElement; top: number; index: number }[] = [];
  dragSourceIndex: number | null = null;

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

    this.loadDemoContent();
    setTimeout(() => this.updateHeadingHandles(), 300);

    this.quill.on('text-change', () => {
      requestAnimationFrame(() => this.updateHeadingHandles());
    });

    // Set up native drop handling on the Quill editor element
    const editorEl = this.editorContainer.nativeElement.querySelector('.ql-editor') as HTMLElement;
    if (editorEl) {
      editorEl.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      });
      editorEl.addEventListener('drop', (e: DragEvent) => this.handleEditorDrop(e));
    }
  }

  ngOnDestroy() {}

  // --- Source Preview ---
  openPreview(source: { title: string; url: string }) {
    this.previewUrl = source.url;
    this.previewTitle = source.title;
    this.showPreview = true;
    this.previewLoading = true;
    this.previewHtml = '';

    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(source.url)}`;
    fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
      .then(r => {
        if (!r.ok) throw new Error('proxy failed');
        return r.text();
      })
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

  // --- Citation Drag from Source ---
  onSourceDragStart(event: DragEvent, source: any) {
    if (!event.dataTransfer) return;
    const citation = this.formatMLA(source);
    event.dataTransfer.setData('text/plain', citation);
    event.dataTransfer.setData('application/x-scrible-citation', JSON.stringify(source));
    event.dataTransfer.effectAllowed = 'copy';
  }

  private handleEditorDrop(event: DragEvent) {
    const sourceJson = event.dataTransfer?.getData('application/x-scrible-citation');
    const headingData = event.dataTransfer?.getData('application/x-heading-drag');

    if (headingData && this.dragSourceIndex !== null) {
      event.preventDefault();
      this.handleHeadingDrop(event);
      return;
    }

    if (!sourceJson) return;
    event.preventDefault();
    event.stopPropagation();

    const source = JSON.parse(sourceJson);
    const citation = this.formatMLA(source);

    // Get drop position using caret APIs
    let insertIndex = this.quill.getLength() - 1;
    const doc = document as any;
    if (doc.caretRangeFromPoint) {
      const range = doc.caretRangeFromPoint(event.clientX, event.clientY);
      if (range) {
        // Find the line-level position: go to end of current line
        const sel = this.quill.getSelection();
        try {
          const blot = this.quill.scroll.find(range.startContainer, true);
          if (blot) {
            const blotIndex = this.quill.getIndex(blot as any);
            // Find end of current line
            const [line] = this.quill.getLine(blotIndex);
            if (line) {
              insertIndex = this.quill.getIndex(line as any) + line.length();
            }
          }
        } catch {
          // fallback — insert at end
        }
      }
    }

    // Insert a newline, then the citation as a blockquote
    this.quill.insertText(insertIndex, '\n', 'user');
    this.quill.insertText(insertIndex + 1, citation, { blockquote: true, italic: true }, 'user');
    this.quill.insertText(insertIndex + 1 + citation.length, '\n', 'user');
  }

  // Wrapper for template (dragover on editor-wrapper)
  onEditorDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onEditorDrop(event: DragEvent) {
    // Handled by native listener on .ql-editor — this is a fallback
  }

  formatMLA(source: any): string {
    const author = source.author || 'Unknown';
    const title = `\u201c${source.title}\u201d`;
    const date = source.date || new Date().getFullYear().toString();
    const accessed = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${author}. ${title}. ${date}. Web. ${accessed}.`;
  }

  // --- Heading Drag (within editor) ---
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

  onHeadingDragStart(event: DragEvent, handle: any) {
    this.dragSourceIndex = handle.index;
    event.dataTransfer?.setData('text/plain', 'heading-move');
    event.dataTransfer?.setData('application/x-heading-drag', String(handle.index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  private handleHeadingDrop(event: DragEvent) {
    const sourceIdx = this.dragSourceIndex!;
    const range = this.getHeadingSectionRange(sourceIdx);
    if (!range) { this.dragSourceIndex = null; return; }

    let targetIndex = this.quill.getLength() - 1;
    const doc = document as any;
    if (doc.caretRangeFromPoint) {
      const caretRange = doc.caretRangeFromPoint(event.clientX, event.clientY);
      if (caretRange) {
        try {
          const blot = this.quill.scroll.find(caretRange.startContainer, true);
          if (blot) targetIndex = this.quill.getIndex(blot as any);
        } catch {}
      }
    }

    const delta = this.quill.getContents(range.start, range.length);
    this.quill.deleteText(range.start, range.length, 'user');
    if (targetIndex > range.start) targetIndex -= range.length;
    if (targetIndex < 0) targetIndex = 0;
    this.quill.updateContents({ ops: [{ retain: targetIndex }, ...delta.ops!] } as any, 'user');

    this.dragSourceIndex = null;
  }

  onHeadingDrop(event: DragEvent) {
    // handled in handleEditorDrop
  }

  getHeadingSectionRange(startIndex: number): { start: number; length: number } | null {
    const content = this.quill.getContents();
    let currentIdx = 0;
    let sectionStart = -1;
    let sectionLevel = 0;
    let sectionEnd = this.quill.getLength();

    for (const op of content.ops!) {
      const text = typeof op.insert === 'string' ? op.insert : '\n';
      const len = text.length;
      const header = (op.attributes as any)?.header;

      if (currentIdx === startIndex && header) {
        sectionStart = currentIdx;
        sectionLevel = header;
      } else if (sectionStart >= 0 && header && header <= sectionLevel && currentIdx > sectionStart) {
        sectionEnd = currentIdx;
        break;
      }
      currentIdx += len;
    }

    if (sectionStart < 0) return null;
    return { start: sectionStart, length: sectionEnd - sectionStart };
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
