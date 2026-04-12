# Accessibility (WCAG 2.1 AA)

## Type: programmatic
This scenario uses axe-core, not LLM visual evaluation.

## Checks

### 9.1 Main editor page — no violations
- Navigate to the outline editor.
- Run axe-core with tags: wcag2a, wcag2aa, wcag21a, wcag21aa.
- There should be 0 violations.

### 9.2 With source panel open — no violations
- Open the source panel.
- Run axe-core.
- There should be 0 violations.

### 9.3 With source detail open — no violations
- Open a source detail view.
- Run axe-core.
- There should be 0 violations.

### 9.4 Color contrast
- All text should meet WCAG AA minimum contrast ratios.
- This is checked automatically by axe-core.

### 9.5 Interactive elements have labels
- All buttons, inputs, and interactive elements should have accessible labels (aria-label, title, or visible text).
- This is checked automatically by axe-core.
