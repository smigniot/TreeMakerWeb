# TreeMaker 5 — Serialization & Conditions Analysis

All file references relative to `Source/`.

## SECTION A — File Format / Serialization

### A.1 The format(s)

**Container.** All TreeMaker documents are a single **flat, newline-delimited ASCII** stream — one token per line. No binary format, no nesting/braces, no key names: structure is purely positional (reader and writer must agree on field order and count). The same routines serialize to a file and to an in-memory `stringstream` (the latter powers Undo/Redo). See `tmModel/tmTreeClasses/tmTree_IO.cpp:16-79`.

**Versions** — dispatched on a version string in `tmTree::GetSelf` (`tmTree_IO.cpp:102-144`):
- `"3.0"` — legacy; only nodes/edges/paths recovered, polys/folds discarded (`Getv3Self`, line 630).
- `"4.0"` — nodes/edges/paths + conditions; polys/vertices/creases are placeholders. `Getv4Self` (490), `Putv4Self`/`Exportv4` (429, 150).
- `"5.0"` — full model incl. polys, vertices, creases, facets, conditions. `Getv5Self`/`Putv5Self` (262, 193).

`PutSelf` always writes v5 (`tmTree_IO.cpp:89`); v4 only via explicit `Exportv4`. **The `.tmd5` extension does NOT imply version 5** — the bundled samples under `Source/test/tmModelTester/*.tmd5` are actually **version 4.0**.

**Line endings.** v5 writes `'\n'`; v4 writes `'\r'` (Mac-classic) via scoped `Endl eol('\r')` (`tmTree_IO.cpp:433`, mechanism `tmPart.h:151-156`). Readers accept `\n`, `\r`, `\r\n` (`tmPart::ConsumeTrailingSpace`, `tmPart.cpp:164`).

**Float formatting.** Fixed notation; precision **10** for v5 (`Putv5Self`, lines 196-197), precision **6** for v4 (`Putv4Self`, lines 431-432).

#### Annotated excerpt (real file: `test/tmModelTester/tmModelTester_2.tmd5`, v4.0, CR-delimited)

```
tree          <- class tag string for tmTree (GetTagStr())
4.0           <- version string
1.000000      <- mPaperWidth
1.000000      <- mPaperHeight
0.100000      <- mScale
true          <- mHasSymmetry          (bool -> "true"/"false")
0.500000      <- mSymLoc.x  } tmPoint = two PODs, x then y
0.500000      <- mSymLoc.y
90.000000     <- mSymAngle
33            <- numNodes      } the 7 v4 part counts
32            <- numEdges        (v5 inserts 7 status bools before these
528           <- numPaths         and adds an 8th count, numFacets)
0             <- numPolys
0             <- numVertices
0             <- numCreases
0             <- numConditions
node          <- tmNode tag; first node record begins
1             <- mIndex (1-based)
              <- mLabel (EMPTY string = a blank line)
0.083333      <- mLoc.x
0.103703      <- mLoc.y
true ...      <- mIsLeafNode, mIsSubNode, mIsBorderNode, ... (bools)
1             <- mEdges: array size = 1
32            <-   edge index #1  (pointer stored AS the target's 1-based index)
1             <- mLeafPaths: array size
2 ...         <-   path indices...
```

Per-part field orders: `tmNode::Putv4Self` (`tmNode.cpp:341`) / `Getv4Self` (363); `tmEdge` (`tmEdge.cpp:178/197/216/234`); `tmPath` (`tmPath.cpp:615/648/684/706`). The v5 tree header additionally writes 7 status bools (`mIsFeasible`, `mIsPolygonValid`, `mIsPolygonFilled`, `mIsVertexDepthValid`, `mIsFacetDataValid`, `mIsLocalRootConnectable`, `mNeedsCleanup`) — `Putv5Self` lines 210-216 — and an 8th count `numFacets`.

### A.2 How serialization works

