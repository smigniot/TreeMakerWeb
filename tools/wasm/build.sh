#!/usr/bin/env bash
#
# Compile the TreeMaker model + optimizers + ALM backend to WebAssembly, with the
# C wrapper in src/wasm/tmwasm.cpp, producing an ES6 module at
# src/wasm/generated/tmengine.{js,wasm}.
#
# Requires the Emscripten SDK on PATH (source ~/emsdk/emsdk_env.sh). Orig/ is
# kept pristine — the same modern-clang source patches as the native oracle are
# applied to a build/ copy (Emscripten uses the same clang front-end).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ORIG="$ROOT/Orig/Source"
BUILD="$HERE/build"
SRC="$BUILD/src"
OUT="$ROOT/src/wasm/generated"
WRAPPER="$ROOT/src/wasm/tmwasm.cpp"

if ! command -v emcc >/dev/null 2>&1; then
  echo "error: emcc not found. Run: source ~/emsdk/emsdk_env.sh" >&2
  exit 1
fi

sedi() { LC_ALL=C sed -i '' "$@"; }

rm -rf "$BUILD"
mkdir -p "$SRC" "$OUT"

cp "$ORIG/tmHeader.cpp" "$ORIG/tmHeader.h" "$SRC/"
cp -R "$ORIG/tmModel" "$SRC/tmModel"

# Modern-clang fixes (see tools/oracle/README.md for rationale).
sedi \
  -e '185s/push_back(/this->push_back(/' \
  -e '209s/erase(/this->erase(/' \
  -e '220s/erase(/this->erase(/' \
  -e '243s/insert(/this->insert(/' \
  -e '296s/erase(/this->erase(/' \
  -e '334s/insert(/this->insert(/' \
  "$SRC/tmModel/tmPtrClasses/tmArray.h"
sedi \
  -e '243s/contains(pt)/this->contains(pt)/' \
  -e '243s/push_back(pt)/this->push_back(pt)/' \
  -e '253s/contains(pt)/this->contains(pt)/' \
  "$SRC/tmModel/tmPtrClasses/tmDpptrArray.h"
sedi -e '/#include "tmArrayIterator.h"/a\
#include "tmTreeCleaner.h"' \
  "$SRC/tmModel/tmTreeClasses/tmTree.h"

# Model sources (ALM backend only; exclude cfsqp/rfsqp/wnlib).
SOURCES=("$SRC/tmHeader.cpp")
while IFS= read -r f; do SOURCES+=("$f"); done < <(
  find "$SRC/tmModel/tmPtrClasses" "$SRC/tmModel/tmTreeClasses" \
       "$SRC/tmModel/tmOptimizers" "$SRC/tmModel/tmSolvers" \
       -name '*.cpp' | sort
)
SOURCES+=("$SRC/tmModel/tmNLCO/tmNLCO.cpp" "$SRC/tmModel/tmNLCO/tmNLCO_alm.cpp")
SOURCES+=("$WRAPPER")

INCLUDES=(-I"$SRC")
while IFS= read -r d; do INCLUDES+=(-I"$d"); done < <(find "$SRC/tmModel" -type d | sort)

# NOTE: the 2005-era optimizer code has latent UB that an -O2 build miscompiles
# (layout-sensitive heap corruption in the edge/strain paths, and occasional
# scale failures). -O1 + SAFE_HEAP runs all golden cases correctly. SAFE_HEAP
# adds bounds-checked loads/stores (~2x slower) but the result is still compiled
# Wasm and far faster than a JS reimplementation. Hardening to a clean -O2 build
# is a tracked follow-up.
OPT=(-O1 -w -sSAFE_HEAP=1)
DEBUG_FLAGS=()
if [ "${DEBUG:-0}" = "1" ]; then
  echo "(debug build: assertions + names)"
  OPT=(-O1 -g2 -sSAFE_HEAP=1)
  DEBUG_FLAGS=(-sASSERTIONS=2 -sDEMANGLE_SUPPORT=1)
fi

echo "Compiling ${#SOURCES[@]} sources to WebAssembly…"
emcc -std=c++14 "${OPT[@]}" -fexceptions \
  "${INCLUDES[@]}" "${SOURCES[@]}" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createTmEngine \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 \
  ${DEBUG_FLAGS[@]+"${DEBUG_FLAGS[@]}"} \
  -sEXPORTED_FUNCTIONS=_tmOptimize,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString \
  -o "$OUT/tmengine.js"

echo "Built: $OUT/tmengine.js + tmengine.wasm"
ls -lh "$OUT"
