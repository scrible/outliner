# Keyboard Navigation & Accessibility

All mouse-accessible features must also be keyboard-accessible.

## Setup
Navigate to the outline editor. Click into the editor to give it focus.

## Actions

### 11.1 Tab indents list items
- Place cursor in a bullet list item.
- Press Tab.
- The item should indent one level.
  - No tab character should appear in the text.
  - The indentation should be visual (nested under the parent item).

### 11.2 Shift+Tab outdents list items
- With cursor in an indented item, press Shift+Tab.
- The item should outdent one level.

### 11.3 Tab on citation indents it
- Place cursor in a citation (gold-styled element).
- Press Tab.
- The citation should indent (move to the right).
  - The citation text should NOT change.
  - No tab character should be inserted.

### 11.4 Arrow keys move between blocks
- The editor should support arrow key navigation between blocks.
- Pressing arrow keys should move the cursor between headings, list items, and citations.

### 11.5 Enter at end of heading creates bullet
- Place cursor at end of a heading.
- Press Enter.
- A new bullet list item should appear below the heading.
  - It should NOT create a new heading.

### 11.6 Enter on empty list item removes it
- Create an empty list item (press Enter at end of existing item).
- Without typing, press Enter again or Backspace.
- The empty item should be removed.

### 11.7 Ctrl/Cmd+Z undoes last action
- Make a change (type text, delete text).
- Press Cmd+Z (Mac) or Ctrl+Z (Windows).
- The change should be undone.

### 11.8 Ctrl/Cmd+Shift+Z redoes
- After undoing, press Cmd+Shift+Z or Ctrl+Y.
- The change should be redone.

### 11.9 No keyboard traps
- Tab should not trap focus inside the editor.
  - After indenting, Tab should continue to work for indentation.
  - Escape or Tab from a non-list context should not create unexpected behavior.

### 11.10 Copy/paste preserves formatting
- Select some formatted text (bold, heading, list).
- Copy (Cmd+C) and paste (Cmd+V) elsewhere in the editor.
- Formatting should be preserved.