**Layered Put/Get (`tmTree_IO.cpp:28-49`):**
1. **Literals / POD** — `tmPart::PutPOD/GetPOD` overloads (`tmPart.cpp:190-498`) for `int`, `size_t`, `bool`, `tmFloat`, `tmPoint`, `std::string`, `char*`, `tmArray<tmPoint>`. Each writes value + `sEndl`. Booleans serialize as words `true`/`false` (`tmPart.cpp:309`). Empty strings = a blank line (`tmPart.cpp:399-404`); C-strings escape `\n \r \\` and cap at `MAX_LABEL_LEN=31` (`tmPart.cpp:443-498`).
2. **References** — a pointer is stored as **the target's 1-based `mIndex`** (NULL → 0). Templates `tmTree::PutPtr/GetPtr` and `PutPtrArray/GetPtrArray` (`tmTree.h:837-951`). On read, indices resolved against `tmCluster::GetParts<P>()`; a bad index throws `EX_IO_BAD_REF_INDEX` unless `canFail` (`tmTree.h:851-867`). Arrays = size line + that many index lines.
3. **Parts** — each has `Putv5Self/Getv5Self` (+v4/v3) streaming its fields and references in fixed order.

**Two-pass reference resolution (`Getv5Self`, lines 295-320):** reader first reads counts and constructs that many *blank* parts (`new tmNode(this)` …), so all parts exist before any references are resolved; then reads each part's body, resolving index→pointer immediately. Conditions are the exception (created on the fly).

**Dynamic type system / class registry (`tmPart.h` + `tmPart.cpp`):**
- Every persistent class carries a **4-char tag string**, permanent across versions (`tmPart.cpp:43-53`), via `TM_DECLARE_TAG()` / `TM_IMPLEMENT_TAG(Class,"xxxx")` (`tmPart.h:34-53`). Examples: `tree`, `node`, `edge`, `path`, `poly`, `vrtx`, `crse`, `fact`.
- A numeric `Tag()` (assignment-order, *not* persistent) indexes parallel arrays: a `GetTagStrs()` string table and `GetCreatorFns()` factory pointers `tmPart*(*)(tmTree*)`. Both built once by `tmPart::InitTypes()` → `MakeTypeArray<...>` (`tmPart.cpp:659-664`, list `tmPart.h:319-348`). `CreatorFnT<P>::Create` is `new P(aTree)` (`tmPart.h:304-308`).
- `StrToTag`/`TagToStr` (`tmPart.cpp:575-604`) map 4-char code ↔ runtime index. TreeMaker's `MakePart`-by-name factory.

**Polymorphic conditions** (`tmTree_IO.cpp:342-418`): `Putv5Condition` writes `tagStr`, `mIndex`, `mIsFeasibleCondition`, a `numLines` count, then subclass body via virtual `PutRestv4`. `Makev5Condition` reads the tag, calls `GetCreatorFns()[ctag](this)`, `dynamic_cast`s to `tmCondition*`, reads common fields and subclass body via virtual `GetRestv4`. The `numLines` count enables **forward compatibility**: an unrecognized tag (`EX_IO_UNRECOGNIZED_TAG`) is skipped by reading & discarding exactly `numLines` lines (`tmTree_IO.cpp:406-417`).

### A.3 Backward / forward compatibility

- Version dispatch with per-version readers; unknown version → `EX_IO_BAD_TREE_VERSION` (`tmTree_IO.cpp:143`).
- **v3 → v5**: only nodes/edges/paths; polys/folds dropped; old per-node condition flags translated into `tmCondition` objects (v3 node reader reads legacy `nodeIsSymmetric`, `nodeIsPaired`, `nodeXFixed`, `nodeStickToEdge`, `nodeIsCollinear`, … into conditions).
- **v4 → v5**: after `Getv4Self`, polys/vertices/creases killed (`KillPolysAndCreasePattern`) because their formats changed (`tmTree_IO.cpp:130-132`); condition feasibility recomputed via `CalcFeasibility()` (lines 541-543).
- **Writing backward (`Exportv4`)**: clones the tree, strips polys/vertices/creases/internal nodes, writes v4 with CR endings and precision 6.
- Stable tag strings + per-condition `numLines` give both backward (read old) and forward (skip unknown future conditions) tolerance.
- **Float robustness**: reader special-cases TM4's `NAN(017)` tokens, substituting `0.0` (`tmPart.cpp:280-302`).

### A.4 Port assessment (serialization)

**Straightforward to port to TS.** Line-oriented ASCII with positional fields — a `split(/\r\n|\r|\n/)` + cursor-based reader reproduces `GetPOD`; a string-builder reproduces `PutPOD`. A class-tag→constructor map (plain JS object) replaces the template registry; an index→object array (built after reading counts) replaces `PutPtr`/`GetPtr`. Two-pass "create blanks, then fill" ports directly.

