// Where each agent's harness runs, as `app.agent-placement` asks: in a
// sandbox on this computer, or on this computer outside a sandbox when a
// person chose that for the agent's file as it is now. A choice made for an
// earlier version of the file counts as no choice (Julian, HAL-1709).

import {
  type AgentPlacementKey,
  type AgentPlacementStore,
  type Clock,
  type Digest,
  isAgentPlacementFor,
} from "@halonicjs/ports";
import { bytesToHex, err, ok, type Result } from "@halonicjs/std";

/** The agent a placement question is about. */
export interface PlacementSubject extends AgentPlacementKey {
  /**
   * The agent's file exactly as it is on disk. Its fingerprint is taken over
   * these raw bytes, so even a whitespace edit asks the person again
   * (Liam, HAL-1967).
   */
  readonly file: Uint8Array;
}

/** Why an agent runs in a sandbox. */
export type SandboxReason =
  /** No person chose "this computer" for the agent. */
  | "not-chosen"
  /** A person chose "this computer" for an earlier version of the agent's file. */
  | "file-changed"
  /** The choice exists but can't be read. */
  | "unreadable";

/** Where an agent's harness runs, and the fingerprint of its file now. */
export type PlacementAnswer =
  | {
      readonly runsOn: "this-computer";
      /** The fingerprint of the agent's file now, such as "sha256:9f86d081…". */
      readonly agentFingerprint: string;
    }
  | {
      readonly runsOn: "sandbox";
      readonly agentFingerprint: string;
      readonly reason: SandboxReason;
      /**
       * The store's error when the choice couldn't be read, for the host to
       * log and show the person. It can name paths in the user's profile.
       */
      readonly error?: unknown;
    };

/** Why a person's "this computer" choice wasn't saved. */
export interface PlacementRefusal {
  readonly kind: "fingerprint-changed";
  /** The fingerprint of the agent's file now, to show the person again. */
  readonly agentFingerprint: string;
}

/**
 * The read side of {@link AgentPlacement}: what the engine gets, through the
 * `PlacementPolicy` it declares itself. It has no way to make a choice, so
 * nothing on a run's path can take an agent out of its sandbox.
 */
export interface PlacementReader {
  /** Where the agent's harness runs. Without a valid choice, in a sandbox. */
  where(subject: PlacementSubject): Promise<PlacementAnswer>;
}

/** What {@link AgentPlacement} needs from the host. */
export interface AgentPlacementOptions {
  /** The choices in the user's profile. */
  readonly store: AgentPlacementStore;
  /** Hashes the agent's file. */
  readonly digest: Digest;
  /** Gives the time a person chose. */
  readonly clock: Clock;
}

/** The prefix of an agent file's fingerprint: the hash it was made with. */
export const agentFingerprintPrefix = "sha256:";

/**
 * The fingerprint of an agent's file: `sha256:` and the SHA-256, in hex, of
 * its raw bytes.
 *
 * @example
 * await agentFingerprint(encodeUtf8("kind: agent\n"), digest); // "sha256:3b1f…"
 */
export async function agentFingerprint(file: Uint8Array, digest: Digest): Promise<string> {
  return `${agentFingerprintPrefix}${bytesToHex(await digest.sha256(file))}`;
}

/**
 * Reads and changes where each agent's harness runs. Only a person changes
 * it, from the agent's settings or `halonic` on the command line. Hand the
 * engine only the {@link PlacementReader} side.
 *
 * @example
 * const placement = new AgentPlacement({ store, digest, clock });
 * const answer = await placement.where({ location, agent: "coder", file });
 * if (answer.runsOn === "sandbox") return openSandbox(profile);
 */
export class AgentPlacement implements PlacementReader {
  private readonly store: AgentPlacementStore;
  private readonly digest: Digest;
  private readonly clock: Clock;

  constructor(options: AgentPlacementOptions) {
    this.store = options.store;
    this.digest = options.digest;
    this.clock = options.clock;
  }

  /**
   * Where the agent's harness runs. It runs on this computer only when a
   * person chose that for the file as it is now. Without a choice, with a
   * choice for another version of the file, or with one that can't be read,
   * it runs in a sandbox, and the answer says which. A record the store
   * gives back that isn't exactly a choice for this agent counts as one that
   * can't be read, so a store with a bug can't let the agent out either
   * (Julian, HAL-2927).
   */
  async where(subject: PlacementSubject): Promise<PlacementAnswer> {
    const fingerprint = await agentFingerprint(subject.file, this.digest);
    const key = keyOf(subject);
    let record: unknown;
    try {
      record = await this.store.get(key);
    } catch (error) {
      return { runsOn: "sandbox", agentFingerprint: fingerprint, reason: "unreadable", error };
    }
    if (record === null) {
      return { runsOn: "sandbox", agentFingerprint: fingerprint, reason: "not-chosen" };
    }
    if (!isAgentPlacementFor(key, record)) {
      const error = new Error(
        `The placement store gave back something that isn't a valid placement for the agent ${JSON.stringify(key.agent)} in ${JSON.stringify(key.location)}.`,
      );
      return { runsOn: "sandbox", agentFingerprint: fingerprint, reason: "unreadable", error };
    }
    if (record.agentFingerprint !== fingerprint) {
      return { runsOn: "sandbox", agentFingerprint: fingerprint, reason: "file-changed" };
    }
    return { runsOn: "this-computer", agentFingerprint: fingerprint };
  }

  /**
   * Saves a person's choice to run the agent on this computer.
   * `shownFingerprint` is the fingerprint from the {@link where} answer the
   * person saw; it must be the fingerprint of the file now, or nothing is
   * saved. So a file that changed while the person read the prompt is
   * never let out of its sandbox. It also replaces a choice that couldn't
   * be read.
   *
   * Only a person's own action calls this. No tool offers it, and the
   * engine gets only {@link PlacementReader}.
   */
  async chooseThisComputer(
    subject: PlacementSubject,
    shownFingerprint: string,
  ): Promise<Result<void, PlacementRefusal>> {
    const fingerprint = await agentFingerprint(subject.file, this.digest);
    if (shownFingerprint !== fingerprint) {
      return err({ kind: "fingerprint-changed", agentFingerprint: fingerprint });
    }
    await this.store.save({
      ...keyOf(subject),
      runsOn: "this-computer",
      agentFingerprint: fingerprint,
      chosenAt: this.clock.now().toISOString(),
    });
    return ok(undefined);
  }

  /**
   * Puts the agent back in a sandbox by forgetting the choice, even one that
   * can't be read. Without a choice, nothing changes.
   */
  async chooseSandbox(key: AgentPlacementKey): Promise<void> {
    await this.store.remove(keyOf(key));
  }
}

/** Only the key, so the file's bytes never reach the store. */
function keyOf(key: AgentPlacementKey): AgentPlacementKey {
  return { location: key.location, agent: key.agent };
}
