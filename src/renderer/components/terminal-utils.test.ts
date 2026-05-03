import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMatchesAnyShortcut, mockPlatform, mockPreferences, webglState } = vi.hoisted(() => ({
  mockMatchesAnyShortcut: vi.fn(() => false),
  mockPlatform: { isMac: false, isWin: false, isLinux: true },
  mockPreferences: { copyOnSelect: false } as { copyOnSelect: boolean },
  webglState: {
    shouldThrow: false,
    lastInstance: null as null | { dispose: ReturnType<typeof vi.fn>; fireContextLoss: () => void },
  },
}));
vi.mock('../shortcuts.js', () => ({
  shortcutManager: { matchesAnyShortcut: (...args: unknown[]) => mockMatchesAnyShortcut(...args) },
}));
vi.mock('../platform.js', () => ({
  get isMac() { return mockPlatform.isMac; },
  get isWin() { return mockPlatform.isWin; },
  get isLinux() { return mockPlatform.isLinux; },
}));
vi.mock('../state.js', () => ({
  appState: { get preferences() { return mockPreferences; } },
}));
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    private listener: (() => void) | null = null;
    dispose = vi.fn();
    onContextLoss = (listener: () => void) => {
      this.listener = listener;
      return { dispose() {} };
    };
    constructor() {
      if (webglState.shouldThrow) throw new Error('no webgl');
      webglState.lastInstance = {
        dispose: this.dispose,
        fireContextLoss: () => this.listener?.(),
      };
    }
  },
}));

import { attachClipboardCopyHandler, attachCopyOnSelect, loadWebglWithFallback } from './terminal-utils.js';

const mockClipboardWrite = vi.fn().mockResolvedValue(undefined);
const mockVibeyardClipboardWrite = vi.fn().mockResolvedValue(undefined);

class FakeTerminal {
  private keyHandler: ((e: KeyboardEvent) => boolean) | null = null;
  private selectionListener: (() => void) | null = null;
  private _selection = '';

  attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean): void {
    this.keyHandler = handler;
  }
  simulateKey(event: Partial<KeyboardEvent>): boolean {
    return this.keyHandler ? this.keyHandler(event as KeyboardEvent) : true;
  }
  onSelectionChange(listener: () => void): { dispose(): void } {
    this.selectionListener = listener;
    return { dispose: () => { this.selectionListener = null; } };
  }
  fireSelectionChange(): void { this.selectionListener?.(); }
  getSelection(): string { return this._selection; }
  setSelection(s: string): void { this._selection = s; }
}

function stubPlatform(platform: string) {
  vi.stubGlobal('navigator', {
    platform,
    clipboard: { writeText: mockClipboardWrite },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMatchesAnyShortcut.mockReturnValue(false);
  mockPreferences.copyOnSelect = false;
  vi.stubGlobal('window', { vibeyard: { clipboard: { write: mockVibeyardClipboardWrite } } });
});

describe('attachClipboardCopyHandler (macOS)', () => {
  beforeEach(() => {
    stubPlatform('MacIntel');
    mockPlatform.isMac = true;
    mockPlatform.isWin = false;
  });

  it('copies selected text to clipboard on Ctrl+Shift+C keydown', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    terminal.setSelection('hello');
    terminal.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keydown' });

    expect(mockClipboardWrite).toHaveBeenCalledWith('hello');
  });

  it('does not copy on keyup', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    terminal.setSelection('hello');
    terminal.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keyup' });

    expect(mockClipboardWrite).not.toHaveBeenCalled();
  });

  it('does not copy when nothing is selected', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    terminal.setSelection('');
    terminal.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keydown' });

    expect(mockClipboardWrite).not.toHaveBeenCalled();
  });

  it('returns false on Ctrl+Shift+C to prevent default', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    const result = terminal.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keydown' });

    expect(result).toBe(false);
  });

  it('returns false on Ctrl+F to let document handle search', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    const result = terminal.simulateKey({ ctrlKey: true, key: 'f', type: 'keydown' });

    expect(result).toBe(false);
  });

  it('returns true for unhandled keys', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    const result = terminal.simulateKey({ key: 'a', type: 'keydown' });

    expect(result).toBe(true);
  });

  it('delegates unhandled keys to extend handler', () => {
    const terminal = new FakeTerminal();
    const extend = vi.fn().mockReturnValue(false);
    attachClipboardCopyHandler(terminal as any, extend);

    terminal.simulateKey({ key: 'Enter', shiftKey: true, type: 'keydown' });

    expect(extend).toHaveBeenCalled();
  });

  it('returns true when extend handler returns undefined', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any, () => undefined);

    const result = terminal.simulateKey({ key: 'a', type: 'keydown' });

    expect(result).toBe(true);
  });

  it('does not intercept Ctrl+C (lets xterm send SIGINT)', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    terminal.setSelection('hello');
    const result = terminal.simulateKey({ ctrlKey: true, key: 'c', type: 'keydown' });

    expect(result).toBe(true);
    expect(mockClipboardWrite).not.toHaveBeenCalled();
  });

});

