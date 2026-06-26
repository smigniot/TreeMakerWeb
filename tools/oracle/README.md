# Oracle harness

Builds the native TreeMaker **model** (no GUI) from the vendored `Orig/` source
and runs `tmModelTester` to produce golden numeric outputs. These are the
regression baseline for the ported optimizer (P2) and prove the model layer is
cleanly separable (it compiles with zero wxWidgets/GUI dependencies).

## Run

```bash
npm run oracle          # == bash tools/oracle/build_and_run.sh
```

Outputs:
- `oracle.out.txt` — raw tester output (committed).
- `baseline.json` — extracted key values for the TS tests (committed).
- `build/` — patched working copy + binary (git-ignored).

Requires a C++ toolchain (`clang++`). ALM backend only — CFSQP/RFSQP/wnlib are
excluded (sources absent / not needed).

## Orig/ stays pristine

The script copies the needed sources into `build/src/` and applies three small,
mechanical fixes so 2005-era code compiles under a modern (two-phase-lookup)
clang. `Orig/` itself is never modified. The fixes:

1. `tmArray.h` / `tmDpptrArray.h` — qualify base-class calls (`this->push_back`,
   `this->erase`, `this->insert`, `this->contains`); their bases are dependent
   template types (`std::vector<T>`, `tmArray<T*>`).
2. `tmTree.h` — `#include "tmTreeCleaner.h"` so inline methods that construct a
   `tmTreeCleaner` see the complete type.

The **same fixes are needed for the P2 Emscripten/Wasm build** (identical clang
front-end), so this script doubles as the reference for that toolchain.

## Platform-sensitivity caveat (important for regression design)

The ALM optimizer solves a **non-convex** circle/river-packing problem, so the
final result is sensitive to floating-point/compiler/platform differences:

| Case | Historical (2005, GCC 4) | This build (clang) | Note |
|---|---|---|---|
| file_1 scale | 0.517637 | 0.517638 | matches to ~6 digits |
| file_5 RMS strain | 3.580266% | 3.580266% | exact |
| file_2 scale | 0.074658 | 0.073832 | drifts (~1%) |
| file_3 scale | 0.056381 | 0.049425 | drifts (~12%) |

Takeaways encoded in `baseline.json`:
- The **simple** cases (file_1, file_5) are tight **anchors** (tol ≤ 1e-3).
- The **complex** cases drift; use generous tolerances and treat `feasible` +
  order-of-magnitude as the signal, not exact equality.
- The right comparison for the Wasm port is **Wasm vs. this machine's native
  build** (same source), regenerated via `npm run oracle` — not the 2005 numbers.

(Cosmetic: `file_4`'s "Elapsed time" prints a garbage value — a pre-existing
quirk in the tester's edge-optimization timing path; ignore it.)
