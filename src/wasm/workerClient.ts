// Main-thread client for the WebAssembly engine. In the browser it offloads
// work to a Web Worker (so the UI stays responsive); in environments without
// Workers (Node/tests) it falls back to running the engine directly in-realm.
// The public API matches the direct engine functions.

import * as direct from './engine';
import type { OptimizeMode, OptimizeResult, CreasePatternResult } from './engine';
import type { WorkerRequest, WorkerResponse } from './worker';

const hasWorker = typeof Worker !== 'undefined';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    };
    worker.onerror = (e) => {
      const err = new Error(`worker error: ${e.message}`);
      for (const [, p] of pending) p.reject(err);
      pending.clear();
    };
  }
  return worker;
}

/** Omit that distributes over the request union (plain Omit collapses it). */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

function call<T>(req: WithoutId<WorkerRequest>): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ ...req, id } as WorkerRequest);
  });
}

export function optimize(docText: string, mode: OptimizeMode): Promise<OptimizeResult> {
  if (!hasWorker) return direct.optimize(docText, mode);
  return call<OptimizeResult>({ kind: 'optimize', docText, mode });
}

export function specBuildCreasePattern(spec: string, mode: OptimizeMode): Promise<CreasePatternResult> {
  if (!hasWorker) return direct.specBuildCreasePattern(spec, mode);
  return call<CreasePatternResult>({ kind: 'specBuildCP', spec, mode });
}

export function exportV5(spec: string, mode: number): Promise<string> {
  if (!hasWorker) return direct.exportV5(spec, mode);
  return call<string>({ kind: 'exportV5', spec, mode });
}
