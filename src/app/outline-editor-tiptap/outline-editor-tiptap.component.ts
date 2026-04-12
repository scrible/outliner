import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import DragHandle from '@tiptap/extension-drag-handle';
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
          shouldShow: ({ editor }) => {
            // Show on text selection, but not on empty selections or citations
            const { from, to } = editor.state.selection;
            return from !== to && !editor.isActive('citation');
          },
        }),
        Citation,
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
              if (this.hoveredNode && this.hoveredNodePos >= 0) {
                const node = this.hoveredNode;
                const pos = this.hoveredNodePos;
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
          onNodeChange: ({ node, editor }) => {
            // Track the hovered node for copy button
            if (node) {
              let targetPos = -1;
              editor.state.doc.descendants((n: any, pos: number) => {
                if (n === node && targetPos < 0) { targetPos = pos; return false; }
                return true;
              });
              this.hoveredNode = node;
              this.hoveredNodePos = targetPos;
            } else {
              this.hoveredNode = null;
              this.hoveredNodePos = -1;
            }
          },
          nested: true,
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

    // Formatter: runs on blur + debounced after edits
    const runFormatter = () => {
      const { doc, tr } = this.editor.state;
      let modified = false;

      // Remove trailing empty paragraphs
      while (doc.lastChild && doc.lastChild.type.name === 'paragraph'
             && doc.lastChild.textContent === '' && doc.childCount > 1) {
        const pos = doc.content.size - doc.lastChild.nodeSize;
        this.editor.chain().deleteRange({ from: pos, to: doc.content.size }).run();
        modified = true;
      }

      // Remove empty list items that don't have focus
      const sel = this.editor.state.selection;
      doc.descendants((node: any, pos: number) => {
        if (node.type.name === 'listItem' && node.textContent === '') {
          const isFocused = sel.$from.pos >= pos && sel.$from.pos <= pos + node.nodeSize;
          if (!isFocused) {
            this.editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
            modified = true;
            return false;
          }
        }
        return true;
      });
    };

    // Run on blur
    this.editor.on('blur', () => setTimeout(runFormatter, 100));

    // Debounced run after edits (20s — long enough to not interfere with typing)
    let formatTimer: any = null;
    this.editor.on('update', () => {
      clearTimeout(formatTimer);
      formatTimer = setTimeout(runFormatter, 20000);
    });
  }

  ngOnDestroy() {
    this.editor?.destroy();
  }

  // ── Source panel ──
  openSourceDetail(source: any) { this.selectedSource = source; }
  goBackToSources() { this.selectedSource = null; }
  closePreview() { this.showPreview = false; this.selectedSource = null; }

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
    const html = this.editor.getHTML();
    const text = this.editor.getText();
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
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
