# Customizable Paste Shortcut — Design

**Date:** 2026-04-29
**Branch:** `feature/customizable-paste-shortcut`
**Status:** Approved (pending user spec review)

## Goal

Let users change the keyboard shortcut used for paste, app-wide, from the existing Preferences → Shortcuts panel. Default behavior is unchanged (`Cmd+V` on macOS, `Ctrl+V` on Linux/Windows).

## Non-Goals

- Customizing copy or cut shortcuts (paste only).
- Multiple paste bindings simultaneously (one configurable shortcut, matching every other entry in `SHORTCUT_DEFAULTS`).
- File / image paste behavior changes — text only for the terminal path; native input path delegates to Chromium and inherits whatever it already does for non-text.
- Browser-tab webview internal paste behavior.
- Linux X11 primary-selection middle-click paste — unaffected by this change.

## Architecture

### New shortcut entry

Add one entry to `SHORTCUT_DEFAULTS` in `src/renderer/shortcuts.ts`:

```ts
{ id: 'paste', label: 'Paste', category: 'Editing', defaultKeys: 'CmdOrCtrl+V' }
```

No existing category fits cleanly (existing categories are `Sessions`, `Panels`, `Search & Help`), so add a new `Editing` category. The Preferences → Shortcuts UI in `preferences-modal.ts` iterates `SHORTCUT_DEFAULTS` already, so no UI components change.

### New main-process module

`src/main/paste-accelerator.ts` owns:

- The currently configured paste accelerator (Electron `Accelerator` string).
- A `before-input-event` listener attached to the BrowserWindow's webContents.
- A function to update the configured accelerator without rebuilding the window.

The listener parses each `Input` event into a normalized accelerator string (e.g. `Ctrl+Shift+V`) and compares to the configured one. On match (and not in IME composition):

1. `event.preventDefault()` — stops Chromium's native handler.
2. `mainWindow.webContents.send('paste:dispatch')` — hands off to renderer.

### IPC

New `paste` namespace exposed via the preload bridge:

| Channel | Direction | Purpose |
|---|---|---|
| `paste:set-accelerator` | renderer → main | Push the active accelerator. Sent at startup and whenever the user changes it. |
| `paste:dispatch` | main → renderer | Notify renderer that a paste was triggered; renderer decides where it lands. |
| `paste:native` | renderer → main | Renderer asks main to call `webContents.paste()` for the focused input. |

### Renderer dispatch

In the renderer, a top-level handler subscribes to `paste:dispatch`. It inspects `document.activeElement`:

- **Terminal pane** (xterm canvas / its container) → existing PTY paste path: `navigator.clipboard.readText()` + write to PTY with bracketed-paste handling.
- **Native input** (`<input>`, `<textarea>`, contenteditable) → call `paste:native` IPC; main calls `mainWindow.webContents.paste()` so Chromium's native paste runs (cursor position, undo, IME all preserved).
- **Other** → no-op.

The hardcoded Windows `Ctrl+V` handler at `src/renderer/components/terminal-utils.ts:59-72` is **removed**. The terminal paste path is unified through `paste:dispatch`.

### Edit menu integration

`src/main/menu.ts` Edit-menu items get the active accelerator string for display only:

- `accelerator: <user-key>`
- `registerAccelerator: false`

The menu shows the binding label but does not register it as a global accelerator (avoids double-firing). When the user changes the shortcut, the renderer triggers a menu rebuild via the existing `menu:rebuild` IPC handler (`src/main/ipc-handlers.ts:223`).

### Preference storage

Reuses the existing `keybindings: Record<string, string>` field on `Preferences` (`src/shared/types.ts`). The `paste` shortcut id is just one more entry. Persistence and the override mechanism (`shortcutManager.setOverride`, `getKeys`) work unchanged.

## Data Flow