describe('attachClipboardCopyHandler (Windows)', () => {
  beforeEach(() => {
    stubPlatform('Win32');
    mockPlatform.isMac = false;
    mockPlatform.isWin = true;
  });

  it('Ctrl+C copies selection and returns false', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    terminal.setSelection('selected text');
    const result = terminal.simulateKey({ ctrlKey: true, key: 'c', type: 'keydown' });

    expect(result).toBe(false);
    expect(mockClipboardWrite).toHaveBeenCalledWith('selected text');
  });

  it('Ctrl+C without selection returns true (SIGINT passthrough)', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    terminal.setSelection('');
    const result = terminal.simulateKey({ ctrlKey: true, key: 'c', type: 'keydown' });

    expect(result).toBe(true);
    expect(mockClipboardWrite).not.toHaveBeenCalled();
  });

  it('Ctrl+C does not copy on keyup', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    terminal.setSelection('text');
    const result = terminal.simulateKey({ ctrlKey: true, key: 'c', type: 'keyup' });

    expect(result).toBe(false);
    expect(mockClipboardWrite).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+C still works for copy', () => {
    const terminal = new FakeTerminal();
    attachClipboardCopyHandler(terminal as any);

    terminal.setSelection('shift-copy');
    const result = terminal.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keydown' });

    expect(result).toBe(false);
    expect(mockClipboardWrite).toHaveBeenCalledWith('shift-copy');
  });
});

describe('attachClipboardCopyHandler app shortcut suppression', () => {
  beforeEach(() => {
    stubPlatform('Win32');
    mockPlatform.isMac = false;
    mockPlatform.isWin = true;
  });

  it('returns false when key matches a registered app shortcut', () => {
    const terminal = new FakeTerminal();
    mockMatchesAnyShortcut.mockReturnValue(true);
    attachClipboardCopyHandler(terminal as any);

    const result = terminal.simulateKey({ ctrlKey: true, key: 'j', type: 'keydown' });

    expect(result).toBe(false);
  });

  it('falls through to default when key does not match any shortcut', () => {
    const terminal = new FakeTerminal();
    mockMatchesAnyShortcut.mockReturnValue(false);
    attachClipboardCopyHandler(terminal as any);

    const result = terminal.simulateKey({ key: 'a', type: 'keydown' });

    expect(result).toBe(true);
  });
});

describe('attachCopyOnSelect', () => {
  it('does not write to clipboard when copyOnSelect preference is off', () => {
    const terminal = new FakeTerminal();
    attachCopyOnSelect(terminal as any);

    terminal.setSelection('hello');
    terminal.fireSelectionChange();

    expect(mockVibeyardClipboardWrite).not.toHaveBeenCalled();
  });

  it('writes selection to clipboard when copyOnSelect is on and selection is non-empty', () => {
    mockPreferences.copyOnSelect = true;
    const terminal = new FakeTerminal();
    attachCopyOnSelect(terminal as any);

    terminal.setSelection('selected');
    terminal.fireSelectionChange();

    expect(mockVibeyardClipboardWrite).toHaveBeenCalledWith('selected');
  });

  it('does not write to clipboard when copyOnSelect is on but selection is empty', () => {
    mockPreferences.copyOnSelect = true;
    const terminal = new FakeTerminal();
    attachCopyOnSelect(terminal as any);

    terminal.setSelection('');
    terminal.fireSelectionChange();

    expect(mockVibeyardClipboardWrite).not.toHaveBeenCalled();
  });
});

describe('loadWebglWithFallback', () => {
  beforeEach(() => {
    webglState.shouldThrow = false;
    webglState.lastInstance = null;
  });

  it('loads the addon and subscribes to onContextLoss', () => {
    const terminal = { loadAddon: vi.fn() };
    loadWebglWithFallback(terminal as any);

    expect(terminal.loadAddon).toHaveBeenCalledTimes(1);
    expect(webglState.lastInstance).not.toBeNull();
  });

  it('disposes the addon when the WebGL context is lost', () => {
    const terminal = { loadAddon: vi.fn() };
    loadWebglWithFallback(terminal as any);

    webglState.lastInstance!.fireContextLoss();

    expect(webglState.lastInstance!.dispose).toHaveBeenCalledTimes(1);
  });

  it('falls back silently when WebGL is unavailable', () => {
    webglState.shouldThrow = true;
    const terminal = { loadAddon: vi.fn() };

    expect(() => loadWebglWithFallback(terminal as any)).not.toThrow();
    expect(terminal.loadAddon).not.toHaveBeenCalled();
  });
});
