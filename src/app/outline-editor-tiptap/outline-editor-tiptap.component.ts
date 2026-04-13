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
  private highlightKey = new PluginKey('hoverHighlight');

  ngOnInit() {
    this.editor = new Editor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          bulletList: { keepMarks: true, keepAttributes: true },
          orderedList: { keepMarks: true, keepAttributes: true },
          dropcursor: { color: false, width: 2, class: 'drop-cursor-box' },
        }),
        BubbleMenu.configure({
          shouldShow: ({ editor, state }) => {
            if (!editor.isFocused) return false;
            const { from, to } = state.selection;
            return from !== to && !editor.isActive('citation');
          },
        }),
        Citation,
        this.createBackspaceGuard(),
        this.createHoverHighlight(),
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
            // Wire up copy button
            el.querySelector('.handle-copy')?.addEventListener('click', (e) => {
              e.stopPropagation();
              const pos = this.resolveHoveredNodePos();
              if (this.hoveredNode && pos >= 0) {
                const node = this.hoveredNode;
                let endPos = pos + node.nodeSize;
                if (node.type.name === 'heading') {
                  const level = node.attrs['level'];
                  const doc = this.editor.state.doc;
                  let found = false;
                  doc.nodesBetween(pos + node.nodeSize, doc.content.size, (n: any, p: number) => {
                    if (found) return false;
                    const depth = doc.resolve(p).depth;
                    if (depth !== 0) return false; // only check top-level nodes
                    if (n.type.name === 'heading' && n.attrs['level'] <= level) {
                      endPos = p; found = true; return false;
                    }
                    endPos = p + n.nodeSize;
                    return false;
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
            this.hoveredNode = node || null;
            this.hoveredNodePos = -1;
            // Drive the highlight decoration
            this.updateHighlight(node);
          },
          nested: true,
          onElementDragStart: () => {
            // If dragging a heading, expand selection to include the full section
            const dragPos = this.resolveHoveredNodePos();
            if (this.hoveredNode?.type.name === 'heading' && dragPos >= 0) {
              const headingLevel = this.hoveredNode.attrs['level'];
              const startPos = dragPos;
              let endPos = startPos + this.hoveredNode.nodeSize;
              const doc = this.editor.state.doc;
              let sectionEndFound = false;
              doc.nodesBetween(startPos + this.hoveredNode.nodeSize, doc.content.size, (n: any, p: number) => {
                if (sectionEndFound) return false;
                const depth = doc.resolve(p).depth;
                if (depth !== 0) return true;
                if (n.type.name === 'heading' && n.attrs['level'] <= headingLevel) {
                  endPos = p; sectionEndFound = true; return false;
                }
                endPos = p + n.nodeSize;
                return false;
              });
              if (!sectionEndFound) endPos = doc.content.size;
              this.editor.chain().setTextSelection({ from: startPos, to: endPos }).run();
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

    // Click on citation → place cursor inside (for Tab indent) + open source detail on double-click
    this.editor.on('create', ({ editor }) => {
      editor.view.dom.addEventListener('click', (e: MouseEvent) => {
        const citationEl = (e.target as HTMLElement).closest('.citation-node');
        if (!citationEl) return;
        // Place cursor inside the citation node for Tab/Shift-Tab to work
        const pos = editor.view.posAtDOM(citationEl, 0);
        if (pos >= 0) {
          editor.chain().setTextSelection(pos).run();
        }
      });
      editor.view.dom.addEventListener('dblclick', (e: MouseEvent) => {
        const citationEl = (e.target as HTMLElement).closest('.citation-node');
        if (!citationEl) return;
        const sourceUrl = citationEl.getAttribute('data-source-url') || '';
        const source = this.sampleSources.find(s => sourceUrl.includes(s.url) || citationEl.textContent?.includes(s.author));
        if (source) { this.showPreview = true; this.openSourceDetail(source); }
      });
    });

    // Formatter: runs on blur (skip if focus moved to drag handle)
    let isFormatting = false;
    const runFormatter = () => {
      if (isFormatting) return;
      isFormatting = true;
      try {
        let doc = this.editor.state.doc;

        // 1. Convert bare paragraphs (with text) to list items
        let bareFound = true;
        let bareIter = 0;
        while (bareFound && bareIter < 20) {
          bareFound = false;
          bareIter++;
          doc = this.editor.state.doc;
          let pos = 0;
          for (let i = 0; i < doc.childCount; i++) {
            const child = doc.child(i);
            if (child.type.name === 'paragraph' && child.textContent.trim()) {
              // Find the nearest sibling list type
              let listType = 'bulletList';
              for (let j = i - 1; j >= 0; j--) {
                const sib = doc.child(j);
                if (sib.type.name === 'bulletList' || sib.type.name === 'orderedList') {
                  listType = sib.type.name; break;
                }
              }
              // Wrap in a new list at the same position
              const contentJson = child.content.size > 0 ? child.content.toJSON() : [];
              this.editor.chain()
                .deleteRange({ from: pos, to: pos + child.nodeSize })
                .insertContentAt(pos, {
                  type: listType,
                  content: [{ type: 'listItem', content: [{ type: 'paragraph', content: contentJson }] }],
                })
                .run();
              bareFound = true;
              break;
            }
            pos += child.nodeSize;
          }
        }

        // 2. Lift headings out of lists (headings should always be top-level)
        let headingLiftNeeded = true;
        let headingLiftIter = 0;
        while (headingLiftNeeded && headingLiftIter < 10) {
          headingLiftNeeded = false;
          headingLiftIter++;
          doc = this.editor.state.doc;
          doc.descendants((node: any, pos: number) => {
            if (headingLiftNeeded) return false;
            if (node.type.name === 'heading') {
              const $pos = doc.resolve(pos);
              // If heading is inside a list item (depth > 1), lift it
              for (let d = $pos.depth; d > 0; d--) {
                if ($pos.node(d).type.name === 'listItem') {
                  // Select the heading and lift it out
                  this.editor.chain()
                    .setTextSelection({ from: pos, to: pos + node.nodeSize })
                    .liftListItem('listItem')
                    .run();
                  headingLiftNeeded = true;
                  return false;
                }
              }
            }
            return true;
          });
        }

        // Remove trailing empty paragraphs
        doc = this.editor.state.doc;
        let iterations = 0;
        while (doc.lastChild && doc.lastChild.type.name === 'paragraph'
               && doc.lastChild.textContent === '' && doc.childCount > 1 && iterations < 5) {
          const pos = doc.content.size - doc.lastChild.nodeSize;
          this.editor.chain().deleteRange({ from: pos, to: doc.content.size }).run();
          doc = this.editor.state.doc;
          iterations++;
        }

        // 3. Remove empty list items
        doc = this.editor.state.doc;
        const emptyPositions: number[] = [];
        doc.descendants((node: any, pos: number) => {
          if (node.type.name === 'listItem' && node.textContent.trim() === '') emptyPositions.push(pos);
          return true;
        });
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

        // 4. Cap citation indent to 1 level at a time (no skipping depths)
        doc = this.editor.state.doc;
        let pos2 = 0;
        for (let i = 0; i < doc.childCount; i++) {
          const child = doc.child(i);
          if (child.type.name === 'citation') {
            const indent = child.attrs['indent'] || 0;
            // Citations are top-level block nodes. Max indent = 1 for now
            // (since they aren't inside lists, they can indent independently)
            // But enforce max = previous citation's indent + 1
            if (indent > 1) {
              // Find previous citation
              let prevIndent = 0;
              for (let j = i - 1; j >= 0; j--) {
                const prev = doc.child(j);
                if (prev.type.name === 'citation') { prevIndent = prev.attrs['indent'] || 0; break; }
              }
              if (indent > prevIndent + 1) {
                this.editor.chain()
                  .setTextSelection(pos2 + 1)
                  .updateAttributes('citation', { indent: prevIndent + 1 })
                  .run();
                break; // restart iteration after mutation
              }
            }
          }
          pos2 += child.nodeSize;
        }

        // 5. Fix sequential nesting: lift orphaned nested items
        let fixNeeded = true;
        let fixIter = 0;
        while (fixNeeded && fixIter < 10) {
          fixNeeded = false;
          fixIter++;
          doc = this.editor.state.doc;
          doc.descendants((node: any, pos: number) => {
            if (fixNeeded) return false;
            if (node.type.name !== 'listItem') return true;
            const $pos = doc.resolve(pos);
            if ($pos.depth < 4) return true;
            const grandparentLi = $pos.node($pos.depth - 2);
            if (grandparentLi?.type.name !== 'listItem') return true;
            const parentListIndex = $pos.index($pos.depth - 2);
            if (parentListIndex === 0) {
              this.editor.chain().setTextSelection(pos + 1).liftListItem('listItem').run();
              fixNeeded = true;
              return false;
            }
            return true;
          });
        }
      } finally {
        isFormatting = false;
      }
    };

    this.editor.on('blur', ({ event }) => {
      const related = (event as FocusEvent)?.relatedTarget as HTMLElement | null;
      if (related?.closest('.drag-handle-group')) return;
      if (related?.closest('.bubble-toolbar')) return;
      setTimeout(runFormatter, 200);
    });
  }

  ngOnDestroy() {
    this.editor?.destroy();
  }

  // ── Source panel ──
  openSourceDetail(source: any) { this.selectedSource = source; }
  goBackToSources() { this.selectedSource = null; }
  closePreview() { this.showPreview = false; this.selectedSource = null; }

  // ── Highlight system ──
  // Driven by DragHandle's onNodeChange — creates ProseMirror decorations
  // that survive reconciliation and persist when mouse moves to handle buttons

  private updateHighlight(node: any) {
    if (!node) {
      this.editor.view.dispatch(this.editor.state.tr.setMeta(this.highlightKey, { type: 'clear' }));
      return;
    }
    // Find the node's position
    const pos = this.resolveHoveredNodePos();
    if (pos < 0) return;

    if (node.type.name === 'heading') {
      this.editor.view.dispatch(this.editor.state.tr.setMeta(this.highlightKey, { type: 'section', pos, level: node.attrs['level'] }));
    } else {
      this.editor.view.dispatch(this.editor.state.tr.setMeta(this.highlightKey, { type: 'node', pos, size: node.nodeSize }));
    }
  }

  private createHoverHighlight(): Extension {
    const pluginKey = this.highlightKey;
    return Extension.create({
      name: 'hoverHighlight',
      addProseMirrorPlugins() {
        return [
          new Plugin({
            key: pluginKey,
            state: {
              init: () => ({ type: 'clear' } as any),
              apply: (tr: any, prev: any) => {
                const meta = tr.getMeta(pluginKey);
                if (meta) return meta;
                if (tr.docChanged && prev.type !== 'clear') return { type: 'clear' };
                return prev;
              },
            },
            props: {
              decorations: (state) => {
                const highlight = pluginKey.getState(state);
                if (!highlight || highlight.type === 'clear') return DecorationSet.empty;

                const doc = state.doc;
                const decorations: Decoration[] = [];

                if (highlight.type === 'node') {
                  // Single node highlight (list item, citation, paragraph)
                  const node = doc.nodeAt(highlight.pos);
                  if (node) {
                    decorations.push(Decoration.node(highlight.pos, highlight.pos + node.nodeSize, {
                      class: 'node-highlight',
                    }));
                  }
                } else if (highlight.type === 'section') {
                  // Heading section: heading + children until next same-level heading
                  const headingNode = doc.nodeAt(highlight.pos);
                  if (!headingNode || headingNode.type.name !== 'heading') return DecorationSet.empty;
                  const headingLevel = headingNode.attrs['level'];

                  decorations.push(Decoration.node(highlight.pos, highlight.pos + headingNode.nodeSize, {
                    class: 'section-highlight-heading',
                  }));

                  let pos = highlight.pos + headingNode.nodeSize;
                  while (pos < doc.content.size) {
                    const node = doc.nodeAt(pos);
                    if (!node) break;
                    if (node.type.name === 'heading' && node.attrs['level'] <= headingLevel) break;
                    decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                      class: 'section-highlight',
                    }));
                    pos += node.nodeSize;
                  }
                }

                return DecorationSet.create(doc, decorations);
              },
            },
          }),
        ];
      },
    });
  }

  /** Prevent Backspace from escaping list items */
  private createBackspaceGuard(): Extension {
    return Extension.create({
      name: 'backspaceGuard',
      addKeyboardShortcuts() {
        return {
          'Backspace': ({ editor }) => {
            const { $from, empty } = editor.state.selection;
            if (!empty) return false;
            if ($from.parent.type.name !== 'paragraph' && $from.parent.type.name !== 'heading') return false;
            if ($from.parentOffset !== 0) return false;
            const listItem = $from.node($from.depth - 1);
            if (listItem?.type.name !== 'listItem') return false;
            // Nested → outdent; top-level → block
            let listDepth = 0;
            for (let d = $from.depth; d > 0; d--) {
              if ($from.node(d).type.name === 'listItem') listDepth++;
            }
            if (listDepth > 1) return editor.chain().liftListItem('listItem').run();
            return true;
          },
        };
      },
    });
  }

  /** Resolve the position of the currently hovered node (lazy) */
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
    this.editor.chain().focus().insertContent({
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

  // ── Thumbnails ──
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

  // ── Export ──
  exportToGoogleDoc() {
    // Build HTML with inline styles for Google Docs compatibility
    // Google Docs requires: meta charset, inline styles on every element, no class-based styling
    const rawHtml = this.editor.getHTML();
    const div = document.createElement('div');
    div.innerHTML = rawHtml;
    // Apply inline styles
    div.querySelectorAll('h1').forEach(el => {
      el.setAttribute('style', 'font-size:20pt;font-weight:bold;font-family:Arial;margin:16px 0 4px;');
    });
    div.querySelectorAll('h2').forEach(el => {
      el.setAttribute('style', 'font-size:14pt;font-weight:bold;color:#1d6e82;font-family:Arial;margin:12px 0 4px;');
    });
    div.querySelectorAll('h3').forEach(el => {
      el.setAttribute('style', 'font-size:12pt;font-weight:bold;font-family:Arial;margin:8px 0 4px;');
    });
    div.querySelectorAll('.citation-node, blockquote').forEach(el => {
      el.setAttribute('style', 'border-left:3px solid #ECB86B;padding:4px 8px;background-color:#FCF4E9;font-style:italic;color:#78600e;font-size:10pt;font-family:Arial;margin:4px 0 4px 24px;');
    });
    div.querySelectorAll('ul, ol').forEach(el => {
      el.setAttribute('style', 'font-family:Arial;font-size:11pt;');
    });
    div.querySelectorAll('li').forEach(el => {
      if (!el.getAttribute('style')) el.setAttribute('style', 'font-family:Arial;font-size:11pt;margin:2px 0;');
    });
    div.querySelectorAll('p').forEach(el => {
      if (!el.getAttribute('style')) el.setAttribute('style', 'font-family:Arial;font-size:11pt;margin:2px 0;');
    });
    // Remove data- attributes and classes that Google Docs doesn't understand
    div.querySelectorAll('[data-type]').forEach(el => {
      el.removeAttribute('data-type');
      el.removeAttribute('data-source-url');
      el.removeAttribute('data-source-title');
      el.removeAttribute('data-source-author');
      el.removeAttribute('class');
    });
    // Wrap in full HTML document fragment for Google Docs
    const styledHtml = `<meta charset="utf-8"><div style="font-family:Arial;font-size:11pt;">${div.innerHTML}</div>`;
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
    const { $from } = this.editor.state.selection;
    // If inside a list item, lift out of all list levels first
    let inList = false;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'listItem') { inList = true; break; }
    }
    if (inList) {
      // Each lift must dispatch separately — can() only checks current state
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
