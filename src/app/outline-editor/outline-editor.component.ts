import { Component, AfterViewInit, ElementRef, ViewChild, OnDestroy, ViewEncapsulation, NgZone, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SafeUrlPipe } from '../safe-url.pipe';
import Quill from 'quill';

interface LineInfo {
  el: HTMLElement;
  index: number;
  length: number;
  rect: DOMRect;
}

interface DragState {
  type: 'line' | 'source';
  /** For line drag: the Quill index of the dragged line */
  lineIndex?: number;
  lineLength?: number;
  lineEl?: HTMLElement;
  /** For source drag */
  source?: any;
  /** Mouse offset from the drag handle */
  offsetY: number;
  /** The floating preview element */
  floatingEl?: HTMLElement;
  /** The drop indicator line */
  indicatorEl?: HTMLElement;
  /** Current drop target line index in Quill */
  dropBeforeIndex?: number;
}

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
  showPreview = false;

  sampleSources = [
    { title: 'Mars Exploration Program — NASA', url: 'https://mars.nasa.gov/', author: 'NASA', date: '2024',
      summary: 'NASA\'s hub for Mars missions including rovers, orbiters, and future human exploration plans. Covers Curiosity, Perseverance, and upcoming sample-return missions.' },
    { title: 'Mars 2020 Perseverance Rover', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/', author: 'NASA Science', date: '2024',
      summary: 'Details on the Perseverance rover mission, designed to seek signs of ancient life and collect rock samples for future return to Earth via the Mars Sample Return campaign.' },
    { title: 'Water on Mars — Wikipedia', url: 'https://en.wikipedia.org/wiki/Water_on_Mars', author: 'Wikipedia contributors', date: '2024',
      summary: 'Comprehensive overview of evidence for water on Mars, including polar ice caps, seasonal flows, subsurface glaciers, and implications for past habitability.' },
    { title: 'SpaceX Starship', url: 'https://www.spacex.com/vehicles/starship/', author: 'SpaceX', date: '2024',
      summary: 'SpaceX\'s fully reusable heavy-lift launch vehicle designed to carry crew and cargo to the Moon, Mars, and beyond. Key to reducing per-kg launch costs for interplanetary missions.' },
  ];

  // Line handles for ALL block-level lines
  lineHandles: { el: HTMLElement; top: number; index: number; length: number }[] = [];

  // Keyboard navigation
  selectedLineIndex: number | null = null;
  hoveredLineIndex: number | null = null;

  // Drag state
  private dragState: DragState | null = null;

  // Source drag: pending state before threshold is met
  private pendingSourceDrag: { source: any; startX: number; startY: number } | null = null;
  private sourceJustDragged = false;

  // Bound listeners for cleanup
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: ((e: MouseEvent) => void) | null = null;

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

    // Disable native drag/drop on the editor entirely
    const editorEl = this.editorContainer.nativeElement.querySelector('.ql-editor') as HTMLElement;
    if (editorEl) {
      editorEl.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); e.stopImmediatePropagation(); }, true);
      editorEl.addEventListener('drop', (e: DragEvent) => { e.preventDefault(); e.stopImmediatePropagation(); }, true);
      editorEl.addEventListener('dragstart', (e: DragEvent) => { e.preventDefault(); e.stopImmediatePropagation(); }, true);
    }

    this.loadDemoContent();
    setTimeout(() => this.updateLineHandles(), 300);

    this.quill.on('text-change', () => {
      requestAnimationFrame(() => this.updateLineHandles());
    });
  }

  ngOnDestroy() {
    this.cleanupDrag();
  }

  // ──────────────────────────────────────
  // Source Detail (thumbnail + summary)
  // ──────────────────────────────────────
  selectedSource: any = null;

  openSourceDetail(source: any) {
    this.selectedSource = source;
  }

  closePreview() {
    this.showPreview = false;
    this.selectedSource = null;
  }

  goBackToSources() {
    this.selectedSource = null;
  }

  // ──────────────────────────────────────
  // Citation insertion (Cite button)
  // ──────────────────────────────────────
  insertCitation(source: any) {
    const citation = this.formatMLA(source);
    const sel = this.quill.getSelection();
    let insertIndex = sel ? sel.index : this.quill.getLength() - 1;

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

  // ──────────────────────────────────────
  // Line handles — for ALL block-level lines
  // ──────────────────────────────────────
  getHeadingSectionRange(startIndex: number): { start: number; length: number } | null {
    const [startLine] = this.quill.getLine(startIndex);
    if (!startLine) return null;
    const startLineIdx = this.quill.getIndex(startLine as any);
    const startFmt = this.quill.getFormat(startLineIdx, (startLine as any).length());
    if (!startFmt['header']) return null;
    const sectionLevel = startFmt['header'] as number;

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

  updateLineHandles() {
    const editor = this.editorContainer.nativeElement.querySelector('.ql-editor');
    if (!editor) return;

    const handles: typeof this.lineHandles = [];
    const wrapperRect = this.editorContainer.nativeElement.closest('.editor-wrapper')?.getBoundingClientRect();
    if (!wrapperRect) return;

    // Walk all block-level elements, including li inside ol/ul
    const addBlock = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      if (rect.height === 0) return;
      const blot = this.quill.scroll.find(el, true);
      if (!blot) return;
      try {
        const index = this.quill.getIndex(blot as any);
        const len = (blot as any).length ? (blot as any).length() : 1;
        handles.push({ el, top: rect.top - wrapperRect.top, index, length: len });
      } catch {}
    };

    for (let i = 0; i < editor.children.length; i++) {
      const el = editor.children[i] as HTMLElement;
      const tag = el.tagName;
      if (tag === 'OL' || tag === 'UL') {
        // Recurse into list items
        for (let j = 0; j < el.children.length; j++) {
          addBlock(el.children[j] as HTMLElement);
        }
      } else {
        addBlock(el);
      }
    }
    this.lineHandles = handles;
    this.cdr.detectChanges();
  }

  // ──────────────────────────────────────
  // Mouse-based line drag
  // ──────────────────────────────────────
  onLineHandleMouseDown(event: MouseEvent, handle: { el: HTMLElement; top: number; index: number; length: number }) {
    event.preventDefault();
    event.stopPropagation();

    const rect = handle.el.getBoundingClientRect();
    const tag = handle.el.tagName;
    let dragIndex = handle.index;
    let dragLength = handle.length;

    // For headings: grab the entire section (heading + content until next same-level heading)
    if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
      const section = this.getHeadingSectionRange(handle.index);
      if (section) {
        dragIndex = section.start;
        dragLength = section.length;
      }
    }

    this.dragState = {
      type: 'line',
      lineIndex: dragIndex,
      lineLength: dragLength,
      lineEl: handle.el,
      offsetY: event.clientY - rect.top,
    };

    // Find all DOM elements in the drag range and dim them
    const sectionEls = this.getElementsInRange(dragIndex, dragLength);
    sectionEls.forEach(el => el.classList.add('dragging-source'));

    // Create floating preview from all section elements
    this.createFloatingPreview(sectionEls, event.clientX, event.clientY);

    // Create drop indicator
    this.createDropIndicator();

    this.attachGlobalListeners();
  }

  // ──────────────────────────────────────
  // Mouse-based source drag
  // ──────────────────────────────────────
  onSourceMouseDown(event: MouseEvent, source: any) {
    // Only trigger on left button
    if (event.button !== 0) return;

    // Set up pending drag — will activate after mouse moves beyond threshold
    this.pendingSourceDrag = {
      source,
      startX: event.clientX,
      startY: event.clientY,
    };
    this.sourceJustDragged = false;

    const onMove = (e: MouseEvent) => {
      if (!this.pendingSourceDrag) return;
      const dx = e.clientX - this.pendingSourceDrag.startX;
      const dy = e.clientY - this.pendingSourceDrag.startY;
      if (Math.sqrt(dx * dx + dy * dy) < 5) return; // threshold

      // Activate drag
      const src = this.pendingSourceDrag.source;
      this.pendingSourceDrag = null;
      this.sourceJustDragged = true;
      (window as any).__sourceDragActivated = true;
      (window as any).__globalMoveCount = 0; // reset counter

      this.dragState = {
        type: 'source',
        source: src,
        offsetY: 0,
      };

      const tempDiv = document.createElement('div');
      tempDiv.textContent = this.formatMLA(src);
      tempDiv.style.cssText = 'font-size:12px;color:#78600e;background:#fffbf0;border-left:3px solid #d4a843;padding:4px 8px;max-width:300px;border-radius:4px;';
      document.body.appendChild(tempDiv);

      this.dragState.floatingEl = this.createFloatingEl(tempDiv, e.clientX, e.clientY);
      document.body.removeChild(tempDiv);

      this.createDropIndicator();
      this.attachGlobalListeners();

      // Remove these pending listeners
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
    };

    const onUp = () => {
      this.pendingSourceDrag = null;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      // Let click handler fire normally (opens preview)
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  }

  onSourceClick(event: MouseEvent, source: any) {
    // If we just completed a drag, don't open preview
    if (this.sourceJustDragged) {
      event.preventDefault();
      event.stopPropagation();
      this.sourceJustDragged = false;
      return;
    }
    this.openSourceDetail(source);
  }

  private getElementsInRange(startIndex: number, length: number): HTMLElement[] {
    const editor = this.editorContainer.nativeElement.querySelector('.ql-editor');
    if (!editor) return [];
    const endIndex = startIndex + length;
    const result: HTMLElement[] = [];

    const checkEl = (el: HTMLElement) => {
      const blot = this.quill.scroll.find(el, true);
      if (!blot) return;
      try {
        const idx = this.quill.getIndex(blot as any);
        const len = (blot as any).length ? (blot as any).length() : 1;
        if (idx >= startIndex && idx + len <= endIndex) {
          result.push(el);
        }
      } catch {}
    };

    for (let i = 0; i < editor.children.length; i++) {
      const el = editor.children[i] as HTMLElement;
      const tag = el.tagName;
      if (tag === 'OL' || tag === 'UL') {
        for (let j = 0; j < el.children.length; j++) checkEl(el.children[j] as HTMLElement);
      } else {
        checkEl(el);
      }
    }
    return result;
  }

  private createFloatingPreview(sourceEls: HTMLElement | HTMLElement[], x: number, y: number) {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      pointer-events: none;
      opacity: 0.85;
      z-index: 10000;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 6px 10px;
      max-width: 500px;
      max-height: 300px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
      left: ${x + 12}px;
      top: ${y - 10}px;
    `;
    const els = Array.isArray(sourceEls) ? sourceEls : [sourceEls];
    for (const el of els) {
      container.appendChild(el.cloneNode(true));
    }
    document.body.appendChild(container);
    this.dragState!.floatingEl = container;
  }

  private createFloatingEl(sourceEl: HTMLElement, x: number, y: number): HTMLElement {
    this.createFloatingPreview(sourceEl, x, y);
    return this.dragState!.floatingEl!;
  }

  private createDropIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'drop-placeholder';
    indicator.style.cssText = `
      position: absolute;
      left: 48px; right: 20px;
      height: 32px;
      border: 2px dashed #ccc;
      border-radius: 4px;
      background: #f9f9f9;
      pointer-events: none;
      display: none;
      z-index: 5;
    `;
    const wrapper = this.editorContainer.nativeElement.closest('.editor-wrapper');
    if (wrapper) wrapper.appendChild(indicator);
    this.dragState!.indicatorEl = indicator;
  }

  // Track which element has displaced margin so we can clean it up
  private displacedEl: HTMLElement | null = null;

  private attachGlobalListeners() {
    this.boundMouseMove = (e: MouseEvent) => {
      (window as any).__globalMoveCount = ((window as any).__globalMoveCount || 0) + 1;
      this.onGlobalMouseMove(e);
    };
    this.boundMouseUp = (e: MouseEvent) => this.onGlobalMouseUp(e);
    document.addEventListener('mousemove', this.boundMouseMove, true);
    document.addEventListener('mouseup', this.boundMouseUp, true);
  }

  private onGlobalMouseMove(event: MouseEvent) {
    if (!this.dragState) return;

    // Move floating preview
    if (this.dragState.floatingEl) {
      this.dragState.floatingEl.style.left = `${event.clientX + 12}px`;
      this.dragState.floatingEl.style.top = `${event.clientY - 10}px`;
    }

    // Update drop indicator position
    this.updateDropIndicator(event.clientX, event.clientY);

    // Debug: log indicator state
    if (this.dragState.indicatorEl) {
      (window as any).__lastIndicatorState = {
        display: this.dragState.indicatorEl.style.display,
        top: this.dragState.indicatorEl.style.top,
        dropIdx: this.dragState.dropBeforeIndex,
        mouseX: event.clientX,
        mouseY: event.clientY,
      };
    }
  }

  private updateDropIndicator(clientX: number, clientY: number) {
    if (!this.dragState?.indicatorEl) {
      (window as any).__dropDebug = 'no indicatorEl';
      return;
    }

    const editor = this.editorContainer.nativeElement.querySelector('.ql-editor');
    if (!editor) {
      (window as any).__dropDebug = 'no editor';
      return;
    }

    const wrapperRect = this.editorContainer.nativeElement.closest('.editor-wrapper')?.getBoundingClientRect();
    if (!wrapperRect) {
      (window as any).__dropDebug = 'no wrapperRect';
      return;
    }

    // Collect all block-level elements with their rects
    const blocks: { el: HTMLElement; parent: HTMLElement; rect: DOMRect; quillIdx: number; quillLen: number }[] = [];
    const collectBlocks = (parent: HTMLElement) => {
      for (let i = 0; i < parent.children.length; i++) {
        const el = parent.children[i] as HTMLElement;
        if (el === this.dragState!.indicatorEl) continue;
        const tag = el.tagName;
        if (tag === 'OL' || tag === 'UL') {
          collectBlocks(el);
        } else {
          const rect = el.getBoundingClientRect();
          if (rect.height === 0) continue;
          const blot = this.quill.scroll.find(el, true);
          if (!blot) continue;
          try {
            const idx = this.quill.getIndex(blot as any);
            const len = (blot as any).length ? (blot as any).length() : 1;
            blocks.push({ el, parent: el.parentElement!, rect, quillIdx: idx, quillLen: len });
          } catch {}
        }
      }
    };
    collectBlocks(editor as HTMLElement);

    // Find the nearest block boundary
    let bestBlock: typeof blocks[0] | null = null;
    let insertBefore = true; // true = insert before bestBlock, false = insert after
    let minDist = Infinity;

    for (const block of blocks) {
      const topDist = Math.abs(clientY - block.rect.top);
      if (topDist < minDist) {
        minDist = topDist;
        bestBlock = block;
        insertBefore = true;
      }
      const bottomDist = Math.abs(clientY - block.rect.bottom);
      if (bottomDist < minDist) {
        minDist = bottomDist;
        bestBlock = block;
        insertBefore = false;
      }
    }

    // Clean up previous displacement
    if (this.displacedEl) {
      this.displacedEl.style.marginTop = '';
      this.displacedEl = null;
    }

    if (bestBlock) {
      const targetEl = insertBefore ? bestBlock.el : (bestBlock.el.nextElementSibling as HTMLElement);
      const wrapperRect = this.editorContainer.nativeElement.closest('.editor-wrapper')!.getBoundingClientRect();

      if (insertBefore) {
        // Position placeholder above bestBlock, displace bestBlock down
        const rect = bestBlock.el.getBoundingClientRect();
        this.dragState.indicatorEl.style.top = `${rect.top - wrapperRect.top}px`;
        bestBlock.el.style.marginTop = '40px';
        this.displacedEl = bestBlock.el;
        this.dragState.dropBeforeIndex = bestBlock.quillIdx;
      } else if (targetEl) {
        // Position placeholder above the next element
        const rect = targetEl.getBoundingClientRect();
        this.dragState.indicatorEl.style.top = `${rect.top - wrapperRect.top}px`;
        targetEl.style.marginTop = '40px';
        this.displacedEl = targetEl;
        this.dragState.dropBeforeIndex = bestBlock.quillIdx + bestBlock.quillLen;
      } else {
        // At the end — position after last block
        const rect = bestBlock.el.getBoundingClientRect();
        this.dragState.indicatorEl.style.top = `${rect.bottom - wrapperRect.top + 4}px`;
        this.dragState.dropBeforeIndex = bestBlock.quillIdx + bestBlock.quillLen;
      }
      this.dragState.indicatorEl.style.display = 'block';
    } else {
      this.dragState.indicatorEl.style.display = 'none';
      this.dragState.dropBeforeIndex = undefined;
    }
  }

  private onGlobalMouseUp(event: MouseEvent) {
    if (!this.dragState) return;

    const state = this.dragState;

    if (state.type === 'line') {
      this.completLineDrop(state, event);
    } else if (state.type === 'source') {
      this.completeSourceDrop(state, event);
    }

    this.cleanupDrag();
    requestAnimationFrame(() => this.updateLineHandles());
  }

  private completLineDrop(state: DragState, event: MouseEvent) {
    if (state.lineIndex == null || state.lineLength == null) return;
    if (state.dropBeforeIndex == null) return;

    const srcStart = state.lineIndex;
    const srcLen = state.lineLength;
    let targetIndex = state.dropBeforeIndex;

    // Don't drop onto self
    if (targetIndex >= srcStart && targetIndex <= srcStart + srcLen) return;

    // Get the content of the line being moved
    const delta = this.quill.getContents(srcStart, srcLen);

    // Delete source first
    this.quill.deleteText(srcStart, srcLen, 'user');

    // Adjust target if it was after the deleted text
    if (targetIndex > srcStart) {
      targetIndex -= srcLen;
    }

    // Clamp
    if (targetIndex < 0) targetIndex = 0;
    const docLen = this.quill.getLength();
    if (targetIndex > docLen) targetIndex = docLen;

    // Insert at target
    this.quill.updateContents({
      ops: [...(targetIndex > 0 ? [{ retain: targetIndex }] : []), ...delta.ops!]
    } as any, 'user');
  }

  private completeSourceDrop(state: DragState, event: MouseEvent) {
    if (!state.source) return;

    const citation = this.formatMLA(state.source);

    // Find insert position from drop coordinates
    let insertIndex = this.quill.getLength() - 1;

    if (state.dropBeforeIndex != null) {
      insertIndex = state.dropBeforeIndex;
    } else {
      // Fallback: use caretRangeFromPoint
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
    }

    // Insert citation as blockquote
    this.quill.insertText(insertIndex, '\n', 'user');
    this.quill.insertText(insertIndex + 1, citation, { blockquote: true, italic: true }, 'user');
    this.quill.insertText(insertIndex + 1 + citation.length, '\n', 'user');
    this.quill.setSelection(insertIndex + 2 + citation.length, 0);
  }

  private cleanupDrag() {
    if (this.dragState) {
      if (this.dragState.floatingEl) {
        this.dragState.floatingEl.remove();
      }
      if (this.dragState.indicatorEl) {
        this.dragState.indicatorEl.remove();
      }
      // Un-dim all dragged elements
      document.querySelectorAll('.dragging-source').forEach(el => el.classList.remove('dragging-source'));
    }
    if (this.displacedEl) {
      this.displacedEl.style.marginTop = '';
      this.displacedEl = null;
    }
    this.dragState = null;

    if (this.boundMouseMove) {
      document.removeEventListener('mousemove', this.boundMouseMove, true);
      this.boundMouseMove = null;
    }
    if (this.boundMouseUp) {
      document.removeEventListener('mouseup', this.boundMouseUp, true);
      this.boundMouseUp = null;
    }
  }

  // ──────────────────────────────────────
  // Keyboard navigation
  // ──────────────────────────────────────
  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    const lines = this.getEditorLines();
    if (lines.length === 0) return;

    // Enter or click-based selection is handled separately
    if (event.key === 'ArrowDown' && !event.shiftKey) {
      if (this.selectedLineIndex !== null) {
        event.preventDefault();
        const currentPos = this.findLinePosition(this.selectedLineIndex, lines);
        if (currentPos < lines.length - 1) {
          this.selectedLineIndex = lines[currentPos + 1].index;
          this.scrollLineIntoView(lines[currentPos + 1].el);
        }
        this.cdr.detectChanges();
        return;
      }
    }

    if (event.key === 'ArrowUp' && !event.shiftKey) {
      if (this.selectedLineIndex !== null) {
        event.preventDefault();
        const currentPos = this.findLinePosition(this.selectedLineIndex, lines);
        if (currentPos > 0) {
          this.selectedLineIndex = lines[currentPos - 1].index;
          this.scrollLineIntoView(lines[currentPos - 1].el);
        }
        this.cdr.detectChanges();
        return;
      }
    }

    // Shift+ArrowDown: move selected line down
    if (event.key === 'ArrowDown' && event.shiftKey && this.selectedLineIndex !== null) {
      event.preventDefault();
      this.moveSelectedLine('down', lines);
      return;
    }

    // Shift+ArrowUp: move selected line up
    if (event.key === 'ArrowUp' && event.shiftKey && this.selectedLineIndex !== null) {
      event.preventDefault();
      this.moveSelectedLine('up', lines);
      return;
    }

    // Escape: deselect
    if (event.key === 'Escape') {
      this.selectedLineIndex = null;
      this.cdr.detectChanges();
    }
  }

  onLineClick(event: MouseEvent, handle: { index: number; el: HTMLElement }) {
    // Select the line
    this.selectedLineIndex = handle.index;
    this.cdr.detectChanges();
  }

  private getEditorLines(): LineInfo[] {
    const editor = this.editorContainer.nativeElement.querySelector('.ql-editor');
    if (!editor) return [];

    const lines: LineInfo[] = [];
    const children = editor.children;

    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement;
      const blot = this.quill.scroll.find(el, true);
      if (!blot) continue;
      const index = this.quill.getIndex(blot as any);
      const len = (blot as any).length ? (blot as any).length() : 1;
      lines.push({ el, index, length: len, rect: el.getBoundingClientRect() });
    }
    return lines;
  }

  private findLinePosition(quillIndex: number, lines: LineInfo[]): number {
    // Find the line at or nearest to this quill index
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].index === quillIndex) return i;
    }
    // Fallback: find closest
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < lines.length; i++) {
      const dist = Math.abs(lines[i].index - quillIndex);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }

  private moveSelectedLine(direction: 'up' | 'down', lines: LineInfo[]) {
    if (this.selectedLineIndex === null) return;

    const pos = this.findLinePosition(this.selectedLineIndex, lines);
    if (direction === 'up' && pos <= 0) return;
    if (direction === 'down' && pos >= lines.length - 1) return;

    const srcLine = lines[pos];
    const srcStart = srcLine.index;
    const srcLen = srcLine.length;

    // Get target position
    const targetLine = direction === 'up' ? lines[pos - 1] : lines[pos + 1];

    // Get content of the line being moved
    const delta = this.quill.getContents(srcStart, srcLen);

    // Delete source
    this.quill.deleteText(srcStart, srcLen, 'user');

    // Calculate new target index
    let targetIndex: number;
    if (direction === 'up') {
      targetIndex = targetLine.index;
    } else {
      // After deletion, target line shifted
      targetIndex = targetLine.index - srcLen + targetLine.length;
    }

    if (targetIndex < 0) targetIndex = 0;

    // Insert
    this.quill.updateContents({
      ops: [...(targetIndex > 0 ? [{ retain: targetIndex }] : []), ...delta.ops!]
    } as any, 'user');

    // Update selected index to new position
    this.selectedLineIndex = targetIndex;
    this.cdr.detectChanges();

    requestAnimationFrame(() => {
      this.updateLineHandles();
      // Scroll into view
      const newLines = this.getEditorLines();
      const newPos = this.findLinePosition(this.selectedLineIndex!, newLines);
      if (newLines[newPos]) {
        this.scrollLineIntoView(newLines[newPos].el);
      }
    });
  }

  private scrollLineIntoView(el: HTMLElement) {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  isLineSelected(index: number): boolean {
    return this.selectedLineIndex === index;
  }

  // ──────────────────────────────────────
  // Export to Google Docs (unchanged)
  // ──────────────────────────────────────
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

  // ──────────────────────────────────────
  // Demo Content (unchanged)
  // ──────────────────────────────────────
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
