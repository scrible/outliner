#!/usr/bin/env node
/**
 * Step 10 — Collaborative editing test suite
 *
 * Tests Yjs collab between two browser contexts connected to the same room.
 * Uses playwright-core directly (matches eval-suite pattern).
 *
 * Usage: node test-collab.mjs [--url http://localhost:4200/playground]
 */
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const baseUrl = args.find((_, i) => args[i - 1] === '--url') || 'http://localhost:4200/collab-test';

let passed = 0, failed = 0;
const results = [];

function report(name, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (ok) passed++; else failed++;
  results.push({ name, status, detail });
}

async function waitForEditor(page, timeout = 15000) {
  await page.waitForSelector('.ProseMirror', { timeout });
  // Wait for Yjs sync — editor should have content or be ready
  await page.waitForFunction(() => {
    const pm = document.querySelector('.ProseMirror');
    return pm && pm.children.length > 0;
  }, { timeout });
}

async function getEditorText(page) {
  return page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return pm ? pm.innerText : '';
  });
}

async function getEditorHTML(page) {
  return page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return pm ? pm.innerHTML : '';
  });
}

async function typeInEditor(page, text) {
  await page.click('.ProseMirror');
  await page.keyboard.type(text);
}

async function clearAndType(page, text) {
  await page.click('.ProseMirror');
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text);
}

