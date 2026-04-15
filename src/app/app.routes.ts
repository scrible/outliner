import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: ':outlineId', loadComponent: () => import('./outline-editor-tiptap/outline-editor-tiptap.component').then(m => m.OutlineEditorTiptapComponent) },
  { path: '', redirectTo: 'demo', pathMatch: 'full' },
];
