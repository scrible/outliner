#!/usr/bin/env node
/**
 * LLM-based behavioral eval suite runner
 *
 * Architecture:
 *   - Playwright handles browser automation and screenshot capture
 *   - Playwright's own text/visual locators handle coordinate extraction
 *   - AWS Bedrock (Nova Lite) evaluates screenshots for pass/fail
 *   - axe-core handles accessibility checks (programmatic)
 *
 * Usage:
 *   node eval-suite/runner.mjs --url http://localhost:4300
 *   node eval-suite/runner.mjs --url http://localhost:4300/tiptap-eval
 */

import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { BedrockClient } from './bedrock-client.mjs';

// Parse args
const args = process.argv.slice(2);
const url = args.find((_, i) => args[i - 1] === '--url') || 'http://localhost:4300';
const scenarioFilter = args.find((_, i) => args[i - 1] === '--scenario');
const profileName = args.find((_, i) => args[i - 1] === '--profile') || 'scrible-dev';
const outDir = args.find((_, i) => args[i - 1] === '--out') || join(import.meta.dirname, 'results', new Date().toISOString().replace(/[:.]/g, '-'));

mkdirSync(outDir, { recursive: true });

// Find Chrome for Testing
let execPath;
try {
  const { execSync } = await import('child_process');
  execPath = execSync('find ~/Library/Caches/ms-playwright -name "Google Chrome for Testing" -type f 2>/dev/null | head -1', { encoding: 'utf8' }).trim() || undefined;
} catch { execPath = undefined; }

// Load scenarios
const scenarioDir = join(import.meta.dirname, 'scenarios');
let scenarioFiles = readdirSync(scenarioDir).filter(f => f.endsWith('.md')).sort();
if (scenarioFilter) {
  scenarioFiles = scenarioFiles.filter(f => f.includes(scenarioFilter));
}

console.log(`\n🏎️  Outline Editor Eval Suite`);
console.log(`   URL: ${url}`);
console.log(`   Scenarios: ${scenarioFiles.length}`);
console.log(`   Output: ${outDir}\n`);

// Initialize Bedrock client
const bedrock = new BedrockClient(profileName);

// Launch browser
const browser = await chromium.launch({ headless: true, executablePath: execPath, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });

const allResults = [];

for (const file of scenarioFiles) {
  const scenarioName = basename(file, '.md');
  const content = readFileSync(join(scenarioDir, file), 'utf8');
  const isProgrammatic = content.includes('## Type: programmatic');

  console.log(`\n── ${scenarioName} ──`);

  if (isProgrammatic) {
    // Run axe-core accessibility checks
    const results = await runAccessibilityScenario(context, url, content, scenarioName, outDir);
    allResults.push(...results);
  } else {
    // Run LLM-evaluated visual scenario
    const results = await runVisualScenario(context, url, content, scenarioName, outDir, bedrock);
    allResults.push(...results);
  }
}

// Summary
console.log('\n' + '='.repeat(60));
const passed = allResults.filter(r => r.pass).length;
const failed = allResults.filter(r => !r.pass).length;
console.log(`\n✅ ${passed} passed  ❌ ${failed} failed  (${allResults.length} total)\n`);

// Write summary
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ url, timestamp: new Date().toISOString(), results: allResults }, null, 2));
console.log(`Results saved to ${outDir}/summary.json\n`);

await browser.close();
process.exit(failed > 0 ? 1 : 0);

// ─── Visual scenario runner ───

async function runVisualScenario(context, url, scenarioMd, scenarioName, outDir, bedrock) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Parse checks from the scenario markdown
  const checks = parseChecks(scenarioMd);
  const results = [];

  for (const check of checks) {
    // Take screenshot
    const screenshotPath = join(outDir, `${scenarioName}-${check.id}.png`);
    await page.screenshot({ path: screenshotPath });
    const screenshotBase64 = readFileSync(screenshotPath).toString('base64');

    // If the check has actions, execute them first
    if (check.hasActions) {
      await executeActions(page, check);
      // Take post-action screenshot
      const postPath = join(outDir, `${scenarioName}-${check.id}-after.png`);
      await page.screenshot({ path: postPath });
      const postBase64 = readFileSync(postPath).toString('base64');

      // Ask LLM to evaluate the outcome
      const evaluation = await bedrock.evaluateScreenshot(postBase64, check.expected);
      results.push({ scenario: scenarioName, check: check.id, name: check.name, pass: evaluation.pass, detail: evaluation.reason });
      console.log(`  ${evaluation.pass ? '✓' : '✗'} ${check.name}`);
      if (!evaluation.pass) console.log(`    ${evaluation.reason}`);
    } else {
      // Static check — just evaluate the current screenshot
      const evaluation = await bedrock.evaluateScreenshot(screenshotBase64, check.expected);
      results.push({ scenario: scenarioName, check: check.id, name: check.name, pass: evaluation.pass, detail: evaluation.reason });
      console.log(`  ${evaluation.pass ? '✓' : '✗'} ${check.name}`);
      if (!evaluation.pass) console.log(`    ${evaluation.reason}`);
    }
  }

  await page.close();
  return results;
}

