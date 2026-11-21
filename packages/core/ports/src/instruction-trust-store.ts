/** Version of the {@link InstructionTrustStore} port. A breaking change bumps it and comes with an ADR. */
export const instructionTrustStoreVersion = 1;

/** What a run's instructions were: a digest per file, and one digest for all of them. */
export interface InstructionPin {
  /** The digest of the whole set, so two runs with the same instructions share it. */
  readonly digest: string;
  /** Each file's `sha256:` digest, by file name. */
  readonly files: Readonly<Record<string, string>>;
}

/** How a set of instructions differs from a trusted pin. */
export interface InstructionChanges {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}

/** Which agent's instructions a trusted pin is for; {@link instructionTrustKey} makes one. */
export interface InstructionTrustKey {
  /** The workspace's resolved real path, as in a `TrustRecord`. */
  location: string;
  /** The agent's hub and id, as `support/coder`. */
  agent: string;
}

/**
 * The key of one agent's trusted instructions: the workspace, and the agent's
 * hub and id together, so two hubs that each have an agent `coder` each have
 * their own pin (HAL-14875). Every place that checks or trusts a pin makes its
 * key here. A pin saved under the bare id, before the hub was part of the key,
 * matches no key, so it counts as not trusted and a person is asked again.
 * Hub and agent ids have no `/`, so no two agents share a key.
 *
 * @example
 * instructionTrustKey("/workspaces/acme", "support", "coder");
 * // { location: "/workspaces/acme", agent: "support/coder" }
 */
export function instructionTrustKey(
  location: string,
  hub: string,
  agent: string,
): InstructionTrustKey {
  return { location, agent: `${hub}/${agent}` };
}

/**
 * The instructions a person trusted for one agent (requirement
 * `ports.instruction-trust-store`): the pin of its `AGENTS.md` and skills as
 * they were when the person said yes. Without a record, nothing is trusted
 * and a person is asked.
 *
 * @example
 * const trusted: InstructionTrustRecord = {
 *   location: "/workspaces/acme",
 *   agent: "coder",
 *   pin: { digest: "sha256:9f86d0…", files: { "AGENTS.md": "sha256:2c26b4…" } },
 *   grantedAt: "2026-11-15T10:00:00.000Z",
 * };
 */
export interface InstructionTrustRecord extends InstructionTrustKey {
  /** The instructions the person trusted. */
  pin: InstructionPin;
  /** When the person trusted them, as ISO text. */
  grantedAt: string;
}

/**
 * Each agent's trusted instructions, in the user's profile next to the trust
 * records: the profile folder for the CLI and `serve`, the app data folder
 * for the desktop app, memory for tests and the browser demo. **Never inside
 * a workspace**, so an agent that edits its own instructions can't also trust
 * them.
 *
 * The port only stores pins. `instructionTrust` in `core/app` compares one
 * with the instructions a run has, and the engine asks. Only a person trusts
 * instructions: no tool the model can call reaches this store.
 *
 * A record that exists but can't be read makes `get` throw, never return
 * `null`: the caller then asks the person, never trusts, and says why. The
 * error names the record's key, and `remove` still deletes it.
 */
export interface InstructionTrustStore {
  /** The trusted instructions for one agent, or `null` when there are none. */
  get(key: InstructionTrustKey): Promise<InstructionTrustRecord | null>;
  /** Saves trusted instructions, replacing any with the same key. */
  save(record: InstructionTrustRecord): Promise<void>;
  /**
   * Deletes the trusted instructions for one agent, even a record that can't
   * be read. Removing a record that isn't there is not an error.
   */
  remove(key: InstructionTrustKey): Promise<void>;
}

const recordFields = ["location", "agent", "pin", "grantedAt"] as const;
const pinFields = ["digest", "files"] as const;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;

/** Whether `value` is a plain object with exactly `fields`, each its own property. */
function hasExactlyFields(
  value: unknown,
  fields: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return (
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function isPin(value: unknown): value is InstructionPin {
  if (!hasExactlyFields(value, pinFields)) return false;
  const digest = value["digest"];
  const files = value["files"];
  if (typeof digest !== "string" || !digestPattern.test(digest)) return false;
  if (typeof files !== "object" || files === null || Array.isArray(files)) return false;
  return Object.values(files).every(
    (fileDigest) => typeof fileDigest === "string" && digestPattern.test(fileDigest),
  );
}

/**
 * Whether `value`, as read back from a store, is valid trusted instructions
 * for `key`: exactly the fields of an {@link InstructionTrustRecord}, the key
 * asked for, a pin whose `digest` and every file digest are in `sha256:` form,
 * and a time that is text. Anything else is a damaged or borrowed record, such
 * as a hand edit or a file copied from another agent, and must never count as
 * trust. Every adapter checks what it reads with this, and the service in
 * `core/app` checks what an adapter gives back with it again.
 *
 * @example
 * isInstructionTrustFor(key, JSON.parse(text)); // false for `{ ...record, trusted: true }`
 */
export function isInstructionTrustFor(
  key: InstructionTrustKey,
  value: unknown,
): value is InstructionTrustRecord {
  if (!hasExactlyFields(value, recordFields)) return false;
  return (
    value["location"] === key.location &&
    value["agent"] === key.agent &&
    typeof value["grantedAt"] === "string" &&
    isPin(value["pin"])
  );
}
