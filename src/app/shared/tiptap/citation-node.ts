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
import { Plugin } from '@tiptap/pm/state';
import { ReplaceStep, ReplaceAroundStep } from '@tiptap/pm/transform';

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
      indent: {
        default: 0,
        renderHTML: (attributes: any) => {
          if (!attributes['indent']) return {};
          return { style: `margin-left: ${attributes['indent'] * 2}em` };
        },
      },
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
      // Note: NOT contenteditable=false — cursor placement allowed for Tab indent
      // Text input is blocked via addInputRules returning empty + keyboard shortcuts
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
      // Tab indents citation, Shift+Tab outdents
      'Tab': ({ editor }) => {
        if (!editor.isActive('citation')) return false;
        const attrs = editor.getAttributes('citation');
        const currentIndent = attrs['indent'] || 0;
        return editor.chain().updateAttributes('citation', { indent: Math.min(currentIndent + 1, 1) }).run();
      },
      'Shift-Tab': ({ editor }) => {
        if (!editor.isActive('citation')) return false;
        const attrs = editor.getAttributes('citation');
        const currentIndent = attrs['indent'] || 0;
        return editor.chain().updateAttributes('citation', { indent: Math.max(currentIndent - 1, 0) }).run();
      },
      // Block text-modifying keys in citations
      'Backspace': ({ editor }) => editor.isActive('citation'),
      'Delete': ({ editor }) => editor.isActive('citation'),
    };
  },

  // Block text input in citations via ProseMirror filterTransaction
  addProseMirrorPlugins() {
    const citationType = this.type;
    return [
      new Plugin({
        filterTransaction: (tr: any) => {
          if (!tr.docChanged) return true;
          // Block content replacement inside citations, but allow attribute changes (indent)
          let blockEdit = false;
          tr.steps.forEach((step: any) => {
            if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return;
            if (step.from !== undefined) {
              const $from = tr.docs[0]?.resolve?.(step.from);
              if ($from?.parent?.type === citationType) {
                blockEdit = true;
              }
            }
          });
          return !blockEdit;
        },
      }),
    ];
  },
});
