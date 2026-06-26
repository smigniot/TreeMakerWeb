# TreeMaker 5 — Core Data Model & Algorithms Analysis

Scope: `Source/tmModel/tmTreeClasses/` (the model) and `Source/tmModel/tmPtrClasses/` (containers). Optimizers in `Source/tmModel/tmOptimizers/` and `tmNLCO/` are referenced but not analyzed here (see doc 02).

## 1. Domain Concepts

TreeMaker turns a **tree graph** (a stick-figure of the origami subject) into a **crease pattern** that folds into a base with one flap per tree edge. The classes form a layered pipeline from abstract graph → geometry → foldable structure.

**Tree layer (the user's input graph):**
- **`tmNode`** (`tmNode.h`) — a vertex of the abstract tree. Has a paper location `mLoc`, a `mDepth` (scaled distance to root → y in folded form) and `mElevation` (distance to axis → x in folded form). Flags distinguish *leaf* vs *branch* vs *sub* nodes. Leaf nodes = tips of flaps; the convex hull of leaf nodes is what must be tiled with polygons.
- **`tmEdge`** (`tmEdge.h`) — an edge of the tree = a flap (or flap segment). Carries `mLength` (tree units), `mStrain`, `mStiffness`. Always connects exactly two nodes.
- **`tmPath`** (`tmPath.h`) — the unique route between two nodes through the tree. A **leaf path** connects two leaf nodes; its **minimum paper length** (= sum of edge lengths × scale) is the packing constraint. A path is **active** when its actual paper distance equals its minimum (the two flaps are touching = circle/river tangency). Active leaf paths ("axial paths") plus border paths define the polygon network. Paths also exist as **subpaths** inside polys (inset rings, spokes, ridges, gussets). The number of paths is O(n²) in node count — this is the source of the "high complexity / many useless paths" remark.

**Crease-pattern layer (derived geometry):**
- **`tmPoly`** (`tmPoly.h`) — a polygon in the crease pattern, bounded by active/border paths (`mRingPaths`, corners `mRingNodes`). It recursively contains **subpolys** (`tmPolyOwner`) created by *insetting*, plus `mCrossPaths`, `mInsetNodes`, `mSpokePaths`, `mRidgePath`. Each poly gets filled with a "molecule" crease pattern. This is the universal-molecule recursion.
- **`tmVertex`** (`tmVertex.h`) — a point of the crease pattern (paper coordinate `mLoc` + `mElevation`, `mDepth`, `mDiscreteDepth`). Owned by a node (projection of a tree node) or a path. Carries scratch flags `mCCFlag`/`mSTFlag` for facet-ordering graph traversal.
- **`tmCrease`** (`tmCrease.h`) — a segment between two vertices. `Kind` ∈ {AXIAL, GUSSET, RIDGE, UNFOLDED_HINGE, FOLDED_HINGE, PSEUDOHINGE} (the "AGRH" structural assignment); `Fold` ∈ {FLAT, MOUNTAIN, VALLEY, BORDER} (the M/V assignment computed last). Knows its two incident facets (`mFwdFacet`/`mBkdFacet`).
- **`tmFacet`** (`tmFacet.h`) — a polygon region bounded by creases (CCW `mVertices`/`mCreases`). Carries the **facet-ordering graph** edges (`mTailFacets`/`mHeadFacets`), the resulting layer `mOrder`, the up-face `Color`, and `mCorridorEdge` (which tree edge's "corridor" it belongs to). This is the layer-ordering layer that makes the base physically foldable without self-intersection.

**Relationships (ownership/derivation chain):** `tmNode`+`tmEdge` → `tmPath` → `tmPoly` (+subpolys) → `tmVertex`+`tmCrease` → `tmFacet` → facet order/color/fold. Only nodes, edges, and conditions are user-authored; everything from paths down is derived.

**`tmPart`** (`tmPart.h`) is the common base of all of the above: every part has a back-pointer `mTree`, a 1-based `mIndex`, and a dynamic-type tag system (`TM_DECLARE_TAG`) used for stream I/O and for `MakeTypeArray`.

**`tmCondition`** (`tmCondition.h` + 13 subclasses) — user constraints (node fixed to corner/edge/symmetry line, paths active, edge length fixed, same strain, angle quantized, etc.). These are pure constraint-bridge objects: their key methods are `AddConstraints(tmScaleOptimizer*/tmEdgeOptimizer*/tmStrainOptimizer*)`, so they are the seam between the data model and the optimizers.

## 2. Class Hierarchy & Ownership

**`tmTree`** (`tmTree.h`) is `public tmPart, private tmCluster, public tmEdgeOwner, public tmPolyOwner, public tmConditionOwner`. Two parallel registries exist, which is the central design subtlety:

- **`tmCluster`** (`tmCluster.h`) holds *flat registries of all parts of each type*: `mNodes, mEdges, mPaths, mPolys, mVertices, mCreases, mFacets, mConditions` (each a `tmDpptrArray<T>`). These include sub-parts owned by polys. `GetParts<P>()` is template-specialized to return the right list — used by indexing, I/O, and bulk iteration. The tree privately *is-a* cluster.
- **Owner classes** (`tmNodeOwner`, `tmEdgeOwner`, `tmPathOwner`, `tmPolyOwner`, `tmVertexOwner`, `tmCreaseOwner`, `tmFacetOwner`) each hold an `mOwnedXxx` `tmDpptrArray` and are *responsible for heap deletion* of those parts. Ownership is hierarchical: `tmTree` owns nodes/edges/paths/polys/conditions; `tmPoly` owns its subnodes/subpaths/subpolys/creases/facets; `tmNode` owns vertices; `tmPath` owns vertices and creases. Each owner exposes virtual `XxxOwnerAsTree()/AsPoly()` discriminators (e.g. `tmPoly::NodeOwnerAsPoly(){return this;}`) so code can recover the concrete owner type — a hand-rolled visitor/RTTI substitute.

So **every part is registered twice**: once in the cluster (flat, by type) and once in its owner (hierarchical, for lifetime). Deleting a poly deletes its owned sub-parts, which must then also vanish from the flat cluster lists. That is exactly what the dangle-proof pointers automate.

**Dangle-proof pointers (`tmPtrClasses/`):**
- `tmDpptrTarget` (`tmDpptrTarget.h`) — base of every part; keeps `std::vector<tmDpptrSrc*> mDpptrSrcs` of everything pointing at it. Its destructor notifies all sources to drop the reference.
- `tmDpptr<T>` (`tmDpptr.h`) — a smart `T*` that registers/deregisters with the target; after the target is deleted it silently reads back as `NULL`. Used for singular cross-references that may outlive their target (e.g. `tmPath::mFwdPoly`, `tmCrease::mFwdFacet`).
- `tmDpptrArray<T>` (`tmDpptrArray.h`) — `tmArray<T*>` that, when a pointed-to object is deleted, *removes the slot entirely*. This is what keeps the cluster registries and `mOwned*`/`mEdges`/`mLeafPaths` lists self-cleaning on cascade deletes.
- `tmArray<T>` (`tmArray.h`) — `std::vector<T>` plus set ops (`union_with`, `intersect_with`, `erase_remove`), 1-based legacy accessors, range-checked `operator[]` in debug.

**Why they exist:** the model is a densely cross-linked graph where a single `delete` (e.g. of a poly during cleanup) must ripple through dozens of back-references and registries. Rather than manual bookkeeping at every delete site, the dpptr system makes deletion safe and references auto-nulling — effectively an *observer/weak-reference* mechanism with eager removal.

**Port assessment of pointers:** This is the biggest C++→JS impedance point. JS GC does **not** remove an object from arrays just because it's logically dead, and there is no destructor hook to fire the "remove me everywhere" notification. Options for the port: (a) keep explicit registries and write explicit `dispose()`/removal logic at delete sites (closest to current behavior, most faithful); (b) stop storing flat registries and *derive* them on demand from the ownership tree (eliminates most dangle hazards); (c) use integer handles/IDs instead of pointers, with arrays as the source of truth and "dead" marked by tombstones. Recommended: (b)+(c): IDs + derived views, which removes the entire dpptr layer. The `tmArray` set operations port trivially to TS array helpers.

## 3. Key Algorithms (stages of CP generation)

The model itself contains the **structural/geometric** algorithms; the **numerical optimization** lives in the optimizer module and is *driven from outside* the model (the GUI controller `tmwxGUI/tmwxDocView/tmwxDoc_Action.cpp`, and `test/tmModelTester`), operating on a `tmTree*`. `tmTree` never calls an optimizer; conditions only *describe* constraints to them.

**Stage A — Tree construction / topological editing** (`tmTree.cpp`):
- `AddNode` (line 423), `SplitEdge` (505), `AbsorbNode(s)`, `AbsorbEdge(s)`, `AddStub`/`RemoveStub`, `KillSomeNodesAndEdges`, `MakeNodeRoot`. `AddNode` is illustrative: adds node+edge, then incrementally clones every path ending at `fromNode` to extend it, maintaining each node's `mLeafPaths`. Pure graph bookkeeping.
- Dimensional edits: `SetNodeLocs`, `SetEdgeLengths`, `ScaleTree`, `RenormalizeToUnit*`, `RemoveStrain`, `PerturbNodes`. Pure data mutation.

**Stage B — Optimization (EXTERNAL, do not port to model):** scale optimization (circle/river packing, maximizing `mScale`), edge optimization, strain optimization. Entry classes `tmScaleOptimizer`/`tmEdgeOptimizer`/`tmStrainOptimizer` take a `tmTree*`; conditions feed them via `tmCondition::AddConstraints(...)`. The model exposes the hooks (`GetScale/SetScale`, node locs, path min/actual lengths, `IsFeasible`) but contains none of the NLP math.

**Stage C — Cleanup pipeline** — `tmTree::CleanupAfterEdit` (2603), the heart of the derived model. Runs automatically (see §4). In order:
1. Clamp node locations to paper; clear all dimensional flags; delete invalid conditions.
2. `tmPath::TreePathCalcLengths` per path → set feasible/active flags; set tree `mIsFeasible`; set `mIsConditioned*` flags.
3. `CalcBorderNodesAndPaths` (2015) — convex hull of nodes (the border).
4. `CalcPinnedNodesAndEdges` (2102) — which nodes/edges cannot grow (constraint-limited).
5. `CalcPolygonNetwork` (2125) — iterative fixpoint ("snip off" non-conforming paths/nodes) that decides which paths/nodes are polygon members, then deletes invalidated polys.
6. `CalcPolygonValidity` (2216) — is the hull fully tiled by valid polys? → `mIsPolygonValid`.
7. `KillOrphanVerticesAndCreases` (2245), then `CalcPartIndices` (2304) renumbers all parts; clear vertex/crease/facet cleanup data.
8. `CalcPolygonFilled` (2321) → `mIsPolygonFilled` (early-exit if not).
9. `CalcDepthAndBend` (2338) — root depth = 0, propagate node depths along paths; compute per-path `mMinDepth`/`mMinDepthDist`; vertex depths and crease/vertex bend.
10. `CalcVertexDepthValidity`, `CalcFacetDataValidity` (well-formedness + two-colorability; early-exit on failure).
11. `CalcFacetCorridorEdges`, then `CalcFacetOrder`.
12. `CalcFacetColor` (2563) and `CalcFoldDirections` (2584) — final M/V/color assignment.

**Stage D — Polygon & crease/molecule construction:**
- `BuildTreePolys` (1716) → free/owner function `BuildPolysFromPaths` (in `tmPolyOwner.cpp`, also used by `tmFacetOwner.cpp`/`tmPoly.cpp`) builds top-level polys from the leaf-path network, discarding nonconvex/node-enclosing polys.
- `BuildPolysAndCreasePattern` (1751) → for each poly, `tmPoly::BuildPolyContents` → `tmPoly::CalcContents` recursively insets subpolys, makes inset nodes/spoke/ridge paths (`GetOrMakeInsetNode`, `GetRidgelineNodesAndPaths`), and builds vertices/creases via `tmPath::BuildSelfVertices`/`ConnectSelfVertices` and `tmFacet::CalcContents`. This is the universal-molecule/inset algorithm — geometry-heavy.

**Stage E — Facet ordering** (`tmTree_FacetOrder.cpp`): `CalcFacetOrder` (515) builds **local root networks** (`CalcRootNetworks`, 400) — connected components of local-root vertices/creases — verifies a unique depth-0 component and connectability (`mIsLocalRootConnectable`), then `ConnectFacetGraph`, splices all components into one global network by repeated `CanAbsorb`/`Absorb`, `BreakOneLink` to make it sortable, and `tmFacet::CalcOrder` topologically assigns layer order. Graph algorithm using the `mCCFlag`/`mSTFlag` scratch fields and helper classes `tmRootNetwork`/`tmCorridor`. `GetCPStatus` (1800) returns a diagnostic enum (EDGES_TOO_SHORT, POLYS_NOT_VALID/FILLED, VERTICES_LACK_DEPTH, FACETS_NOT_VALID, NOT_LOCAL_ROOT_CONNECTABLE, HAS_FULL_CP) with the offending parts.

## 4. Statefulness & Data Flow

**Authoritative (mutated by user/optimizer):** paper size, scale, symmetry; node locations; edge lengths/strain/stiffness; the node/edge topology; conditions. Everything else (paths beyond raw existence, all polys/vertices/creases/facets, all `Is*` flags, depths, facet order/color, folds) is **derived** and rebuilt by `CleanupAfterEdit`.

**Dirty model:** a single boolean `tmTree::mNeedsCleanup`, managed by the RAII stack class **`tmTreeCleaner`** (`tmTreeCleaner.h/.cpp`). Every mutating tree method begins with `tmTreeCleaner tc(this);`. The cleaner sets `mNeedsCleanup=true` on construction and, on destruction, calls `CleanupAfterEdit()` **only if the tree was clean when it was constructed**. This makes cleanup fire exactly once after the outermost edit, even with deeply nested mutating calls. Comment explicitly forbids heap-allocating a cleaner.

**Validity flags** are the coarse staleness/result signals consumed by the UI and by `GetCPStatus`: `mIsFeasible, mIsPolygonValid, mIsPolygonFilled, mIsVertexDepthValid, mIsFacetDataValid, mIsLocalRootConnectable`. The pipeline early-exits and leaves later flags false when an earlier stage fails — so the flag set encodes "how far CP generation got."

There is no fine-grained incremental invalidation: any edit triggers a full `CleanupAfterEdit`. Polys do a cheap self-check (`mNodeLocs` vs current ring-node positions, `MoveTol = 1e-6`) so an unchanged poly's contents can be preserved across cleanups, but the rest is recomputed wholesale.

## 5. Port Assessment (per piece)

| Piece | Files | Recommendation |
|---|---|---|
| `tmArray`, set ops | `tmArray.h` | (b) Reimplement in TS as array + helpers. Trivial. |
| `tmDpptr*` dangle-proof ptrs | `tmDpptr*.h/.cpp`, `tmDpptrTarget` | **Replace, don't port.** GC + explicit registry removal, or switch to integer IDs with derived registries. Biggest semantic-translation risk: cascade deletes that currently auto-clean references must become explicit. |
| Part data classes (`tmNode/Edge/Path/Poly/Vertex/Crease/Facet`) | respective `.h/.cpp` | (b) Plain TS classes/records. Mostly data + simple geometry (`tmPoint` math, angles, lengths). Drop the `mDpptrTarget` base, the tag/I/O macros, and `friend` access. |
| Ownership (`tm*Owner`, `tmCluster`) | owner `.h/.cpp`, `tmCluster.h` | (b) Collapse: a single owning tree-of-arrays plus derived flat indexes. The `*OwnerAsTree/AsPoly` virtual discriminators become a `kind` tag or discriminated union. |
| Dynamic type/tag system, stream I/O | `tmPart.h` macros, `tmTree_IO.cpp`, all `Putv5/Getv5` | (b) Rewrite. The `.tmd5` format (index-encoded pointers) can be reimplemented; the template tag registry maps to a string→ctor table. |
| Cleanup pipeline (Stage C) | `tmTree.cpp` `CleanupAfterEdit` + `Calc*` | (a) **Pure algorithm — strong WASM candidate**, or careful TS reimplementation. Convex hull, polygon-network fixpoint, depth propagation are geometry/graph math, no UI/optimizer coupling. |
| Poly/molecule + crease construction (Stage D) | `tmPoly.cpp`, `tmPath.cpp`, `tmFacet.cpp`, `tmPolyOwner.cpp` | (a) Pure geometry; the heaviest, most numerically delicate code (insetting, ridgelines, intersection tests with `DistTol/ConvexityTol = 1e-4`). Prime WASM candidate to preserve exact behavior. |
| Facet ordering (Stage E) | `tmTree_FacetOrder.cpp`, `tmRootNetwork`, `tmCorridor` | (a) Pure graph algorithm with scratch flags. WASM or TS; self-contained. |
| `tmCondition` + 13 subclasses | `tmCondition*.{h,cpp}` | (c) **Tightly coupled to optimizers** via `AddConstraints(...)`. Port the data side (which parts, feasibility) as TS, but the constraint-emission half must move with the optimizer port. |
| `tmTreeCleaner` RAII dirty model | `tmTreeCleaner.*` | (b) Replace RAII-on-scope-exit with an explicit `beginEdit()/endEdit()` (depth-counted) wrapper. |

**C++ idioms that are hard to port:**
- **RAII/deterministic destructors** — used for both `tmTreeCleaner` (cleanup trigger) and `tmDpptrTarget` (reference removal). No JS equivalent; both need explicit lifecycle calls.
- **`tmDpptr` pointer auto-nulling on delete** — pervasive; the single largest behavioral change.
- **Heavy template metaprogramming** — `GetParts<P>()` specializations, `MakeTypeArray<R,G>`, the `TM_DECLARE_TAG`/`TM_TEMPLATE_FRIENDS` macros. Replace with a type-string registry; no TS templates needed.
- **`friend`-class-based encapsulation** — every part befriends `tmTree` and the conditions; TS has no `friend`, so use module scoping or accept looser visibility.
- **Multiple inheritance** — `tmTree` and `tmPoly` inherit several owner mixins; flatten into composition.
- **`dynamic_cast`** in condition matching — replace with a discriminant field / `instanceof`.
- **1-based vs 0-based indexing** — `tmArray` mixes both; part `mIndex` is 1-based and load-bearing for I/O. Normalize to 0-based in the port but keep 1-based on the wire if preserving the file format.
- **ISO-8859 source encoding** — these files are Latin-1 (the © bytes), which trips UTF-8 tooling (grep needs `-a`).

**Key takeaway:** the model splits cleanly into (1) a portable plain-data graph layer (nodes/edges/paths/conditions) → idiomatic TS, (2) a large, self-contained, numerically sensitive geometry+graph engine (cleanup pipeline, molecule construction, facet ordering) → excellent WebAssembly candidate for bit-identical output, and (3) the dpptr/RAII/dirty-flag infrastructure → redesign away rather than port. Conditions straddle the model/optimizer boundary and must be co-designed with the optimizer port.
