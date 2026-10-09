import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { createElement } from 'react';
// tsx defaults to the classic JSX transform without a package tsconfig.
(globalThis as typeof globalThis & { React: typeof React }).React = React;
import { renderToStaticMarkup } from 'react-dom/server';
import KeyDrawer from './KeyDrawer.tsx';
import { DOWNSTREAM_KEYS } from '../../data/prototype.ts';
const noop = () => {};
for (const mode of ['create', { id: DOWNSTREAM_KEYS[0].id }] as const) {
  test(`key drawer opens ${typeof mode === 'string' ? 'create' : 'edit'} without undefined scope state`, () => {
    const markup = renderToStaticMarkup(createElement(KeyDrawer, { mode, keysSource: [...DOWNSTREAM_KEYS], onClose: noop, onFlash: noop, onSaved: async () => {} }));
    assert.match(markup, /<aside/);
    assert.match(markup, /sk-/);
    assert.doesNotMatch(markup, /models:read|requests:write|usage:read/);
  });
}
