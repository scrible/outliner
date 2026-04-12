/**
 * Inlined and adapted from ngx-tiptap v10.1.0 (BubbleMenuDirective)
 * Source: https://github.com/sibiraj-s/ngx-tiptap
 * License: MIT
 *
 * Inlined to decouple from ngx-tiptap's Angular version constraints.
 * See editor.directive.ts for full rationale.
 *
 * Changes from original:
 * - Converted to standalone directive
 * - Replaced `tippyOptions` input with generic `options` for TipTap 3
 *   (TipTap 3 switched from Tippy.js to Floating UI)
 */
import { Directive, ElementRef, Input, OnInit, OnDestroy } from '@angular/core';
import { Editor } from '@tiptap/core';
import { BubbleMenuPlugin } from '@tiptap/extension-bubble-menu';

@Directive({
  selector: 'tiptap-bubble-menu[editor], [tiptapBubbleMenu][editor]',
  standalone: true,
})
export class TiptapBubbleMenuDirective implements OnInit, OnDestroy {
  @Input() editor!: Editor;
  @Input() pluginKey = 'NgxTiptapBubbleMenu';
  @Input() options: Record<string, any> = {};
  @Input() shouldShow: any = null;
  @Input() updateDelay?: number;

  constructor(private elRef: ElementRef<HTMLElement>) {}

  ngOnInit() {
    if (!this.editor) throw new Error('Required: Input `editor`');
    this.editor.registerPlugin(BubbleMenuPlugin({
      pluginKey: this.pluginKey,
      editor: this.editor,
      element: this.elRef.nativeElement,
      shouldShow: this.shouldShow,
      updateDelay: this.updateDelay,
      ...this.options,
    }));
  }

  ngOnDestroy() {
    this.editor.unregisterPlugin(this.pluginKey);
  }
}
