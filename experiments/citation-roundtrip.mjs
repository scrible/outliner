/**
 * citation-roundtrip.mjs
 *
 * Validates that citation node attributes survive a Yjs binary round-trip.
 * Creates a Y.Doc with an XmlFragment containing a citation XmlElement,
 * encodes to binary, decodes into a fresh Y.Doc, and asserts all attributes
 * are preserved.
 */

import * as Y from 'yjs';

const CITATION_ATTRS = {
  sourceUrl:    'https://example.com/article/123',
  sourceTitle:  'The Importance of Round-Trip Fidelity',
  sourceAuthor: 'Jane Doe',
  indent:       '2',
};

// ── Step 1: Create source doc ────────────────────────────────────────────────

const srcDoc = new Y.Doc();
const fragment = srcDoc.getXmlFragment('prosemirror');

// Insert a citation XmlElement with attributes
const citation = new Y.XmlElement('citation');
for (const [key, value] of Object.entries(CITATION_ATTRS)) {
  citation.setAttribute(key, value);
}

// Give it text content too, to be thorough
const textNode = new Y.XmlText('Quoted passage from the source.');
citation.insert(0, [textNode]);

fragment.insert(0, [citation]);

console.log('Source doc created.');
console.log('  Fragment length:', fragment.length);
console.log('  Citation attrs:', citation.getAttributes());
console.log('  Citation text:', citation.toString());

// ── Step 2: Encode to binary ─────────────────────────────────────────────────

const update = Y.encodeStateAsUpdate(srcDoc);
console.log(`\nEncoded state: ${update.byteLength} bytes`);

// ── Step 3: Apply to a fresh doc ─────────────────────────────────────────────

const dstDoc = new Y.Doc();
Y.applyUpdate(dstDoc, update);

const dstFragment = dstDoc.getXmlFragment('prosemirror');
console.log('\nDestination doc hydrated.');
console.log('  Fragment length:', dstFragment.length);

// ── Step 4: Read back and verify ─────────────────────────────────────────────

let pass = true;

if (dstFragment.length !== 1) {
  console.error(`FAIL: expected 1 child in fragment, got ${dstFragment.length}`);
  pass = false;
} else {
  const dstCitation = dstFragment.get(0);
  console.log('  Node name:', dstCitation.nodeName);

  const recoveredAttrs = dstCitation.getAttributes();
  console.log('  Recovered attrs:', recoveredAttrs);

  for (const [key, expected] of Object.entries(CITATION_ATTRS)) {
    const actual = recoveredAttrs[key];
    if (actual !== expected) {
      console.error(`FAIL: ${key} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      pass = false;
    }
  }

  // Check text content
  const text = dstCitation.toString();
  if (!text.includes('Quoted passage')) {
    console.error(`FAIL: text content lost — got ${JSON.stringify(text)}`);
    pass = false;
  }
}

// ── Result ────────────────────────────────────────────────────────────────────

console.log(pass ? '\nPASS — all citation attributes survived the round-trip.' : '\nFAIL — see errors above.');
process.exit(pass ? 0 : 1);
