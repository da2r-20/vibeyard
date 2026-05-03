import { describe, it, expect } from 'vitest';
import { matchesPasteAccelerator } from './paste-accelerator';

type Input = {
  type: 'keyDown' | 'keyUp';
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  isComposing?: boolean;
};

function makeInput(over: Partial<Input>): Input {
  return {
    type: 'keyDown',
    key: 'V',
    control: false,
    meta: false,
    shift: false,
    alt: false,
    isComposing: false,
    ...over,
  };
}

describe('matchesPasteAccelerator', () => {
  it('matches Ctrl+V on Linux/Windows when accelerator is CmdOrCtrl+V', () => {
    const input = makeInput({ control: true, key: 'V' });
    expect(matchesPasteAccelerator(input, 'CmdOrCtrl+V', 'linux')).toBe(true);
    expect(matchesPasteAccelerator(input, 'CmdOrCtrl+V', 'win32')).toBe(true);
  });

  it('matches Cmd+V on macOS when accelerator is CmdOrCtrl+V', () => {
    const input = makeInput({ meta: true, key: 'V' });
    expect(matchesPasteAccelerator(input, 'CmdOrCtrl+V', 'darwin')).toBe(true);
  });

  it('does not match Ctrl+V on macOS when accelerator is CmdOrCtrl+V', () => {
    const input = makeInput({ control: true, key: 'V' });
    expect(matchesPasteAccelerator(input, 'CmdOrCtrl+V', 'darwin')).toBe(false);
  });

  it('matches Ctrl+Shift+V exactly', () => {
    const input = makeInput({ control: true, shift: true, key: 'V' });
    expect(matchesPasteAccelerator(input, 'Ctrl+Shift+V', 'linux')).toBe(true);
  });

  it('does not match when extra modifier present', () => {
    const input = makeInput({ control: true, shift: true, key: 'V' });
    expect(matchesPasteAccelerator(input, 'CmdOrCtrl+V', 'linux')).toBe(false);
  });

  it('does not match when modifier missing', () => {
    const input = makeInput({ key: 'V' });
    expect(matchesPasteAccelerator(input, 'CmdOrCtrl+V', 'linux')).toBe(false);
  });

  it('case-insensitive on letter keys', () => {
    const input = makeInput({ control: true, key: 'v' });
    expect(matchesPasteAccelerator(input, 'CmdOrCtrl+V', 'linux')).toBe(true);
  });

  it('only matches keyDown events', () => {
    const input = makeInput({ type: 'keyUp', control: true, key: 'V' });
    expect(matchesPasteAccelerator(input, 'CmdOrCtrl+V', 'linux')).toBe(false);
  });

  it('does not match when isComposing is true (IME)', () => {
    const input = makeInput({ control: true, key: 'V', isComposing: true });
    expect(matchesPasteAccelerator(input, 'CmdOrCtrl+V', 'linux')).toBe(false);
  });

  it('returns false for empty accelerator', () => {
    const input = makeInput({ control: true, key: 'V' });
    expect(matchesPasteAccelerator(input, '', 'linux')).toBe(false);
  });

  it('returns false for malformed accelerator', () => {
    const input = makeInput({ control: true, key: 'V' });
    expect(matchesPasteAccelerator(input, '+++', 'linux')).toBe(false);
  });
});
