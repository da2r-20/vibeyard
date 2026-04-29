# Customizable Paste Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users change the keyboard shortcut used for paste, app-wide, from the existing Preferences → Shortcuts panel. Default is unchanged (`Cmd+V` on macOS, `Ctrl+V` on Linux/Windows).

**Architecture:** Single cross-platform paste pipeline. Main-process `before-input-event` listener intercepts the configured paste accelerator, prevents Chromium's native handler, and tells the renderer to dispatch. Renderer routes by `document.activeElement`: terminal panes get bracketed-paste-aware PTY writes; native inputs delegate to `webContents.paste()` for proper cursor/undo/IME handling. The Edit menu shows the active binding label without registering its own accelerator.

**Tech Stack:** Electron, TypeScript, Vitest (v8 coverage), xterm.js, existing `ShortcutManager` + `keybindings` preferences.

**Spec:** `docs/superpowers/specs/2026-04-29-customizable-paste-shortcut-design.md`

---

## File Structure

**New files:**
- `src/main/paste-accelerator.ts` — owns the main-side accelerator state, parses Electron `Input` events, installs the `before-input-event` listener.
- `src/main/paste-accelerator.test.ts` — unit tests for accelerator matching.
- `src/renderer/paste-dispatcher.ts` — receives `paste:dispatch` IPC; classifies focus target; routes to terminal-paste or native-paste path.
- `src/renderer/paste-dispatcher.test.ts` — unit tests for `classifyTarget` and the bracketed-paste write helper.

**Modified files:**
- `src/renderer/shortcuts.ts` — add `paste` entry to `SHORTCUT_DEFAULTS` under new `Editing` category.
- `src/renderer/shortcuts.test.ts` — coverage for the new entry.
- `src/main/main.ts` — install `paste-accelerator` listener after window creation.
- `src/main/ipc-handlers.ts` — register `paste:set-accelerator` and `paste:native` channels.
- `src/main/menu.ts` — Edit-menu paste item shows active accelerator label with `registerAccelerator: false`.
- `src/preload/preload.ts` — expose `paste` namespace on `window.vibeyard`.
- `src/renderer/index.ts` — initialize dispatcher, push initial accelerator to main, re-push on `preferences-changed`.
- `src/renderer/components/terminal-utils.ts` — remove the hardcoded Windows Ctrl+V branch (paste is unified through the dispatcher).
- `src/renderer/components/terminal-utils.test.ts` — remove tests for the removed Ctrl+V handler.
- `src/renderer/components/terminal-pane.ts` — drop `writeToPty` argument; expose `writeToFocusedTerminal` and `getFocusedTerminalBracketedPaste`.
- `src/renderer/components/project-terminal.ts` — drop `writeToPty` argument from `attachClipboardCopyHandler` call.

---

### Task 1: Add `paste` entry to SHORTCUT_DEFAULTS

