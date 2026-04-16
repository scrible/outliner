import { Component, OnInit, OnDestroy, Input, ViewEncapsulation, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import DragHandle from '@tiptap/extension-drag-handle';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { yCursorPlugin } from '@tiptap/y-tiptap';
import { TiptapEditorDirective, TiptapBubbleMenuDirective } from '../shared/tiptap';
import {
  Citation,
  KeyboardGuards,
  AcademicFormatter,
  OutlineNumbering,
} from '@scrible/tiptap-academic-outline';

@Component({
  selector: 'app-outline-editor-tiptap',
  standalone: true,
  imports: [CommonModule, TiptapEditorDirective, TiptapBubbleMenuDirective],
  templateUrl: './outline-editor-tiptap.component.html',
  styleUrl: './outline-editor-tiptap.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class OutlineEditorTiptapComponent implements OnInit, OnDestroy {
  editor!: Editor;
  showPreview = false;
  selectedSource: any = null;
  exportToastVisible = false;
  pasteShortcut = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '\u2318V' : 'Ctrl+V';

  // Read-only mode — set via @Input or auto-set on disconnect timeout
  @Input() readOnly = false;

  // Citation removal confirmation dialog
  citationRemoveConfirm: { pos: number; text: string } | null = null;
  syncStatus: 'connecting' | 'synced' | 'disconnected' | 'connection-error' = 'connecting';
  private disconnectTimer: any = null;
  private readonly disconnectTimeoutMs = 8000;

  // Yjs collaborative editing
  private ydoc = new Y.Doc();
  private wsProvider: WebsocketProvider | null = null;
  private readonly yjsUrl = 'ws://localhost:1234';

  constructor(private route: ActivatedRoute, private cdr: ChangeDetectorRef) {}

  sampleSources = [
    { title: 'Mars Exploration Program — NASA', url: 'https://mars.nasa.gov/', author: 'NASA', date: '2024',
      summary: 'NASA\'s hub for Mars missions including rovers, orbiters, and future human exploration plans.' },
    { title: 'Mars 2020 Perseverance Rover', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/', author: 'NASA Science', date: '2024',
      summary: 'Details on the Perseverance rover mission, designed to seek signs of ancient life and collect rock samples.' },
    { title: 'Water on Mars — Wikipedia', url: 'https://en.wikipedia.org/wiki/Water_on_Mars', author: 'Wikipedia contributors', date: '2024',
      summary: 'Comprehensive overview of evidence for water on Mars, including polar ice caps and subsurface glaciers.' },
    { title: 'SpaceX Starship', url: 'https://www.spacex.com/vehicles/starship/', author: 'SpaceX', date: '2024',
      summary: 'SpaceX\'s fully reusable heavy-lift launch vehicle designed for interplanetary missions.' },
  ];

  private toastTimer: any = null;
  private hoveredNode: any = null;
  private hoveredNodePos = -1;
  private highlightOverlay: HTMLElement | null = null;
  private citationDropPreview: HTMLElement | null = null;
  private sectionDrag: {
    sectionFrom: number;
    sectionTo: number;
    sectionNodes: any[];
    headingLevel: number;
    floatingClone: HTMLElement;
    dropIndicator: HTMLElement;
    currentDropPos: number;
    startY: number;
    active: boolean;
    greyedEls: HTMLElement[];
    boundMouseMove: (e: MouseEvent) => void;
    boundMouseUp: (e: MouseEvent) => void;
    boundKeyDown: (e: KeyboardEvent) => void;
  } | null = null;

  // ════════════════════════════════════════════════════════════
  // Shared: find the section range for a heading (heading + children until next same-level)
  // ════════════════════════════════════════════════════════════
  private findSectionRange(pos: number, node: any): { from: number; to: number } {
    const doc = this.editor.state.doc;
    const level = node.attrs['level'];
    let endPos = pos + node.nodeSize;
    let found = false;
    doc.nodesBetween(pos + node.nodeSize, doc.content.size, (n: any, p: number) => {
      if (found) return false;
      if (doc.resolve(p).depth !== 0) return false;
      if (n.type.name === 'heading' && n.attrs['level'] <= level) {
        endPos = p; found = true; return false;
      }
      endPos = p + n.nodeSize;
      return false;
    });
    if (!found) endPos = doc.content.size;
    return { from: pos, to: endPos };
  }

  // ════════════════════════════════════════════════════════════
  // Editor initialization
  // ════════════════════════════════════════════════════════════
  ngOnInit() {
    // Derive room name from route param, defaulting to 'outline-demo'.
    const outlineId = this.route.snapshot.paramMap.get('outlineId') || 'demo';
    const yjsRoom = `outline-${outlineId}`;

    // Connect provider before editor so Collaboration can use it immediately.
    this.wsProvider = new WebsocketProvider(this.yjsUrl, yjsRoom, this.ydoc);

    // Cursor presence as a custom extension wrapping yCursorPlugin.
    const cursorAwareness = this.wsProvider.awareness;
    const userColor = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    cursorAwareness.setLocalStateField('user', { name: `User ${this.ydoc.clientID}`, color: userColor });

    const CollaborationCursor = Extension.create({
      name: 'collaborationCursor',
      addProseMirrorPlugins() {
        return [yCursorPlugin(cursorAwareness)];
      },
    });

    this.editor = new Editor({
      extensions: [
        // Collaboration must come first — it manages the document.
        Collaboration.configure({
          document: this.ydoc,
        }),
        CollaborationCursor,
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          bulletList: { keepMarks: true, keepAttributes: true },
          orderedList: { keepMarks: true, keepAttributes: true },
          dropcursor: { color: false, width: 2, class: 'drop-cursor-box' },
          undoRedo: false, // Yjs manages undo via Collaboration extension
        }),
        BubbleMenu.configure({
          shouldShow: ({ editor, state }) => {
            if (!editor.isFocused) return false;
            const { from, to } = state.selection;
            return from !== to && !editor.isActive('citation');
          },
        }),
        Citation,
        KeyboardGuards,
        OutlineNumbering,
        AcademicFormatter,
        DragHandle.configure({
          render: () => this.createDragHandleElement(),
          onNodeChange: ({ node }) => {
            this.hoveredNode = node || null;
            this.hoveredNodePos = -1;
            this.updateHighlightOverlay(node);
            // Reveal the wrapper on first real hover (hidden on load to prevent 0,0 flash)
            if (node && this.dragHandleWrapper?.style.display === 'none') {
              this.dragHandleWrapper.style.display = '';
            }
          },
          nested: true,
        }),
      ],
      editorProps: {
        attributes: { class: 'outline-content', role: 'textbox', 'aria-label': 'Outline editor', 'aria-multiline': 'true' },
      },
    });

    // Seed demo content on first sync if doc is empty.
    this.wsProvider.on('sync', (synced: boolean) => {
      if (synced && this.editor.isEmpty) {
        this.editor.commands.setContent(this.getDemoContent());
      }
    });

    // Connection status tracking — auto-readonly after 8s disconnect.
    this.wsProvider.on('status', ({ status }: { status: string }) => {
      if (status === 'disconnected') {
        this.syncStatus = 'disconnected';
        this.disconnectTimer = setTimeout(() => {
          this.syncStatus = 'connection-error';
          this.editor.setEditable(false);
          this.cdr.detectChanges();
        }, this.disconnectTimeoutMs);
      } else if (status === 'connected') {
        clearTimeout(this.disconnectTimer);
        this.syncStatus = 'synced';
        if (!this.readOnly) {
          this.editor.setEditable(true);
        }
        this.cdr.detectChanges();
      }
    });

    // Apply initial read-only state.
    if (this.readOnly) {
      this.editor.setEditable(false);
    }

    // Hide the drag handle wrapper on load — the plugin positions it at 0,0
    // before any mouse interaction. We show it on the first onNodeChange.
    const handleGroup = this.editor.view.dom.parentElement?.querySelector('.drag-handle-group');
    if (handleGroup?.parentElement) {
      this.dragHandleWrapper = handleGroup.parentElement as HTMLElement;
      this.dragHandleWrapper.style.display = 'none';
    }

    // Expose for Playwright test access
    (window as any).__tiptapEditor = this.editor;
    (window as any).__yjsProvider = this.wsProvider;

    this.setupSourceDropHandling();
    this.setupCitationClickHandling();
  }

  ngOnDestroy() {
    clearTimeout(this.disconnectTimer);
    if (this.sectionDrag) this.cleanupSectionDrag();
    this.highlightOverlay?.remove();
    this.citationDropPreview?.remove();
    this.wsProvider?.destroy();
    this.ydoc?.destroy();
    this.editor?.destroy();
  }

  // ════════════════════════════════════════════════════════════
  // Highlight overlay — ONE div, positioned via bounding rect union
  // No ProseMirror decorations, no CSS classes on content, no jitter.
  // ════════════════════════════════════════════════════════════
  private updateHighlightOverlay(node: any) {
    if (!node) { this.clearHighlightOverlay(); return; }
    const pos = this.resolveHoveredNodePos();
    if (pos < 0) { this.clearHighlightOverlay(); return; }

    const view = this.editor.view;
    const doc = this.editor.state.doc;
    let domElements: Element[] = [];

    if (node.type.name === 'heading') {
      const { from, to } = this.findSectionRange(pos, node);
      // Collect all top-level DOM elements in the section
      let p = from;
      while (p < to) {
        const n = doc.nodeAt(p);
        if (!n) break;
        const domNode = view.nodeDOM(p);
        if (domNode instanceof Element) domElements.push(domNode);
        p += n.nodeSize;
      }
    } else {
      const domNode = view.nodeDOM(pos);
      if (domNode instanceof Element) domElements.push(domNode);
    }

    if (domElements.length === 0) { this.clearHighlightOverlay(); return; }
    this.positionOverlay(domElements, node.type.name === 'heading');
  }

  private positionOverlay(elements: Element[], isSection: boolean) {
    const pm = this.editor.view.dom;
    const pmRect = pm.getBoundingClientRect();

    // Compute union bounding rect of all elements
    let top = Infinity, bottom = -Infinity;
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }

    if (!this.highlightOverlay) {
      this.highlightOverlay = document.createElement('div');
      this.highlightOverlay.className = 'hover-overlay';
      // Append to .editor-wrapper (the positioned ancestor) for correct absolute positioning
      const wrapper = pm.closest('.editor-wrapper') || pm.parentElement;
      wrapper?.appendChild(this.highlightOverlay);
    }

    const overlay = this.highlightOverlay;
    // Position relative to .editor-wrapper (the positioned ancestor)
    const wrapper = pm.closest('.editor-wrapper') as HTMLElement;
    const wrapperRect = wrapper.getBoundingClientRect();

    overlay.style.top = (top - wrapperRect.top) + 'px';
    overlay.style.left = (pmRect.left - wrapperRect.left) + 'px';
    overlay.style.width = pmRect.width + 'px';
    overlay.style.height = (bottom - top) + 'px';
    overlay.style.display = 'block';
    overlay.classList.toggle('hover-overlay-section', isSection);
  }

  private clearHighlightOverlay() {
    if (this.highlightOverlay) this.highlightOverlay.style.display = 'none';
  }

  // ════════════════════════════════════════════════════════════
  // Drag handle element
  // ════════════════════════════════════════════════════════════
  private dragHandleWrapper: HTMLElement | null = null;

  private createDragHandleElement(): HTMLElement {
    const el = document.createElement('div');
    el.classList.add('drag-handle-group');
    el.innerHTML = `
      <button class="handle-copy" title="Copy to clipboard" aria-label="Copy element">
        <span class="material-icons">content_copy</span>
      </button>
      <div class="handle-grip" title="Drag to move" aria-label="Drag to reorder">
        <span class="material-icons">drag_indicator</span>
      </div>
    `;
    const grip = el.querySelector('.handle-grip')!;

    // Custom section drag for headings — intercepts before HTML5 drag can start
    grip.addEventListener('mousedown', (e: Event) => {
      if (this.hoveredNode?.type.name === 'heading') {
        this.startSectionDrag(e as MouseEvent);
      }
    });

    // Prevent HTML5 drag for headings (startSectionDrag handles them via mousedown)
    grip.addEventListener('dragstart', (e: Event) => {
      if (this.sectionDrag) {
        e.preventDefault();
        return;
      }
      // Fix drag ghost for non-heading items: position content to right of cursor
      const de = e as DragEvent;
      if (!de.dataTransfer) return;
      const orig = de.dataTransfer.setDragImage.bind(de.dataTransfer);
      de.dataTransfer.setDragImage = (img: Element, _x: number, _y: number) => orig(img, 0, 10);
    }, true);
    el.querySelector('.handle-copy')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyHoveredNode();
    });
    // Keep highlight visible when mouse enters the handle
    el.addEventListener('mouseenter', () => {
      if (this.hoveredNode) this.updateHighlightOverlay(this.hoveredNode);
    });
    el.addEventListener('mouseleave', (e) => {
      const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
      if (!related || !related.closest('.ProseMirror')) this.clearHighlightOverlay();
    });
    return el;
  }

  private copyHoveredNode() {
    const pos = this.resolveHoveredNodePos();
    if (!this.hoveredNode || pos < 0) return;
    const node = this.hoveredNode;
    let endPos = pos + node.nodeSize;
    if (node.type.name === 'heading') {
      endPos = this.findSectionRange(pos, node).to;
    }
    navigator.clipboard.writeText(this.editor.state.doc.textBetween(pos, endPos, '\n')).catch(() => {});
    this.showToast();
  }

  // ════════════════════════════════════════════════════════════
  // Section drag — custom mousedown/mousemove/mouseup system for headings
  // Bypasses HTML5 drag entirely. Non-heading items use default DragHandle.
  // ════════════════════════════════════════════════════════════
  private startSectionDrag(e: MouseEvent) {
    const pos = this.resolveHoveredNodePos();
    if (!this.hoveredNode || this.hoveredNode.type.name !== 'heading' || pos < 0) return;

    e.preventDefault();
    e.stopPropagation();

    const { from, to } = this.findSectionRange(pos, this.hoveredNode);
    const doc = this.editor.state.doc;
    const view = this.editor.view;

    // Snapshot section nodes as JSON
    const nodes: any[] = [];
    let p = from;
    while (p < to) {
      const n = doc.nodeAt(p);
      if (!n) break;
      nodes.push(n.toJSON());
      p += n.nodeSize;
    }

    // Grey out the original section DOM elements
    const greyedEls: HTMLElement[] = [];
    p = from;
    while (p < to) {
      const n = doc.nodeAt(p);
      if (!n) break;
      const dom = view.nodeDOM(p);
      if (dom instanceof HTMLElement) {
        dom.classList.add('section-dragging');
        greyedEls.push(dom);
      }
      p += n.nodeSize;
    }

    // Create floating clone (heading text pill)
    const pm = view.dom;
    const wrapper = pm.closest('.editor-wrapper') as HTMLElement;
    const wrapperRect = wrapper.getBoundingClientRect();

    const clone = document.createElement('div');
    clone.className = 'section-drag-clone';
    clone.textContent = this.hoveredNode.textContent;
    clone.style.display = 'none';
    wrapper.appendChild(clone);

    // Create drop indicator
    const indicator = document.createElement('div');
    indicator.className = 'section-drop-indicator';
    wrapper.appendChild(indicator);

    // Lock drag handle so the plugin doesn't interfere
    this.editor.view.dispatch(this.editor.state.tr.setMeta('lockDragHandle', true));
    this.clearHighlightOverlay();

    // Bind event handlers
    const boundMouseMove = (ev: MouseEvent) => this.updateSectionDrag(ev);
    const boundMouseUp = (ev: MouseEvent) => this.commitSectionDrag();
    const boundKeyDown = (ev: KeyboardEvent) => { if (ev.key === 'Escape') this.cancelSectionDrag(); };

    document.addEventListener('mousemove', boundMouseMove);
    document.addEventListener('mouseup', boundMouseUp);
    document.addEventListener('keydown', boundKeyDown);

    this.sectionDrag = {
      sectionFrom: from,
      sectionTo: to,
      sectionNodes: nodes,
      headingLevel: this.hoveredNode.attrs['level'],
      floatingClone: clone,
      dropIndicator: indicator,
      currentDropPos: -1,
      startY: e.clientY,
      active: false,
      greyedEls,
      boundMouseMove,
      boundMouseUp,
      boundKeyDown,
    };
  }

  private updateSectionDrag(e: MouseEvent) {
    if (!this.sectionDrag) return;
    const drag = this.sectionDrag;

    // Dead zone: require 4px movement before activating
    if (!drag.active) {
      if (Math.abs(e.clientY - drag.startY) < 4) return;
      drag.active = true;
      drag.floatingClone.style.display = '';
      drag.dropIndicator.style.display = 'block';
    }

    const view = this.editor.view;
    const pm = view.dom;
    const wrapper = pm.closest('.editor-wrapper') as HTMLElement;
    const wrapperRect = wrapper.getBoundingClientRect();
    const pmRect = pm.getBoundingClientRect();

    // Position floating clone near cursor
    drag.floatingClone.style.top = (e.clientY - wrapperRect.top - 14) + 'px';
    drag.floatingClone.style.left = (pmRect.left - wrapperRect.left + 20) + 'px';

    // Find nearest section gap via bounding rects.
    // Group headings at the SAME level as the dragged heading into sections.
    // Headings at other levels and non-heading nodes are standalone unless
    // they're children of a same-level heading's section.
    const doc = this.editor.state.doc;
    const dragLevel = drag.headingLevel;
    const sections: { from: number; to: number }[] = [];
    let pos = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const child = doc.child(i);
      const nodeStart = pos;
      pos += child.nodeSize;
      if (child.type.name === 'heading' && child.attrs['level'] === dragLevel) {
        // Same-level heading: group it with its children
        const range = this.findSectionRange(nodeStart, child);
        sections.push(range);
        while (i + 1 < doc.childCount && pos < range.to) {
          i++;
          pos += doc.child(i).nodeSize;
        }
      } else if (sections.length === 0 || nodeStart >= sections[sections.length - 1].to) {
        // Standalone node (not part of a same-level heading's section)
        sections.push({ from: nodeStart, to: nodeStart + child.nodeSize });
      }
    }

    // Build boundaries at section edges, skipping the dragged section
    const boundaries: { y: number; pos: number }[] = [];
    for (const sec of sections) {
      if (sec.from >= drag.sectionFrom && sec.from < drag.sectionTo) continue;
      // Get bounding rect union for all DOM elements in this section
      let secTop = Infinity, secBottom = -Infinity;
      let p = sec.from;
      while (p < sec.to) {
        const n = doc.nodeAt(p);
        if (!n) break;
        const dom = view.nodeDOM(p);
        if (dom instanceof HTMLElement) {
          const rect = dom.getBoundingClientRect();
          if (rect.top < secTop) secTop = rect.top;
          if (rect.bottom > secBottom) secBottom = rect.bottom;
        }
        p += n.nodeSize;
      }
      if (secTop === Infinity) continue;
      if (boundaries.length === 0) boundaries.push({ y: secTop, pos: sec.from });
      boundaries.push({ y: secBottom, pos: sec.to });
    }

    if (boundaries.length === 0) return;

    let best = boundaries[0];
    for (const b of boundaries) {
      if (Math.abs(b.y - e.clientY) < Math.abs(best.y - e.clientY)) best = b;
    }
    drag.currentDropPos = best.pos;

    // Position drop indicator at the gap
    drag.dropIndicator.style.top = (best.y - wrapperRect.top) + 'px';
    drag.dropIndicator.style.left = (pmRect.left - wrapperRect.left) + 'px';
    drag.dropIndicator.style.width = pmRect.width + 'px';
  }

  private commitSectionDrag() {
    if (!this.sectionDrag || !this.sectionDrag.active) {
      this.cancelSectionDrag();
      return;
    }
    const drag = this.sectionDrag;
    let dropPos = drag.currentDropPos;

    // Don't move to same position
    if (dropPos < 0 || dropPos === drag.sectionFrom || dropPos === drag.sectionTo) {
      this.cancelSectionDrag();
      return;
    }

    // Single transaction: delete source, insert at target
    const schema = this.editor.state.schema;
    const sectionNodes = drag.sectionNodes.map((json: any) => schema.nodeFromJSON(json));
    const tr = this.editor.state.tr;
    tr.delete(drag.sectionFrom, drag.sectionTo);
    if (dropPos > drag.sectionFrom) dropPos -= (drag.sectionTo - drag.sectionFrom);
    const insertAt = Math.max(0, Math.min(dropPos, tr.doc.content.size));
    for (let i = sectionNodes.length - 1; i >= 0; i--) {
      tr.insert(insertAt, sectionNodes[i]);
    }
    this.editor.view.dispatch(tr);
    this.editor.view.focus();

    this.cleanupSectionDrag();
  }

  private cancelSectionDrag() {
    this.cleanupSectionDrag();
  }

  private cleanupSectionDrag() {
    if (!this.sectionDrag) return;
    const drag = this.sectionDrag;

    // Remove greyed-out styling
    for (const el of drag.greyedEls) el.classList.remove('section-dragging');

    // Remove floating clone and drop indicator
    drag.floatingClone.remove();
    drag.dropIndicator.remove();

    // Unbind event handlers
    document.removeEventListener('mousemove', drag.boundMouseMove);
    document.removeEventListener('mouseup', drag.boundMouseUp);
    document.removeEventListener('keydown', drag.boundKeyDown);

    // Unlock drag handle
    this.editor.view.dispatch(this.editor.state.tr.setMeta('lockDragHandle', false));

    this.sectionDrag = null;
  }

  // ════════════════════════════════════════════════════════════
  // Source drop handling
  // ════════════════════════════════════════════════════════════
  private setupSourceDropHandling() {
    this.editor.view.dom.addEventListener('drop', (e: DragEvent) => {
      const sourceJson = e.dataTransfer?.getData('application/x-scrible-citation');
      if (!sourceJson) return;
      e.preventDefault();
      e.stopPropagation();
      const source = JSON.parse(sourceJson);
      const pos = this.editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (pos) {
        this.editor.chain().focus().insertContentAt(pos.pos, {
          type: 'citation',
          attrs: { sourceUrl: source.url, sourceTitle: source.title, sourceAuthor: source.author },
          content: [{ type: 'text', marks: [{ type: 'italic' }], text: this.formatMLA(source) }],
        }).run();
      }
    });
    this.editor.view.dom.addEventListener('dragover', (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('application/x-scrible-citation')) e.preventDefault();
    });
  }

  // ════════════════════════════════════════════════════════════
  // Citation click handling
  // ════════════════════════════════════════════════════════════
  private setupCitationClickHandling() {
    this.editor.on('create', ({ editor }) => {
      editor.view.dom.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        // Handle remove button click (× pseudo-element, right 28px of citation)
        const citationForRemove = target.closest('.citation-node') as HTMLElement;
        if (citationForRemove && !this.readOnly && this.syncStatus !== 'connection-error') {
          const rect = citationForRemove.getBoundingClientRect();
          if (e.clientX > rect.right - 28) {
            e.stopPropagation();
            // Find the citation's text — used to relocate it on confirm
            const text = citationForRemove.textContent || '';
            this.citationRemoveConfirm = { pos: -1, text };
            this.cdr.detectChanges();
            return;
          }
        }

        const citationEl = target.closest('.citation-node');
        if (!citationEl) return;
        // Place cursor inside for Tab/Shift-Tab
        const pos = editor.view.posAtDOM(citationEl, 0);
        if (pos >= 0) editor.chain().setTextSelection(pos).run();
      });
      editor.view.dom.addEventListener('dblclick', (e: MouseEvent) => {
        const citationEl = (e.target as HTMLElement).closest('.citation-node');
        if (!citationEl) return;
        const sourceUrl = citationEl.getAttribute('data-source-url') || '';
        const source = this.sampleSources.find(s => sourceUrl.includes(s.url) || citationEl.textContent?.includes(s.author));
        if (source) { this.showPreview = true; this.openSourceDetail(source); }
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // Citation removal — converts citation to freetext
  // ════════════════════════════════════════════════════════════
  confirmRemoveCitation() {
    if (!this.citationRemoveConfirm) return;
    const { text } = this.citationRemoveConfirm;
    // Re-find the citation by scanning the doc (position may have shifted)
    const doc = this.editor.state.doc;
    let citationPos = -1;
    let citationNode: any = null;
    doc.descendants((node: any, pos: number) => {
      if (citationNode) return false;
      if (node.type.name === 'citation' && node.textContent === text) {
        citationPos = pos;
        citationNode = node;
        return false;
      }
      return true;
    });
    if (citationPos < 0 || !citationNode) {
      this.citationRemoveConfirm = null;
      return;
    }
    // Replace citation with a bullet list item containing its text
    this.editor.chain()
      .deleteRange({ from: citationPos, to: citationPos + citationNode.nodeSize })
      .insertContentAt(citationPos, {
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
        }],
      })
      .run();
    this.citationRemoveConfirm = null;
  }

  cancelRemoveCitation() {
    this.citationRemoveConfirm = null;
  }

  // ════════════════════════════════════════════════════════════
  // Utility
  // ════════════════════════════════════════════════════════════
  private resolveHoveredNodePos(): number {
    if (!this.hoveredNode) return -1;
    if (this.hoveredNodePos >= 0) return this.hoveredNodePos;
    let pos = -1;
    this.editor.state.doc.descendants((n: any, p: number) => {
      if (n === this.hoveredNode && pos < 0) { pos = p; return false; }
      return true;
    });
    this.hoveredNodePos = pos;
    return pos;
  }

  // ════════════════════════════════════════════════════════════
  // Source panel
  // ════════════════════════════════════════════════════════════
  openSourceDetail(source: any) { this.selectedSource = source; }
  goBackToSources() { this.selectedSource = null; }
  closePreview() { this.showPreview = false; this.selectedSource = null; }

  // ════════════════════════════════════════════════════════════
  // Citation
  // ════════════════════════════════════════════════════════════
  onSourceDragStart(event: DragEvent, source: any) {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('application/x-scrible-citation', JSON.stringify(source));
    event.dataTransfer.setData('text/plain', this.formatMLA(source));
    event.dataTransfer.effectAllowed = 'copy';
  }

  insertCitation(source: any) {
    this.hideCitationDropPreview();
    const insertPos = this.getCitationInsertPos();
    this.editor.chain().focus().insertContentAt(insertPos, {
      type: 'citation',
      attrs: { sourceUrl: source.url, sourceTitle: source.title, sourceAuthor: source.author },
      content: [{ type: 'text', marks: [{ type: 'italic' }], text: this.formatMLA(source) }],
    }).run();
  }

  formatMLA(source: any): string {
    const author = source.author || 'Unknown';
    const title = `\u201c${source.title}\u201d`;
    const date = source.date || new Date().getFullYear().toString();
    const accessed = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${author}. ${title}. ${date}. Web. ${accessed}.`;
  }

  // ════════════════════════════════════════════════════════════
  // Citation drop preview — shows where "Insert Citation" will land
  // ════════════════════════════════════════════════════════════
  private getCitationInsertPos(): number {
    const doc = this.editor.state.doc;
    let insertPos = doc.content.size;
    for (let i = doc.childCount - 1; i >= 0; i--) {
      const child = doc.child(i);
      if (child.textContent.trim() || child.type.name === 'citation') {
        let p = 0;
        for (let j = 0; j <= i; j++) p += doc.child(j).nodeSize;
        insertPos = p;
        break;
      }
    }
    return insertPos;
  }

  showCitationDropPreview() {
    const view = this.editor.view;
    const insertPos = this.getCitationInsertPos();

    // Use ProseMirror's coordsAtPos for exact insertion point coordinates
    const coords = view.coordsAtPos(insertPos);
    const pm = view.dom;
    const wrapper = pm.closest('.editor-wrapper') as HTMLElement;
    if (!wrapper) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const pmRect = pm.getBoundingClientRect();

    if (!this.citationDropPreview) {
      this.citationDropPreview = document.createElement('div');
      this.citationDropPreview.className = 'citation-drop-preview';
      wrapper.appendChild(this.citationDropPreview);
    }

    const preview = this.citationDropPreview;
    preview.style.top = (coords.bottom - wrapperRect.top + 4) + 'px';
    preview.style.left = (pmRect.left - wrapperRect.left) + 'px';
    preview.style.width = pmRect.width + 'px';
    preview.style.display = 'block';
  }

  hideCitationDropPreview() {
    if (this.citationDropPreview) this.citationDropPreview.style.display = 'none';
  }

  // ════════════════════════════════════════════════════════════
  // Thumbnails
  // ════════════════════════════════════════════════════════════
  private thumbnailCache: Record<string, string> = {};
  getThumbnailUrl(url: string): string {
    if (this.thumbnailCache[url]) return this.thumbnailCache[url];
    const cached = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`thumb:${url}`) : null;
    if (cached) { this.thumbnailCache[url] = cached; return cached; }
    const thumbUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;
    this.thumbnailCache[url] = thumbUrl;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(`thumb:${url}`, thumbUrl);
    return thumbUrl;
  }

  // ════════════════════════════════════════════════════════════
  // Export — inline styles for Google Docs
  // ════════════════════════════════════════════════════════════
  exportToGoogleDoc() {
    const rawHtml = this.editor.getHTML();
    const div = document.createElement('div');
    div.innerHTML = rawHtml;
    // Inline styles on every element (Google Docs strips <style> tags and classes)
    div.querySelectorAll('h1').forEach(el => el.setAttribute('style', 'font-size:20pt;font-weight:bold;font-family:Arial;'));
    div.querySelectorAll('h2').forEach(el => el.setAttribute('style', 'font-size:14pt;font-weight:bold;color:#1d6e82;font-family:Arial;'));
    div.querySelectorAll('h3').forEach(el => el.setAttribute('style', 'font-size:12pt;font-weight:bold;font-family:Arial;'));
    div.querySelectorAll('.citation-node, blockquote').forEach(el => {
      el.setAttribute('style', 'border-left:3px solid #ECB86B;padding:4px 8px;background-color:#FCF4E9;font-style:italic;color:#78600e;font-size:10pt;font-family:Arial;margin-left:24px;');
      el.removeAttribute('class');
      ['data-type', 'data-source-url', 'data-source-title', 'data-source-author'].forEach(a => el.removeAttribute(a));
    });
    div.querySelectorAll('ul, ol').forEach(el => el.setAttribute('style', 'font-family:Arial;font-size:11pt;'));
    div.querySelectorAll('li').forEach(el => { if (!el.getAttribute('style')) el.setAttribute('style', 'font-family:Arial;font-size:11pt;'); });
    div.querySelectorAll('p').forEach(el => { if (!el.getAttribute('style')) el.setAttribute('style', 'font-family:Arial;font-size:11pt;'); });
    const styledHtml = `<meta charset="utf-8">${div.innerHTML}`;
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([styledHtml], { type: 'text/html' }),
        'text/plain': new Blob([this.editor.getText()], { type: 'text/plain' }),
      })
    ]).catch(() => {});
    this.showToast();
  }

  showToast() {
    this.exportToastVisible = true;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.exportToastVisible = false; }, 8000);
  }

  // ════════════════════════════════════════════════════════════
  // Toolbar
  // ════════════════════════════════════════════════════════════
  toggleHeading(level: 1 | 2 | 3) {
    const { $from } = this.editor.state.selection;
    let inList = false;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'listItem') { inList = true; break; }
    }
    if (inList) {
      let lifts = 0;
      while (this.editor.can().liftListItem('listItem') && lifts < 5) {
        this.editor.chain().liftListItem('listItem').run();
        lifts++;
      }
    }
    this.editor.chain().focus().toggleHeading({ level }).run();
  }

  isHeadingActive(level: number): boolean {
    return this.editor?.isActive('heading', { level }) || false;
  }

  // ════════════════════════════════════════════════════════════
  // Demo content
  // ════════════════════════════════════════════════════════════
  private getDemoContent() {
    return {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Mars Colonization: Economic Feasibility Study' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Thesis' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The rapid advancement of reusable rocket technology has fundamentally altered the economic landscape of space exploration, making Mars colonization a realistic near-term goal.' }] }] },
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Background' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'NASA\'s Mars Exploration Program has systematically studied Mars since the 1990s with rovers, orbiters, and landers.' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The Perseverance rover (2021) is designed to search for ancient microbial life and collect samples for Earth return.' }] }] },
        ]},
        { type: 'citation', attrs: { sourceUrl: 'https://science.nasa.gov/mission/mars-2020-perseverance/', sourceTitle: 'Mars 2020 Perseverance Rover', sourceAuthor: 'NASA' },
          content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'NASA. \u201cMars 2020 Perseverance Rover.\u201d science.nasa.gov, 2024. Web.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Economic Feasibility' }] },
        { type: 'orderedList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Launch cost reduction' }] },
            { type: 'bulletList', content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SpaceX Starship has reduced projected per-kg costs by two orders of magnitude vs. the Shuttle era.' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Falcon 9 reusability demonstrated >200 successful landings.' }] }] },
            ]},
          ]},
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'In-situ resource utilization (ISRU)' }] },
            { type: 'bulletList', content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Colonists could produce fuel, water, and building materials from Martian resources.' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'MOXIE experiment on Perseverance successfully produced oxygen from CO\u2082.' }] }] },
            ]},
          ]},
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Conclusion' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The convergence of reduced launch costs, advancing life support, and international collaboration suggests a permanent Mars presence is achievable within two decades.' }] }] },
        ]},
      ],
    };
  }
}
