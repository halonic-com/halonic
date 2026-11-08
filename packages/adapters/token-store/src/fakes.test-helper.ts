import type { Clock, RecordChange, RecordStore, Secrets } from "@halonicjs/ports";
import { encodeBase64url } from "./base64url.ts";

/** A record store that keeps its log in memory, so tests can read and change it. */
export interface MemoryRecords extends RecordStore {
  readonly log: RecordChange[];
}

export function memoryRecords(): MemoryRecords {
  const log: RecordChange[] = [];
  return {
    log,
    append: async (changes) => {
      log.push(...structuredClone(changes));
    },
    changes: async (collection) =>
      structuredClone(log.filter((change) => change.collection === collection)),
  };
}

/** Secrets held in a map, counting how often each name is read. */
export interface MemorySecrets extends Secrets {
  readonly values: Map<string, string>;
  readonly reads: Map<string, number>;
}

export function memorySecrets(entries: Record<string, string> = {}): MemorySecrets {
  const values = new Map(Object.entries(entries));
  const reads = new Map<string, number>();
  return {
    values,
    reads,
    get: async (name) => {
      reads.set(name, (reads.get(name) ?? 0) + 1);
      return values.get(name) ?? null;
    },
  };
}

/** A fresh random token key in the configured form. */
export function randomTokenKey(): string {
  return encodeBase64url(crypto.getRandomValues(new Uint8Array(32)));
}

export const fixedClock: Clock = { now: () => new Date("2026-11-08T12:00:00.000Z") };
