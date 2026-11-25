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

/**
 * The newest sign-ins started: who started each, and whether its `connected` is recorded yet, so
 * the record names the device that started a sign-in and holds one `connected` per sign-in.
 */
export const keySignInsKey = "paperclip-keys:sign-ins";

/** The sign-in list keeps only the newest of these. */
const keptSignIns = 20;

interface StartedSignIn {
  readonly signInId: string;
  /** As {@link KeyChange.by}: the session that started the sign-in. */
  readonly by: string;
  readonly recorded: boolean;
}

/** Notes that `by` started the sign-in `signInId`, for {@link claimConnected}. */
export async function rememberSignIn(
  coordination: Coordination,
  signInId: string,
  by: string,
): Promise<void> {
  await updateSignIns(coordination, signInId, () => ({ signInId, by, recorded: false }));
}

/**
 * Marks the sign-in's `connected` as recorded and says whom to record it for: the session that
 * started it, or `poller` when the list no longer holds it. `null` when it is recorded already,
 * so polls after the first add nothing.
 */
export async function claimConnected(
  coordination: Coordination,
  signInId: string,
  poller: string,
): Promise<string | null> {
  let by: string | null = null;
  await updateSignIns(coordination, signInId, (known) => {
    if (known?.recorded === true) {
      by = null;
      return undefined;
    }
    by = known?.by ?? poller;
    return { signInId, by, recorded: true };
  });
  return by;
}

/** Puts `next`'s entry for `signInId` last in the list, or leaves the list when it gives `undefined`. */
async function updateSignIns(
  coordination: Coordination,
  signInId: string,
  next: (known: StartedSignIn | undefined) => StartedSignIn | undefined,
): Promise<void> {
  await updateRecord(coordination, keySignInsKey, (stored) => {
    const signIns = readSignIns(stored);
    const entry = next(signIns.find((signIn) => signIn.signInId === signInId));
    if (entry === undefined) {
      return undefined;
    }
    const others = signIns.filter((signIn) => signIn.signInId !== signInId);
    return JSON.stringify({
      version: recordVersion,
      signIns: [...others, entry].slice(-keptSignIns),
    });
  });
}

function readSignIns(stored: string | null): StartedSignIn[] {
  return readList(stored, "signIns")
    .filter(isStartedSignIn)
    .map(({ signInId, by, recorded }) => ({ signInId, by, recorded }));
}

function isStartedSignIn(value: unknown): value is StartedSignIn {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const fields = value as Record<string, unknown>;
  return (
    ["signInId", "by"].every((field) => typeof fields[field] === "string") &&
    typeof fields["recorded"] === "boolean"
  );
}

/** The changes, oldest first. */
export async function keyChanges(coordination: Coordination): Promise<readonly KeyChange[]> {
  return readChanges(await coordination.read(keyChangesKey));
}

/** The changes in a stored record; one of another version, or that doesn't read, holds none. */
function readChanges(stored: string | null): KeyChange[] {
  return readList(stored, "changes")
    .filter(isKeyChange)
    .map(({ connection, change, by, at }) => ({ connection, change, by, at }));
}

/** The list under `field` in a stored record; one of another version, or that doesn't read, holds none. */
function readList(stored: string | null, field: string): unknown[] {
  if (stored === null) {
    return [];
  }
  try {
    const record = JSON.parse(stored) as Record<string, unknown> | null;
    const list = record?.[field];
    return record?.["version"] === recordVersion && Array.isArray(list) ? list : [];
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
