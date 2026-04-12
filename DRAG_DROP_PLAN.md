# TipTap Drag & Drop Implementation Plan

## Options investigated

### Option A: @tiptap/extension-drag-handle (not available for v2)
TipTap's DragHandle is a v3/Pro feature. We're on v2 (required by ngx-tiptap 10 + Angular 17).
NOT available without upgrading to TipTap 3 + Angular 20+.

### Option B: ProseMirror NodeView + custom drag (recommended)
ProseMirror supports custom NodeViews that can render drag handles natively.
The handle is part of the node's DOM, so it participates in ProseMirror's
transaction system — moves are tree operations, not delta patches.

Key advantage: ProseMirror's `ReplaceStep` operates on the document tree,
so moving a heading section is a single transaction that preserves children.

### Option C: Port Quill mouse-based drag (fallback)
Our ~300 lines of custom mousedown/move/up code could be ported.
Less ideal because it bypasses ProseMirror's transaction system.

## Recommended approach: Option B

### Architecture
1. Custom NodeView for headings and list items that renders a drag handle
2. On mousedown on handle: start a ProseMirror drag transaction
3. Track mouse position to determine drop target (resolve ProseMirror position)
4. On mouseup: execute a ReplaceStep that moves the node (and children) to the new position
5. For headings: resolve "section" as everything from heading to next same-level heading
6. For list items: the tree structure handles children automatically

### Key ProseMirror APIs
- `NodeView` — custom rendering with drag handle DOM
- `view.posAtCoords()` — convert mouse coordinates to document position
- `tr.step(new ReplaceStep(...))` — atomic move operation
- `doc.resolve(pos)` — resolve position to node context
- `doc.nodesBetween(from, to)` — walk nodes in a range

### Estimated effort
- NodeView for drag handle: ~4h
- Drop target calculation: ~4h
- Section-aware heading moves: ~2h
- Visual feedback (overlay, preview): ~2h
- Integration + testing: ~4h
- Total: ~16h

### What we get for free (vs Quill)
- No stale inline style cleanup (ProseMirror manages DOM)
- No empty line creation (tree operations are atomic)
- No nested list orphaning (children are tree children, not indent attributes)
- Proper undo/redo (transactions are undoable)