**Files:**
- Modify: `src/renderer/shortcuts.ts:53` (append entry, end of `SHORTCUT_DEFAULTS`)
- Test: `src/renderer/shortcuts.test.ts` (append a new describe block)

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/shortcuts.test.ts` (after the last existing `describe` block):

```ts
describe('paste shortcut', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
    mockAppState.preferences.keybindings = {};
  });

  it('paste shortcut is present in SHORTCUT_DEFAULTS with default CmdOrCtrl+V', async () => {
    const { SHORTCUT_DEFAULTS } = await import('./shortcuts');
    const paste = SHORTCUT_DEFAULTS.find((s) => s.id === 'paste');
    expect(paste).toBeDefined();
    expect(paste!.defaultKeys).toBe('CmdOrCtrl+V');
    expect(paste!.label).toBe('Paste');
    expect(paste!.category).toBe('Editing');
  });

  it('shortcutManager.getKeys returns default for paste when no override', async () => {
    const { shortcutManager } = await import('./shortcuts');
    expect(shortcutManager.getKeys('paste')).toBe('CmdOrCtrl+V');
  });

  it('shortcutManager.getKeys returns override for paste when set', async () => {
    mockAppState.preferences.keybindings = { paste: 'CmdOrCtrl+Shift+V' };
    const { shortcutManager } = await import('./shortcuts');
    expect(shortcutManager.getKeys('paste')).toBe('CmdOrCtrl+Shift+V');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/shortcuts.test.ts`
Expected: 3 new tests fail with `paste` undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/shortcuts.ts`, append one line to `SHORTCUT_DEFAULTS` (currently ending at line 52, before the closing `];` on line 53):

```ts
  { id: 'paste', label: 'Paste', category: 'Editing', defaultKeys: 'CmdOrCtrl+V' },
```

The final array entry just before `];` should now be the paste line.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/shortcuts.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shortcuts.ts src/renderer/shortcuts.test.ts
git commit -m "add paste shortcut entry to SHORTCUT_DEFAULTS"
```

---

### Task 2: Main-process accelerator matching helper (pure function, TDD)

**Files:**
- Create: `src/main/paste-accelerator.ts`
- Test: `src/main/paste-accelerator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/paste-accelerator.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/paste-accelerator.test.ts`
Expected: cannot find module `./paste-accelerator`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/paste-accelerator.ts`:

```ts
import type { BrowserWindow } from 'electron';

export type Platform = NodeJS.Platform;

export interface InputLike {
  type: 'keyDown' | 'keyUp' | string;
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  isComposing?: boolean;
}

interface ParsedAccelerator {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parseAccelerator(accelerator: string, platform: Platform): ParsedAccelerator | null {
  if (!accelerator) return null;
  const parts = accelerator.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  let key = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'cmdorctrl') {
      if (platform === 'darwin') meta = true;
      else ctrl = true;
    } else if (lower === 'ctrl' || lower === 'control') {
      ctrl = true;
    } else if (lower === 'cmd' || lower === 'command' || lower === 'meta') {
      meta = true;
    } else if (lower === 'shift') {
      shift = true;
    } else if (lower === 'alt' || lower === 'option') {
      alt = true;
    } else {
      if (key) return null; // multiple non-modifier keys
      key = part;
    }
  }

  if (!key) return null;
  return { ctrl, meta, shift, alt, key };
}

export function matchesPasteAccelerator(
  input: InputLike,
  accelerator: string,
  platform: Platform = process.platform,
): boolean {
  if (input.type !== 'keyDown') return false;
  if (input.isComposing) return false;

  const parsed = parseAccelerator(accelerator, platform);
  if (!parsed) return false;

  if (parsed.ctrl !== input.control) return false;
  if (parsed.meta !== input.meta) return false;
  if (parsed.shift !== input.shift) return false;
  if (parsed.alt !== input.alt) return false;

  const inputKey = input.key;
  if (inputKey === parsed.key) return true;
  if (inputKey.length === 1 && parsed.key.length === 1
      && inputKey.toLowerCase() === parsed.key.toLowerCase()) return true;
  return false;
}

let currentAccelerator = 'CmdOrCtrl+V';
let listenerInstalled = false;
let installedWindow: BrowserWindow | null = null;

export function setPasteAccelerator(accelerator: string): void {
  currentAccelerator = accelerator || 'CmdOrCtrl+V';
}

export function getPasteAccelerator(): string {
  return currentAccelerator;
}

export function installPasteListener(window: BrowserWindow): void {
  if (listenerInstalled && installedWindow === window) return;
  listenerInstalled = true;
  installedWindow = window;

  window.webContents.on('before-input-event', (event, input) => {
    if (matchesPasteAccelerator(input as InputLike, currentAccelerator)) {
      event.preventDefault();
      window.webContents.send('paste:dispatch');
    }
  });
}

// Test-only: reset module state between tests.
export function _resetForTesting(): void {
  currentAccelerator = 'CmdOrCtrl+V';
  listenerInstalled = false;
  installedWindow = null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/paste-accelerator.test.ts`
Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/paste-accelerator.ts src/main/paste-accelerator.test.ts
git commit -m "add main-process paste accelerator matcher and listener"
```

---

### Task 3: Renderer paste-dispatcher (focus classifier + paste helpers, TDD)

**Files:**
- Create: `src/renderer/paste-dispatcher.ts`
- Test: `src/renderer/paste-dispatcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/paste-dispatcher.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/paste-dispatcher.test.ts`
Expected: cannot find module `./paste-dispatcher`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/paste-dispatcher.ts`:

```ts
export type PasteTarget = 'terminal' | 'input' | 'other';

export function classifyTarget(el: Element | null): PasteTarget {
  if (!el) return 'other';
  if (el.closest('.terminal-pane')) return 'terminal';
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return 'input';
  if ((el as HTMLElement).isContentEditable) return 'input';
  return 'other';
}

export function buildPtyPasteString(text: string, bracketedPasteMode: boolean): string {
  if (!text) return '';
  return bracketedPasteMode ? `\x1b[200~${text}\x1b[201~` : text;
}

type WriteToFocusedTerminal = (data: string) => boolean;
type GetBracketedPaste = () => boolean;

export function createPasteDispatcher(deps: {
  writeToFocusedTerminal: WriteToFocusedTerminal;
  isFocusedTerminalBracketedPaste: GetBracketedPaste;
  pasteNative: () => void;
}) {
  return async function dispatchPaste(): Promise<void> {
    const target = classifyTarget(document.activeElement);
    if (target === 'terminal') {
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }
      const bp = deps.isFocusedTerminalBracketedPaste();
      const data = buildPtyPasteString(text, bp);
      if (data) deps.writeToFocusedTerminal(data);
    } else if (target === 'input') {
      deps.pasteNative();
    }
    // 'other' → no-op
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/paste-dispatcher.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/paste-dispatcher.ts src/renderer/paste-dispatcher.test.ts
git commit -m "add renderer paste dispatcher with focus classifier"
```

---

### Task 4: IPC handlers (`paste:set-accelerator`, `paste:native`)

**Files:**
- Modify: `src/main/ipc-handlers.ts:1-10` (imports), `:225` (insert after `menu:rebuild`)

- [ ] **Step 1: Add imports**

In `src/main/ipc-handlers.ts`, add to the top imports (the line with `import { createAppMenu } from './menu';`):

```ts
import { setPasteAccelerator, installPasteListener } from './paste-accelerator';
```

- [ ] **Step 2: Add IPC handlers**

In `src/main/ipc-handlers.ts`, immediately after the `menu:rebuild` handler (around line 225), insert:

```ts
  ipcMain.handle('paste:set-accelerator', (_event, accelerator: string) => {
    setPasteAccelerator(accelerator);
    const win = BrowserWindow.getAllWindows()[0];
    if (win) installPasteListener(win);
  });

  ipcMain.handle('paste:native', () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.webContents.paste();
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "add paste:set-accelerator and paste:native IPC handlers"
```

---

### Task 5: Expose `paste` namespace in preload

**Files:**
- Modify: `src/preload/preload.ts:120-138` (interface), `:282-302` (implementation)

- [ ] **Step 1: Add the type to the `VibeyardApi` interface**

In `src/preload/preload.ts`, immediately after the `clipboard` block (which currently ends at line 122), insert:

```ts
  paste: {
    setAccelerator(accelerator: string): Promise<void>;
    native(): Promise<void>;
    onDispatch(callback: () => void): () => void;
  };
```

- [ ] **Step 2: Add the implementation**

In `src/preload/preload.ts`, immediately after the `clipboard` implementation (which currently ends at line 284 with `},`), insert:

```ts
  paste: {
    setAccelerator: (accelerator: string) => ipcRenderer.invoke('paste:set-accelerator', accelerator),
    native: () => ipcRenderer.invoke('paste:native'),
    onDispatch: (callback) => onChannel('paste:dispatch', () => callback()),
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.preload.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/preload/preload.ts
git commit -m "expose paste namespace on preload bridge"
```

---

### Task 6: Update Edit menu paste item to display configured accelerator

**Files:**
- Modify: `src/main/menu.ts:1-3` (imports), `:50-69` (Edit submenu)

- [ ] **Step 1: Add import**

In `src/main/menu.ts`, change line 2:

```ts
import { isMac, isWin } from './platform';
```

to:

```ts
import { isMac, isWin } from './platform';
import { getPasteAccelerator } from './paste-accelerator';
```

- [ ] **Step 2: Update Edit submenu — Windows branch**

In `src/main/menu.ts`, replace the Windows Edit-submenu paste line (currently `{ label: 'Paste', click: () => focusedContents()?.paste() },` near line 56) with:

```ts
        {
          label: 'Paste',
          accelerator: getPasteAccelerator(),
          registerAccelerator: false,
          click: () => focusedContents()?.paste(),
        },
```

- [ ] **Step 3: Update Edit submenu — Mac/Linux branch**

In `src/main/menu.ts`, replace the Mac/Linux paste lines (currently `{ role: 'paste' as const },` and `{ role: 'pasteAndMatchStyle' as const },` near lines 65-66) with:

```ts
        {
          label: 'Paste',
          accelerator: getPasteAccelerator(),
          registerAccelerator: false,
          click: () => focusedContents()?.paste(),
        },
        { role: 'pasteAndMatchStyle' as const },
```

(`pasteAndMatchStyle` keeps its default behavior; only the plain Paste item picks up the user accelerator.)

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/menu.ts
git commit -m "show user-configured paste accelerator label on Edit menu"
```

---

### Task 7: Wire paste listener installation in main.ts

**Files:**
- Modify: `src/main/main.ts:1-10` (imports), `:75` (after window creation)

- [ ] **Step 1: Add import**

In `src/main/main.ts`, add to imports (e.g. next to `import { createAppMenu } from './menu';` around line 6):

```ts
import { installPasteListener } from './paste-accelerator';
```

- [ ] **Step 2: Install listener after window creation**

In `src/main/main.ts`, immediately before the closing `}` of `createWindow()` (just after the `mainWindow.on('closed', ...)` block ending around line 75), add:

```ts
  installPasteListener(mainWindow);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/main.ts
git commit -m "install paste accelerator listener on main window creation"
```

---

### Task 8: Wire dispatcher in renderer + push accelerator to main

**Files:**
- Modify: `src/renderer/index.ts:1-10` (imports), `:206-220` (startup + preferences-changed block)

- [ ] **Step 1: Add imports**

In `src/renderer/index.ts`, add to imports near the top:

```ts
import { createPasteDispatcher } from './paste-dispatcher.js';
import { shortcutManager } from './shortcuts.js';
import { writeToFocusedTerminal, getFocusedTerminalBracketedPaste } from './components/terminal-pane.js';
```

(If `shortcutManager` is already imported, skip that line. The two terminal-pane helpers will be added in Task 9; for now this import will not yet resolve until Task 9 adds them — order Task 9 immediately after this task's commit.)

- [ ] **Step 2: Initialize dispatcher and push initial accelerator**

In `src/renderer/index.ts`, immediately after `await appState.load();` (currently line 207), insert:

```ts
  const dispatchPaste = createPasteDispatcher({
    writeToFocusedTerminal,
    isFocusedTerminalBracketedPaste: getFocusedTerminalBracketedPaste,
    pasteNative: () => { window.vibeyard.paste.native().catch(() => {}); },
  });
  window.vibeyard.paste.onDispatch(() => { dispatchPaste().catch(() => {}); });

  const initialPasteAccel = shortcutManager.getKeys('paste') || 'CmdOrCtrl+V';
  await window.vibeyard.paste.setAccelerator(initialPasteAccel);
```

- [ ] **Step 3: Re-push accelerator on `preferences-changed`**

In `src/renderer/index.ts`, find the existing `appState.on('preferences-changed', () => { ... })` block (currently lines 214-220) and add inside its callback, after the existing theme lines:

```ts
    const pasteAccel = shortcutManager.getKeys('paste') || 'CmdOrCtrl+V';
    window.vibeyard.paste.setAccelerator(pasteAccel).catch(() => {});
    window.vibeyard.menu.rebuild(appState.preferences.debugMode ?? false).catch(() => {});
```

- [ ] **Step 4: Defer build verification to Task 9**

The `writeToFocusedTerminal` and `getFocusedTerminalBracketedPaste` exports don't exist yet. Don't run the build until Task 9 is done. Skip to commit.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.ts
git commit -m "wire paste dispatcher and push accelerator to main on prefs change"
```

---

### Task 9: Expose terminal-pane paste helpers; remove hardcoded Windows Ctrl+V

**Files:**
- Modify: `src/renderer/components/terminal-pane.ts` (add two helpers near `setFocused`)
- Modify: `src/renderer/components/terminal-utils.ts:31-79` (remove Windows Ctrl+V branch)

- [ ] **Step 1: Inspect existing terminal-pane state structure**

Read `src/renderer/components/terminal-pane.ts` to confirm the shape of `instances` (the `Map<string, ...>` of session terminals). Each instance should have a `terminal: Terminal` property and the session id; PTY writes go through `window.vibeyard.pty.write(sessionId, data)`. The `focusedSessionId` module-level variable is set by `setFocused`.

- [ ] **Step 2: Add the two new helpers in terminal-pane.ts**

In `src/renderer/components/terminal-pane.ts`, append after the existing `setFocused` function (around line 319):

```ts
/** Returns true if any text was sent to the focused session's PTY. */
export function writeToFocusedTerminal(data: string): boolean {
  if (!focusedSessionId) return false;
  if (!data) return false;
  window.vibeyard.pty.write(focusedSessionId, data);
  return true;
}

/** Returns whether the focused terminal currently has bracketed-paste mode enabled. */
export function getFocusedTerminalBracketedPaste(): boolean {
  if (!focusedSessionId) return false;
  const instance = instances.get(focusedSessionId);
  if (!instance) return false;
  const modes = (instance.terminal as { modes?: { bracketedPasteMode?: boolean } }).modes;
  return !!modes?.bracketedPasteMode;
}
```

- [ ] **Step 3: Remove the hardcoded Windows Ctrl+V handler in terminal-utils.ts**

In `src/renderer/components/terminal-utils.ts`, delete lines 59-72 (the `// Windows: Ctrl+V → async paste clipboard to PTY` block), leaving the surrounding handler code intact. Also remove the now-unused `writeToPty` parameter from `attachClipboardCopyHandler`:

Replace lines 31-35 (the function signature):

```ts
export function attachClipboardCopyHandler(
  terminal: Terminal,
  extend?: ExtraKeyHandler,
  writeToPty?: (data: string) => void
): void {
```

with:

```ts
export function attachClipboardCopyHandler(
  terminal: Terminal,
  extend?: ExtraKeyHandler,
): void {
```

Also update the JSDoc above (lines 18-30) to remove the Ctrl+V/`writeToPty` references — keep only the documentation for the remaining handlers (Cmd/Ctrl+F bubble, Ctrl+Shift+C copy, Windows Ctrl+C copy/SIGINT).

- [ ] **Step 4: Update both callers of `attachClipboardCopyHandler`**

Two callers pass `writeToPty` as a third argument and must be updated. First confirm via grep:

```bash
grep -rn "attachClipboardCopyHandler" src/renderer/components/
```

Expected matches: `terminal-pane.ts:105` and `project-terminal.ts:87`.

In `src/renderer/components/terminal-pane.ts`, replace lines 102-111:

```ts
  const writeToPty = (data: string) => window.vibeyard.pty.write(sessionId, data);

  // Send CSI u encoding for Shift+Enter so Claude CLI treats it as newline
  attachClipboardCopyHandler(terminal, (e) => {
    if (e.shiftKey && e.key === 'Enter') {
      if (e.type === 'keydown') window.vibeyard.pty.write(sessionId, '\x1b[13;2u');
      e.preventDefault();
      return false;
    }
  }, writeToPty);
```

with:

```ts
  // Send CSI u encoding for Shift+Enter so Claude CLI treats it as newline
  attachClipboardCopyHandler(terminal, (e) => {
    if (e.shiftKey && e.key === 'Enter') {
      if (e.type === 'keydown') window.vibeyard.pty.write(sessionId, '\x1b[13;2u');
      e.preventDefault();
      return false;
    }
  });
```

In `src/renderer/components/project-terminal.ts:87`, replace:

```ts
  attachClipboardCopyHandler(terminal, undefined, (data) => window.vibeyard.pty.write(sessionId, data));
```

with:

```ts
  attachClipboardCopyHandler(terminal);
```

- [ ] **Step 5: Update terminal-utils.test.ts — remove Ctrl+V tests**

In `src/renderer/components/terminal-utils.test.ts`, the Windows-section `describe` block contains tests for the removed Ctrl+V behavior. Delete the following test cases:

- `'Ctrl+V returns false and pastes clipboard to PTY'`
- `'Ctrl+V calls preventDefault to suppress native paste event'`
- `'Ctrl+V wraps text in bracketed paste escapes when mode is enabled'`
- `'Ctrl+V does not paste empty clipboard'`
- `'Ctrl+V without writeToPty falls through to default'`
- `'Ctrl+V does not call writeToPty on keyup'`

Also delete the import / use of `mockClipboardRead` if it becomes unused after removing those tests, and any test in this file that passes `writeToPty` as the third argument to `attachClipboardCopyHandler` (the signature no longer accepts it).

If the only remaining content of the Windows `describe` block is `Ctrl+Shift+C still works for copy`, keep that test.

(Bracketed-paste behavior is now covered by `paste-dispatcher.test.ts > buildPtyPasteString`.)

- [ ] **Step 6: Verify the renderer builds**

Run: `npm run build`
Expected: build succeeds — main, preload, and renderer all compile.

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: all tests pass (the new tests from Tasks 1-3 included; Ctrl+V tests removed).

- [ ] **Step 8: Commit**

Stage all modified files (verify with `git status` first):

```bash
git add src/renderer/components/terminal-pane.ts \
        src/renderer/components/terminal-utils.ts \
        src/renderer/components/terminal-utils.test.ts \
        src/renderer/components/project-terminal.ts
git commit -m "unify paste through dispatcher; remove hardcoded Windows Ctrl+V"
```

---

### Task 10: Manual smoke test on Linux

**Files:** none (verification only)

- [ ] **Step 1: Launch the app**

Run: `npm start`
Expected: app launches without errors in the terminal output.

- [ ] **Step 2: Verify default paste in terminal**

1. Copy some text (`echo hello | xclip -selection clipboard` or use any other source).
2. Open or create a session terminal.
3. Press `Ctrl+V`.
4. Expected: the text appears at the shell prompt. If the shell uses bracketed paste (most modern shells do), the text is wrapped properly with no spurious Ctrl+V control characters.

- [ ] **Step 3: Verify default paste in board task modal**

1. Open Kanban view, click `+` to create a task.
2. Click into the title input.
3. Press `Ctrl+V`.
4. Expected: clipboard text inserted at cursor. Cursor advances correctly. Undo (`Ctrl+Z`) reverts the paste.

- [ ] **Step 4: Rebind paste to `Ctrl+Shift+V`**

1. Open Preferences → Shortcuts.
2. Find `Editing → Paste`.
3. Click Record, press `Ctrl+Shift+V`, save.
4. Expected: the row updates to show the new binding.

- [ ] **Step 5: Verify rebinding takes effect**

1. In a terminal, press `Ctrl+V`. Expected: nothing pastes; the `^V` literal is **not** sent to the shell either (because the renderer's xterm key handler suppresses it via `shortcutManager.matchesAnyShortcut`).
2. Press `Ctrl+Shift+V`. Expected: clipboard text pastes into terminal.
3. Click into a board task input. Press `Ctrl+V` — nothing pastes. Press `Ctrl+Shift+V` — paste works.

- [ ] **Step 6: Verify Edit menu shows the binding**

1. Open the application's Edit menu.
2. Expected: the Paste item displays `Ctrl+Shift+V` (or the platform-equivalent symbol) next to it.

- [ ] **Step 7: Reset to default**

1. In Preferences → Shortcuts → Paste, click Reset.
2. Verify `Ctrl+V` works again in both terminal and inputs.

- [ ] **Step 8: Verify Linux primary-selection middle-click paste still works**

1. Select some text in the terminal with the mouse (it auto-copies to primary selection).
2. Click somewhere else in the terminal, then middle-click.
3. Expected: selected text is pasted. (This path is independent of our changes — regression check only.)

- [ ] **Step 9: Commit no further changes**

If any issues surface, file fixes as new commits before declaring success. Do not amend prior commits.

---

## Mac / Windows Verification (Deferred)

Implementer is on Linux. The following must be verified before merge by someone with access to those platforms; flag in PR description:

- **macOS:** repeat Steps 2-7 of Task 10 with default `Cmd+V`. Specifically check no double-paste in inputs, and that `pasteAndMatchStyle` (Cmd+Shift+V default) still works as a separate menu item.
- **Windows:** repeat Steps 2-7 of Task 10 with default `Ctrl+V`. Specifically watch for double-paste in board task modal inputs (the original Electron-on-Windows quirk this design works around).

---

## Definition of Done

- All tests in `npm test` pass.
- `npm run build` succeeds.
- Manual smoke test (Task 10) on Linux passes every step.
- All commits land on `feature/customizable-paste-shortcut` (branched from `main`).
- PR description calls out Mac/Windows verification gap.
