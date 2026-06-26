#!/usr/bin/env bash
#
# Build and run the native TreeMaker model tester (ALM backend only) from the
# vendored Orig/ source, to produce GOLDEN reference outputs that the TypeScript
# port regression-tests against. See DESIGN.md §7.
#
# The model layer (tmModel) has no GUI/wxWidgets dependency, so this compiles
# standalone. CFSQP/RFSQP/wnlib backends are excluded (sources absent / not
# needed — only tmUSE_ALM is defined in tmNLCO.h).
#
# Orig/ is kept 100% pristine: the build copies the needed sources into
# build/src/ and applies a handful of mechanical fixes there (2005-era code under
# a modern two-phase-lookup clang). The same patches are reusable for the P2
# Emscripten/Wasm build, which hits the identical compile issues.
#
# Usage:  bash tools/oracle/build_and_run.sh
# Output: tools/oracle/oracle.out.txt  (committed; the regression baseline)

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ORIG="$ROOT/Orig/Source"
BUILD="$HERE/build"
SRC="$BUILD/src"            # patched working copy
TESTDIR="$ORIG/test/tmModelTester/"

# LC_ALL=C: sources are Latin-1 (© byte) and trip UTF-8-aware sed.
sedi() { LC_ALL=C sed -i '' "$@"; }

rm -rf "$BUILD"
mkdir -p "$SRC"

# --- Copy just what the model needs into a patchable working tree ------------
cp "$ORIG/tmHeader.cpp" "$ORIG/tmHeader.h" "$SRC/"
cp -R "$ORIG/tmModel" "$SRC/tmModel"

# --- Mechanical fixes for modern clang (Orig/ untouched) ---------------------
# (1) tmArray<T> : std::vector<T> and tmDpptrArray<T> : tmArray<T*> call base
#     members unqualified; two-phase lookup now requires `this->`.
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
# (2) tmTree.h has inline methods constructing a `tmTreeCleaner` (only
#     forward-declared); the type must be complete where those bodies are parsed.
sedi -e '/#include "tmArrayIterator.h"/a\
#include "tmTreeCleaner.h"' \
  "$SRC/tmModel/tmTreeClasses/tmTree.h"

# --- Patch the tester's hard-coded test-file path to our vendored location ---
mkdir -p "$SRC/test"
LC_ALL=C sed "s|/users/rjlang/C++Projects/TreeMaker_5/Source/test/tmModelTester/|$TESTDIR|" \
  "$ORIG/test/tmModelTester/tmModelTester.cpp" > "$SRC/test/tmModelTester.cpp"

# --- Collect sources (exclude unused / non-compilable backends) --------------
SOURCES=("$SRC/tmHeader.cpp")
while IFS= read -r f; do SOURCES+=("$f"); done < <(
  find "$SRC/tmModel/tmPtrClasses" "$SRC/tmModel/tmTreeClasses" \
       "$SRC/tmModel/tmOptimizers" "$SRC/tmModel/tmSolvers" \
       -name '*.cpp' | sort
)
SOURCES+=("$SRC/tmModel/tmNLCO/tmNLCO.cpp" "$SRC/tmModel/tmNLCO/tmNLCO_alm.cpp")
SOURCES+=("$SRC/test/tmModelTester.cpp")

# --- Header search paths: Source root + every model subdir -------------------
INCLUDES=(-I"$SRC")
while IFS= read -r d; do INCLUDES+=(-I"$d"); done < <(find "$SRC/tmModel" -type d | sort)

BIN="$BUILD/tmModelTester"
echo "Compiling ${#SOURCES[@]} source files (ALM backend)…"
# -std=c++14: the code uses dynamic exception specifications, removed in C++17.
clang++ -std=c++14 -O2 -w -fexceptions "${INCLUDES[@]}" "${SOURCES[@]}" -o "$BIN"

echo "Running tester (cwd = test dir so relative reads resolve)…"
OUT="$HERE/oracle.out.txt"
( cd "$TESTDIR" && "$BIN" ) | tee "$OUT"
echo ""
echo "Golden output written to: $OUT"
