import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);

// Spec files are imported explicitly. Angular 17's karma builder runs on
// webpack 5, where `require.context` is unavailable, so globbing at runtime
// isn't viable. When you add a new *.spec.ts, add its import below.
import '../packages/outline-numbering/src/plugin.spec';
import '../packages/outline-numbering/src/strategies.spec';
