export type SessionStatus = 'working' | 'waiting' | 'idle';

const IDLE_TIMEOUT_MS = 1500;
const WORKING_CONFIRM_MS = 150;

type StatusChangeCallback = (sessionId: string, status: SessionStatus) => void;

interface SessionState {
  status: SessionStatus;
  idleTimer: ReturnType<typeof setTimeout> | null;
  confirmTimer: ReturnType<typeof setTimeout> | null;
  dataBytes: number;
}

const sessions = new Map<string, SessionState>();
const listeners: StatusChangeCallback[] = [];

function setStatus(sessionId: string, status: SessionStatus): void {
  const state = sessions.get(sessionId);
  if (!state || state.status === status) return;
  state.status = status;
  for (const cb of listeners) cb(sessionId, status);
}

export function recordActivity(sessionId: string, byteCount: number): void {
  const state = sessions.get(sessionId);
  if (!state) return;

  // Reset idle timeout
  if (state.idleTimer !== null) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    state.idleTimer = null;
    state.dataBytes = 0;
    setStatus(sessionId, 'waiting');
  }, IDLE_TIMEOUT_MS);

  // Already working — just keep resetting idle timer
  if (state.status === 'working') return;

  // Waiting/idle → need to confirm it's real activity, not a resize echo.
  // Accumulate bytes and require a threshold before flipping to working.
  state.dataBytes += byteCount;

  if (state.confirmTimer === null) {
    state.confirmTimer = setTimeout(() => {
      state.confirmTimer = null;
      if (state.dataBytes > 80) {
        setStatus(sessionId, 'working');
      }
      state.dataBytes = 0;
    }, WORKING_CONFIRM_MS);
  }
}

export function initSession(sessionId: string): void {
  sessions.set(sessionId, { status: 'working', idleTimer: null, confirmTimer: null, dataBytes: 0 });
  for (const cb of listeners) cb(sessionId, 'working');
}

export function setIdle(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (!state) return;
  if (state.idleTimer !== null) clearTimeout(state.idleTimer);
  if (state.confirmTimer !== null) clearTimeout(state.confirmTimer);
  state.idleTimer = null;
  state.confirmTimer = null;
  state.dataBytes = 0;
  setStatus(sessionId, 'idle');
}

export function removeSession(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (!state) return;
  if (state.idleTimer !== null) clearTimeout(state.idleTimer);
  if (state.confirmTimer !== null) clearTimeout(state.confirmTimer);
  sessions.delete(sessionId);
}

export function getStatus(sessionId: string): SessionStatus {
  return sessions.get(sessionId)?.status ?? 'idle';
}

export function onChange(callback: StatusChangeCallback): void {
  listeners.push(callback);
}
