# Mobile Browser Compatibility

## Type: programmatic
This scenario uses Playwright mobile emulation, not LLM visual evaluation.

## Checks

### 10.1 Renders on Chrome Android
- Open the editor in a Chrome Android emulated viewport (e.g., Pixel 5: 393x851).
- The editor should render with visible headings, lists, and content.
- No JavaScript errors should occur during load.

### 10.2 Renders on Safari iOS
- Open the editor in a Safari iOS emulated viewport (e.g., iPhone 12: 390x844).
- The editor should render with visible headings, lists, and content.
- No JavaScript errors should occur during load.

### 10.3 Content is scrollable on mobile
- In a mobile viewport, the editor content should be scrollable if it exceeds the viewport height.

### 10.4 Text is readable without horizontal scroll
- All text content should fit within the mobile viewport width without requiring horizontal scrolling.

### 10.5 Source panel accessible on mobile
- The "Sources" button should be visible and clickable.
- Clicking it should show the source panel (may overlay the editor on mobile).
