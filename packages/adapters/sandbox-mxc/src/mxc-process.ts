// Our own narrow view of the part of MXC's SDK (`@microsoft/mxc-sdk/v1`) that
// starts a program: the request `spawn` takes and the process it returns. Like
// `MxcSdk`, it lets a test hand in a fake SDK, so every system runs the tests
// without the real one.

import type { Readable, Writable } from "node:stream";

/** What MXC's network policy says. The adapter writes only the two shapes below, and never an egress rule. */
export interface MxcNetwork {
  egress: { default: "deny" };
  ingress: { default: "allow" | "deny"; hostLoopback: "allow" | "deny" };
  /** The bridge, as MXC's network proxy: the one local port the box reaches (HAL-3365, variant 1a). */
  runtimeConfig?: { networkProxy: string };
}

/** What MXC's `spawn` is asked to start. */
export interface MxcRequest {
  /** The whole Windows command line: the program and its arguments, quoted. */
  command: string;
  workingDirectory: string;
  filesystem: {
    /** Folders the program may read. Never a single file, never a drive root. */
    readonlyPaths: string[];
    /** Folders the program may read and write. */
    readwritePaths: string[];
    /** Paths the program can't touch, files included; wins over both lists above. */
    deniedPaths: string[];
  };
  network: MxcNetwork;
  /** On, with no clipboard and no input injection: without it Node and git don't start (HAL-2444). */
  ui: { disable: false; clipboard: "none"; allowInputInjection: false };
  /** Only these variables; neither the host's nor MXC's own defaults. */
  environment: Record<string, string>;
  inheritDefaultEnvironment: false;
  timeoutMs: number;
}

/** What every `spawn` call is given besides the request: telemetry is off (HAL-7603). */
export interface MxcSpawnOptions {
  telemetry: { enabled: false };
}

/** Passed on every `spawn` call. */
export const spawnOptions: MxcSpawnOptions = { telemetry: { enabled: false } };

/** A program MXC started: the SDK's `MxcProcess`, as far as the adapter reads it. */
export interface MxcProcess {
  standardInput: Writable | null;
  standardOutput: Readable | null;
  standardError: Readable | null;
  /** Settles when the program and everything it started has ended. */
  wait(): Promise<{ exitCode: number | null; timedOut: boolean }>;
  /** Ends the whole process tree. */
  kill(): void | Promise<void>;
  /** Frees what the SDK holds for the process. Called once it has ended. */
  dispose(): void;
}

/** Starts a program in a box. */
export type MxcSpawn = (request: MxcRequest, options: MxcSpawnOptions) => Promise<MxcProcess>;
