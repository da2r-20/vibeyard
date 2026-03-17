import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessionRecord {
  id: string;
  name: string;
  claudeSessionId: string | null;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  sessions: SessionRecord[];
  activeSessionId: string | null;
  layout: {
    mode: 'tabs' | 'split';
    splitPanes: string[];
    splitDirection: 'horizontal' | 'vertical';
  };
}

export interface PersistedState {
  version: 1;
  projects: ProjectRecord[];
  activeProjectId: string | null;
}

const STATE_DIR = path.join(os.homedir(), '.claude-ide');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function defaultState(): PersistedState {
  return {
    version: 1,
    projects: [],
    activeProjectId: null,
  };
}

export function loadState(): PersistedState {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return defaultState();
    }
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.version !== 1) {
      return defaultState();
    }
    return parsed;
  } catch {
    return defaultState();
  }
}

export function saveState(state: PersistedState): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(STATE_DIR)) {
        fs.mkdirSync(STATE_DIR, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save state:', err);
    }
    saveTimer = null;
  }, 300);
}

export function saveStateSync(state: PersistedState): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}
