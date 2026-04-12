# Known Issues

## TipTap Prototype (tiptap-prototype branch)

### Resolved (from Quill prototype — no longer applicable)
- ~~Nested list orphaning~~ — ProseMirror tree structure prevents this
- ~~Citation Tab indent~~ — Citation is a schema node with contenteditable=false
- ~~Formatter edge cases~~ — No formatter needed (tree ops are atomic)
- ~~Stale inline styles after drag~~ — DragHandle uses ProseMirror transactions
- ~~Empty line creation after drop~~ — Tree operations don't create orphan newlines
- ~~Hover overlay obscures text~~ — DragHandle manages its own overlay

### Active
1. **Source drag from panel to editor** — Not yet implemented. Click "Insert Citation" works, but drag-from-panel-to-editor is not wired up.
2. **Mobile touch drag** — DragHandle uses mouse events. Touch support needs testing/configuration.
3. **BubbleMenu position** — Sometimes appears at bottom of viewport instead of near selected text (Floating UI positioning edge case).

### Future work
- Custom citation node: consider making Tab indent work (currently consumed as no-op)
- Source drag: wire up mousedown on source cards to create a ProseMirror drag
- Collaborative editing: extension is installed (transitive dep of DragHandle), needs Yjs provider setup
