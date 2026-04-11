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

---

# Remaining Goals: Planning & Analysis

## Goal 1: Evaluate TipTap (+ SortableJS) — GATE for production

### What to evaluate
1. **Feature parity check** — Can TipTap replicate our current feature set?
   - Hierarchical headings (H1/H2/H3) with section-aware operations
   - Ordered/bulleted lists with nested indentation
   - Citation list items (custom node type, read-only content, editable position)
   - Drag & drop: headings move sections, list items move with children
   - Source panel integration (drag source → insert citation)
   - Copy to clipboard with proper nested HTML
   - Inline formatting (bold, italic, underline, link)
   - Undo/redo

2. **Architecture comparison** — Where does TipTap reduce complexity?
   - **Drag handles**: TipTap's DragHandle extension vs our custom mouse system (~300 lines)
   - **Custom node types**: ProseMirror schema allows `citation` as a first-class node (vs our ListItem monkey-patch)
   - **Keyboard handling**: ProseMirror's InputRules vs our Quill keyboard binding overrides
   - **DOM manipulation**: ProseMirror manages its own DOM (no scroll.find/getIndex needed)
   - **Clipboard**: ProseMirror's serializers handle nested HTML natively

3. **Migration effort estimate**
   - Schema definition: ~4h (headings, lists, citations, blockquotes)
   - Editor component rewrite: ~12h (replace Quill init with TipTap, wire up toolbar)
   - Drag & drop: ~8h (DragHandle extension + custom section-aware logic)
   - Source panel integration: ~4h (drag from panel, citation insertion)
   - Formatter: ~4h (ProseMirror transforms instead of delta walking)
   - Testing & polish: ~8h
   - **Total: ~40h**

### Recommended evaluation approach
1. Create a branch `feature/tiptap-eval`
2. Build a minimal TipTap editor with: H1/H2/H3, ordered/bulleted lists, drag handles
3. Test: does DragHandle move sections? Do lists nest properly?
4. If yes: build out citations and source panel integration
5. If no: document the blockers and stay on Quill

### Decision criteria
- **Switch to TipTap if**: DragHandle works for section reordering, custom nodes support citation type, and the migration estimate holds under 50h
- **Stay on Quill if**: TipTap's DragHandle doesn't support section-aware moves, or ProseMirror schema can't represent our outline structure

## Goal 2: Accessibility and visual regression report

### Scope
- Run axe-core on all pages of the Scrible app (sign-in, library, contentview, outline editor)
- Generate HTML report with violations grouped by severity
- Set up Playwright visual regression baseline screenshots
- Integrate into `scrible-dev test` command

### Prerequisites
- Dev environment running (`scrible-dev up`)
- `dev-a11y-scan.mjs` already exists in `env/development/`

### Estimated effort: ~8h

## Goal 3: AngularJS → Angular outline editor migration

### Dependencies
- Accessibility report (Goal 2) should be in place first
- TipTap evaluation (Goal 1) determines which editor to migrate TO

### Two possible paths
1. **If TipTap is adopted**: Migrate directly from AngularJS outline to TipTap-based Angular outline. Skip intermediate Quill step.
2. **If staying on Quill**: Port the current prototype into the toolbar2 project as an Angular component, replacing the AngularJS outline.

### Estimated effort: 20-40h depending on path

## Goal 4: Productionize the outline editor

### Requirements beyond the prototype
- Authentication integration (user context, permissions)
- Data persistence (save/load outline to server)
- Real source integration (not sample data)
- Collaborative editing (optional, future)
- Mobile responsive design
- Performance with large outlines (100+ items)
- Error handling and offline support

### Estimated effort: 40-60h

## Remaining prototype bugs

### Active
1. Nested list drag edge cases (indent-aware drop positioning)
2. Mobile/Android rendering (touch events, viewport)
3. Citation type persistence in complex drag sequences

### Nice-to-have improvements
- Heading size +/- buttons in toolbar (attempted, needs custom toolbar HTML)
- Drag preview should show accurate section size
- Source panel should support real URL fetching (not sample data)
- Undo/redo should group related operations (e.g., drag = single undo step)

## Execution order

```
1. TipTap evaluation (gate)
   ├── If TipTap works → 1a. Build TipTap prototype
   └── If not → 1b. Harden Quill prototype
2. Accessibility report
3. Outline editor migration (path depends on #1)
4. Productionize
```
