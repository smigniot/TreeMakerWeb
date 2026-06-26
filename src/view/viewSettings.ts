// Display toggles that drive what the canvas renders. A small subset of the
// ~100 flags in the C++ tmwxViewSettings; expanded by the View Settings panel
// (chrome task). The canvas reads these as the single source of truth for
// visibility (matching IsVisible<P> in the original).

export interface ViewSettings {
  showPaper: boolean;
  showSymmetryLine: boolean;
  showNodes: boolean;
  showNodeIndices: boolean;
  showNodeLabels: boolean;
  showEdges: boolean;
  showEdgeLengths: boolean;
  showPaths: boolean; // leaf paths, colored by feasibility
  showConditions: boolean;
  showCreasePattern: boolean; // mountain/valley creases overlay
}

export function defaultViewSettings(): ViewSettings {
  return {
    showPaper: true,
    showSymmetryLine: true,
    showNodes: true,
    showNodeIndices: true,
    showNodeLabels: true,
    showEdges: true,
    showEdgeLengths: false,
    showPaths: false,
    showConditions: true,
    showCreasePattern: true,
  };
}