1. **App start.** Renderer reads `preferences.keybindings.paste` (falling back to default `CmdOrCtrl+V`) and sends `paste:set-accelerator` to main.
2. **Listener install.** Main stores the accelerator and ensures the `before-input-event` listener is attached.
3. **Keystroke.** User presses a key. Main's listener checks for a match — if no match, returns; if matched and not IME-composing, prevents default and sends `paste:dispatch`.
4. **Renderer routing.** Renderer classifies `document.activeElement`:
   - Terminal: read clipboard, write to PTY with bracketed-paste.
   - Input: send `paste:native` to main.
   - Other: ignore.
5. **Native input paste.** Main receives `paste:native`, calls `mainWindow.webContents.paste()`. Chromium handles cursor, undo, IME.
6. **User edits shortcut.** Renderer sends new accelerator via `paste:set-accelerator`. Main swaps it in. Edit menu rebuilds for display.

## Edge Cases

- **Empty / invalid accelerator string.** Fall back to default `CmdOrCtrl+V`. Validate against Electron's accelerator format before applying.
- **IME composition.** When `event.isComposing` is true (or equivalent on the main-side `Input` event), do not dispatch.
- **Conflict with existing shortcuts.** If the user picks a binding already used by another action, behavior is what `shortcutManager` already does for any shortcut conflict — out of scope to redesign here.
- **Modifier-only or empty bindings.** Validation rejects them (matches existing shortcut recording UX).
- **App backgrounded.** `before-input-event` only fires for the focused window's webContents. No global hook.
- **Webview / browser-tab pane.** `before-input-event` does not fire for inner webviews. Their internal paste behavior is unchanged.

## Testing

### Unit

- Extend `src/renderer/shortcuts.test.ts` to cover the new `paste` entry: default value, override + reset, presence in `SHORTCUT_DEFAULTS`.
- Add `src/main/paste-accelerator.test.ts` covering accelerator-string ↔ `Input` event matching (modifier permutations, case, `CmdOrCtrl` resolution per platform).
- Add a renderer-side test for the `document.activeElement` classifier (terminal / input / other).

### Manual (Linux — primary verification)

1. Default `Ctrl+V` pastes into terminal. ✅
2. Default `Ctrl+V` pastes into board task modal text input. ✅
3. Open Preferences → Shortcuts, rebind `paste` to `Ctrl+Shift+V`. Verify both terminal and input fields paste on the new combo and **not** on `Ctrl+V`.
4. Reset to default; verify behavior reverts.
5. Bracketed-paste mode in terminal still triggers on paste.
6. Edit menu shows the active binding label.
7. Linux X11 middle-click primary-selection paste still works in terminal (regression check).

### Manual (deferred — flagged in PR)

- macOS: same flow with `Cmd+V` default.
- Windows: same flow with `Ctrl+V` default; specifically check no double-paste in input fields.

## Files Touched (estimate)

- `src/renderer/shortcuts.ts` — add `paste` entry.
- `src/renderer/shortcuts.test.ts` — coverage for new entry.
- `src/renderer/state.ts` — push accelerator to main on startup and on `preferences-changed`.
- `src/renderer/components/terminal-utils.ts` — remove hardcoded Windows handler; expose paste-into-PTY function for new dispatch path.
- `src/renderer/paste-dispatcher.ts` (new) — receives `paste:dispatch`, routes by focus.
- `src/main/paste-accelerator.ts` (new) — listener, current-accelerator state.
- `src/main/paste-accelerator.test.ts` (new) — accelerator-matching tests.
- `src/main/ipc-handlers.ts` — `paste:set-accelerator`, `paste:native` handlers.
- `src/main/menu.ts` — accelerator label on Edit menu paste item; `registerAccelerator: false`.
- `src/preload/preload.ts` — expose `paste` namespace.

## Risks

- **Subtle main-side accelerator parsing bugs.** Mitigation: dedicated unit tests for `Input` ↔ accelerator matching.
- **Mac/Windows verification gap.** Implementer is on Linux. Mitigation: design uses cross-platform primitives (`before-input-event`, `webContents.paste()`); call out gap in PR description.
- **Menu rebuild cost.** Rebuilds on every shortcut change. Acceptable — same pattern as other shortcut changes already trigger.