Gotchas:
- **Float formatting must match C++** `fixed`/`precision`: v5 = 10 fractional digits, v4 = 6. JS `num.toFixed(n)` matches `std::fixed`/`setprecision(n)` in the common case (both emit trailing zeros); watch rounding-mode edge cases. Round-trip exactness for re-saved files is the main risk.
- **Booleans** are words `true`/`false`, not `0/1`.
- **Empty strings** = a blank line — reader peeks two chars to detect `\n\n`/`\r\r` (`tmPart.cpp:411-436`); replicate the two-char lookahead or you desync.
- **Label escaping** (`\n \r \\`) and the 31-char cap.
- **`NAN(017)`** tokens from old files.
- Line-ending agnostic on read; choose `\n` on write (v5).
- No self-describing keys, no checksums — a single field-count mismatch cascades. Port the exact field order from each `Getv5Self`/`GetRestv4`. The per-condition `numLines` is the only resync anchor.

> Project decision: native format is **JSON**; legacy v3/v4/v5 is **import + export** only, in an isolated module — so all of the above lives behind one legacy serializer, exercised by the `.tmd5` oracles.

---

## SECTION B — Conditions / Constraint System

### B.1 What conditions are

A `tmCondition` is a **high-level, user-specified constraint on the design** (e.g. "this flap node sits on the paper edge"). The code separates (`tmCondition.cpp:14-33`):
- a **condition** — high-level, attached to tree parts, persisted; and
- a **constraint** — a low-level mathematical equality/inequality (`tmDifferentiableFn` over a `vector<tmFloat>` state vector) consumed by the optimizer.

One condition emits **one or more constraints**, varying by which optimizer is running and which referenced nodes are currently movable.

`tmCondition` (abstract, `tmCondition.h:31-71`) is a `tmPart` subclass. Key virtuals: `IsNodeCondition/IsEdgeCondition/IsPathCondition`, `Uses(tmPart*)`, `IsValidCondition()`, `CalcFeasibility()`, the three `AddConstraints(...)` overloads, and the I/O trio `GetNumLinesRest/PutRestv4/GetRestv4`. Common stored state: `mIndex`, `mIsFeasibleCondition`, owner (`tmConditionOwner`, normally the tree).

### B.2 Condition types

All in `Source/tmModel/tmTreeClasses/`. Tags from `TM_IMPLEMENT_TAG`.

| Class | Tag | Kind | Constrains | Stored fields (`PutRestv4`) | Constraint fn(s) |
|---|---|---|---|---|---|
| `tmConditionNodeFixed` | `CNfn` | node | One/both coords of a leaf node fixed | node, mXFixed, mYFixed, mXFixValue, mYFixValue (5) | `OneVarFn` (linear eq.) |
| `tmConditionNodeOnEdge` | `CNen` | node | Node lies on any paper edge | node (1) | `StickToEdgeFn` (nonlinear eq.) |
| `tmConditionNodeOnCorner` | `CNkn` | node | Node lies on a paper corner | node (1) | two `CornerFn` (nonlinear eq.) |
| `tmConditionNodeSymmetric` | `CNsn` | node | Node on the symmetry line | node (1) | `StickToLineFn` (linear eq.); infeasible if no symmetry |
| `tmConditionNodesPaired` | `CNpn` | node | Two nodes mirror across symmetry | node1, node2 (2) | `PairFn1A/1B` (both movable) or `PairFn2A/2B` |
| `tmConditionNodesCollinear` | `CNcn` | node | Three nodes collinear | node1, node2, node3 (3) | `CollinearFn1/2/3` by movability |
| `tmConditionEdgeLengthFixed` | `CNfe` | edge | Edge strain forced to 0 | edge (1) | `OneVarFn` (linear eq.) |
| `tmConditionEdgesSameStrain` | `CNes` | edge | Two edges equal strain | edge1, edge2 (2) | `TwoVarFn` (linear eq.) |
| `tmConditionPathActive` | `CNap` | path | A leaf path is active (taut at min) | node1, node2 (2; path via `FindLeafPath`) | `PathFn1` / `StrainPathFn1-3` / `MultiStrainPathFn1-3` |
| `tmConditionPathAngleFixed` | `CNfp` | path | Active path + angle fixed to `mAngle` | inherits PathActive + mAngle (2+1) | PathActive set + `PathAngleFn1/2` |
| `tmConditionPathAngleQuant` | `CNqp` | path | Active path + angle quantized | inherits PathActive + mQuant, mQuantOffset (2+2) | PathActive set + `QuantizeAngleFn1/2` |
| `tmConditionNodeCombo` | `CNxn` | node | Combined node condition (v5) | node, toSym, toEdge, toCorner, xFixed, xFixValue, yFixed, yFixValue (8) | union of node fns, gated by flags |
| `tmConditionPathCombo` | `CNxp` | path | Combined path condition (v5) | node1, node2, isAngleFixed, angle, isAngleQuant, quant, quantOffset (7) | union of PathActive + angle fns |

