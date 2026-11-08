import {
  type Clock,
  compactedChanges,
  type RecordChange,
  type RecordStore,
  type Secrets,
} from "@halonicjs/ports";
import { encodeBase64url } from "@halonicjs/std";

/**
 * A record store that keeps its log in memory, so tests can read and change
 * it. `appended` keeps every change ever appended, also after a compact.
 */
export interface MemoryRecords extends RecordStore {
  readonly log: RecordChange[];
  readonly appended: RecordChange[];
}

export function memoryRecords(): MemoryRecords {
  const log: RecordChange[] = [];
  const appended: RecordChange[] = [];
  return {
    log,
    appended,
    append: async (changes) => {
      log.push(...structuredClone(changes));
      appended.push(...structuredClone(changes));
    },
    changes: async (collection) =>
      structuredClone(log.filter((change) => change.collection === collection)),
    compact: async (collection) => {
      const kept = log.filter((change) => change.collection !== collection);
      const compacted = compactedChanges(
        collection,
        log.filter((change) => change.collection === collection),
      );
      log.splice(0, log.length, ...kept, ...compacted);
    },
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
