import { readFileSync } from "node:fs";

/**
 * The functions `noise.wasm` exports: `snow` behind the crate
 * `apps/studio/src-tauri/crates/e2e-noise-wasm`. Each returns a length, or
 * -1 when the call failed; after one failure every call fails.
 */
export interface NoiseExports {
  readonly memory: WebAssembly.Memory;
  noise_input(): number;
  noise_output(): number;
  noise_buffer_bytes(): number;
  noise_start(handshake: number, role: number, prologueLength: number): number;
  noise_write(payloadLength: number): number;
  noise_read(messageLength: number): number;
  noise_is_transport(): number;
  noise_handshake_hash(): number;
  noise_remote_static(): number;
  noise_rekey_outgoing(): number;
  noise_rekey_incoming(): number;
}

/**
 * Fills `length` bytes at `pointer` in the instance's memory with random
 * bytes, and returns 1. It may throw, which ends the call that needed it.
 */
export type RandomFillImport = (pointer: number, length: number) => number;

/** Makes one instance, with the random function it imports. Tests pass their own. */
export type InstantiateNoise = (randomFill: RandomFillImport) => NoiseExports;

let compiled: WebAssembly.Module | undefined;

/** The module, compiled once per process; every session gets its own instance of it. */
function noiseModule(): WebAssembly.Module {
  compiled ??= new WebAssembly.Module(readFileSync(new URL("./noise.wasm", import.meta.url)));
  return compiled;
}

/** A new instance of `noise.wasm`, with fresh memory. */
export const instantiateNoise: InstantiateNoise = (randomFill) => {
  const instance = new WebAssembly.Instance(noiseModule(), {
    halonic: { random_fill: randomFill },
  });
  return instance.exports as unknown as NoiseExports;
};
