interface FieldDef {
  label: string;
  id: string;
  placeholder?: string;
  defaultValue?: string;
}

const overlay = document.getElementById('modal-overlay')!;
const titleEl = document.getElementById('modal-title')!;
const bodyEl = document.getElementById('modal-body')!;
const btnCancel = document.getElementById('modal-cancel')!;
const btnConfirm = document.getElementById('modal-confirm')!;

export function setModalError(fieldId: string, message: string): void {
  const existing = bodyEl.querySelector(`#modal-error-${fieldId}`);
  if (existing) existing.remove();

  if (!message) return;

  const input = document.getElementById(`modal-${fieldId}`);
  if (!input) return;

  const errEl = document.createElement('div');
  errEl.id = `modal-error-${fieldId}`;
  errEl.className = 'modal-error';
  errEl.textContent = message;
  input.parentElement!.appendChild(errEl);
}

export function closeModal(): void {
  overlay.classList.add('hidden');
  cleanup();
}

export function showModal(
  title: string,
  fields: FieldDef[],
  onConfirm: (values: Record<string, string>) => void | Promise<void>
): void {
  titleEl.textContent = title;
  bodyEl.innerHTML = '';

  for (const field of fields) {
    const div = document.createElement('div');
    div.className = 'modal-field';
    div.innerHTML = `
      <label for="modal-${field.id}">${field.label}</label>
      <input type="text" id="modal-${field.id}" placeholder="${field.placeholder ?? ''}" value="${field.defaultValue ?? ''}">
    `;
    bodyEl.appendChild(div);
  }

  overlay.classList.remove('hidden');

  // Focus first input
  const firstInput = bodyEl.querySelector('input') as HTMLInputElement | null;
  if (firstInput) {
    requestAnimationFrame(() => {
      firstInput.focus();
      firstInput.select();
    });
  }

  // Clean up previous listeners
  cleanup();

  const handleConfirm = async () => {
    const values: Record<string, string> = {};
    for (const field of fields) {
      const input = document.getElementById(`modal-${field.id}`) as HTMLInputElement;
      values[field.id] = input?.value ?? '';
    }
    await onConfirm(values);
  };

  const handleCancel = () => {
    closeModal();
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  btnConfirm.addEventListener('click', handleConfirm);
  btnCancel.addEventListener('click', handleCancel);
  overlay.addEventListener('keydown', handleKeydown);

  // Store for cleanup
  (overlay as any)._cleanup = () => {
    btnConfirm.removeEventListener('click', handleConfirm);
    btnCancel.removeEventListener('click', handleCancel);
    overlay.removeEventListener('keydown', handleKeydown);
  };
}

function cleanup(): void {
  if ((overlay as any)._cleanup) {
    (overlay as any)._cleanup();
    (overlay as any)._cleanup = null;
  }
}
