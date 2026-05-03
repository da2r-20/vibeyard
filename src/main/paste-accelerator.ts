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
