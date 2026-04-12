# Outline Editor Eval Suite

Implementation-agnostic behavioral testing for outline editors using LLM visual evaluation + axe-core accessibility checks.

## Quick start

```bash
# Install dependencies (if not already)
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/credential-providers @axe-core/playwright

# Run against the Quill prototype
node eval-suite/runner.mjs --url http://localhost:4300

# Run against the TipTap prototype
node eval-suite/runner.mjs --url http://localhost:4300/tiptap-eval

# Run a specific scenario
node eval-suite/runner.mjs --url http://localhost:4300 --scenario 02-drag

# Use a different AWS profile
node eval-suite/runner.mjs --url http://localhost:4300 --profile my-profile
```

## How it works

### Visual evaluation (LLM)
1. Runner launches headless Chrome via Playwright
2. For each scenario check, takes a screenshot
3. If the check involves actions (click, drag, type), executes them via Playwright text locators
4. Sends screenshot to AWS Bedrock (Nova Lite) with the expected outcome description
5. Nova Lite evaluates whether the visual result matches expectations
6. Pass/fail + reason collected per check

### Accessibility (axe-core)
Scenario `09-accessibility.md` runs axe-core programmatically. This is the one check that is deterministic and DOM-based, but it's implementation-agnostic since axe inspects the rendered page.

## Adding scenarios

Create a new `.md` file in `eval-suite/scenarios/`. Format:

```markdown
# Scenario Title

## Setup
Description of starting state.

## Actions (optional)

### X.Y Check name
- Description of what to look for or do.
- Expected visual outcome.
```

Checks are parsed by `### X.Y Title` headers. Lines starting with `- ` are accumulated as the expected outcome sent to the LLM.

## Architecture

- `runner.mjs` — Orchestrator: loads scenarios, manages browser, coordinates evaluation
- `bedrock-client.mjs` — AWS Bedrock API wrapper for Nova Lite visual evaluation
- `scenarios/` — Markdown test scenarios (human-readable, implementation-agnostic)
- `results/` — Output directory with screenshots + JSON summary per run

## Cost

~$0.01 per full run (9 scenarios × ~3 checks each) using Nova Lite.
