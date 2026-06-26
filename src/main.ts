// TreeMakerWeb entry point.
// P1 builds the model, SVG surface, and chrome on top of this shell.

function mount(root: HTMLElement): void {
  root.textContent = 'TreeMakerWeb — booting…';
}

const app = document.getElementById('app');
if (app) mount(app);

export { mount };
