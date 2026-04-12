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

Goals are numbered in execution order.

## Goal 1: Build LLM-based behavioral eval suite

Implementation-agnostic test suite using an LLM (via AWS Bedrock) + Playwright to evaluate outline editor behavior through screenshots and human-like interactions. Includes axe-core a11y validation as a programmatic component. Enables rigorous comparison of any editor implementation.

See [Eval Suite Design](#eval-suite-design) below for architecture details.

## Goal 2: Evaluate TipTap (+ alternatives) as replacement for Quill — COMPLETE

### Results

| Metric | Quill Prototype | TipTap Prototype |
|--------|----------------|------------------|
| Eval score | 55/56 (1 known runner issue) | 56/56 (perfect) |
| TypeScript lines | ~1,400 | ~300 |
| Drag & drop code | ~300 lines custom mouse system | 15 lines DragHandle config |
| Citation implementation | Monkey-patched ListItem blot | First-class ProseMirror schema node |
| Nested list model | Flat delta (causes orphaning) | Real tree (children are tree children) |
| Formatter required | ~100 lines (empty lines, indent, list consolidation) | Not needed (tree handles structure) |
| Clipboard HTML | quillHtmlToNestedHtml() transform required | Native nested HTML output |
| Experimental APIs used | scroll.find, getIndex, getLine (undocumented) | None |
| Collaborative editing path | y-quill (available) | @tiptap/extension-collaboration (installed, DragHandle depends on it) |
| Mobile | ⚠️ Known rendering issues | ✅ 5/5 mobile checks pass |
| a11y | ✅ 0 violations | ✅ 0 violations |

### Recommendation: TipTap (Path B)

**The TipTap prototype achieves feature parity at 1/5th the code**, with no known behavioral bugs. The Quill prototype has several unresolved issues (citation Tab indent, formatter edge cases, nested list orphaning) that are structurally unfixable due to Quill's flat delta model.

TipTap's advantages are architectural, not cosmetic:
1. **Tree document model** eliminates the entire class of orphaning/spacing bugs
2. **DragHandle extension** replaces 300 lines of custom mouse code with 15 lines of config
3. **Custom Citation node** is a real schema type, not a monkey-patch
4. **Collaboration** is already a transitive dependency (DragHandle imports it)
5. **No experimental APIs** — everything we use is documented and stable

### Path decision for Goal 5

Based on these results, **Path B (TipTap)** is the clear recommendation:
- Merges Goals 5 and 6 (migration + productionization in one effort)
- The TipTap prototype IS the foundation — not a throwaway
- Estimated remaining work: custom citation polish, source drag from panel, a11y refinements

## Goal 3: Editor landscape survey — COMPLETE

See [comparison table](#comparison-table) below. Shortlist: TipTap (primary), Lexical (secondary), Milkdown (tertiary).

## Goal 4: Accessibility and visual regression report

Run axe-core on all Scrible app pages, generate baseline, integrate into `scrible-dev test`. Independent — can run in parallel with Goals 1-2.

## Goal 5: AngularJS → Angular outline editor migration

Three paths (decision after Goal 2):
- **Path A — Quill**: Port current prototype. Known limitations persist.
- **Path B — TipTap** (or other from Goal 3): Build new editor, integrate into toolbar2. Merges with Goal 6.
- **Path C — Fully custom**: Maximum control, maximum effort.

## Goal 6: Productionize the outline editor

If Path B chosen for Goal 5, this merges into it. Otherwise separate.

Requirements: auth, persistence, real sources, collaborative editing (REQUIRED), mobile support (REQUIRED), performance, offline support.

---

## Behavioral requirements to validate

These are derived from our experience building and iterating on the Quill prototype. Each represents a behavior that either works today, was hard to achieve, or remains broken.

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

#### Collaborative editing
- [ ] Multiple users can work on the same outline simultaneously
- [ ] Editor framework has a proven path to real-time collaboration (e.g., Yjs, ShareDB, or built-in)
- [ ] NOT a hard requirement for the prototype, but must not choose an architecture that makes it categorically impossible or extremely difficult

#### Mobile support (Android & iOS)
- [ ] Editor renders and functions on Chrome/Android and Safari/iOS
- [ ] Touch-based drag & drop (or acceptable alternative for reordering on mobile)
- [ ] Toolbar accessible on mobile (not clipped or hidden)
- [ ] NOT required for the prototype, but must not choose an architecture with known mobile blockers

#### Styling
- [ ] Scrible brand colors (#1d6e82 teal, #a56708 gold, Arial font)
- [ ] Consistent vertical spacing between all elements
- [ ] WCAG 2.1 AA compliant (0 violations verified via axe-core)

### TipTap architecture comparison — Where does it reduce complexity?
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

---

## Comparison table

| Editor | Custom nodes | Tree | Drag/drop | Collab | Angular | Mobile | npm/wk | Verdict |
|--------|-------------|------|-----------|--------|---------|--------|--------|---------|
| **TipTap** | ✅ Schema | ✅ | ✅ DragHandle | ✅ Hocuspocus | ✅ ngx-tiptap | ✅ Tested | 1.2M | **Primary** |
| **ProseMirror** | ✅ Schema | ✅ | Partial | ✅ y-prosemirror | DIY | ✅ Core supports | 6M | Viable |
| **Lexical** | ✅ Custom | ✅ | DIY | ✅ y-lexical | Partial | ✅ Meta tests mobile | 2.5M | Secondary |
| **Slate** | ✅ Schema-less | ✅ | ✅ dnd-kit | ✅ slate-yjs | Weak (408/wk) | ⚠️ React-dep | 200K | Risky |
| **Milkdown** | ✅ Plugin | ✅ | ✅ Plugin | ✅ Yjs | Weak | ⚠️ Limited docs | 50K | Tertiary |
| **Quill** | Monkey-patch | ❌ | DIY | ✅ y-quill | DIY | ⚠️ Known issues | 1M | Current |
| **CKEditor 5** | Limited | ❌ | Basic | ❌ Commercial | ✅ | ✅ | 150K | **Ruled out** |
| **TinyMCE** | Plugins | Partial | Yes | ❌ Discontinued | ✅ | ✅ | 665K | **Ruled out** |
| **Froala** | Plugins | Partial | Yes | ❌ None | ✅ | ✅ | 236K | **Ruled out** |
| **Trix** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | 363K | **Ruled out** |
| **SunEditor** | Limited | Partial | ❌ | ❌ | DIY | ⚠️ | 49K | **Ruled out** |

### Shortlist for deep evaluation
1. **TipTap** — Primary. Best combination: DragHandle, ProseMirror tree, Yjs collab, Angular bindings. Largest community of the ProseMirror wrappers.
2. **Lexical** — Secondary. Meta-backed, clean architecture, but Angular support is thin and drag/drop is DIY.
3. **Milkdown** — Tertiary. ProseMirror benefits with plugin architecture, but small community (50K/wk) is a risk.
4. **ProseMirror (raw)** — Fallback. Maximum control but ~2x the effort vs TipTap.
5. **Slate** — Noted but Angular wrapper at 408 downloads/week is too risky for production.

### Recommendation
Start deep evaluation with **TipTap**. If TipTap has blockers, evaluate **Lexical** next (cleaner than raw ProseMirror, Meta-backed). **Milkdown** as a dark horse if both have issues.

## Eval suite design

### Rationale
Programmatic tests are tightly coupled to implementation. LLM-based tests describe what a human sees and does, making them portable across Quill, TipTap, or any editor.

### Architecture
```
eval-suite/
  scenarios/                 # Human-readable test scenarios (Markdown)
    01-basic-structure.md
    02-drag-drop-headings.md
    03-drag-drop-list-items.md
    04-citations.md
    05-keyboard-behavior.md
    06-source-panel.md
    07-clipboard-export.md
    08-formatting-toolbar.md
    09-accessibility.md      # axe-core (programmatic, implementation-agnostic)
  runner.mjs                 # Orchestrator: Playwright + Bedrock Claude
  README.md
```

### Two types of evaluation
1. **Perceptual (LLM)**: Screenshot-based. LLM interprets what it sees, executes actions by coordinates, evaluates outcomes visually. Runs via AWS Bedrock (Claude).
2. **Programmatic (axe-core)**: WCAG 2.1 AA validation. Runs via Playwright. Implementation-agnostic (axe inspects rendered DOM, not source code).

### LLM runner: Playwright + AWS Bedrock
- Runner launches headless Chrome via Playwright
- For each scenario, sends screenshots to Claude via Bedrock API
- Claude interprets screenshots, returns Playwright actions (click coordinates, drag gestures, keyboard input)
- Runner executes actions, takes new screenshots, sends back for evaluation
- Claude evaluates "Expected outcome" against final screenshots
- Benefits of Bedrock: parallel execution, no Claude Code subscription draw, reusable infrastructure

### Key properties
- **Implementation-agnostic**: No DOM selectors, CSS classes, or API references
- **Perceptual**: Evaluates visual layout, text, spatial relationships
- **Portable**: Same scenarios for any editor implementation
- **Evidence-based**: Screenshots saved per step
- **Extensible**: Add scenarios as Markdown files
- **Parallelizable**: Bedrock calls can run concurrently across scenarios

### Estimated effort: ~12h

## Execution order

```
Goal 1: Build LLM eval suite (Playwright + Bedrock)
  ↓
Goal 2: Run eval suite against Quill (baseline) + TipTap (comparison)
  ↓                    ┌─ Goal 3: Landscape survey — COMPLETE
  ↓                    │
  Checkpoint ←─────────┘
  ↓                    ┌─ Goal 4: A11y report (parallel, anytime)
  ↓                    │
Goal 5: Migration ←────┘
  ├─ Path A (Quill) → Goal 6 separate
  ├─ Path B (TipTap) → Goal 6 merged
  └─ Path C (Custom) → Goal 6 separate
```

## Next steps

1. **Goal 1: Build eval suite** — Write scenarios, build Playwright + Bedrock runner, validate against Quill prototype. Plan to be reviewed before implementation begins (Bedrock API design decisions).

2. **Goal 2: TipTap evaluation** — Continue buildout (citation node, drag, toolbar). Run eval suite for direct comparison with Quill.

3. **Goal 4: A11y report** — Independent, can start anytime in parallel.

4. **Checkpoint** — Compare eval results. Blake decides path for Goal 5.

5. **Goal 5** — Execute migration on chosen path.
