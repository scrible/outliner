import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'tiptap-eval', loadComponent: () => import('./tiptap-eval/tiptap-eval.component').then(m => m.TiptapEvalComponent) },
  { path: '', loadComponent: () => import('./outline-editor/outline-editor.component').then(m => m.OutlineEditorComponent) },
];
