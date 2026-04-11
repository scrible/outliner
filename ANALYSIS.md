# Outline Editor: Drag & Drop Library + Quill Analysis

## Question 1: Could a drag & drop library reduce our custom code?

### Libraries evaluated

| Library | Weekly DL | Angular? | Works with contenteditable? | Verdict |
|---------|-----------|----------|-----------------------------|---------|
| **SortableJS** | 3M | Via ngx-sortablejs | Yes, with care | **Best option** |
| **Pragmatic D&D** (Atlassian) | ~200K | Framework-agnostic, yes | Yes, native HTML5 | Good alternative |
| **@angular/cdk DragDropModule** | In our deps | Native | **No** — known incompatibility (issue #20177) | Already abandoned |
| **dnd-kit** | React-only | No (ng-dnd exists but different) | React-specific | Not suitable |
| **Quill plugins** | N/A | N/A | None found | Nothing available |

### What we custom-built and what a library could replace

Our custom drag system (~300 lines) handles:
1. Mouse-based drag initiation (mousedown/move/up)
2. Floating preview clone
3. Drop indicator positioning
4. Drop target calculation (nearest block edge)
5. Section-aware drag (headings grab children)
6. List-constrained drops
7. Post-drop DOM cleanup (stale inline styles)

**SortableJS could replace items 1-4** (~180 lines). Items 5-7 are outline-specific logic that no library handles — we'd still need custom code for section awareness, drop constraints, and the Quill DOM cleanup.

**Pragmatic D&D could replace items 1-3** but gives less out of the box for item 4 (drop indicators). It's lower-level — more control, more code.

### Recommendation

**SortableJS is the strongest candidate.** It would eliminate our mousedown/move/up handling, floating preview management, and drop indicator positioning. The reduction: ~180 lines of custom drag code → ~40 lines of SortableJS config + callbacks.

**However:** The integration risk is non-trivial. SortableJS uses native HTML5 drag events, which Quill actively intercepts. We currently disable Quill's native drag handling via capture-phase listeners. SortableJS would need to coexist with those listeners, which may cause conflicts. We'd be trading one set of workarounds for another.

**Net assessment: marginal improvement.** The custom mouse-based approach works reliably and doesn't fight the browser's drag API. SortableJS would be cleaner architecturally but adds a dependency and integration risk.

---

## Question 2: Should we keep Quill or go custom?

### What we use from Quill
- Rich text editing (bold, italic, underline, link)
- List formatting (ordered, bullet, indent levels)
- Header formatting (H1, H2, H3)
- Blockquote formatting (citations)
- Undo/redo (history module)
- Bubble theme toolbar (inline formatting popup)
- Delta format (content model)

### What we fight in Quill
- **Native drag/drop** — fully disabled via capture-phase interception
- **Clipboard module** — intercepts paste events, we work around it
- **Toolbar** — replaced header dropdown with custom H1/H2/H3 buttons via DOM manipulation
- **Keyboard bindings** — overridden Tab, Enter, and added custom bindings for blockquotes/headings
- **DOM manipulation** — using `scroll.find`, `getIndex`, `getLine` (experimental APIs)
- **Post-edit cleanup** — formatter walks Quill's content and modifies it programmatically
- **Inline styles** — Quill's DOM patching preserves stale styles we set during drag

### Risk assessment

**Quill's experimental APIs** (`scroll.find`, `getIndex`) are not covered by semantic versioning. A minor Quill update could break our drag system, hover handles, and formatter — the core of our custom behavior.

**Quill 2.0** was a TypeScript rewrite. The APIs we use survived, but the project's maintenance is inconsistent ("Inactive" on Snyk, sporadic releases). Relying on experimental APIs in a project with uncertain maintenance is a compounding risk.

### Alternatives

| Option | Effort | Risk | Benefit |
|--------|--------|------|---------|
| **Stay on Quill** | 0 (sunk cost) | Medium (API breakage) | Working today |
| **TipTap (ProseMirror)** | 40-60h | Low (active, stable) | Built-in drag handles, better architecture |
| **Lexical (Meta)** | 50-70h | Medium (newer, less mature) | Cleaner extension model |
| **Custom (contenteditable)** | 80-100h | High (rebuild everything) | Full control, no dependencies |

### Recommendation

**Short term: Stay on Quill.** It works, the risks are manageable, and the prototype serves its purpose.

**Medium term: Evaluate TipTap.** If this outline editor moves toward production, TipTap's ProseMirror foundation offers:
- Built-in DragHandle extension (eliminates our entire custom drag system)
- Proper block-level node model (eliminates our formatter's line-walking)
- Angular bindings via ngx-tiptap
- Active maintenance with semantic versioning

The migration would be substantial (~50h) but would reduce our custom code by ~60% and eliminate the experimental API risk.

**Not recommended: Going fully custom.** The effort to rebuild undo/redo, IME support, accessibility, and cross-browser text editing would exceed the cost of TipTap migration by 2-3x, with worse outcomes.

---

## Summary

| Decision | Recommendation |
|----------|---------------|
| Drag & drop library now? | No — marginal improvement, integration risk |
| Keep Quill for prototype? | Yes |
| Production editor? | Evaluate TipTap migration |
| Go fully custom? | No |
