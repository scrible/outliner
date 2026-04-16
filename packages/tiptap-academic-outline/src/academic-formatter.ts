/**
 * Structural formatter for academic outlines.
 *
 * Runs cleanup passes on idle (blur/focus debounce) and after drops:
 * - Bare paragraphs at root → wrap in nearest list type
 * - Headings inside lists → lift out
 * - Empty trailing paragraphs → remove
 * - Empty list items → remove
 * - Citation indent cap → max 1 level
 * - Over-nested list items → lift
 *
 * Each pass is idempotent. The formatter re-runs up to a fixed
 * iteration limit per pass to handle cascading structural changes.
 */
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';

export interface AcademicFormatterOptions {
  /**
   * Idle timeout in ms before the formatter runs. Default: 8000.
   */
  idleTimeout: number;

  /**
   * Post-drop delay in ms. Default: 400.
   */
  dropDelay: number;

  /**
   * Max citation indent level. Default: 1.
   */
  maxCitationIndent: number;

  /**
   * Max list nesting depth (in terms of ProseMirror depth). Default: 4.
   */
  maxNestingDepth: number;
}

export const AcademicFormatter = Extension.create<AcademicFormatterOptions>({
  name: 'academicFormatter',

  addOptions() {
    return {
      idleTimeout: 8000,
      dropDelay: 400,
      maxCitationIndent: 1,
      maxNestingDepth: 4,
    };
  },

  onCreate() {
    let isFormatting = false;
    let formatterTimer: any = null;
    const editor = this.editor;
    const opts = this.options;

    const runFormatter = () => {
      if (isFormatting || !editor || editor.isDestroyed) return;
      isFormatting = true;
      try {
        formatBareText(editor);
        formatLiftHeadings(editor);
        formatRemoveEmptyTrailing(editor);
        formatRemoveEmptyListItems(editor);
        formatCapCitationIndent(editor, opts.maxCitationIndent);
        formatFixNesting(editor, opts.maxNestingDepth);
      } finally {
        isFormatting = false;
      }
    };

    editor.on('blur', () => {
      clearTimeout(formatterTimer);
      formatterTimer = setTimeout(runFormatter, opts.idleTimeout);
    });

    editor.on('focus', () => {
      clearTimeout(formatterTimer);
      formatterTimer = setTimeout(runFormatter, opts.idleTimeout);
    });

    editor.view.dom.addEventListener('drop', () => {
      clearTimeout(formatterTimer);
      formatterTimer = setTimeout(runFormatter, opts.dropDelay);
    });

    // Store cleanup ref
    (this as any)._formatterTimer = formatterTimer;
    (this as any)._clearTimer = () => clearTimeout(formatterTimer);
  },

  onDestroy() {
    (this as any)._clearTimer?.();
  },
});

function formatBareText(editor: Editor) {
  for (let iter = 0; iter < 20; iter++) {
    const doc = editor.state.doc;
    let pos = 0, found = false;
    for (let i = 0; i < doc.childCount; i++) {
      const child = doc.child(i);
      if (child.type.name === 'paragraph' && child.textContent.trim()) {
        let listType = 'bulletList';
        for (let j = i - 1; j >= 0; j--) {
          const sib = doc.child(j);
          if (sib.type.name === 'bulletList' || sib.type.name === 'orderedList') {
            listType = sib.type.name;
            break;
          }
        }
        const contentJson = child.content.size > 0 ? child.content.toJSON() : [];
        editor.chain()
          .deleteRange({ from: pos, to: pos + child.nodeSize })
          .insertContentAt(pos, {
            type: listType,
            content: [{ type: 'listItem', content: [{ type: 'paragraph', content: contentJson }] }],
          })
          .run();
        found = true;
        break;
      }
      pos += child.nodeSize;
    }
    if (!found) break;
  }
}

function formatLiftHeadings(editor: Editor) {
  for (let iter = 0; iter < 10; iter++) {
    const doc = editor.state.doc;
    let lifted = false;
    doc.descendants((node: any, pos: number) => {
      if (lifted) return false;
      if (node.type.name !== 'heading') return true;
      const $pos = doc.resolve(pos);
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).type.name === 'listItem') {
          editor.chain()
            .setTextSelection({ from: pos, to: pos + node.nodeSize })
            .liftListItem('listItem')
            .run();
          lifted = true;
          return false;
        }
      }
      return true;
    });
    if (!lifted) break;
  }
}

function formatRemoveEmptyTrailing(editor: Editor) {
  for (let iter = 0; iter < 5; iter++) {
    const doc = editor.state.doc;
    if (!doc.lastChild ||
        doc.lastChild.type.name !== 'paragraph' ||
        doc.lastChild.textContent !== '' ||
        doc.childCount <= 1) break;
    editor.chain()
      .deleteRange({ from: doc.content.size - doc.lastChild.nodeSize, to: doc.content.size })
      .run();
  }
}

function formatRemoveEmptyListItems(editor: Editor) {
  const doc = editor.state.doc;
  const empties: number[] = [];
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'listItem' && node.textContent.trim() === '') {
      empties.push(pos);
    }
    return true;
  });
  for (let i = empties.length - 1; i >= 0; i--) {
    const currentDoc = editor.state.doc;
    const pos = empties[i];
    if (pos >= currentDoc.content.size) continue;
    const node = currentDoc.nodeAt(pos);
    if (node?.type.name === 'listItem' && node.textContent.trim() === '') {
      editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
    }
  }
}

function formatCapCitationIndent(editor: Editor, maxIndent: number) {
  const doc = editor.state.doc;
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    if (child.type.name === 'citation' && (child.attrs['indent'] || 0) > maxIndent) {
      editor.chain()
        .setTextSelection(pos + 1)
        .updateAttributes('citation', { indent: maxIndent })
        .run();
      return;
    }
    pos += child.nodeSize;
  }
}

function formatFixNesting(editor: Editor, maxDepth: number) {
  for (let iter = 0; iter < 10; iter++) {
    const doc = editor.state.doc;
    let fixed = false;
    doc.descendants((node: any, pos: number) => {
      if (fixed) return false;
      if (node.type.name !== 'listItem') return true;
      const $pos = doc.resolve(pos);
      if ($pos.depth < maxDepth) return true;
      const grandparentLi = $pos.node($pos.depth - 2);
      if (grandparentLi?.type.name !== 'listItem') return true;
      if ($pos.index($pos.depth - 2) === 0) {
        editor.chain().setTextSelection(pos + 1).liftListItem('listItem').run();
        fixed = true;
        return false;
      }
      return true;
    });
    if (!fixed) break;
  }
}
