#!/usr/bin/env node
/**
 * Step 11 — Citation integration tests
 * Tests citation attributes, loading state, remove-to-freetext with confirmation.
 */
import { chromium } from 'playwright-core';

let passed = 0, failed = 0;

function report(name, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (ok) passed++; else failed++;
}

async function waitForEditor(page, timeout = 15000) {
  await page.waitForSelector('.ProseMirror', { timeout });
  await page.waitForFunction(() => {
    const pm = document.querySelector('.ProseMirror');
    return pm && pm.children.length > 0;
  }, { timeout });
}

async function run() {
  console.log('\nCitation integration tests\n');
  const browser = await chromium.launch({ headless: true });

  try {
    // ── Test 1: Citation node attributes ──
    console.log('Test 1: Citation node extended attributes');
    {
      const room = `cite-attr-${Date.now()}`;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`http://localhost:4200/${room}`);
      await waitForEditor(page);
      await page.waitForTimeout(500);

      // Insert a citation with entryId and libraryId
      await page.evaluate(() => {
        const editor = window.__tiptapEditor;
        if (!editor) return;
        editor.chain().focus().insertContentAt(editor.state.doc.content.size, {
          type: 'citation',
          attrs: {
            sourceUrl: 'https://example.com',
            sourceTitle: 'Test',
            sourceAuthor: 'Author',
            entryId: 12345,
            libraryId: 67890,
          },
          content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Test citation text.' }],
        }).run();
      });
      await page.waitForTimeout(300);

      const attrs = await page.evaluate(() => {
        const cite = document.querySelector('.citation-node[data-entry-id="12345"]');
        return cite ? {
          entryId: cite.getAttribute('data-entry-id'),
          libraryId: cite.getAttribute('data-library-id'),
          url: cite.getAttribute('data-source-url'),
        } : null;
      });
      report('entryId attribute rendered', attrs?.entryId === '12345');
      report('libraryId attribute rendered', attrs?.libraryId === '67890');

      await ctx.close();
    }

    // ── Test 2: Citation loading state ──
    console.log('\nTest 2: Citation loading state');
    {
      const room = `cite-load-${Date.now()}`;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`http://localhost:4200/${room}`);
      await waitForEditor(page);
      await page.waitForTimeout(500);

      // Insert a citation with citationLoading: true
      await page.evaluate(() => {
        const editor = window.__tiptapEditor;
        if (!editor) return;
        editor.chain().focus().insertContentAt(editor.state.doc.content.size, {
          type: 'citation',
          attrs: { citationLoading: true },
          content: [{ type: 'text', text: 'Loading...' }],
        }).run();
      });
      await page.waitForTimeout(300);

      const hasLoadingClass = await page.evaluate(() =>
        !!document.querySelector('.citation-node.citation-loading'));
      report('Loading CSS class applied', hasLoadingClass);

      // Check spinner animation exists
      const hasSpinner = await page.evaluate(() => {
        const el = document.querySelector('.citation-node.citation-loading');
        if (!el) return false;
        const before = getComputedStyle(el, '::before');
        return before.content !== 'none' && before.content !== '';
      });
      report('Spinner pseudo-element present', hasSpinner);

      await ctx.close();
    }

    // ── Test 3: Remove citation — confirmation flow ──
    console.log('\nTest 3: Remove citation with confirmation');
    {
      // Use a fresh room with no demo content — insert only our citation
      const room = `cite-remove-${Date.now()}`;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`http://localhost:4200/${room}`);
      await waitForEditor(page);
      await page.waitForTimeout(1000);

      // Clear all content and insert just our citation
      await page.evaluate(() => {
        const editor = window.__tiptapEditor;
        if (!editor) return;
        editor.commands.clearContent();
        editor.chain().focus().insertContentAt(0, [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Test' }] },
          {
            type: 'citation',
            attrs: { sourceTitle: 'RemoveMe' },
            content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Citation text to remove.' }],
          },
        ]).run();
      });
      await page.waitForTimeout(500);

      // Click the × button area (right side of the ONLY citation)
      const citationEl = await page.waitForSelector('.citation-node');
      const box = await citationEl.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
      }
      await page.waitForTimeout(300);

      // Check confirmation dialog appears
      const hasDialog = await page.evaluate(() =>
        !!document.querySelector('.confirm-dialog'));
      report('Confirmation dialog appears on × click', hasDialog);

      // Check preview text
      const previewText = await page.evaluate(() =>
        document.querySelector('.confirm-preview')?.textContent?.trim());
      report('Dialog shows citation text', previewText?.includes('Citation text to remove'));

      // Click Cancel
      await page.click('.confirm-dialog .btn-ghost');
      await page.waitForTimeout(200);
      const dialogGone = await page.evaluate(() =>
        !document.querySelector('.confirm-dialog'));
      report('Cancel closes dialog', dialogGone);

      // Citation still exists
      const stillExists = await page.evaluate(() =>
        !!document.querySelector('.citation-node'));
      report('Citation preserved after cancel', stillExists);

      // Now click × again and confirm
      const box2 = await citationEl.boundingBox();
      if (box2) {
        await page.mouse.click(box2.x + box2.width - 10, box2.y + box2.height / 2);
      }
      await page.waitForTimeout(300);
      await page.click('.confirm-dialog .btn-danger');
      await page.waitForTimeout(500);

      // Citation should be gone, replaced by freetext
      const citationGone = await page.evaluate(() =>
        !document.querySelector('.citation-node'));
      report('Citation removed after confirm', citationGone);

      const textConverted = await page.evaluate(() => {
        const pm = document.querySelector('.ProseMirror');
        return pm?.innerText || '';
      });
      report('Citation text converted to freetext', textConverted.includes('Citation text to remove'));

      await ctx.close();
    }

    // ── Test 4: Remove button hidden in read-only ──
    console.log('\nTest 4: Remove button hidden when disconnected (read-only)');
    {
      const room = `cite-ro-${Date.now()}`;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`http://localhost:4200/${room}`);
      await waitForEditor(page);
      await page.waitForTimeout(500);

      // Insert a citation
      await page.evaluate(() => {
        const editor = window.__tiptapEditor;
        editor?.chain().focus().insertContentAt(editor.state.doc.content.size, {
          type: 'citation',
          content: [{ type: 'text', text: 'Read-only citation' }],
        }).run();
      });
      await page.waitForTimeout(300);

      // Disconnect to trigger read-only
      await page.evaluate(() => { window.__yjsProvider?.disconnect(); });
      await page.waitForTimeout(9000);

      // Check × button is hidden via CSS
      const removeHidden = await page.evaluate(() => {
        const cite = document.querySelector('.citation-node');
        if (!cite) return false;
        const after = getComputedStyle(cite, '::after');
        return after.display === 'none';
      });
      report('Remove button hidden in read-only mode', removeHidden);

      await ctx.close();
    }

  } finally {
    await browser.close();
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
