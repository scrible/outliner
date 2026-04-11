# Known Issues (as of 2026-04-11)

## Active bugs

1. **Hover overlay obscures text** — The absolute-positioned overlay div sits above the editor content, blocking interaction. Needs z-index fix or alternative approach.

2. **Citation editable after click** — Clicking a citation opens the source detail panel but leaves the cursor in the blockquote where text can be edited. Citations should be fully static/non-editable.

3. **Tab on citations doesn't indent** — Custom keyboard bindings for blockquote Tab don't fire. Root cause likely: Quill doesn't treat blockquotes the same as list items for keyboard binding format matching. May need to rethink using blockquotes for citations.

4. **Nested list drag orphaning** — Dragging nested lists onto nested lists can result in child lists becoming orphaned under a heading without a parent list item. Needs investigation after overlay fix.

5. **Mobile/Android rendering** — Doesn't render or work on Chrome on Android. Touch events, viewport, and Quill mobile support all need attention. Important but not urgent — tackle after bugs 1-4.

## Resolution order
Fix 1 → 2 → 3 (possibly together if we replace blockquotes with styled list items) → 4 → 5
