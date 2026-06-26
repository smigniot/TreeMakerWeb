// Reader for legacy TreeMaker version 4.0 documents. Produces a TreeState that
// Tree.fromState turns into a live tree (re-deriving paths/flags). Field orders
// mirror the C++ Putv4Self / PutRestv4 exactly (verified against the source).
//
// We reuse each part's 1-based file index as its model id, so the pointer
// indices in the file resolve directly to node/edge ids.

import type { Cursor } from './cursor';
import type { TreeState } from '../../model/tree';
import type { Condition } from '../../model/conditions';

/** Parse a v4 body. The caller has already consumed the "tree" tag + "4.0". */
export function readV4(c: Cursor): TreeState {
  const paper = { width: c.num(), height: c.num() };
  const scale = c.num();
  const hasSymmetry = c.bool();
  const symLoc = c.point();
  const symAngle = c.num();

  const numNodes = c.int();
  const numEdges = c.int();
  const numPaths = c.int();
  c.int(); // numPolys   (placeholder, always 0 in v4)
  c.int(); // numVertices
  c.int(); // numCreases
  const numConditions = c.int();

  const nodes: TreeState['nodes'] = [];
  for (let i = 0; i < numNodes; i++) {
    expectTag(c, 'node');
    const id = c.int();
    const label = c.str();
    const loc = c.point();
    c.bool(); // isLeafNode (derived on our side)
    const isSub = c.bool(); // isSubNode
    c.bool(); // isBorderNode
    c.bool(); // isPinnedNode
    c.bool(); // isPolygonNode
    c.bool(); // isConditionedNode
    c.int(); // owned-vertices count (0)
    c.ptrArray(); // mEdges (derived from edges on our side)
    c.ptrArray(); // mLeafPaths (derived)
    c.ownerPtr(); // node owner
    nodes.push({ id, loc, label, isSub });
  }

  const edges: TreeState['edges'] = [];
  for (let i = 0; i < numEdges; i++) {
    expectTag(c, 'edge');
    const id = c.int();
    const label = c.str();
    const length = c.num();
    const strain = c.num();
    const stiffness = c.num();
    c.bool(); // isPinnedEdge
    c.bool(); // isConditionedEdge
    const ends = c.ptrArray(); // the two endpoint node indices
    // NB: edges write NO owner pointer in v4 (PutOwnerPtr(tmEdgeOwner) is a
    // no-op — edges are always tree-owned), unlike nodes and paths.
    const fromNode = ends[0] ?? 0;
    const toNode = ends[1] ?? 0;
    edges.push({ id, fromNode, toNode, length, strain, stiffness, label });
  }

  // Path records are fully derived on our side; consume to advance the cursor.
  for (let i = 0; i < numPaths; i++) {
    expectTag(c, 'path');
    c.int(); // index
    c.num(); // minTreeLength
    c.num(); // minPaperLength
    c.bool(); c.bool(); c.bool(); c.bool(); c.bool(); c.bool(); // 6 flags
    c.int(); // owned vertices (0)
    c.ptr(); // fwd poly (0)
    c.ptr(); // bkd poly (0)
    c.ptrArray(); // nodes
    c.ptrArray(); // edges
    c.ownerPtr();
  }

  const conditions: Condition[] = [];
  for (let i = 0; i < numConditions; i++) {
    const cond = readCondition(c, conditions.length + 1);
    if (cond) conditions.push(cond);
  }

  // Trailing owned-part arrays: nodes, edges, paths, then a single 0 (no polys).
  c.ptrArray();
  c.ptrArray();
  c.ptrArray();
  c.int();

  return {
    format: 1,
    paper,
    scale,
    symmetry: { has: hasSymmetry, loc: symLoc, angle: symAngle },
    rootNode: nodes.length ? nodes[0]!.id : null,
    nodes,
    edges,
    conditions,
  };
}

function expectTag(c: Cursor, tag: string): void {
  const t = c.str();
  if (t !== tag) throw new Error(`legacy v4 parse: expected "${tag}" tag, got "${t}"`);
}

/**
 * Read one v4 condition: tag, numLines, body. Known tags are mapped to model
 * conditions; unknown tags are skipped by their numLines (forward-compatible,
 * matching tmTree::Makev4Condition).
 */
function readCondition(c: Cursor, id: number): Condition | null {
  const tag = c.str();
  const numLines = c.int();
  switch (tag) {
    case 'CNpn': // NodesPaired
      return { id, type: 'NodesPaired', tag, node1: c.ptr(), node2: c.ptr() };
    case 'CNsn': // NodeSymmetric
      return { id, type: 'NodeSymmetric', tag, node: c.ptr() };
    case 'CNap': // PathActive
      return { id, type: 'PathActive', tag, node1: c.ptr(), node2: c.ptr() };
    case 'CNen': // NodeOnEdge
      return { id, type: 'NodeOnEdge', tag, node: c.ptr() };
    case 'CNkn': // NodeOnCorner
      return { id, type: 'NodeOnCorner', tag, node: c.ptr() };
    case 'CNes': // EdgesSameStrain
      return { id, type: 'EdgesSameStrain', tag, edge1: c.ptr(), edge2: c.ptr() };
    default:
      // Unrecognized: skip its body lines, lose the condition (logged by caller).
      c.skip(numLines);
      return null;
  }
}
