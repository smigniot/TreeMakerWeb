// View Settings panel: toggles that drive what the canvas renders, plus a few
// presets. A small stand-in for the ~100-flag C++ tmwxViewSettings panel.

import type { DesignView } from '../view/designView';
import type { ViewSettings } from '../view/viewSettings';
import { checkbox, row, heading } from './forms';

const LABELS: Record<keyof ViewSettings, string> = {
  showPaper: 'Paper',
  showSymmetryLine: 'Symmetry line',
  showNodes: 'Nodes',
  showNodeIndices: 'Node indices',
  showNodeLabels: 'Node labels',
  showEdges: 'Edges',
  showEdgeLengths: 'Edge lengths',
  showPaths: 'Leaf paths',
  showConditions: 'Conditions',
};

const PRESETS: Record<string, Partial<ViewSettings>> = {
  Design: { showPaper: true, showNodes: true, showNodeIndices: true, showEdges: true, showConditions: true, showPaths: false, showEdgeLengths: false },
  Tree: { showPaper: true, showNodes: true, showNodeIndices: true, showEdges: true, showEdgeLengths: true, showConditions: false, showPaths: false },
  Paths: { showPaper: true, showNodes: true, showEdges: true, showPaths: true, showConditions: false },
  All: { showPaper: true, showSymmetryLine: true, showNodes: true, showNodeIndices: true, showNodeLabels: true, showEdges: true, showEdgeLengths: true, showPaths: true, showConditions: true },
};

export class ViewSettingsPanel {
  constructor(private host: HTMLElement, private view: DesignView) {
    this.render();
  }

  private render(): void {
    this.host.replaceChildren();
    this.host.append(heading('View'));

    const presets = document.createElement('div');
    presets.className = 'tm-presets';
    for (const name of Object.keys(PRESETS)) {
      const b = document.createElement('button');
      b.textContent = name;
      b.addEventListener('click', () => {
        Object.assign(this.view.settings, PRESETS[name]);
        this.view.render();
        this.render();
      });
      presets.append(b);
    }
    this.host.append(presets);

    for (const key of Object.keys(LABELS) as (keyof ViewSettings)[]) {
      this.host.append(
        row(LABELS[key], checkbox(this.view.settings[key], (v) => {
          this.view.settings[key] = v;
          this.view.render();
        })),
      );
    }
  }
}
