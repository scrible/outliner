/**
 * Inlined and adapted from ngx-tiptap v10.1.0 (EditorDirective)
 * Source: https://github.com/sibiraj-s/ngx-tiptap
 * License: MIT
 *
 * Inlined to decouple from ngx-tiptap's Angular version constraints
 * (v10 requires Angular 17 + TipTap 2; v14 requires Angular 20 + TipTap 3).
 * This allows us to use TipTap 3 with Angular 17.
 *
 * Changes from original:
 * - Converted to standalone directive
 * - Removed NG_VALUE_ACCESSOR (we don't use reactive forms binding)
 * - Updated setContent() signature for TipTap 3: (value, false) → (value, { emitUpdate: false })
 */
import { Directive, ElementRef, Input, Renderer2, ChangeDetectorRef, OnInit, AfterViewInit } from '@angular/core';
import { Editor } from '@tiptap/core';

@Directive({
  selector: 'tiptap[editor], [tiptap][editor], [tiptapEditor][editor]',
  standalone: true,
})
export class TiptapEditorDirective implements OnInit, AfterViewInit {
  @Input() editor!: Editor;

  constructor(
    private elRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    if (!this.editor) throw new Error('Required: Input `editor`');
    const { innerHTML } = this.elRef.nativeElement;
    this.elRef.nativeElement.innerHTML = '';
    // TipTap 3: options.element can be Element | { mount: HTMLElement } | function
    const editorEl = this.editor.options.element as any;
    const sourceEl: HTMLElement | null = editorEl instanceof HTMLElement ? editorEl
      : editorEl?.mount instanceof HTMLElement ? editorEl.mount : null;
    if (sourceEl) {
      this.elRef.nativeElement.append(...Array.from(sourceEl.childNodes));
    }
    this.editor.setOptions({ element: this.elRef.nativeElement });
    if (innerHTML) {
      this.editor.chain().setContent(innerHTML, { emitUpdate: false } as any).run();
    }
    this.editor.on('selectionUpdate', () => this.cdr.markForCheck());
  }

  ngAfterViewInit() {
    this.cdr.detectChanges();
  }
}
