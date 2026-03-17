import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import { spawnPty, writePty, resizePty, killPty } from './pty-manager';
import { loadState, saveState, PersistedState } from './store';

export function registerIpcHandlers(): void {
  ipcMain.handle('pty:create', (_event, sessionId: string, cwd: string, claudeSessionId: string | null) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;

    spawnPty(
      sessionId,
      cwd,
      claudeSessionId,
      (data) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:data', sessionId, data);
        }
      },
      (exitCode, signal) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:exit', sessionId, exitCode, signal);
        }
      }
    );
  });

  ipcMain.on('pty:write', (_event, sessionId: string, data: string) => {
    writePty(sessionId, data);
  });

  ipcMain.on('pty:resize', (_event, sessionId: string, cols: number, rows: number) => {
    resizePty(sessionId, cols, rows);
  });

  ipcMain.handle('pty:kill', (_event, sessionId: string) => {
    killPty(sessionId);
  });

  ipcMain.handle('fs:isDirectory', (_event, path: string) => {
    try {
      return fs.statSync(path).isDirectory();
    } catch {
      return false;
    }
  });

  ipcMain.handle('store:load', () => {
    return loadState();
  });

  ipcMain.handle('store:save', (_event, state: PersistedState) => {
    saveState(state);
  });
}
