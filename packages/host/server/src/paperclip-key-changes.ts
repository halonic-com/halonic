import type { Clock, Coordination } from "@halonicjs/ports";
import { updateRecord } from "./versioned-record.ts";

/**
 * Who connected or disconnected a Paperclip key, and when (`server.paperclip-key-password`):
 * the newest {@link keptChanges} in one `Coordination` value, which `halonic serve devices` and
 * `GET /api/devices` show. It names the connection, never its key.
 */
export const keyChangesKey = "paperclip-keys:changes";

/** The record keeps only the newest of these; older ones are dropped on each write. */
export const keptChanges = 20;

/** One change to a connection's stored key. */
export interface KeyChange {
  readonly connection: string;
  /** `connected` puts a key in the store, replacing any; `disconnected` takes it out. */
  readonly change: "connected" | "disconnected";
  /** The id of the device whose session asked, or `browser` for a password session. */
  readonly by: string;
  readonly at: string;
}

const recordVersion = 1;

/** Adds a change, stamped now, and drops the oldest past {@link keptChanges}. */
export async function recordKeyChange(
  { coordination, clock }: { readonly coordination: Coordination; readonly clock: Clock },
  change: Omit<KeyChange, "at">,
): Promise<void> {
  const entry: KeyChange = { ...change, at: clock.now().toISOString() };
  await updateRecord(coordination, keyChangesKey, (stored) =>
    JSON.stringify({
      version: recordVersion,
      changes: [...readChanges(stored), entry].slice(-keptChanges),
    }),
  );
}

/** The changes, oldest first. */
export async function keyChanges(coordination: Coordination): Promise<readonly KeyChange[]> {
  return readChanges(await coordination.read(keyChangesKey));
}

/** The changes in a stored record; one of another version, or that doesn't read, holds none. */
function readChanges(stored: string | null): KeyChange[] {
  if (stored === null) {
    return [];
  }
  try {
    const record = JSON.parse(stored) as { version?: unknown; changes?: unknown };
    if (record?.version !== recordVersion || !Array.isArray(record.changes)) {
      return [];
    }
    return record.changes.filter(isKeyChange).map(({ connection, change, by, at }) => ({
      connection,
      change,
      by,
      at,
    }));
  } catch {
    return [];
  }
}

function isKeyChange(value: unknown): value is KeyChange {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const fields = value as Record<string, unknown>;
  return (
    ["connection", "by", "at"].every((field) => typeof fields[field] === "string") &&
    (fields["change"] === "connected" || fields["change"] === "disconnected")
  );
}
