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

### Behavioral requirements to validate

These are derived from our experience building and iterating on the Quill prototype. Each represents a behavior that either works today, was hard to achieve, or remains broken. The evaluation should confirm TipTap can handle all of them.

#### Document structure
- [ ] H1/H2/H3 headings define a hierarchical outline
- [ ] Ordered lists (1, 2, 3) and unordered lists (bullets)
- [ ] Lists nest via indentation (Tab/Shift+Tab), with strict single-step indent enforcement
- [ ] Headings are section boundaries — everything between two same-level headings belongs to the upper heading
- [ ] Proper tree structure: nested lists are children of their parent list item, not siblings (Quill's flat delta fails here)

#### Citations
- [ ] Citation is a distinct node type (not a blockquote, not a regular list item)
- [ ] Citation content is read-only (position is editable — indent/move — but text is not)
- [ ] Citation renders with gold/amber styling (border-left, background, italic)
- [ ] Citation bullet/number marker is hidden
- [ ] Tab/Shift+Tab indents/outdents citations (Quill fails here — both keyboard and toolbar)
- [ ] Enter on a citation creates a regular bullet list item below it
- [ ] Click on a citation opens the source detail panel
- [ ] Citations are not converted to other list types by the formatter
- [ ] Citations follow MLA format, inserted programmatically (not user-typed)

#### Drag & drop
- [ ] Single hover handle appears on mouseover, positioned at the nearest element
- [ ] Hovering shows the element (and all children) that would be dragged — single overlay with dashed border
- [ ] Dragging a heading moves the entire section (heading + all content until next same-level heading)
- [ ] Dragging a list item moves it + all indented children below it
- [ ] Dragging a citation moves just the citation
- [ ] Headings can only drop before/after sibling headings (not inside another section's content)
- [ ] List items can only drop into existing lists (not create orphan lists)
- [ ] Dropping a list item into a different list type converts it to match (ol↔ul)
- [ ] Floating preview shows the content being dragged, styled to match the editor
- [ ] Drop placeholder (dashed box) displaces content to show where the item will land
- [ ] Escape cancels an active drag
- [ ] No text selection occurs during drag (user-select: none)
- [ ] After drop, no stale inline styles remain (the spacing bug)
- [ ] After drop, no empty lines are created

#### Source panel
- [ ] Side panel with list of sources (favicon, title, author, date)
- [ ] Click source → opens detail view (thumbnail, summary, link, "Insert Citation" button)
- [ ] Drag source from panel onto editor → inserts MLA citation at drop position
- [ ] Drag works from anywhere on the source card (not just a handle)
- [ ] Short click (no drag) opens detail view; drag threshold distinguishes click from drag
- [ ] "Insert Citation" inserts at last focused position in the editor
- [ ] Detail view close (X/back) returns to source list, doesn't close the panel
- [ ] Opening/closing the panel doesn't shift the editor content position

#### Keyboard
- [ ] Tab always indents (never inserts whitespace or tab characters)
- [ ] Shift+Tab always outdents
- [ ] Enter at end of heading creates a new bullet list item
- [ ] Enter on empty list item deletes it and moves cursor to end of previous line
- [ ] Enter on citation creates a new bullet (not another citation)
- [ ] Arrow keys navigate between lines (when an element is selected via handle)
- [ ] Shift+Arrow moves the selected line up/down
- [ ] Escape deselects / cancels drag
- [ ] Headings don't allow leading whitespace or tabs
- [ ] Undo/redo works across all operations

#### Formatting toolbar
- [ ] Bubble theme — appears inline on text selection
- [ ] H1/H2/H3 as toggle buttons (not a dropdown), with active state tracking
- [ ] Ordered list / bullet list buttons (clicking same type does NOT remove list)
- [ ] Indent/outdent buttons
- [ ] Bold, italic, underline
- [ ] Link
- [ ] No "remove formatting" / "clean" button
- [ ] Toolbar renders above drag handles and hover overlay (z-index)

#### Clipboard / export
- [ ] Copy produces properly nested HTML (not Quill's flat `data-list` format)
- [ ] Google Docs paste receives correct OL/UL nesting with nested sublists
- [ ] Copy icon on hover handle copies element (or section for headings)
- [ ] Full-document copy via clipboard button shows toast with paste instructions
- [ ] Toast includes platform-sensitive shortcut (⌘V / Ctrl+V) and Google Doc link
- [ ] Toast auto-dismisses after 8 seconds, has manual close button

#### Formatter (post-edit cleanup)
- [ ] Removes empty lines (but not the line the cursor is on)
- [ ] Enforces single-step indentation
- [ ] Auto-converts list items to match neighbor type at same indent (except citations)
- [ ] Strips leading whitespace from headings
- [ ] Runs after drag/drop (immediately) and on blur
- [ ] Does NOT delete newly-created empty lines while user is still typing

#### Styling
- [ ] Scrible brand colors (#1d6e82 teal, #a56708 gold, Arial font)
- [ ] Consistent vertical spacing between all elements
- [ ] WCAG 2.1 AA compliant (0 violations verified via axe-core)

### Architecture comparison — Where does TipTap reduce complexity?
- **Tree structure**: ProseMirror uses a real document tree (vs Quill's flat delta). Nested lists are actual children, not indent attributes. This solves the orphaning problem natively.
- **Custom nodes**: `citation` can be a first-class ProseMirror node with its own schema, serialization, and behavior. No monkey-patching.
- **Drag handles**: TipTap's DragHandle extension vs our ~300 lines of custom mouse drag code.
- **Keyboard**: ProseMirror's InputRules and keymap plugins vs our 10+ Quill keyboard binding overrides.
- **Clipboard**: ProseMirror serializers produce proper nested HTML natively.
- **DOM management**: ProseMirror manages its own DOM. No `scroll.find`, `getIndex`, `getLine`.
- **Formatter**: ProseMirror transforms operate on the tree, not by walking line-by-line.

### Migration effort estimate
- Schema definition: ~4h (headings, lists, citations)
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
- Accessibility report (Goal 2) should be in place first (to catch regressions)
- TipTap evaluation (Goal 1) is NOT a blocker, but informs path choice

### Three possible paths (decision point TBD)
1. **Path A — Migrate with Quill**: Port the current outliner prototype into toolbar2 as an Angular component. Carries forward known Quill limitations (flat delta, citation tab, formatter edge cases).
2. **Path B — Migrate with TipTap**: Build a TipTap-based editor and integrate it into toolbar2. Merges Goals 3 and 4 into one effort. Cleanest architecture but highest upfront cost.
3. **Path C — Fully custom native**: Build the editor from scratch with contenteditable. Maximum control, maximum effort. Not recommended unless both Quill and TipTap prove inadequate.

### How the decision gets made
- If Goal 1 shows TipTap handles the behavioral requirements → likely Path B
- If TipTap has blockers → Path A (with known limitations accepted or worked around)
- Path C only if both alternatives fail

### Estimated effort: 20-40h depending on path

## Goal 4: Productionize the outline editor

### Relationship to Goal 3
- If Path B is chosen for Goal 3, Goal 4 merges into it (TipTap migration IS productionization)
- If Path A or C is chosen, Goal 4 is separate work on top of Goal 3
- Conditional on Goal 1 (TipTap evaluation determines the foundation)

### Requirements beyond the prototype
- Authentication integration (user context, permissions)
- Data persistence (save/load outline to server)
- Real source integration (not sample data)
- Collaborative editing (optional, future)
- Mobile responsive design
- Performance with large outlines (100+ items)
- Error handling and offline support

### Estimated effort: 40-60h (or absorbed into Goal 3 Path B)

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
Parallel track:
  ┌─ Goal 1: TipTap evaluation
  │    → Produces: recommendation + path decision for Goal 3
  │
  └─ Goal 2: Accessibility report
       → Produces: regression baseline for Goal 3

After both complete:
  Goal 3: AngularJS → Angular migration
    ├─ Path A (Quill) → Goal 4 separate
    ├─ Path B (TipTap) → Goal 4 merged
    └─ Path C (Custom) → Goal 4 separate
```

## Next steps

1. **Start Goal 1**: Create `feature/tiptap-eval` branch in the outliner repo. Build minimal TipTap editor with the behavioral requirements checklist above. Focus first on the items Quill struggles with: proper tree structure for nested lists, citation as a custom node, drag handles with section awareness.

2. **In parallel, start Goal 2**: Run `dev-a11y-scan.mjs` against the full Scrible app, generate baseline report, integrate into `scrible-dev test`.

3. **After Goal 1**: Present findings against the behavioral requirements checklist. Blake decides Path A/B/C for Goal 3.

4. **Execute Goal 3** on chosen path. Goal 4 follows or merges depending on path.