The two `*Combo` classes are the modern (v5-era) unified UI objects; the individual types are largely v4 building blocks (`NodeCombo::GetRestv4` notes it only appears in v5 files). All registered in `tmPart.h:335-347`.

### B.3 How conditions connect to the optimizer

Each optimizer, when building its problem, iterates the tree's conditions and lets each inject its constraints:

```
tmArrayIterator<tmCondition*> iConditions(theTree->GetConditions());
while (iConditions.Next(&aCondition)) aCondition->AddConstraints(this);
```
(`tmScaleOptimizer.cpp:90-92`, `tmEdgeOptimizer.cpp:134-136`, `tmStrainOptimizer.cpp:144-146`.)

Inside each `AddConstraints(tmXxxOptimizer*)`:
1. Calls `t->GetBaseOffset(node/edge)` to find the part's slot in the state vector; `BAD_OFFSET` means fixed/not a variable.
2. Builds one or more `tmDifferentiableFn` constraint objects (the `*Fn` classes in `tmOptimizers/tmConstraintFns.h`), choosing the variant by movability count.
3. Hands them to the optimizer via `t->GetNLCO()->AddLinearEquality(...)` / `AddNonlinearEquality(...)` (interface `tmNLCO/tmNLCO.h:155-158`; NLCO pluggable — ALM/etc.).

Separately, `CalcFeasibility()` (e.g. `tmConditionNodeFixed.cpp:116`) evaluates the *same* `*Fn` objects against current node coordinates and `IsTiny(...)` (tolerance `DistTol()=1e-4`, `tmPart.h:109-116`) to set the persisted `mIsFeasibleCondition` flag used by the UI — independent of an optimization run.

### B.4 Port assessment (conditions)

**Portable, and the cleanest part of the model — but it pulls in the optimizer.**

- The condition objects are trivial: small fixed field sets, a `Uses`/`IsValid`/`CalcFeasibility` predicate, and the `AddConstraints` dispatch. Map directly to TS classes with a discriminated-union `tag` + a small factory map keyed by the 4-char string (reuse the serialization registry).
- `AddConstraints` logic is branching on movability + constructing constraint-function descriptors; straightforward.
- **The real work is the optimizer**, not the conditions. To make conditions *do* anything you must port (a) the `tmDifferentiableFn` family in `tmConstraintFns.h` (each needs `Func` and gradient `Grad`), and (b) a nonlinear constrained optimizer (`tmNLCO`). No drop-in JS equivalent — the main porting cost (see doc 02).
- If v1 only needs to **load/display/edit** designs, conditions can be ported as pure data + feasibility check (`CalcFeasibility` needs only `*Fn::Func`, not gradients or the solver), deferring the optimizer. **This is the P1 plan.**
- Gotchas: symmetry-based conditions return infeasible when `mTree->HasSymmetry()` is false (`tmConditionNodeSymmetric.cpp:79`); path conditions store endpoint nodes and re-derive the path via `FindLeafPath` on load (`tmConditionPathActive.cpp:275`), so the path graph must be rebuilt before conditions are finalized.

### Key files
- Serialization: `tmTree_IO.cpp`, `tmPart.cpp`, `tmPart.h`, `tmTree.h` (PutPtr templates 837-951); per-part `tmNode.cpp`/`tmEdge.cpp`/`tmPath.cpp`.
- Conditions: `tmCondition.{h,cpp}` + the 13 `tmConditionXxx.{h,cpp}`.
- Optimizer link: `tmOptimizers/{tmScale,tmEdge,tmStrain}Optimizer.cpp`, `tmConstraintFns.h`; NLCO backends in `tmNLCO/`.
- Sample data (**v4.0**, CR-delimited): `test/tmModelTester/tmModelTester_{1..5}.tmd5`.
