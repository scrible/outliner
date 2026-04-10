# Scrible Style Guide

Extracted from toolbar2, website, and toolbar-extension codebases.

## Colors

### Primary Brand (Teal)
- **Primary:** `#1d6e82`
- 50: #e3f2f5 | 100: #b9dfe6 | 200: #8bcad5 | 300: #5db5c4 | 400: #3aa5b8
- 600: #1d6e82 | 700: #186373 | 800: #145764 | 900: #0d3d46
- Nub Active: #2e7d84 (fg), #e8f4f8 (bg)
- Link: #337c8e | Link (dark bg): #c8f9ff

### Accent (Gold)
- **Accent:** `#a56708`
- 50: #f5f0e6 | 100: #e6d9c0 | 200: #d6c096 | 300: #c5a76c | 400: #b8944d
- Light Beige: #FCF4E9 | Beige: #ECB86B | Dark Beige: #D8A65A

### Warning/Error
- **Warning:** `#ba1a1a`
- Danger: #d9534f | #FF6666 (dark bg)
- Completed: #00a500

### Grayscale
- #333, #555, #777, #888, #999, #aaa, #bbb, #ccc, #ddd, #eee
- Sidebar bg: #f5f5f5 | Modal footer: #e7e7e7 | Toolbar: #444

## Typography

- **Primary:** Arial, sans-serif
- **Secondary:** Helvetica Neue, Helvetica, Arial, sans-serif
- **Serif:** Georgia, Times New Roman, Times, serif
- **Widget/Brand:** Ek Mukta, sans-serif
- **Icon font:** scrible-icon (custom)

### Sizes
- Base: 14px | Small: 12px | Medium: 16px | Large: 18-22px | XL: 24-26px

## Logo

- Wordmark: `toolbar2/projects/scrible/common/src/lib/components/buttons/scrible-logo-button/scrible_logo.png`
- Large: `toolbar2/projects/scrible/user-app/src/assets/images/popups/scrible-logo-big.png`
- Small: `toolbar2/projects/scrible/user-app/src/assets/images/popups/scrible-logo-small.png`
- Icon font SVG: `toolbar2/projects/scrible/sign-in/src/assets/fonts/scrible-icon.svg`

## Component Patterns

### Buttons
- Border radius: 4px (standard), 2-3px (compact)
- Transitions: 150ms ease
- Disabled: opacity 0.25

### Shadows
- Dialog: `0 5px 15px rgba(0,0,0,0.5)`
- Focus: `0 0 8px rgba(32,194,215,1)` (teal glow)
- Button hover: `inset 0 0 5px 3px rgba(200,200,200,0.55)`

### Focus States
- Teal glow: `0 0 8px rgba(32,194,215,1)`

## Layout

- Sidebar width: 281px
- Toolbar height: 50px
- Common content widths: 300-900px

## Material Theme

Defined in `toolbar2/projects/scrible/user-app/src/styles/material/teal-theme.scss` using Angular Material custom palettes with the teal/gold/red scheme above.