// ──────────────────────────────────────────────
// Main test runner
// ──────────────────────────────────────────────
async function run() {
  console.log(`\nCollab test suite — ${baseUrl}\n`);

  const browser = await chromium.launch({ headless: true });

  try {
    // ──────────────────────────────────────
    // Test 1: Two contexts see the same initial content
    // ──────────────────────────────────────
    console.log('Test 1: Initial sync between two tabs');
    {
      const ctx1 = await browser.newContext();
      const ctx2 = await browser.newContext();
      const page1 = await ctx1.newPage();
      const page2 = await ctx2.newPage();

      await page1.goto(baseUrl);
      await waitForEditor(page1);
      // Small delay for demo content to seed
      await page1.waitForTimeout(1000);

      await page2.goto(baseUrl);
      await waitForEditor(page2);
      await page2.waitForTimeout(1500);

      const text1 = await getEditorText(page1);
      const text2 = await getEditorText(page2);

      report('Both tabs show same content', text1 === text2,
        text1 === text2 ? `${text1.length} chars synced` : `Mismatch: ${text1.length} vs ${text2.length}`);

      report('Content is non-empty', text1.length > 10, `${text1.length} chars`);

      await ctx1.close();
      await ctx2.close();
    }

    // ──────────────────────────────────────
    // Test 2: Concurrent text edits sync
    // ──────────────────────────────────────
    console.log('\nTest 2: Concurrent text edits');
    {
      // Use a unique room to avoid stale state
      const room = `collab-test-${Date.now()}`;
      const url = `http://localhost:4200/${room}`;

      const ctx1 = await browser.newContext();
      const ctx2 = await browser.newContext();
      const page1 = await ctx1.newPage();
      const page2 = await ctx2.newPage();

      await page1.goto(url);
      await waitForEditor(page1);
      await page1.waitForTimeout(500);

      await page2.goto(url);
      await waitForEditor(page2);
      await page2.waitForTimeout(1000);

      // Type in page1 — should appear in page2
      // Click at end of first content element
      await page1.click('.ProseMirror > :first-child');
      await page1.keyboard.press('End');
      await page1.keyboard.type(' ALPHA_MARKER');
      await page1.waitForTimeout(500);

      const text2after = await getEditorText(page2);
      report('Edit from tab1 appears in tab2', text2after.includes('ALPHA_MARKER'));

      // Type in page2 — should appear in page1
      await page2.click('.ProseMirror > :first-child');
      await page2.keyboard.press('End');
      await page2.keyboard.type(' BETA_MARKER');
      await page2.waitForTimeout(500);

      const text1after = await getEditorText(page1);
      report('Edit from tab2 appears in tab1', text1after.includes('BETA_MARKER'));

      // Both should have both markers
      const final1 = await getEditorText(page1);
      const final2 = await getEditorText(page2);
      report('Both tabs converge with both edits',
        final1.includes('ALPHA_MARKER') && final1.includes('BETA_MARKER') &&
        final2.includes('ALPHA_MARKER') && final2.includes('BETA_MARKER'));

      await ctx1.close();
      await ctx2.close();
    }

    // ──────────────────────────────────────
    // Test 3: Structural edits (add/delete nodes)
    // ──────────────────────────────────────
    console.log('\nTest 3: Structural edits');
    {
      const room = `collab-struct-${Date.now()}`;
      const url = `http://localhost:4200/${room}`;

      const ctx1 = await browser.newContext();
      const ctx2 = await browser.newContext();
      const page1 = await ctx1.newPage();
      const page2 = await ctx2.newPage();

      await page1.goto(url);
      await waitForEditor(page1);
      await page1.waitForTimeout(500);

      await page2.goto(url);
      await waitForEditor(page2);
      await page2.waitForTimeout(1000);

      // Count initial nodes in page2
      const initialNodes = await page2.evaluate(() =>
        document.querySelector('.ProseMirror')?.children.length || 0);

      // Add a new heading via keyboard in page1
      await page1.click('.ProseMirror');
      await page1.keyboard.press('Meta+a');
      await page1.keyboard.press('ArrowDown');
      await page1.keyboard.press('End');
      await page1.keyboard.press('Enter');
      await page1.keyboard.press('Enter');
      await page1.keyboard.type('STRUCTURAL_TEST_NODE');
      await page1.waitForTimeout(800);

      // Check it appears in page2
      const text2 = await getEditorText(page2);
      report('New node from tab1 appears in tab2', text2.includes('STRUCTURAL_TEST_NODE'));

      await ctx1.close();
      await ctx2.close();
    }

    // ──────────────────────────────────────
    // Test 4: Citation node sync
    // ──────────────────────────────────────
    console.log('\nTest 4: Citation node sync');
    {
      const room = `collab-cite-${Date.now()}`;
      const url = `http://localhost:4200/${room}`;

      const ctx1 = await browser.newContext();
      const ctx2 = await browser.newContext();
      const page1 = await ctx1.newPage();
      const page2 = await ctx2.newPage();

      await page1.goto(url);
      await waitForEditor(page1);
      await page1.waitForTimeout(500);

      await page2.goto(url);
      await waitForEditor(page2);
      await page2.waitForTimeout(1000);

      // Insert a citation programmatically in page1
      await page1.evaluate(() => {
        const editor = window.__tiptapEditor;
        if (!editor) return;
        const pos = editor.state.doc.content.size;
        editor.chain().focus().insertContentAt(pos, {
          type: 'citation',
          attrs: { sourceUrl: 'https://test.com', sourceTitle: 'Test Source', sourceAuthor: 'Test Author' },
          content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Test Author. "Test Source." 2024. Web.' }],
        }).run();
      });
      await page1.waitForTimeout(800);

      // Check citation appears in page2
      const hasCitation = await page2.evaluate(() => {
        const citations = document.querySelectorAll('.citation-node');
        return Array.from(citations).some(c => c.textContent?.includes('Test Author'));
      });
      report('Citation from tab1 syncs to tab2', hasCitation);

      // Check citation attributes survived the sync
      const attrs = await page2.evaluate(() => {
        const cite = document.querySelector('.citation-node[data-source-author="Test Author"]');
        return cite ? {
          url: cite.getAttribute('data-source-url'),
          title: cite.getAttribute('data-source-title'),
          author: cite.getAttribute('data-source-author'),
        } : null;
      });
      report('Citation attributes preserved across sync',
        attrs?.url === 'https://test.com' && attrs?.title === 'Test Source',
        attrs ? `url=${attrs.url}, title=${attrs.title}` : 'No citation found');

      await ctx1.close();
      await ctx2.close();
    }

    // ──────────────────────────────────────
    // Test 5: Cursor presence
    // ──────────────────────────────────────
    console.log('\nTest 5: Cursor presence');
    {
      const room = `collab-cursor-${Date.now()}`;
      const url = `http://localhost:4200/${room}`;

      const ctx1 = await browser.newContext();
      const ctx2 = await browser.newContext();
      const page1 = await ctx1.newPage();
      const page2 = await ctx2.newPage();

      await page1.goto(url);
      await waitForEditor(page1);
      await page1.waitForTimeout(500);

      await page2.goto(url);
      await waitForEditor(page2);
      await page2.waitForTimeout(1000);

      // Click in page1 to set cursor position
      await page1.click('.ProseMirror > :first-child');
      await page1.waitForTimeout(500);

      // Check for cursor presence element in page2
      // yCursorPlugin renders .ProseMirror-yjs-cursor widget spans
      const hasCursor = await page2.evaluate(() => {
        const cursors = document.querySelectorAll('.ProseMirror-yjs-cursor');
        return cursors.length > 0;
      });
      report('Remote cursor visible in other tab', hasCursor);

      await ctx1.close();
      await ctx2.close();
    }

    // ──────────────────────────────────────
    // Test 6: Disconnect and reconnect
    // ──────────────────────────────────────
    console.log('\nTest 6: Disconnect and reconnect');
    {
      const room = `collab-disconnect-${Date.now()}`;
      const url = `http://localhost:4200/${room}`;

      const ctx1 = await browser.newContext();
      const ctx2 = await browser.newContext();
      const page1 = await ctx1.newPage();
      const page2 = await ctx2.newPage();

      await page1.goto(url);
      await waitForEditor(page1);
      await page1.waitForTimeout(500);

      await page2.goto(url);
      await waitForEditor(page2);
      await page2.waitForTimeout(1000);

      // Disconnect page1 by blocking WebSocket
      await page1.evaluate(() => {
        // Access the provider and disconnect
        const provider = window.__yjsProvider;
        if (provider) provider.disconnect();
      });
      await page1.waitForTimeout(300);

      // Type in page1 while disconnected
      await page1.click('.ProseMirror > :first-child');
      await page1.keyboard.press('End');
      await page1.keyboard.type(' OFFLINE_EDIT');
      await page1.waitForTimeout(300);

      // Type in page2 while page1 is disconnected
      await page2.click('.ProseMirror > :first-child');
      await page2.keyboard.press('End');
      await page2.keyboard.type(' ONLINE_EDIT');
      await page2.waitForTimeout(300);

      // Verify page2 does NOT have OFFLINE_EDIT yet
      const textBefore = await getEditorText(page2);
      report('Offline edits not visible before reconnect', !textBefore.includes('OFFLINE_EDIT'));

      // Reconnect page1
      await page1.evaluate(() => {
        const provider = window.__yjsProvider;
        if (provider) provider.connect();
      });
      await page1.waitForTimeout(2000);

      // Both should now have both edits
      const text1 = await getEditorText(page1);
      const text2 = await getEditorText(page2);

      report('After reconnect, tab1 has both edits',
        text1.includes('OFFLINE_EDIT') && text1.includes('ONLINE_EDIT'));
      report('After reconnect, tab2 has both edits',
        text2.includes('OFFLINE_EDIT') && text2.includes('ONLINE_EDIT'));

      await ctx1.close();
      await ctx2.close();
    }

    // ──────────────────────────────────────
    // Test 7: Persistence across page reload
    // ──────────────────────────────────────
    console.log('\nTest 7: Persistence across reload');
    {
      const room = `collab-persist-${Date.now()}`;
      const url = `http://localhost:4200/${room}`;

      const ctx1 = await browser.newContext();
      const page1 = await ctx1.newPage();

      await page1.goto(url);
      await waitForEditor(page1);
      await page1.waitForTimeout(500);

      // Type distinctive content
      await page1.click('.ProseMirror > :first-child');
      await page1.keyboard.press('End');
      await page1.keyboard.type(' PERSIST_MARKER');
      await page1.waitForTimeout(1000);

      // Reload
      await page1.reload();
      await waitForEditor(page1);
      await page1.waitForTimeout(1500);

      const textAfter = await getEditorText(page1);
      report('Content persists after reload', textAfter.includes('PERSIST_MARKER'));

      await ctx1.close();
    }

  } finally {
    await browser.close();
  }

  // Summary
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
