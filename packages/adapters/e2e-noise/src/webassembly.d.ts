/**
 * The few WebAssembly globals this package uses. Node has them all, but the
 * Node tsconfig leaves out the DOM library that declares them, and
 * `@types/node` doesn't.
 */
declare namespace WebAssembly {
  class Module {
    constructor(bytes: Uint8Array);
  }
  class Instance {
    constructor(module: Module, imports: Record<string, Record<string, unknown>>);
    readonly exports: Record<string, unknown>;
  }
  class Memory {
    readonly buffer: ArrayBuffer;
  }
  class RuntimeError extends Error {}
}
