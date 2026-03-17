import { appState } from './state.js';
import { initSidebar } from './components/sidebar.js';
import { initTabBar } from './components/tab-bar.js';
import { initSplitLayout } from './components/split-layout.js';
import { initKeybindings } from './keybindings.js';
import { handlePtyData, handlePtyExit } from './components/terminal-pane.js';
import { recordActivity, setIdle } from './session-activity.js';

async function main(): Promise<void> {
  // Wire PTY data/exit events from main process
  window.claudeIde.pty.onData((sessionId, data) => {
    handlePtyData(sessionId, data);
    recordActivity(sessionId, data.length);
  });

  window.claudeIde.pty.onExit((sessionId, exitCode) => {
    handlePtyExit(sessionId, exitCode);
    setIdle(sessionId);
  });

  // Initialize components
  initSidebar();
  initTabBar();
  initSplitLayout();
  initKeybindings();

  // Load persisted state
  await appState.load();
}

main().catch(console.error);
