// Type declaration for the Emscripten-generated module (tmengine.js).
// Built by tools/wasm/build.sh; see ../engine.ts for the typed wrapper.

export interface TmEngineModule {
  ccall(name: string, returnType: string | null, argTypes: string[], args: unknown[]): number;
  UTF8ToString(ptr: number): string;
  _free(ptr: number): void;
  _malloc(size: number): number;
}

export default function createTmEngine(opts?: Record<string, unknown>): Promise<TmEngineModule>;
