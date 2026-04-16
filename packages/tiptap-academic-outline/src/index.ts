// Tiptap Extension for nested-list numbering. Re-exported from
// @bwthomas/outline-numbering's /tiptap subpath so consumers of this suite
// get the full academic outlining kit from a single import. See the README
// fork-notes section for why this barrel is kept broad despite duplicating
// upstream exports.
export { OutlineNumbering, OutlineNumberingOptions } from '@bwthomas/outline-numbering/tiptap';
export {
  OutlineNumberingStrategy,
  OutlineNumberingPluginOptions,
  OUTLINE_NUMBERING_KEY,
  outlineNumberingPlugin,
  computeDecorations,
  alphanumericStrategy,
  harvardStrategy,
  purdueOwlStrategy,
  decimalStrategy,
  legalStrategy,
  arabicStrategy,
  lowerRomanStrategy,
  toRoman,
  toLetter,
} from '@bwthomas/outline-numbering';

export { Citation } from './citation';
export { KeyboardGuards } from './keyboard-guards';
export { AcademicFormatter, AcademicFormatterOptions } from './academic-formatter';
