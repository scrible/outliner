# Clipboard & Export

## Setup
Navigate to the outline editor.

## Actions

### 7.1 Copy button shows toast
<!-- KNOWN: This check fails because the runner's executeActions can't yet handle
     coordinate-based hover-then-click sequences. The copy icon only appears on
     mouse hover over the editor content area, which requires a mouse move to
     specific coordinates rather than a text-based locator. Fix: add coordinate-based
     hover support to executeActions in runner.mjs. -->
- Hover over any element in the editor to reveal icons on the left.
- There should be a small copy icon (clipboard icon) next to a drag handle.
- Click the copy icon.
- A toast notification should appear at the bottom of the screen.
- The toast should mention copying to clipboard and include a link to Google Docs.

### 7.2 Toast has platform shortcut
- The toast should display the correct paste shortcut for the current platform (⌘V on Mac, Ctrl+V on Windows/Linux).

### 7.3 Toast auto-dismisses
- After the toast appears, wait approximately 8 seconds.
- The toast should automatically disappear.

### 7.4 Toast has close button
- When the toast is visible, there should be an X or close button on the right side.
- Clicking it should dismiss the toast immediately.

### 7.5 Copy handle on hover
- Hover over any element in the editor to reveal the handle area.
- There should be a copy icon alongside the drag handle.
- Clicking the copy icon should show the toast notification.
