import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('paste-accelerator stateful API', () => {
  beforeEach(async () => {
    const mod = await import('./paste-accelerator');
    mod._resetForTesting();
  });

  it('getPasteAccelerator returns default initially', async () => {
    const { getPasteAccelerator } = await import('./paste-accelerator');
    expect(getPasteAccelerator()).toBe('CmdOrCtrl+V');
  });

  it('setPasteAccelerator round-trips via getPasteAccelerator', async () => {
    const { setPasteAccelerator, getPasteAccelerator } = await import('./paste-accelerator');
    setPasteAccelerator('CmdOrCtrl+Shift+V');
    expect(getPasteAccelerator()).toBe('CmdOrCtrl+Shift+V');
  });

  it('setPasteAccelerator with empty string falls back to default', async () => {
    const { setPasteAccelerator, getPasteAccelerator } = await import('./paste-accelerator');
    setPasteAccelerator('CmdOrCtrl+Shift+V');
    setPasteAccelerator('');
    expect(getPasteAccelerator()).toBe('CmdOrCtrl+V');
  });

  it('_resetForTesting restores the default accelerator', async () => {
    const { setPasteAccelerator, getPasteAccelerator, _resetForTesting } = await import('./paste-accelerator');
    setPasteAccelerator('Ctrl+Shift+V');
    _resetForTesting();
    expect(getPasteAccelerator()).toBe('CmdOrCtrl+V');
  });

  it('installPasteListener registers a before-input-event handler exactly once for the same window', async () => {
    const { installPasteListener } = await import('./paste-accelerator');
    const on = vi.fn();
    const send = vi.fn();
    const fakeWindow = { webContents: { on, send } } as unknown as Parameters<typeof installPasteListener>[0];
    installPasteListener(fakeWindow);
    installPasteListener(fakeWindow);
    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith('before-input-event', expect.any(Function));
  });

  it('installPasteListener does not attach a second listener to a different window once one is installed', async () => {
    const { installPasteListener } = await import('./paste-accelerator');
    const on1 = vi.fn();
    const on2 = vi.fn();
    const w1 = { webContents: { on: on1, send: vi.fn() } } as unknown as Parameters<typeof installPasteListener>[0];
    const w2 = { webContents: { on: on2, send: vi.fn() } } as unknown as Parameters<typeof installPasteListener>[0];
    installPasteListener(w1);
    installPasteListener(w2);
    expect(on1).toHaveBeenCalledTimes(1);
    expect(on2).not.toHaveBeenCalled();
  });

  it('on matching keydown the listener prevents default and sends paste:dispatch', async () => {
    const { installPasteListener, setPasteAccelerator } = await import('./paste-accelerator');
    setPasteAccelerator('CmdOrCtrl+V');
    let captured: ((event: { preventDefault: () => void }, input: unknown) => void) | null = null;
    const on = vi.fn((_evt: string, handler: (event: { preventDefault: () => void }, input: unknown) => void) => {
      captured = handler;
    });
    const send = vi.fn();
    const fakeWindow = { webContents: { on, send } } as unknown as Parameters<typeof installPasteListener>[0];
    installPasteListener(fakeWindow);

    const preventDefault = vi.fn();
    captured!({ preventDefault }, {
      type: 'keyDown',
      key: 'V',
      control: true,
      meta: false,
      shift: false,
      alt: false,
      isComposing: false,
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('paste:dispatch');
  });

  it('on non-matching keydown the listener does not prevent default or send', async () => {
    const { installPasteListener } = await import('./paste-accelerator');
    let captured: ((event: { preventDefault: () => void }, input: unknown) => void) | null = null;
    const on = vi.fn((_evt: string, handler: (event: { preventDefault: () => void }, input: unknown) => void) => {
      captured = handler;
    });
    const send = vi.fn();
    const fakeWindow = { webContents: { on, send } } as unknown as Parameters<typeof installPasteListener>[0];
    installPasteListener(fakeWindow);

    const preventDefault = vi.fn();
    captured!({ preventDefault }, {
      type: 'keyDown',
      key: 'A',
      control: true,
      meta: false,
      shift: false,
      alt: false,
      isComposing: false,
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
