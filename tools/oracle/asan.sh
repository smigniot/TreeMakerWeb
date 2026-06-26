#!/usr/bin/env bash
#
# Build the native tmModelTester with AddressSanitizer + UndefinedBehavior
# Sanitizer and run it on the fixtures, to pinpoint the latent memory bug that
# makes the hardest packings nondeterministic under WebAssembly (DESIGN follow-up).
#
# Reuses the patched source copy created by build_and_run.sh (Orig/ stays
# pristine). Usage: bash tools/oracle/asan.sh

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ORIG="$ROOT/Orig/Source"
SRC="$HERE/build/src"
TESTDIR="$ORIG/test/tmModelTester/"

if [ ! -d "$SRC" ]; then
  echo "patched source missing — running build_and_run.sh first…"
  bash "$HERE/build_and_run.sh" >/dev/null 2>&1 || true
fi

SOURCES=("$SRC/tmHeader.cpp")
while IFS= read -r f; do SOURCES+=("$f"); done < <(
  find "$SRC/tmModel/tmPtrClasses" "$SRC/tmModel/tmTreeClasses" \
       "$SRC/tmModel/tmOptimizers" "$SRC/tmModel/tmSolvers" -name '*.cpp' | sort
)
SOURCES+=("$SRC/tmModel/tmNLCO/tmNLCO.cpp" "$SRC/tmModel/tmNLCO/tmNLCO_alm.cpp")
SOURCES+=("$SRC/test/tmModelTester.cpp")

INCLUDES=(-I"$SRC")
while IFS= read -r d; do INCLUDES+=(-I"$d"); done < <(find "$SRC/tmModel" -type d | sort)

BIN="$HERE/build/tmModelTester_asan"
echo "Compiling with ASan + UBSan…"
clang++ -std=c++14 -O1 -g -fno-omit-frame-pointer -w -fexceptions \
  -fsanitize=address,undefined -fno-sanitize-recover=all \
  "${INCLUDES[@]}" "${SOURCES[@]}" -o "$BIN"

echo "Running (cwd = test dir)…"
cd "$TESTDIR"
ASAN_OPTIONS=abort_on_error=1:detect_leaks=0 \
UBSAN_OPTIONS=print_stacktrace=1 \
  "$BIN"
