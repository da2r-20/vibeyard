import { appState } from '../state.js';
import { showModal, closeModal } from './modal.js';
import { onChange as onStatusChange, getStatus } from '../session-activity.js';

const tabListEl = document.getElementById('tab-list')!;
const btnAddSession = document.getElementById('btn-add-session')!;
const btnToggleSplit = document.getElementById('btn-toggle-split')!;

export function initTabBar(): void {
  btnAddSession.addEventListener('click', promptNewSession);
  btnToggleSplit.addEventListener('click', () => appState.toggleSplit());

  appState.on('state-loaded', render);
  appState.on('project-changed', render);
  appState.on('session-added', render);
  appState.on('session-removed', render);
  appState.on('session-changed', render);
  appState.on('layout-changed', render);

  onStatusChange((sessionId, status) => {
    const dot = tabListEl.querySelector(`.tab-item[data-session-id="${sessionId}"] .tab-status`) as HTMLElement | null;
    if (dot) {
      dot.className = `tab-status ${status}`;
    }
  });

  render();
}

function render(): void {
  tabListEl.innerHTML = '';
  const project = appState.activeProject;
  if (!project) return;

  for (const session of project.sessions) {
    const tab = document.createElement('div');
    tab.className = 'tab-item' + (session.id === project.activeSessionId ? ' active' : '');
    tab.dataset.sessionId = session.id;
    tab.innerHTML = `
      <span class="tab-status ${getStatus(session.id)}"></span>
      <span class="tab-name">${esc(session.name)}</span>
      <span class="tab-close" title="Close session">&times;</span>
    `;

    tab.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('tab-close')) return;
      appState.setActiveSession(project.id, session.id);
    });

    tab.querySelector('.tab-close')!.addEventListener('click', () => {
      appState.removeSession(project.id, session.id);
    });

    tabListEl.appendChild(tab);
  }

  // Update split toggle button visual
  btnToggleSplit.style.color = project.layout.mode === 'split' ? 'var(--accent)' : '';
}

export function promptNewSession(): void {
  const project = appState.activeProject;
  if (!project) return;

  const sessionNum = project.sessions.length + 1;
  showModal('New Session', [
    { label: 'Name', id: 'session-name', placeholder: `Session ${sessionNum}`, defaultValue: `Session ${sessionNum}` },
  ], (values) => {
    const name = values['session-name']?.trim();
    if (name) {
      closeModal();
      appState.addSession(project.id, name);
    }
  });
}

function esc(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}
