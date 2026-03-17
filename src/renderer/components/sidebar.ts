import { appState } from '../state.js';
import { showModal, setModalError, closeModal } from './modal.js';

const projectListEl = document.getElementById('project-list')!;
const btnAddProject = document.getElementById('btn-add-project')!;

export function initSidebar(): void {
  btnAddProject.addEventListener('click', promptNewProject);
  appState.on('state-loaded', render);
  appState.on('project-added', render);
  appState.on('project-removed', render);
  appState.on('project-changed', render);
  render();
}

function render(): void {
  projectListEl.innerHTML = '';

  for (const project of appState.projects) {
    const el = document.createElement('div');
    el.className = 'project-item' + (project.id === appState.activeProjectId ? ' active' : '');
    el.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="project-name">${esc(project.name)}</div>
        <div class="project-path">${esc(project.path)}</div>
      </div>
      <span class="project-delete" title="Remove project">&times;</span>
    `;

    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('project-delete')) return;
      appState.setActiveProject(project.id);
    });

    el.querySelector('.project-delete')!.addEventListener('click', () => {
      appState.removeProject(project.id);
    });

    projectListEl.appendChild(el);
  }
}

export function promptNewProject(): void {
  showModal('New Project', [
    { label: 'Name', id: 'project-name', placeholder: 'My Project' },
    { label: 'Path', id: 'project-path', placeholder: '/path/to/project' },
  ], async (values) => {
    const name = values['project-name']?.trim();
    const path = values['project-path']?.trim();
    if (!name || !path) return;

    const isDir = await window.claudeIde.fs.isDirectory(path);
    if (!isDir) {
      setModalError('project-path', 'Directory does not exist');
      return;
    }

    closeModal();
    appState.addProject(name, path);
  });
}

function esc(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}
