/**
 * Capture annotated Playwright screenshots of the outliner prototype behaviors.
 *
 * Usage: node capture-behaviors.mjs [--url http://localhost:4200] [--out ~/Desktop/recorded-behaviors]
 *
 * Captures screenshots with ISO 8601 timestamped filenames and descriptive suffixes.
 * Separate screencapture video runs in parallel via a sibling shell script.
 */
import { chromium } from 'playwright-core';
import { writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const URL = getArg('--url', 'http://localhost:4200');
const OUT = getArg('--out', `${process.env.HOME}/Desktop/recorded-behaviors`);
const TS = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');

const captures = [];

async function capture(page, name, description) {
  const fname = `${TS}_${name}.png`;
  const path = `${OUT}/${fname}`;
  await page.screenshot({ path, fullPage: false });
  captures.push({ file: fname, description });
  console.log(`  ✓ ${fname} — ${description}`);
}

async function main() {
  console.log(`Capturing outliner behaviors`);
  console.log(`  URL: ${URL}`);
  console.log(`  Output: ${OUT}`);
  console.log(`  Timestamp: ${TS}`);
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('Editor basics:');
  await page.goto(URL);
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  await page.waitForTimeout(1500); // let sync settle
  await capture(page, '01_editor_loaded', 'Editor loaded with demo content — headings, bullets, citations');

  // Show outline numbering on ordered list
  await page.evaluate(() => {
    const editor = window.__tiptapEditor;
    if (editor) {
      // Move cursor to one of the ordered list items (has them from demo content)
      const doc = editor.state.doc;
      let foundOl = null;
      doc.descendants((n, p) => {
        if (foundOl) return false;
        if (n.type.name === 'orderedList') { foundOl = p; return false; }
        return true;
      });
      if (foundOl !== null) {
        editor.commands.setTextSelection(foundOl + 2);
        editor.view.focus();
      }
    }
  });
  await page.waitForTimeout(500);
  await capture(page, '02_numbering_visible', 'Purdue OWL numbering (I/A/1/a) on ordered list items');

  // Bubble menu: select some text
  console.log('Bubble menu:');
  await page.evaluate(() => {
    const editor = window.__tiptapEditor;
    if (editor) {
      const doc = editor.state.doc;
      let headingPos = null;
      doc.descendants((n, p) => {
        if (headingPos) return false;
        if (n.type.name === 'heading' && n.attrs.level === 2) { headingPos = p; return false; }
        return true;
      });
      if (headingPos !== null) {
        editor.commands.setTextSelection({ from: headingPos + 1, to: headingPos + 6 });
        editor.view.focus();
      }
    }
  });
  await page.waitForTimeout(600);
  await capture(page, '03_bubble_menu', 'Bubble menu appears on text selection (H1/H2/H3 toggles)');

  // Hover over a node to show drag handle and highlight overlay
  console.log('Drag handle and hover highlight:');
  const firstHeading = await page.locator('.ProseMirror h1').first();
  await firstHeading.hover();
  await page.waitForTimeout(400);
  await capture(page, '04_drag_handle_hover', 'Drag handle and section highlight on heading hover');

  // Source panel (if visible)
  console.log('Source panel:');
  const sourcePanel = await page.locator('.source-panel, .sources-panel, [class*="source"]').first();
  if (await sourcePanel.count() > 0) {
    await capture(page, '05_source_panel', 'Source panel with draggable citations');
  }

  // Citation node close-up
  console.log('Citation node:');
  const citation = await page.locator('.citation-node').first();
  if (await citation.count() > 0) {
    await citation.hover();
    await page.waitForTimeout(300);
    await capture(page, '06_citation_hover', 'Citation node with remove button (×) visible on hover');
  }

  // Second tab for collaboration demo
  console.log('Collaborative editing:');
  const page2 = await context.newPage();
  await page2.goto(URL);
  await page2.waitForSelector('.ProseMirror', { timeout: 15000 });
  await page2.waitForTimeout(1500);

  // Type into page1, capture both
  await page.bringToFront();
  await page.click('.ProseMirror h1', { position: { x: 200, y: 10 } });
  await page.keyboard.press('End');
  await page.keyboard.type(' [edit from tab 1]');
  await page.waitForTimeout(800);
  await capture(page, '07_collab_tab1', 'Tab 1 after typing — content synced to tab 2 via Yjs');

  await page2.bringToFront();
  await page2.waitForTimeout(500);
  await page2.screenshot({ path: `${OUT}/${TS}_08_collab_tab2.png`, fullPage: false });
  captures.push({ file: `${TS}_08_collab_tab2.png`, description: 'Tab 2 showing tab 1 edit synced via Yjs WebSocket' });
  console.log(`  ✓ ${TS}_08_collab_tab2.png — Tab 2 showing tab 1 edit synced via Yjs WebSocket`);

  // Undo safety / Yjs history
  console.log('Undo with Yjs:');
  await page.bringToFront();
  await page.keyboard.press('Meta+Z');
  await page.waitForTimeout(500);
  await capture(page, '09_undo_yjs', 'Undo via Yjs UndoManager — only tab 1 edits undone, not tab 2');

  // Write the annotation index
  const index = {
    timestamp: TS,
    url: URL,
    captures,
  };
  await writeFile(`${OUT}/${TS}_index.json`, JSON.stringify(index, null, 2));
  console.log(`\n  ✓ ${TS}_index.json — annotation index`);

  // Write a markdown annotation file
  const md = `# Outliner Prototype Behaviors — ${TS}

Captured: ${new Date().toISOString()}
Source: ${URL}

## Screenshots (in order)

${captures.map(c => `### ${c.file}\n${c.description}\n`).join('\n')}

## Notes

- **Numbering plugin**: The new \`@scrible/tiptap-outline-numbering\` plugin renders Purdue OWL academic markers (I, II, III / A, B, C / 1, 2, 3 / a, b, c) on ordered lists. Visible in screenshot 02.
- **Collaboration**: Two browser contexts connected to \`outline-demo\` room via y-websocket on port 1234. Edits propagate via Yjs CRDT.
- **Feature flag**: The prototype does not use \`:tiptap_outline\` — that flag gates the toolbar2 integration (Step 14).
`;
  await writeFile(`${OUT}/${TS}_annotations.md`, md);
  console.log(`  ✓ ${TS}_annotations.md — markdown walkthrough\n`);

  await browser.close();
  console.log(`Done. ${captures.length} screenshots captured in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
