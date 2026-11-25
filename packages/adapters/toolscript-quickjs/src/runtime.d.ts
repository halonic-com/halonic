/**
 * The few runtime globals the engine loader uses. Every runtime the isolate
 * runs on (Node, Workers, browsers) has them, but the host tsconfig's Web
 * types leave them out.
 */
declare namespace WebAssembly {
  class Module {}
  class Memory {
    constructor(descriptor: { readonly initial: number; readonly maximum: number });
    readonly buffer: ArrayBuffer;
    grow(pages: number): number;
  }
  function compile(bytes: ArrayBuffer | Uint8Array): Promise<Module>;
}

declare function atob(data: string): string;
