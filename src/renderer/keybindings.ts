import { appState } from './state.js';
import { promptNewProject } from './components/sidebar.js';
import { promptNewSession } from './components/tab-bar.js';

export function initKeybindings(): void {
  // Menu-based shortcuts (registered via Electron menu accelerators)
  // These handlers receive events forwarded from the main process menu

  window.claudeIde.menu.onNewProject(() => promptNewProject());
  window.claudeIde.menu.onNewSession(() => promptNewSession());
  window.claudeIde.menu.onToggleSplit(() => appState.toggleSplit());
  window.claudeIde.menu.onNextSession(() => appState.cycleSession(1));
  window.claudeIde.menu.onPrevSession(() => appState.cycleSession(-1));
  window.claudeIde.menu.onGotoSession((index) => appState.gotoSession(index));
}
