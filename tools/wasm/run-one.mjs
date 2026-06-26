// Run a single optimization in an isolated process and print the result JSON.
// Used by the golden regression test (one fresh Wasm realm per case) and handy
// for manual checks:  node tools/wasm/run-one.mjs <fixture.tmd5> <mode 0|1|2>
import createTmEngine from '../../src/wasm/generated/tmengine.js';
import { readFileSync } from 'node:fs';

const [, , file, modeArg] = process.argv;
const mode = Number(modeArg ?? 0);
const text = readFileSync(file, 'latin1');
const M = await createTmEngine();
const ptr = M.ccall('tmOptimize', 'number', ['string', 'number'], [text, mode]);
const json = M.UTF8ToString(ptr);
M._free(ptr);
process.stdout.write(json);
