import type { ToolFailureData } from '../../shared/types.js';
import type { ToolInfo } from './tool-catalog.js';
import { findTool } from './tool-catalog.js';
import { appState } from '../state.js';

export interface ToolAlert {
  sessionId: string;
  projectId: string;
  tool: ToolInfo;
}

type ToolAlertCallback = (alert: ToolAlert) => void;

const alertedPerSession = new Map<string, Set<string>>();
const alertListeners: ToolAlertCallback[] = [];

export function onToolAlert(callback: ToolAlertCallback): void {
  alertListeners.push(callback);
}

function extractCommand(cmd: string): string {
  const parts = cmd.trim().split(/\s+/);
  for (const part of parts) {
    if (part.includes('=') || part === 'sudo' || part === 'env') continue;
    return part;
  }
  return parts[0] || '';
}

export function handleToolFailure(sessionId: string, data: ToolFailureData): void {
  if (!appState.preferences.insightsEnabled) return;
  if (data.tool_name !== 'Bash') return;

  const command = typeof data.tool_input?.command === 'string'
    ? extractCommand(data.tool_input.command)
    : '';
  if (!command) return;

  const tool = findTool(command);
  if (!tool) return;

  let alerted = alertedPerSession.get(sessionId);
  if (!alerted) {
    alerted = new Set();
    alertedPerSession.set(sessionId, alerted);
  }
  if (alerted.has(command)) return;

  const project = appState.projects.find(p => p.sessions.some(s => s.id === sessionId));
  if (!project) return;

  if (appState.isInsightDismissed(project.id, `missing-tool:${command}`)) return;

  alerted.add(command);

  for (const cb of alertListeners) cb({ sessionId, projectId: project.id, tool });
}

export function initToolDetector(): void {
  window.claudeIde.session.onToolFailure((sessionId, data) => {
    handleToolFailure(sessionId, data);
  });

  appState.on('session-removed', (data?: unknown) => {
    const d = data as { sessionId?: string } | undefined;
    if (d?.sessionId) {
      alertedPerSession.delete(d.sessionId);
    }
  });
}

/** @internal */
export function _resetForTesting(): void {
  alertedPerSession.clear();
  alertListeners.length = 0;
}
