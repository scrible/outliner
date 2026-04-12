import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./outline-editor/outline-editor.component').then(m => m.OutlineEditorComponent) },
];
