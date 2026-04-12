# Keyboard Behavior

## Setup
Navigate to the outline editor. Click into a list item to place the cursor.

## Actions

### 5.1 Tab indents list item
- Place cursor in a bullet list item.
- Press Tab.
- The item should indent one level (move to the right).
- No tab character or whitespace should be inserted into the text.

### 5.2 Shift+Tab outdents list item
- With the cursor in an indented list item, press Shift+Tab.
- The item should outdent one level (move to the left).

### 5.3 Enter creates new list item
- Place cursor at the end of a list item's text.
- Press Enter.
- A new empty list item should appear below, with the same list type (bullet or number).

### 5.4 Enter on empty list item removes it
- Create a new empty list item by pressing Enter.
- Without typing anything, press Enter again (or press Backspace).
- The empty list item should be removed.
- The cursor should move to the end of the previous line.

### 5.5 Enter after heading creates bullet
- Place cursor at the end of a heading's text.
- Press Enter.
- A new bullet list item should appear below the heading — NOT a new heading.

### 5.6 Headings reject leading whitespace
- Place cursor at the very beginning of a heading.
- Press Space or Tab.
- No whitespace should be added before the heading text.

### 5.7 Undo/Redo works
- Make a text change (type some text, or delete some text).
- Press Cmd+Z (or Ctrl+Z on Windows).
- The change should be undone.
- Press Cmd+Shift+Z (or Ctrl+Y).
- The change should be redone.
