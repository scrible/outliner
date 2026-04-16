/**
 * Keyboard guards for the academic outline editor.
 *
 * Prevents structural corruption from keyboard shortcuts:
 * - Backspace at start of a non-empty list item: outdents nested, blocks top-level
 * - Empty list items can still be deleted (critical for usability)
 */
import { Extension } from '@tiptap/core';

export const KeyboardGuards = Extension.create({
  name: 'keyboardGuards',

  addKeyboardShortcuts() {
    return {
      'Backspace': ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        if ($from.parentOffset !== 0) return false;
        if ($from.parent.type.name !== 'paragraph') return false;

        const listItem = $from.node($from.depth - 1);
        if (listItem?.type.name !== 'listItem') return false;

        // Allow deleting empty list items
        if (listItem.textContent.trim() === '') return false;

        // Count nesting depth
        let listDepth = 0;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'listItem') listDepth++;
        }

        // Nested: outdent. Top-level: block.
        if (listDepth > 1) return editor.chain().liftListItem('listItem').run();
        return true;
      },
    };
  },
});
