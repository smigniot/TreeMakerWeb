// Minimal form-control helpers (vanilla DOM). Used by the inspector and the
// view-settings panel. Each input commits on change/Enter and reports the value.

export function row(label: string, control: HTMLElement): HTMLElement {
  const r = document.createElement('label');
  r.className = 'tm-row';
  const span = document.createElement('span');
  span.className = 'tm-row-label';
  span.textContent = label;
  r.append(span, control);
  return r;
}

export function numberInput(value: number, onCommit: (v: number) => void, opts: { step?: number } = {}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'tm-input';
  input.value = String(value);
  if (opts.step !== undefined) input.step = String(opts.step);
  const commit = () => {
    const v = Number(input.value);
    if (!Number.isNaN(v)) onCommit(v);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return input;
}

export function textInput(value: string, onCommit: (v: string) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tm-input';
  input.value = value;
  input.addEventListener('change', () => onCommit(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return input;
}

export function checkbox(checked: boolean, onCommit: (v: boolean) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'tm-check';
  input.checked = checked;
  input.addEventListener('change', () => onCommit(input.checked));
  return input;
}

export function readonlyField(value: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'tm-readonly';
  span.textContent = value;
  return span;
}

export function heading(text: string): HTMLElement {
  const h = document.createElement('div');
  h.className = 'tm-panel-title';
  h.textContent = text;
  return h;
}
