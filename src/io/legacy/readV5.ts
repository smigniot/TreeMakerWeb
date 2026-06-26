// Reader for legacy TreeMaker version 5.0 documents (the format desktop
// TreeMaker 5 saves). v5 stores the full crease pattern — polys, vertices,
// creases, facets — which we don't keep (the port regenerates them), so those
// records are consumed/skipped to stay in sync; we extract the authoritative
// tree (nodes, edges, conditions). Field orders mirror the C++ Putv5Self exactly.
//
// numNodes includes poly-owned "sub" nodes (inset nodes); we keep only the
// tree-owned nodes (owner flag = tree), so condition node references — which
// always point at tree nodes by 1-based index — resolve.

import type { Cursor } from './cursor';
import type { TreeState } from '../../model/tree';
import type { Condition } from '../../model/conditions';
import { parseConditionBody } from './readV4';

/** Parse a v5 body. The caller has already consumed the "tree" tag + "5.0". */
export function readV5(c: Cursor): TreeState {
  const paper = { width: c.num(), height: c.num() };
  const scale = c.num();
  const hasSymmetry = c.bool();
  const symLoc = c.point();
  const symAngle = c.num();
  for (let i = 0; i < 7; i++) c.bool(); // status flags (recomputed on our side)

  const numNodes = c.int();
  const numEdges = c.int();
  const numPaths = c.int();
  const numPolys = c.int();
  const numVertices = c.int();
  const numCreases = c.int();
  const numFacets = c.int();
  const numConditions = c.int();

  const nodes: TreeState['nodes'] = [];
  for (let i = 0; i < numNodes; i++) {
    expectTag(c, 'node');
    const id = c.int();
    const label = c.str();
    const loc = c.point();
    c.num(); c.num(); // depth, elevation
    c.bool(); // isLeaf
    const isSub = c.bool();
    c.bool(); c.bool(); c.bool(); c.bool(); c.bool(); // border,pinned,polygon,junction,conditioned
    c.ptrArray(); // mEdges
    c.ptrArray(); // mLeafPaths
    c.ptrArray(); // mOwnedVertices
    const treeOwned = !consumeFlagPtr(c); // node owner: flag(isPoly) + poly ptr if set
    if (treeOwned) nodes.push({ id, loc, label, isSub });
  }

  const edges: TreeState['edges'] = [];
  for (let i = 0; i < numEdges; i++) {
    expectTag(c, 'edge');
    const id = c.int();
    const label = c.str();
    const length = c.num();
    const strain = c.num();
    const stiffness = c.num();
    c.bool(); c.bool(); // pinned, conditioned
    const ends = c.ptrArray(); // endpoint nodes
    // edges write no owner pointer
    edges.push({ id, fromNode: ends[0] ?? 0, toNode: ends[1] ?? 0, length, strain, stiffness, label });
  }

  for (let i = 0; i < numPaths; i++) skipPath(c);
  for (let i = 0; i < numPolys; i++) skipPoly(c);
  for (let i = 0; i < numVertices; i++) skipVertex(c);
  for (let i = 0; i < numCreases; i++) skipCrease(c);
  for (let i = 0; i < numFacets; i++) skipFacet(c);

  const conditions: Condition[] = [];
  for (let i = 0; i < numConditions; i++) {
    const cond = readV5Condition(c, conditions.length + 1);
    if (cond) conditions.push(cond);
  }

  // Trailing owned-part arrays: nodes, edges, paths, polys.
  c.ptrArray(); c.ptrArray(); c.ptrArray(); c.ptrArray();

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
  if (t !== tag) throw new Error(`legacy v5 parse: expected "${tag}" tag, got "${t}"`);
}

/** Owner flag + (poly index if flag set). Returns whether the flag was set. */
function consumeFlagPtr(c: Cursor): boolean {
  const flag = c.int();
  if (flag) c.ptr();
  return flag !== 0;
}

/** Vertex/crease owners always write flag + ptr (node-or-path / poly-or-path). */
function consumeFlagAndPtr(c: Cursor): void {
  c.int(); c.ptr();
}

function skipPath(c: Cursor): void {
  expectTag(c, 'path');
  c.int(); // index
  c.num(); c.num(); c.num(); c.num(); // minTree, minPaper, actTree, actPaper
  for (let i = 0; i < 7; i++) c.bool(); // leaf,sub,feasible,active,border,polygon,conditioned
  c.ptr(); c.ptr(); // fwdPoly, bkdPoly
  c.ptrArray(); c.ptrArray(); // nodes, edges
  c.ptr(); // outsetPath
  c.num(); c.num(); c.num(); c.num(); // frontReduction, backReduction, minDepth, minDepthDist
  c.ptrArray(); c.ptrArray(); // ownedVertices, ownedCreases
  consumeFlagPtr(c); // path owner
}

function skipPoly(c: Cursor): void {
  expectTag(c, 'poly');
  c.int(); // index
  c.point(); // centroid
  c.bool(); // isSubPoly
  c.ptrArray(); c.ptrArray(); c.ptrArray(); c.ptrArray(); c.ptrArray(); // ring/cross/inset/spoke
  c.ptr(); // ridgePath
  skipPointArray(c); // mNodeLocs (tmArray<tmPoint>)
  for (let i = 0; i < 7; i++) c.ptrArray(); // localRootVerts/Creases, ownedNodes/Paths/Polys/Creases/Facets
  consumeFlagPtr(c); // poly owner
}

function skipVertex(c: Cursor): void {
  expectTag(c, 'vrtx');
  c.int(); // index
  c.point(); // loc
  c.num(); // elevation
  c.bool(); // isBorderVertex
  c.ptr(); c.ptr(); c.ptr(); // treeNode, left/right pseudohinge mates
  c.ptrArray(); // creases
  c.num(); // depth
  c.int(); // discreteDepth
  c.int(); c.int(); // CCFlag, STFlag
  consumeFlagAndPtr(c); // vertex owner (node or path)
}

function skipCrease(c: Cursor): void {
  expectTag(c, 'crse');
  c.int(); // index
  c.int(); // kind
  c.ptrArray(); // vertices
  c.ptr(); c.ptr(); // fwdFacet, bkdFacet
  c.int(); // fold
  c.int(); c.int(); // CCFlag, STFlag
  consumeFlagAndPtr(c); // crease owner (poly or path)
}

function skipFacet(c: Cursor): void {
  expectTag(c, 'fact');
  c.int(); // index
  c.point(); // centroid
  c.bool(); // isWellFormed
  c.ptrArray(); c.ptrArray(); // vertices, creases
  c.ptr(); // corridorEdge
  c.ptrArray(); c.ptrArray(); // headFacets, tailFacets
  c.int(); // order
  c.int(); // color
  c.ptr(); // facet owner (always a poly)
}

/** tmArray<tmPoint>: size then that many points (2 numbers each). */
function skipPointArray(c: Cursor): void {
  const n = c.int();
  for (let i = 0; i < n; i++) c.point();
}

/** v5 condition: tag, index, isFeasible, numLines, body (PutRestv4). */
function readV5Condition(c: Cursor, id: number): Condition | null {
  const tag = c.str();
  c.int(); // mIndex (we assign our own)
  c.bool(); // mIsFeasibleCondition (recomputed)
  const numLines = c.int();
  return parseConditionBody(c, tag, id, numLines);
}
