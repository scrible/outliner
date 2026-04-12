# Drag & Drop: List Items

## Setup
Navigate to the outline editor. Locate a section with multiple list items.

## Actions

### 3.1 Drag bullet reorders within list
- Find two bullet items in the same list.
- Drag the second bullet above the first.
- The bullets should swap positions.
- The list type (bullet vs numbered) should be preserved.

### 3.2 Nested children move with parent
- Find a numbered list item that has indented bullet sub-items below it (e.g., "Launch cost reduction" with SpaceX and Falcon 9 bullets underneath).
- Drag the parent numbered item to a new position.
- The indented sub-items should move together with their parent.
- Sub-items should NOT become orphaned or appear under a different parent.

### 3.3 Drop placeholder visible during drag
- While dragging a list item, a dashed placeholder box should appear at the drop target position.
- The placeholder should displace surrounding content to show where the item will land.

### 3.4 Floating preview during drag
- While dragging, a semi-transparent preview of the content being dragged should follow the cursor.
- The preview should show all content being moved (parent + children if applicable).

### 3.5 List type converts on cross-list drop
- If an item from a bulleted list is dropped into a numbered list (or vice versa), the item's marker should change to match the target list type.