// ─── Accessibility scenario runner ───

async function runAccessibilityScenario(context, url, scenarioMd, scenarioName, outDir) {
  const results = [];

  // Check if axe-core is available
  let AxeBuilder;
  try {
    const axeModule = await import('@axe-core/playwright');
    AxeBuilder = axeModule.default;
  } catch {
    console.log('  ⚠ @axe-core/playwright not installed, skipping a11y checks');
    return [{ scenario: scenarioName, check: '9.0', name: 'axe-core available', pass: false, detail: 'Package not installed' }];
  }

  const checks = [
    { id: '9.1', name: 'Main editor — no violations', setup: async (page) => {} },
    { id: '9.2', name: 'With source panel — no violations', setup: async (page) => {
      const btn = await page.$('button:has-text("Sources")');
      if (btn) { await btn.click(); await page.waitForTimeout(500); }
    }},
    { id: '9.3', name: 'With source detail — no violations', setup: async (page) => {
      const btn = await page.$('.source-info-btn');
      if (btn) { await btn.click(); await page.waitForTimeout(500); }
    }},
  ];

  for (const check of checks) {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await check.setup(page);

    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const pass = axeResults.violations.length === 0;
    const detail = pass ? '0 violations' : `${axeResults.violations.length} violation(s): ${axeResults.violations.map(v => v.id).join(', ')}`;
    results.push({ scenario: scenarioName, check: check.id, name: check.name, pass, detail });
    console.log(`  ${pass ? '✓' : '✗'} ${check.name}`);
    if (!pass) console.log(`    ${detail}`);

    await page.close();
  }

  return results;
}

// ─── Helpers ───

function parseChecks(md) {
  const checks = [];
  const lines = md.split('\n');
  let currentCheck = null;
  let inExpected = false;

  for (const line of lines) {
    const checkMatch = line.match(/^### (\d+\.\d+)\s+(.+)$/);
    if (checkMatch) {
      if (currentCheck) checks.push(currentCheck);
      currentCheck = {
        id: checkMatch[1],
        name: checkMatch[2],
        expected: '',
        hasActions: false,
      };
      inExpected = false;
      continue;
    }

    if (currentCheck) {
      // Detect action keywords
      if (line.match(/^-\s+(Click|Drag|Press|Type|Move|Hover|Select|Navigate)/i)) {
        currentCheck.hasActions = true;
      }
      // Accumulate check description
      if (line.startsWith('- ')) {
        currentCheck.expected += line.substring(2) + '\n';
      }
    }
  }
  if (currentCheck) checks.push(currentCheck);
  return checks;
}

async function executeActions(page, check) {
  // For now, actions are described in natural language within the check.
  // The runner interprets common patterns:
  const lines = check.expected.split('\n').filter(l => l.trim());

  for (const line of lines) {
    // Click on text
    const clickMatch = line.match(/[Cc]lick (?:on |the )?"([^"]+)"/);
    if (clickMatch) {
      const el = await page.getByText(clickMatch[1], { exact: false }).first();
      if (el) { try { await el.click({ timeout: 3000 }); } catch {} }
      await page.waitForTimeout(500);
      continue;
    }

    // Press key
    const pressMatch = line.match(/[Pp]ress (?:the )?(\w+(?:\+\w+)?)/);
    if (pressMatch) {
      const key = pressMatch[1].replace('Cmd', 'Meta').replace('Ctrl', 'Control');
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
      continue;
    }

    // Type text
    const typeMatch = line.match(/[Tt]ype[sd]? (?:some |the |")?([^"]+)"?/);
    if (typeMatch) {
      await page.keyboard.type(typeMatch[1]);
      await page.waitForTimeout(300);
      continue;
    }

    // Hover over text
    const hoverMatch = line.match(/[Hh]over (?:over |near )?"?([^"]+)"?/);
    if (hoverMatch) {
      const el = await page.getByText(hoverMatch[1], { exact: false }).first();
      if (el) { try { await el.hover({ timeout: 3000 }); } catch {} }
      await page.waitForTimeout(300);
      continue;
    }
  }
}
