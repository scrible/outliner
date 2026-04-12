import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./outline-editor-tiptap/outline-editor-tiptap.component').then(m => m.OutlineEditorTiptapComponent) },
];
