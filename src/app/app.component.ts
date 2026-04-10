import { Component } from '@angular/core';
import { OutlineEditorComponent } from './outline-editor/outline-editor.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [OutlineEditorComponent],
  template: `<app-outline-editor />`,
  styles: [`:host { display: block; height: 100vh; }`]
})
export class AppComponent {}
