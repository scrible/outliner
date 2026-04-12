/**
 * Custom ProseMirror node type for citations in the outline editor.
 *
 * Citations are:
 * - Visually distinct (gold/amber styling, italic, border-left)
 * - Read-only content (position is editable via drag/indent, text is not)
 * - MLA-formatted, inserted programmatically
 * - Rendered without bullet/number markers
 *
 * In the Quill prototype, citations were monkey-patched list items with
 * data-list="citation". In TipTap, they're a first-class node type in
 * the ProseMirror schema.
 */
import { Node, mergeAttributes } from '@tiptap/core';

export const Citation = Node.create({
  name: 'citation',
  group: 'block',
  content: 'text*',
  marks: '_', // allow marks (italic)
  draggable: true,

  addAttributes() {
    return {
      sourceUrl: { default: null },
      sourceTitle: { default: null },
      sourceAuthor: { default: null },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="citation"]' },
      // Also parse blockquotes with citation class for backwards compatibility
      { tag: 'blockquote.citation' },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'citation',
      'data-source-url': node.attrs['sourceUrl'] || '',
      'data-source-title': node.attrs['sourceTitle'] || '',
      'data-source-author': node.attrs['sourceAuthor'] || '',
      class: 'citation-node',
      contenteditable: 'false',
    }), 0];
  },

  addKeyboardShortcuts() {
    return {
      // Enter after a citation creates a new bullet list item
      'Enter': ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== 'citation') return false;
        return editor.chain()
          .insertContentAt($from.after(), { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] })
          .focus($from.after() + 2)
          .run();
      },
      // Tab indents the citation (wraps in a list)
      'Tab': ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== 'citation') return false;
        // For now, Tab on citations is a no-op (they're top-level blocks)
        // Indentation would require wrapping in a list, which changes the structure
        return true; // consume the event
      },
    };
  },
});
