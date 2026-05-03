// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./state.js', () => ({
  appState: { preferences: {} },
}));

import { classifyTarget, buildPtyPasteString } from './paste-dispatcher';

describe('classifyTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns "terminal" for an element inside .terminal-pane', () => {
    document.body.innerHTML = '<div class="terminal-pane"><canvas id="t"></canvas></div>';
    const el = document.getElementById('t')!;
    expect(classifyTarget(el)).toBe('terminal');
  });

  it('returns "input" for an <input>', () => {
    document.body.innerHTML = '<input id="i" type="text" />';
    const el = document.getElementById('i')!;
    expect(classifyTarget(el)).toBe('input');
  });

  it('returns "input" for a <textarea>', () => {
    document.body.innerHTML = '<textarea id="t"></textarea>';
    const el = document.getElementById('t')!;
    expect(classifyTarget(el)).toBe('input');
  });

  it('returns "input" for contenteditable', () => {
    document.body.innerHTML = '<div id="c" contenteditable="true">x</div>';
    const el = document.getElementById('c')!;
    expect(classifyTarget(el)).toBe('input');
  });

  it('returns "other" for body', () => {
    expect(classifyTarget(document.body)).toBe('other');
  });

  it('returns "other" for null', () => {
    expect(classifyTarget(null)).toBe('other');
  });
});

describe('buildPtyPasteString', () => {
  it('returns plain text when bracketed paste mode is off', () => {
    expect(buildPtyPasteString('hello', false)).toBe('hello');
  });

  it('wraps text in bracketed-paste sequences when bracketed paste mode is on', () => {
    expect(buildPtyPasteString('hello', true)).toBe('\x1b[200~hello\x1b[201~');
  });

  it('returns empty string for empty input regardless of mode', () => {
    expect(buildPtyPasteString('', false)).toBe('');
    expect(buildPtyPasteString('', true)).toBe('');
  });
});
