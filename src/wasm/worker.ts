/// <reference lib="webworker" />
// Web Worker that runs the WebAssembly optimizer / crease-pattern builder off
// the main thread, so heavy solves don't freeze the UI. It loads the engine
// (and thus the wasm) in the worker realm and handles request/response messages
// correlated by id. See workerClient.ts for the main-thread side.

import { optimize, specBuildCreasePattern } from './engine';

export type WorkerRequest =
  | { id: number; kind: 'optimize'; docText: string; mode: number }
  | { id: number; kind: 'specBuildCP'; spec: string; mode: number };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    const result =
      msg.kind === 'optimize'
        ? await optimize(msg.docText, msg.mode)
        : await specBuildCreasePattern(msg.spec, msg.mode);
    ctx.postMessage({ id: msg.id, ok: true, result } satisfies WorkerResponse);
  } catch (e) {
    ctx.postMessage({ id: msg.id, ok: false, error: (e as Error).message } satisfies WorkerResponse);
  }
};
