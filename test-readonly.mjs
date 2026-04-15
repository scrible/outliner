#!/usr/bin/env node
/**
 * Step 12 — Read-only mode and disconnect timeout tests
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
  console.log('\nRead-only & disconnect tests\n');
  const browser = await chromium.launch({ headless: true });

  try {
    // ── Test 1: Editable by default ──
    console.log('Test 1: Default editable state');
    {
      const room = `ro-test-${Date.now()}`;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`http://localhost:4200/${room}`);
      await waitForEditor(page);
      await page.waitForTimeout(500);

      const editable = await page.evaluate(() => {
        const pm = document.querySelector('.ProseMirror');
        return pm?.getAttribute('contenteditable');
      });
      report('Editor is editable by default', editable === 'true');

      // No read-only indicator
      const hasReadOnlyAttr = await page.evaluate(() =>
        document.querySelector('.outline-shell')?.hasAttribute('data-read-only'));
      report('No data-read-only attribute by default', !hasReadOnlyAttr);

      // Bubble menu should exist (it's rendered, just hidden until selection)
      const hasBubbleMenu = await page.evaluate(() =>
        !!document.querySelector('.bubble-toolbar'));
      report('Bubble menu rendered when editable', hasBubbleMenu);

      await ctx.close();
    }

    // ── Test 2: Disconnect timeout sets connection-error ──
    console.log('\nTest 2: Disconnect timeout');
    {
      const room = `ro-disc-${Date.now()}`;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`http://localhost:4200/${room}`);
      await waitForEditor(page);
      await page.waitForTimeout(500);

      // Disconnect provider
      await page.evaluate(() => {
        window.__yjsProvider?.disconnect();
      });

      // Wait 2s — should still be editable (timeout is 8s)
      await page.waitForTimeout(2000);
      const stillEditable = await page.evaluate(() =>
        document.querySelector('.ProseMirror')?.getAttribute('contenteditable'));
      report('Still editable 2s after disconnect', stillEditable === 'true');

      // Wait another 7s (total 9s) — should now be read-only
      await page.waitForTimeout(7000);
      const notEditable = await page.evaluate(() =>
        document.querySelector('.ProseMirror')?.getAttribute('contenteditable'));
      report('Not editable after 9s disconnect', notEditable === 'false');

      // Check connection error indicator
      const hasErrorStatus = await page.evaluate(() =>
        !!document.querySelector('.sync-status-error'));
      report('Connection error indicator shown', hasErrorStatus);

      // Check data-read-only attribute
      const hasRoAttr = await page.evaluate(() =>
        document.querySelector('.outline-shell')?.hasAttribute('data-read-only'));
      report('data-read-only attribute set', hasRoAttr);

      // Reconnect — should restore editability
      await page.evaluate(() => {
        window.__yjsProvider?.connect();
      });
      await page.waitForTimeout(2000);
      const restored = await page.evaluate(() =>
        document.querySelector('.ProseMirror')?.getAttribute('contenteditable'));
      report('Editable restored after reconnect', restored === 'true');

      // Error indicator should be gone
      const errorGone = await page.evaluate(() =>
        !document.querySelector('.sync-status-error'));
      report('Connection error indicator cleared', errorGone);

      await ctx.close();
    }

    // ── Test 3: Drag handles hidden in read-only ──
    console.log('\nTest 3: Controls hidden in read-only');
    {
      const room = `ro-ctrl-${Date.now()}`;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`http://localhost:4200/${room}`);
      await waitForEditor(page);
      await page.waitForTimeout(500);

      // Force read-only via disconnect timeout
      await page.evaluate(() => { window.__yjsProvider?.disconnect(); });
      await page.waitForTimeout(9000);

      // Drag handle should be hidden via CSS
      const dragHandleHidden = await page.evaluate(() => {
        const dh = document.querySelector('.drag-handle-group');
        if (!dh) return true; // not rendered = fine
        return getComputedStyle(dh).display === 'none';
      });
      report('Drag handle hidden in read-only', dragHandleHidden);

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
