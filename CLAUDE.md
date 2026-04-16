# SHOULD

1. Track granted permissions in CLAUDE.md immediately.
2. Estimate in tokens/tool calls/wall-clock, not calendar time.
3. **Lead with meaningful command names.** Newline after flow control operators (`&&`, `||`, `|`, `;`) and non-trivial redirects (`>`, `>>`). Stderr-to-stdout (`2>&1`) and `/dev/null` redirects are trivial and stay inline.
4. **Git style guide:**
   - Semantic branch names — describe the change, not a sequence number.
   - Squash local commits & stack branches for large migrations.
   - Never use `--force` and only use `--force-with-lease` when remote history has diverged.
   - No `Co-Authored-By` unless asked.
   - No tabs, only spaces.

---

# Status Report Template

Use at milestones and every ~15 min of sustained autonomous work.

```
════════════════════════════════════════════════════
# Status Report — {ISO 8601 timestamp}
════════════════════════════════════════════════════

## Done

## Problems solved & questions answered

## Decisions made

## Remaining challenges

## Next

════════════════════════════════════════════════════
```
