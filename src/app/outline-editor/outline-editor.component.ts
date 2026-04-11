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

  // Single hover handle (replaces per-line handles)
  hoveredHandle: { top: number; index: number; length: number; el: HTMLElement } | null = null;
  private lastHoveredEl: HTMLElement | null = null;
  private hoverOverlay: HTMLElement | null = null;

  // Drag state
  dragState: DragState | null = null;

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
        ],
        keyboard: {
          bindings: {
            // Override ALL tab behavior — always indent/outdent, never insert whitespace
            'tab': { key: 'Tab', shiftKey: false, handler: () => {
              const sel = this.quill.getSelection();
              if (sel) this.quill.formatLine(sel.index, 1, 'indent', '+1');
              return false;
            }},
            'shift-tab': { key: 'Tab', shiftKey: true, handler: () => {
              const sel = this.quill.getSelection();
              if (sel) this.quill.formatLine(sel.index, 1, 'indent', '-1');
              return false;
            }},
            // Suppress default tab in lists
            'list autofill': { key: 'Tab', collapsed: true, format: ['list'], handler: () => {
              const sel = this.quill.getSelection();
              if (sel) this.quill.formatLine(sel.index, 1, 'indent', '+1');
              return false;
            }},
            // Enter on empty list item: delete the line and move cursor to end of previous line
            'empty list enter': { key: 'Enter', collapsed: true, format: ['list'], handler: (range: any) => {
              const [line] = this.quill.getLine(range.index);
              if (!line) return true;
              const lineText = this.quill.getText(this.quill.getIndex(line as any), (line as any).length());
              if (lineText.trim() === '') {
                const lineIdx = this.quill.getIndex(line as any);
                const lineLen = (line as any).length();
                this.quill.deleteText(lineIdx, lineLen, 'user');
                if (lineIdx > 0) this.quill.setSelection(lineIdx - 1, 0);
                return false;
              }
              return true;
            }},
            // Tab on blockquote: indent the blockquote line (not insert tab character)
            'blockquote tab': { key: 'Tab', shiftKey: false, format: ['blockquote'], handler: (range: any) => {
              this.quill.formatLine(range.index, 1, 'indent', '+1');
              return false;
            }},
            'blockquote shift-tab': { key: 'Tab', shiftKey: true, format: ['blockquote'], handler: (range: any) => {
              this.quill.formatLine(range.index, 1, 'indent', '-1');
              return false;
            }},
            // Prevent typing in blockquotes (citations are read-only)
            // Any printable character in a blockquote is suppressed
            // (Backspace, Delete, Enter are handled separately below)
            // Enter on blockquote: insert a new bullet list item (not another blockquote)
            'blockquote enter': { key: 'Enter', collapsed: true, format: ['blockquote'], handler: (range: any) => {
              const idx = range.index;
              this.quill.insertText(idx, '\n', 'user');
              this.quill.formatLine(idx + 1, 1, { blockquote: false, list: 'bullet' }, 'user');
              this.quill.setSelection(idx + 1, 0);
              return false;
            }},
            // Space/Tab at start of heading: suppress (no leading whitespace in headings)
            'heading space': { key: ' ', collapsed: true, format: ['header'], prefix: /^$/, handler: () => false },
            'heading tab': { key: 'Tab', collapsed: true, format: ['header'], handler: () => false },
            // Enter at end of heading: insert a new bullet list item
            'heading enter': { key: 'Enter', collapsed: true, format: ['header'], handler: (range: any) => {
              const idx = range.index;
              this.quill.insertText(idx, '\n', 'user');
              this.quill.formatLine(idx + 1, 1, { header: false, list: 'bullet' }, 'user');
              this.quill.setSelection(idx + 1, 0);
              return false;
            }},
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

    // Listen for Escape during drag (HostListener doesn't fire when Quill has focus)
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.dragState) {
        e.preventDefault();
        this.cleanupDrag();
        requestAnimationFrame(() => this.updateLineHandles());
      }
    });

    // Replace header dropdown with H1/H2/H3 toggle buttons
    this.replaceHeaderDropdown();

    // Override list toolbar handler: clicking same list type should do nothing (not remove list)
    const toolbar = this.quill.getModule('toolbar') as any;
    if (toolbar) {
      toolbar.addHandler('list', (value: string) => {
        const sel = this.quill.getSelection();
        if (!sel) return;
        const fmt = this.quill.getFormat(sel.index, sel.length || 1);
        const currentList = (fmt as any)['list'];
        // If clicking same list type, do nothing (don't toggle off)
        if (currentList === value) return;
        this.quill.format('list', value);
      });
    }

    // Track last focused position for citation insert
    this.quill.on('selection-change', (range: any) => {
      if (range) this.lastFocusedIndex = range.index;
      // Update header button active state
      this.updateHeaderButtons();
    });

    // Click on blockquote (citation) → open source detail panel
    const editorRoot = this.editorContainer.nativeElement.querySelector('.ql-editor') as HTMLElement;
    if (editorRoot) {
      editorRoot.addEventListener('click', (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest('blockquote');
        if (!target) return;
        // Find matching source by comparing citation text
        const text = target.textContent || '';
        const source = this.sampleSources.find(s => text.includes(s.author) || text.includes(s.title));
        if (source) {
          this.zone.run(() => {
            this.showPreview = true;
            this.openSourceDetail(source);
          });
        }
      });
    }

    // Make blockquotes visually read-only (cursor changes)
    // Actual edit prevention is handled by reverting changes in text-change handler

    // Track mouse position for single hover handle
    const wrapper = this.editorContainer.nativeElement.closest('.editor-wrapper');
    if (wrapper) {
      wrapper.addEventListener('mousemove', (e: Event) => {
        if (!this.dragState) this.updateHoverHandle(e as MouseEvent);
      });
      wrapper.addEventListener('mouseleave', () => {
        this.hoveredHandle = null;
        this.clearHoverHighlight();
        this.cdr.detectChanges();
      });
    }

    this.loadDemoContent();
    setTimeout(() => this.updateLineHandles(), 300);

    // (selection-change handled above)

    this.quill.on('text-change', () => {
      requestAnimationFrame(() => this.updateLineHandles());
    });

    // Run formatter when editor loses focus (cleaner than debounce timer)
    const edRoot = this.editorContainer.nativeElement.querySelector('.ql-editor') as HTMLElement;
    if (edRoot) {
      edRoot.addEventListener('blur', () => {
        setTimeout(() => this.formatOutline(), 100);
      });
    }
  }

  ngOnDestroy() {
    this.cleanupDrag();
  }

  // ──────────────────────────────────────
  // Replace header dropdown with H1/H2/H3 toggle buttons
  // ──────────────────────────────────────
  private replaceHeaderDropdown() {
    const toolbar = this.editorContainer.nativeElement.closest('.quill-host')
      ?.querySelector('.ql-toolbar') ||
      document.querySelector('.ql-toolbar');
    if (!toolbar) return;

    const headerPicker = toolbar.querySelector('.ql-header.ql-picker');
    if (!headerPicker) return;

    // Create button group
    const group = document.createElement('span');
    group.className = 'ql-formats ql-header-btns';

    for (const level of [1, 2, 3]) {
      const btn = document.createElement('button');
      btn.className = 'ql-header-toggle';
      btn.setAttribute('data-value', String(level));
      btn.textContent = `H${level}`;
      btn.addEventListener('click', () => {
        const sel = this.quill.getSelection();
        if (!sel) return;
        const fmt = this.quill.getFormat(sel.index, sel.length || 1);
        const current = (fmt as any)['header'];
        if (current === level) {
          // Already this level — remove header (back to normal)
          this.quill.format('header', false);
        } else {
          this.quill.format('header', level);
        }
        this.updateHeaderButtons();
      });
      group.appendChild(btn);
    }

    // Replace the picker
    headerPicker.parentElement?.replaceChild(group, headerPicker);
  }

  private updateHeaderButtons() {
    const btns = document.querySelectorAll('.ql-header-toggle');
    const sel = this.quill.getSelection();
    if (!sel) return;
    const fmt = this.quill.getFormat(sel.index, sel.length || 1);
    const current = (fmt as any)['header'] || 0;
    btns.forEach(btn => {
      const val = parseInt(btn.getAttribute('data-value') || '0');
      btn.classList.toggle('active', val === current);
    });
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
  lastFocusedIndex: number = 0;
  pasteShortcut = navigator.platform?.includes('Mac') ? '\u2318V' : 'Ctrl+V';

  copyLineToClipboard(handle: { el: HTMLElement; index: number; length: number }) {
    const tag = handle.el.tagName;
    let sectionEls: HTMLElement[];

    if (/^H[123]$/.test(tag)) {
      const range = this.getHeadingSectionRange(handle.index);
      sectionEls = range ? this.getElementsInRange(range.start, range.length) : [handle.el];
    } else {
      sectionEls = [handle.el];
    }

    // Build HTML with proper nesting
    const container = document.createElement('div');
    for (const el of sectionEls) {
      if (el.tagName === 'LI' && el.parentElement) {
        const listTag = el.parentElement.tagName;
        let lastChild = container.lastElementChild;
        if (!lastChild || lastChild.tagName !== listTag) {
          lastChild = document.createElement(listTag);
          container.appendChild(lastChild);
        }
        lastChild.appendChild(el.cloneNode(true));
      } else {
        container.appendChild(el.cloneNode(true));
      }
    }
    const richHtml = this.quillHtmlToNestedHtml(container.innerHTML);
    const text = sectionEls.map(el => el.textContent).join('\n');

    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([richHtml], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })
    ]).catch(() => {});
    this.showToast();
  }

  insertCitation(source: any) {
    const citation = this.formatMLA(source);
    // Insert at last focused position, not end of document
    const sel = this.quill.getSelection();
    let insertIndex = sel ? sel.index : this.lastFocusedIndex || this.quill.getLength() - 1;

    try {
      const [line] = this.quill.getLine(insertIndex);
      if (line) insertIndex = this.quill.getIndex(line as any) + line.length();
    } catch {}

    this.insertCitationText(citation, insertIndex);
    this.quill.focus();
  }

  /** Always inserts a citation with consistent gold blockquote formatting */
  private insertCitationText(citation: string, atIndex: number) {
    // Check if we need a leading newline (avoid double-newlines)
    let offset = 0;
    if (atIndex > 0) {
      const prevChar = this.quill.getText(atIndex - 1, 1);
      if (prevChar !== '\n') {
        this.quill.insertText(atIndex, '\n', 'user');
        offset = 1;
      }
    }
    const insertAt = atIndex + offset;
    this.quill.insertText(insertAt, citation + '\n', 'user');
    this.quill.formatLine(insertAt, 1, { blockquote: true }, 'user');
    this.quill.formatText(insertAt, citation.length, { italic: true }, 'user');
    // Ensure the line AFTER the citation is not a blockquote
    this.quill.formatLine(insertAt + citation.length + 1, 1, { blockquote: false }, 'user');
    this.quill.setSelection(insertAt + citation.length + 1, 0);
    // Run formatter to clean up
    requestAnimationFrame(() => this.formatOutline());
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
  // Single hover handle — follows mouse, highlights target element + children
  // ──────────────────────────────────────
  private updateHoverHandle(event: MouseEvent) {
    const clientY = event.clientY;
    const wrapper = this.editorContainer.nativeElement.closest('.editor-wrapper');
    if (!wrapper) return;
    const wrapperRect = wrapper.getBoundingClientRect();

    // Find the line handle closest to the mouse Y
    let best: typeof this.lineHandles[0] | null = null;
    let bestDist = Infinity;
    for (const h of this.lineHandles) {
      const elRect = h.el.getBoundingClientRect();
      const centerY = elRect.top + elRect.height / 2;
      const dist = Math.abs(clientY - centerY);
      if (dist < bestDist) { bestDist = dist; best = h; }
    }

    if (best && bestDist < 80) {
      const tag = best.el.tagName;
      const isHeading = tag === 'H1' || tag === 'H2' || tag === 'H3';
      let sectionEls: HTMLElement[] = [];

      if (isHeading) {
        // Highlight heading + all section children
        const range = this.getHeadingSectionRange(best.index);
        if (range) sectionEls = this.getElementsInRange(range.start, range.length);
        else sectionEls = [best.el];
      } else {
        sectionEls = [best.el];
      }

      // Update highlight — single overlay covering the entire group
      this.clearHoverHighlight();
      this.showHoverOverlay(sectionEls);
      this.lastHoveredEl = best.el;

      this.hoveredHandle = {
        top: best.el.getBoundingClientRect().top - wrapperRect.top,
        index: best.index,
        length: best.length,
        el: best.el,
      };
      this.cdr.detectChanges();
    } else if (this.hoveredHandle) {
      this.hoveredHandle = null;
      this.clearHoverHighlight();
      this.cdr.detectChanges();
    }
  }

  private showHoverOverlay(elements: HTMLElement[]) {
    if (elements.length === 0) return;
    const wrapper = this.editorContainer.nativeElement.closest('.editor-wrapper');
    if (!wrapper) return;
    const wrapperRect = wrapper.getBoundingClientRect();

    // Calculate union bounding rect of all elements (including parent ol/ul for list items)
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    for (const el of elements) {
      // For list items, use the parent list's left edge to include bullets
      const target = (el.tagName === 'LI' && el.parentElement) ? el.parentElement : el;
      const rect = el.getBoundingClientRect();
      const parentRect = target.getBoundingClientRect();
      top = Math.min(top, rect.top);
      bottom = Math.max(bottom, rect.bottom);
      left = Math.min(left, parentRect.left);
      right = Math.max(right, rect.right);
    }

    if (!this.hoverOverlay) {
      this.hoverOverlay = document.createElement('div');
      this.hoverOverlay.className = 'hover-overlay';
      wrapper.appendChild(this.hoverOverlay);
    }

    this.hoverOverlay.style.cssText = `
      position: absolute;
      top: ${top - wrapperRect.top - 4}px;
      left: ${left - wrapperRect.left - 4}px;
      width: ${right - left + 8}px;
      height: ${bottom - top + 8}px;
      background: #e4f0f3;
      border: 1px dashed #c0d8de;
      border-radius: 6px;
      pointer-events: none;
      z-index: 1;
    `;
  }

  private clearHoverHighlight() {
    if (this.hoverOverlay) {
      this.hoverOverlay.remove();
      this.hoverOverlay = null;
    }
    this.lastHoveredEl = null;
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

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

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
    if (event.button !== 0) return;
    event.preventDefault();

    this.pendingSourceDrag = { source, startX: event.clientX, startY: event.clientY };
    this.sourceJustDragged = false;
    const startTime = Date.now();

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      if (!this.pendingSourceDrag) return;
      const dx = e.clientX - this.pendingSourceDrag.startX;
      const dy = e.clientY - this.pendingSourceDrag.startY;
      if (Math.sqrt(dx * dx + dy * dy) < 8) return;

      const src = this.pendingSourceDrag.source;
      this.pendingSourceDrag = null;
      this.sourceJustDragged = true;

      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';

      this.dragState = { type: 'source', source: src, offsetY: 0 };

      const tempDiv = document.createElement('blockquote');
      tempDiv.textContent = this.formatMLA(src);
      this.createFloatingPreview(tempDiv, e.clientX, e.clientY);

      this.createDropIndicator();
      this.attachGlobalListeners();

      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
    };

    const onUp = () => {
      const wasDrag = this.sourceJustDragged;
      this.pendingSourceDrag = null;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      // Short click (no drag) → open detail view
      if (!wasDrag && Date.now() - startTime < 300) {
        this.zone.run(() => this.openSourceDetail(source));
      }
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
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
    const els = Array.isArray(sourceEls) ? sourceEls : [sourceEls];

    // Compute natural height from source elements
    let totalHeight = 0;
    for (const el of els) {
      totalHeight += el.getBoundingClientRect().height;
    }

    const container = document.createElement('div');
    container.className = 'ql-editor';
    container.style.cssText = `
      position: fixed;
      pointer-events: none;
      opacity: 0.85;
      z-index: 10000;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 6px 10px !important;
      max-width: 480px;
      max-height: ${Math.min(totalHeight + 16, 250)}px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #333;
      min-height: auto !important;
      left: ${x + 12}px;
      top: ${y - 10}px;
    `;
    for (const el of els) {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.classList.remove('dragging-source');
      clone.classList.remove('hover-highlight');
      clone.style.margin = '0';
      // Copy computed styles for headings so they match the editor
      if (/^H[123]$/.test(clone.tagName)) {
        const computed = window.getComputedStyle(el);
        clone.style.fontSize = computed.fontSize;
        clone.style.fontWeight = computed.fontWeight;
        clone.style.color = computed.color;
        clone.style.borderBottom = 'none';
        clone.style.paddingBottom = '0';
        clone.style.marginTop = '0';
      }
      container.appendChild(clone);
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
    this.boundMouseMove = (e: MouseEvent) => this.onGlobalMouseMove(e);
    this.boundMouseUp = (e: MouseEvent) => this.onGlobalMouseUp(e);
    document.addEventListener('mousemove', this.boundMouseMove, true);
    document.addEventListener('mouseup', this.boundMouseUp, true);
  }

  private onGlobalMouseMove(event: MouseEvent) {
    if (!this.dragState) return;
    event.preventDefault(); // Prevent text selection during drag

    // Move floating preview
    if (this.dragState.floatingEl) {
      this.dragState.floatingEl.style.left = `${event.clientX + 12}px`;
      this.dragState.floatingEl.style.top = `${event.clientY - 10}px`;
    }

    // Update drop indicator position
    this.updateDropIndicator(event.clientX, event.clientY);

  }

  private updateDropIndicator(clientX: number, clientY: number) {
    if (!this.dragState?.indicatorEl) return;

    const editor = this.editorContainer.nativeElement.querySelector('.ql-editor');
    if (!editor) return;

    const wrapperRect = this.editorContainer.nativeElement.closest('.editor-wrapper')?.getBoundingClientRect();
    if (!wrapperRect) return;

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

    // Determine valid drop targets based on what's being dragged
    const dragEl = this.dragState.lineEl;
    const dragTag = dragEl?.tagName || '';
    const isHeadingDrag = dragTag === 'H1' || dragTag === 'H2' || dragTag === 'H3';
    const dragHeadingLevel = isHeadingDrag ? parseInt(dragTag[1]) : 0;
    const isListItemDrag = dragTag === 'LI';

    // Filter to valid drop targets
    let validBlocks = blocks;
    if (isHeadingDrag) {
      // Headings can only drop before/after sibling headings at same level.
      // Only use the TOP edge of each sibling heading as a drop target
      // (no bottom edges — prevents inserting between a heading and its content).
      validBlocks = blocks.filter(b => {
        const t = b.el.tagName;
        return (t === 'H1' || t === 'H2' || t === 'H3') && parseInt(t[1]) <= dragHeadingLevel;
      });
      if (validBlocks.length === 0) validBlocks = blocks.filter(b => /^H[123]$/.test(b.el.tagName));
    } else if (isListItemDrag) {
      // List items drop among other list items, blockquotes, or after headings
      validBlocks = blocks.filter(b => b.el.tagName === 'LI' || b.el.tagName === 'BLOCKQUOTE' || /^H[123]$/.test(b.el.tagName));
    }

    let bestBlock: typeof blocks[0] | null = null;
    let insertBefore = true;
    let minDist = Infinity;

    if (isHeadingDrag) {
      // For headings: only snap to the TOP edge of each heading (= section start)
      // and the BOTTOM edge of the last block (= end of document)
      for (const block of validBlocks) {
        const topDist = Math.abs(clientY - block.rect.top);
        if (topDist < minDist) {
          minDist = topDist;
          bestBlock = block;
          insertBefore = true;
        }
      }
      // Also check: drop after the last valid heading's section
      if (validBlocks.length > 0) {
        const lastHeading = validBlocks[validBlocks.length - 1];
        const lastSection = this.getHeadingSectionRange(lastHeading.quillIdx);
        if (lastSection) {
          // Find the last block in the document to get its bottom edge
          const lastBlock = blocks[blocks.length - 1];
          if (lastBlock) {
            const bottomDist = Math.abs(clientY - lastBlock.rect.bottom);
            if (bottomDist < minDist) {
              minDist = bottomDist;
              bestBlock = lastBlock;
              insertBefore = false;
            }
          }
        }
      }
    } else {
      // Standard: snap to nearest top or bottom edge
      for (const block of validBlocks) {
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
    }

    // Clean up previous displacement
    if (this.displacedEl) {
      this.displacedEl.style.marginTop = '';
      this.displacedEl = null;
    }

    const placeholderH = 28; // matches CSS .drop-placeholder height
    const placeholderGap = 14;
    const displacePx = `${placeholderH + placeholderGap}px`;

    if (bestBlock) {
      const displacedTarget = insertBefore ? bestBlock.el : (bestBlock.el.nextElementSibling as HTMLElement);
      const wrapperRect2 = this.editorContainer.nativeElement.closest('.editor-wrapper')!.getBoundingClientRect();

      if (insertBefore) {
        // Displace the target down first, then position placeholder in the gap
        bestBlock.el.style.marginTop = displacePx;
        this.displacedEl = bestBlock.el;
        // Recalculate position after displacement
        const rect = bestBlock.el.getBoundingClientRect();
        this.dragState.indicatorEl.style.top = `${rect.top - wrapperRect2.top - placeholderH - placeholderGap / 2}px`;
        this.dragState.dropBeforeIndex = bestBlock.quillIdx;
      } else if (displacedTarget) {
        displacedTarget.style.marginTop = displacePx;
        this.displacedEl = displacedTarget;
        const rect = displacedTarget.getBoundingClientRect();
        this.dragState.indicatorEl.style.top = `${rect.top - wrapperRect2.top - placeholderH - placeholderGap / 2}px`;
        this.dragState.dropBeforeIndex = bestBlock.quillIdx + bestBlock.quillLen;
      } else {
        // At the end
        const rect = bestBlock.el.getBoundingClientRect();
        this.dragState.indicatorEl.style.top = `${rect.bottom - wrapperRect2.top + 4}px`;
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
    // Clean up any stale inline margin-top from displacement
    const editorEl = this.editorContainer.nativeElement.querySelector('.ql-editor');
    if (editorEl) {
      editorEl.querySelectorAll('[style*="margin-top"]').forEach((el: Element) => {
        (el as HTMLElement).style.marginTop = '';
      });
    }
    requestAnimationFrame(() => {
      this.formatOutline();
      this.updateLineHandles();
    });
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

    // Convert list type if dropped into a different list context
    if (state.lineEl && state.lineEl.tagName === 'LI') {
      try {
        const [targetLine] = this.quill.getLine(targetIndex);
        if (targetLine) {
          const targetFmt = this.quill.getFormat(targetIndex, 1);
          const srcFmt = delta.ops?.find((op: any) => op.attributes?.['list'])?.attributes?.['list'];
          const targetList = (targetFmt as any)['list'] as string | undefined;
          if (targetList && srcFmt && targetList !== srcFmt) {
            this.quill.formatLine(targetIndex, srcLen, 'list', targetList, 'user');
          }
        }
      } catch {}
    }
  }

  private completeSourceDrop(state: DragState, event: MouseEvent) {
    if (!state.source) return;
    const citation = this.formatMLA(state.source);
    const insertIndex = state.dropBeforeIndex ?? this.quill.getLength() - 1;
    this.insertCitationText(citation, insertIndex);
  }

  private cleanupDrag() {
    if (this.dragState) {
      if (this.dragState.floatingEl) {
        this.dragState.floatingEl.remove();
      }
      if (this.dragState.indicatorEl) {
        this.dragState.indicatorEl.remove();
      }
      document.querySelectorAll('.dragging-source').forEach(el => el.classList.remove('dragging-source'));
    }
    if (this.displacedEl) {
      this.displacedEl.style.marginTop = '';
      this.displacedEl = null;
    }
    // Restore text selection
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    // Clear any accidental selection
    window.getSelection()?.removeAllRanges();
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
  // Post-drop formatter — enforce clean outline structure
  // ──────────────────────────────────────
  private formatOutline() {
    const q = this.quill;
    let len = q.getLength();
    let pos = 0;

    while (pos < len) {
      const [line] = q.getLine(pos);
      if (!line) break;
      const lineIdx = q.getIndex(line as any);
      const lineLen = (line as any).length();
      const text = q.getText(lineIdx, lineLen);
      const fmt = q.getFormat(lineIdx, lineLen);

      // 1. Remove empty/whitespace-only lines, BUT skip the line the cursor is on
      const textContent = text.replace(/[\n\s]/g, '');
      const sel = q.getSelection();
      const cursorOnThisLine = sel && sel.index >= lineIdx && sel.index < lineIdx + lineLen;
      if (textContent === '' && !fmt['header'] && !cursorOnThisLine && pos + lineLen < q.getLength()) {
        q.deleteText(lineIdx, lineLen, 'silent');
        len = q.getLength();
        continue;
      }

      // 2. Enforce single-step indentation (no jumping from indent 0 to indent 2+)
      const indent = (fmt['indent'] as number) || 0;
      if (indent > 1 && pos > 0) {
        // Check previous line's indent
        const prevPos = lineIdx - 1;
        if (prevPos >= 0) {
          const prevFmt = q.getFormat(prevPos, 1);
          const prevIndent = ((prevFmt as any)['indent'] as number) || 0;
          if (indent > prevIndent + 1) {
            q.formatLine(lineIdx, lineLen, 'indent', prevIndent + 1, 'silent');
          }
        }
      }

      // 3. Auto-convert list type to match neighboring list at same indent
      const listType = (fmt as any)['list'] as string | undefined;
      if (listType && lineIdx > 0) {
        const prevFmt = q.getFormat(lineIdx - 1, 1);
        const prevList = (prevFmt as any)['list'] as string | undefined;
        const prevIndent = ((prevFmt as any)['indent'] as number) || 0;
        const curIndent = (fmt['indent'] as number) || 0;
        if (prevList && prevList !== listType && prevIndent === curIndent) {
          q.formatLine(lineIdx, lineLen, 'list', prevList, 'silent');
        }
      }

      pos = lineIdx + lineLen;
    }

    // 4. Second pass: remove ALL remaining empty lines anywhere in the document
    //    (catches gaps left by rule 1 due to formatting changes in rules 2-3)
    len = q.getLength();
    pos = 0;
    while (pos < len) {
      const [line] = q.getLine(pos);
      if (!line) break;
      const lineIdx = q.getIndex(line as any);
      const lineLen = (line as any).length();
      const text = q.getText(lineIdx, lineLen);
      const fmt = q.getFormat(lineIdx, lineLen);
      const isEmpty = text.replace(/[\n\s]/g, '') === '';

      if (isEmpty && !fmt['header'] && lineIdx + lineLen < len) {
        q.deleteText(lineIdx, lineLen, 'silent');
        len = q.getLength();
        continue;
      }
      pos = lineIdx + lineLen;
    }

    // 5. Remove trailing empty lines beyond one
    len = q.getLength();
    if (len > 2) {
      const lastText = q.getText(len - 2, 2);
      if (lastText === '\n\n') {
        q.deleteText(len - 1, 1, 'silent');
      }
    }
  }

  // ──────────────────────────────────────
  // HTML transformation — convert Quill's flat lists to properly nested HTML
  // ──────────────────────────────────────
  private quillHtmlToNestedHtml(quillHtml: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = quillHtml;

    const result = document.createElement('div');
    const children = Array.from(temp.children);

    for (const child of children) {
      if (child.tagName === 'OL' || child.tagName === 'UL') {
        // Process list: convert flat Quill list to nested structure
        this.nestList(child as HTMLElement, result);
      } else {
        result.appendChild(child.cloneNode(true));
      }
    }
    return result.innerHTML;
  }

  private nestList(flatList: HTMLElement, output: HTMLElement) {
    const items = Array.from(flatList.children) as HTMLElement[];
    if (items.length === 0) return;

    const buildNested = (items: HTMLElement[], parentIndent: number): HTMLElement => {
      // Determine list type from first item
      const firstType = items[0]?.getAttribute('data-list') || 'bullet';
      const listEl = document.createElement(firstType === 'ordered' ? 'ol' : 'ul');

      let i = 0;
      while (i < items.length) {
        const item = items[i];
        const indent = this.getQuillIndent(item);
        const listType = item.getAttribute('data-list') || 'bullet';

        if (indent === parentIndent) {
          const li = document.createElement('li');
          // Copy text content (skip the ql-ui span)
          for (const node of Array.from(item.childNodes)) {
            if (node instanceof HTMLElement && node.classList.contains('ql-ui')) continue;
            li.appendChild(node.cloneNode(true));
          }

          // Check if next items are children (higher indent)
          const childItems: HTMLElement[] = [];
          let j = i + 1;
          while (j < items.length && this.getQuillIndent(items[j]) > parentIndent) {
            childItems.push(items[j]);
            j++;
          }

          if (childItems.length > 0) {
            const childList = buildNested(childItems, parentIndent + 1);
            li.appendChild(childList);
          }

          // Use correct list type
          if (listType === 'ordered' && listEl.tagName === 'UL') {
            // Mixed types at same level — just add to current list
          }
          listEl.appendChild(li);
          i = j;
        } else {
          i++;
        }
      }
      return listEl;
    };

    const nested = buildNested(items, 0);
    output.appendChild(nested);
  }

  private getQuillIndent(el: HTMLElement): number {
    for (const cls of Array.from(el.classList)) {
      const match = cls.match(/^ql-indent-(\d+)$/);
      if (match) return parseInt(match[1]);
    }
    return 0;
  }

  // ──────────────────────────────────────
  // Export abstraction — swappable for Google Drive API later
  // ──────────────────────────────────────
  private exportOutline(html: string, plainText: string) {
    const nestedHtml = this.quillHtmlToNestedHtml(html);
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([nestedHtml], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      })
    ]).catch(() => {});

    // Show persistent toast (user dismisses manually)
    this.showToast();
  }

  exportToastVisible = false;
  private toastTimer: any = null;

  showToast() {
    this.exportToastVisible = true;
    this.cdr.detectChanges();
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.exportToastVisible = false;
      this.cdr.detectChanges();
    }, 8000);
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

    // Escape: cancel drag if active, otherwise deselect
    if (event.key === 'Escape') {
      if (this.dragState) {
        event.preventDefault();
        this.cleanupDrag();
        requestAnimationFrame(() => this.updateLineHandles());
        return;
      }
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
    this.exportOutline(this.quill.root.innerHTML, this.quill.getText());
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
