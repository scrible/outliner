import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import DragHandle from '@tiptap/extension-drag-handle';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { TiptapEditorDirective, TiptapBubbleMenuDirective, Citation } from '../shared/tiptap';

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
  private hoveredNodePos: number = -1;

  ngOnInit() {
    this.editor = new Editor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          bulletList: { keepMarks: true, keepAttributes: true },
          orderedList: { keepMarks: true, keepAttributes: true },
        }),
        BubbleMenu.configure({
          shouldShow: ({ editor, state }) => {
            // Only show when: editor is focused, text is selected, not in a citation
            if (!editor.isFocused) return false;
            const { from, to } = state.selection;
            return from !== to && !editor.isActive('citation');
          },
        }),
        Citation,
        this.createSectionHighlight(),
        DragHandle.configure({
          render: () => {
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
            // Wire up copy button — copies the hovered node (section for headings)
            el.querySelector('.handle-copy')?.addEventListener('click', (e) => {
              e.stopPropagation();
              const pos = this.resolveHoveredNodePos();
              if (this.hoveredNode && pos >= 0) {
                const node = this.hoveredNode;
                // For headings: find section range (heading + everything until next same-level heading)
                let endPos = pos + node.nodeSize;
                if (node.type.name === 'heading') {
                  const level = node.attrs['level'];
                  this.editor.state.doc.nodesBetween(pos + node.nodeSize, this.editor.state.doc.content.size, (n: any, p: number) => {
                    if (n.type.name === 'heading' && n.attrs['level'] <= level) {
                      endPos = p;
                      return false;
                    }
                    return true;
                  });
                }
                const text = this.editor.state.doc.textBetween(pos, endPos, '\n');
                navigator.clipboard.writeText(text).catch(() => {});
                this.showToast();
              }
            });
            return el;
          },
          onNodeChange: ({ node }) => {
            // Track the hovered node for copy/drag — lightweight
            this.hoveredNode = node || null;
            this.hoveredNodePos = -1;
          },
          nested: true,
          onElementDragStart: () => {
            // If dragging a heading, expand selection to include the full section
            const dragPos = this.resolveHoveredNodePos();
            if (this.hoveredNode?.type.name === 'heading' && dragPos >= 0) {
              const headingLevel = this.hoveredNode.attrs['level'];
              const startPos = dragPos;
              let endPos = startPos + this.hoveredNode.nodeSize;

              // Find section end: walk doc to find next same/higher-level heading
              const doc = this.editor.state.doc;
              let sectionEndFound = false;
              doc.nodesBetween(startPos + this.hoveredNode.nodeSize, doc.content.size, (n: any, p: number) => {
                if (sectionEndFound) return false;
                // Only check top-level nodes (depth 1 from doc)
                const depth = doc.resolve(p).depth;
                if (depth !== 0) return true; // skip nested nodes
                if (n.type.name === 'heading' && n.attrs['level'] <= headingLevel) {
                  endPos = p;
                  sectionEndFound = true;
                  return false;
                }
                endPos = p + n.nodeSize;
                return false; // don't descend into this top-level node
              });
              if (!sectionEndFound) endPos = doc.content.size;

              // Select the full section
              this.editor.chain()
                .setTextSelection({ from: startPos, to: endPos })
                .run();
            }
          },
        }),
      ],
      content: this.getDemoContent(),
      editorProps: {
        attributes: {
          class: 'outline-content',
          role: 'textbox',
          'aria-label': 'Outline editor',
          'aria-multiline': 'true',
        },
      },
    });

    // Handle source drops from the panel
    this.editor.view.dom.addEventListener('drop', (e: DragEvent) => {
      const sourceJson = e.dataTransfer?.getData('application/x-scrible-citation');
      if (!sourceJson) return; // Not a source drop — let TipTap/DragHandle handle it
      e.preventDefault();
      e.stopPropagation();
      const source = JSON.parse(sourceJson);
      // Insert citation at the drop position
      const pos = this.editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (pos) {
        const citation = this.formatMLA(source);
        this.editor.chain().focus().insertContentAt(pos.pos, {
          type: 'citation',
          attrs: { sourceUrl: source.url, sourceTitle: source.title, sourceAuthor: source.author },
          content: [{ type: 'text', marks: [{ type: 'italic' }], text: citation }],
        }).run();
      }
    });

    this.editor.view.dom.addEventListener('dragover', (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('application/x-scrible-citation')) {
        e.preventDefault(); // Allow drop
      }
    });

    // Click on citation node → open source detail
    this.editor.on('create', ({ editor }) => {
      editor.view.dom.addEventListener('click', (e: MouseEvent) => {
        const citationEl = (e.target as HTMLElement).closest('.citation-node');
        if (!citationEl) return;
        const sourceUrl = citationEl.getAttribute('data-source-url') || '';
        const source = this.sampleSources.find(s => sourceUrl.includes(s.url) || citationEl.textContent?.includes(s.author));
        if (source) {
          this.showPreview = true;
          this.openSourceDetail(source);
        }
      });
    });

    // Formatter: runs on blur only (no timer — avoids interference)
    let isFormatting = false;
    const runFormatter = () => {
      if (isFormatting) return;
      isFormatting = true;
      try {
        // Remove trailing empty paragraphs (use fresh doc ref each iteration)
        let doc = this.editor.state.doc;
        let iterations = 0;
        while (doc.lastChild && doc.lastChild.type.name === 'paragraph'
               && doc.lastChild.textContent === '' && doc.childCount > 1 && iterations < 5) {
          const pos = doc.content.size - doc.lastChild.nodeSize;
          this.editor.chain().deleteRange({ from: pos, to: doc.content.size }).run();
          doc = this.editor.state.doc; // refresh reference
          iterations++;
        }

        // Remove empty list items (collect positions first, then delete in reverse)
        doc = this.editor.state.doc;
        const emptyPositions: number[] = [];
        doc.descendants((node: any, pos: number) => {
          if (node.type.name === 'listItem' && node.textContent.trim() === '') {
            emptyPositions.push(pos);
          }
          return true;
        });
        // Delete in reverse order to preserve positions
        for (let i = emptyPositions.length - 1; i >= 0; i--) {
          const pos = emptyPositions[i];
          const currentDoc = this.editor.state.doc;
          if (pos < currentDoc.content.size) {
            const node = currentDoc.nodeAt(pos);
            if (node && node.type.name === 'listItem' && node.textContent.trim() === '') {
              this.editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
            }
          }
        }
      } finally {
        isFormatting = false;
      }
    };

    // Run on blur only
    this.editor.on('blur', () => setTimeout(runFormatter, 200));
  }

  ngOnDestroy() {
    this.editor?.destroy();
  }

  // ── Source panel ──
  openSourceDetail(source: any) { this.selectedSource = source; }
  goBackToSources() { this.selectedSource = null; }
  closePreview() { this.showPreview = false; this.selectedSource = null; }

  /** Create the SectionHighlight extension (ProseMirror plugin with decorations) */
  private createSectionHighlight(): Extension {
    const pluginKey = new PluginKey('sectionHighlight');

    return Extension.create({
      name: 'sectionHighlight',
      addProseMirrorPlugins() {
        return [
          new Plugin({
            key: pluginKey,
            state: {
              init: () => ({ headingPos: -1 }),
              apply: (tr, prev) => {
                const meta = tr.getMeta(pluginKey);
                if (meta !== undefined) return { headingPos: meta };
                return prev;
              },
            },
            props: {
              decorations: (state) => {
                const { headingPos } = pluginKey.getState(state) || {};
                if (headingPos < 0) return DecorationSet.empty;

                const doc = state.doc;
                const headingNode = doc.nodeAt(headingPos);
                if (!headingNode || headingNode.type.name !== 'heading') return DecorationSet.empty;

                const headingLevel = headingNode.attrs['level'];
                const decorations: Decoration[] = [];

                // Highlight the heading itself
                decorations.push(Decoration.node(headingPos, headingPos + headingNode.nodeSize, {
                  class: 'section-highlight-heading',
                }));

                // Highlight children until next same-level-or-higher heading
                let pos = headingPos + headingNode.nodeSize;
                while (pos < doc.content.size) {
                  const node = doc.nodeAt(pos);
                  if (!node) break;
                  if (node.type.name === 'heading' && node.attrs['level'] <= headingLevel) break;
                  decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                    class: 'section-highlight',
                  }));
                  pos += node.nodeSize;
                }

                return DecorationSet.create(doc, decorations);
              },
              handleDOMEvents: {
                mousemove: (view, event) => {
                  const target = event.target as HTMLElement;
                  // Walk up to find a heading that's a direct child of the editor
                  let el: HTMLElement | null = target;
                  const pm = view.dom;
                  let headingEl: HTMLElement | null = null;
                  while (el && el !== pm) {
                    if (/^H[1-3]$/.test(el.tagName) && el.parentElement === pm) {
                      headingEl = el;
                      break;
                    }
                    el = el.parentElement;
                  }

                  // Resolve the heading's document position
                  let newPos = -1;
                  if (headingEl) {
                    const domPos = view.posAtDOM(headingEl, 0);
                    const resolved = view.state.doc.resolve(domPos);
                    // Walk up to the top-level (depth 1) heading node
                    newPos = resolved.depth >= 1 ? resolved.before(1) : domPos;
                  }

                  const current = pluginKey.getState(view.state)?.headingPos ?? -1;
                  if (newPos !== current) {
                    view.dispatch(view.state.tr.setMeta(pluginKey, newPos));
                  }
                  return false; // don't prevent default
                },
                mouseleave: (view) => {
                  const current = pluginKey.getState(view.state)?.headingPos ?? -1;
                  if (current >= 0) {
                    view.dispatch(view.state.tr.setMeta(pluginKey, -1));
                  }
                  return false;
                },
              },
            },
          }),
        ];
      },
    });
  }

  /** Resolve the position of the currently hovered node (lazy — only when needed) */
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

  // ── Source drag ──
  onSourceDragStart(event: DragEvent, source: any) {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('application/x-scrible-citation', JSON.stringify(source));
    event.dataTransfer.setData('text/plain', this.formatMLA(source));
    event.dataTransfer.effectAllowed = 'copy';
  }

  // ── Citation ──
  insertCitation(source: any) {
    const citation = this.formatMLA(source);
    this.editor.chain().focus().insertContent({
      type: 'citation',
      attrs: { sourceUrl: source.url, sourceTitle: source.title, sourceAuthor: source.author },
      content: [{ type: 'text', marks: [{ type: 'italic' }], text: citation }],
    }).run();
  }

  formatMLA(source: any): string {
    const author = source.author || 'Unknown';
    const title = `\u201c${source.title}\u201d`;
    const date = source.date || new Date().getFullYear().toString();
    const accessed = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${author}. ${title}. ${date}. Web. ${accessed}.`;
  }

  // ── Thumbnails (cached via sessionStorage to avoid re-fetching) ──
  private thumbnailCache: Record<string, string> = {};

  getThumbnailUrl(url: string): string {
    if (this.thumbnailCache[url]) return this.thumbnailCache[url];
    const cached = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`thumb:${url}`) : null;
    if (cached) { this.thumbnailCache[url] = cached; return cached; }
    const thumbUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;
    // Cache for future use (the URL itself is the cache key — Microlink caches server-side too)
    this.thumbnailCache[url] = thumbUrl;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(`thumb:${url}`, thumbUrl);
    return thumbUrl;
  }

  // ── Export ──
  exportToGoogleDoc() {
    const rawHtml = this.editor.getHTML();
    // Wrap in a styled HTML fragment for better paste into Google Docs
    const styledHtml = `<html><body>
      <style>
        h1 { font-size: 20px; font-weight: bold; }
        h2 { font-size: 16px; font-weight: bold; color: #1d6e82; }
        h3 { font-size: 14px; font-weight: bold; }
        blockquote, .citation-node { border-left: 3px solid #ECB86B; padding: 4px 8px; background: #FCF4E9; font-style: italic; }
      </style>
      ${rawHtml}
    </body></html>`;
    const text = this.editor.getText();
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([styledHtml], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })
    ]).catch(() => {});
    this.showToast();
  }

  showToast() {
    this.exportToastVisible = true;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.exportToastVisible = false; }, 8000);
  }

  // ── Toolbar commands ──
  toggleHeading(level: 1 | 2 | 3) {
    this.editor.chain().focus().toggleHeading({ level }).run();
  }

  isHeadingActive(level: number): boolean {
    return this.editor?.isActive('heading', { level }) || false;
  }

  // ── Demo content ──
  private getDemoContent() {
    return {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Mars Colonization: Economic Feasibility Study' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Thesis' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'The rapid advancement of reusable rocket technology has fundamentally altered the economic landscape of space exploration, making Mars colonization a realistic near-term goal.' }] },
          ]},
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Background' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'NASA\'s Mars Exploration Program has systematically studied Mars since the 1990s with rovers, orbiters, and landers.' }] },
          ]},
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'The Perseverance rover (2021) is designed to search for ancient microbial life and collect samples for Earth return.' }] },
          ]},
        ]},
        { type: 'citation', attrs: { sourceUrl: 'https://science.nasa.gov/mission/mars-2020-perseverance/', sourceTitle: 'Mars 2020 Perseverance Rover', sourceAuthor: 'NASA' },
          content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'NASA. \u201cMars 2020 Perseverance Rover.\u201d science.nasa.gov, 2024. Web.' }],
        },
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
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'The convergence of reduced launch costs, advancing life support, and international collaboration suggests a permanent Mars presence is achievable within two decades.' }] },
          ]},
        ]},
      ],
    };
  }
}
