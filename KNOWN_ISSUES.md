# Known Issues (as of 2026-04-11)

## Resolved

- ~~Hover overlay obscures text~~ — Fixed: z-index 0 for overlay, z-index 2 for editor content
- ~~Citation editable after click~~ — Fixed: citations are now `li[data-list="citation"]`, keydown whitelist blocks text input
- ~~Tab on citations doesn't indent~~ — Fixed: cursor allowed in citations for Tab/arrow navigation, text input blocked
- ~~Nested list drag orphaning~~ — Fixed: `getListItemWithChildren()` grabs parent + all indented children

## Active bugs

1. **Nested list drag edge cases** — While parent+children now move together, dragging a nested list item onto another nested list can produce unexpected results. The drop target logic may need refinement for indent-aware positioning.

2. **Mobile/Android rendering** — Doesn't render or work on Chrome on Android. Touch events, viewport, and Quill mobile support all need attention. Important but not urgent.

3. **Citation type persistence in some edge cases** — While the formatter now exempts citations from list consolidation, complex drag sequences involving citations can occasionally lose the `data-list="citation"` attribute if Quill's internal delta operations reconstruct the DOM.
