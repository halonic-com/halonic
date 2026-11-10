// Counts the accesses a step's sandbox refused and writes them to the run's
// log as `sandbox.blocked` events, kept bounded: a target's first block is
// written at once, repeats are only counted, and the totals are written when
// the step ends. A program that retries one file in a loop, or tries many
// files, can't flood the log.

import {
  type LoggedSandboxBlock,
  maxBlockedTargetsPerStep,
  type RunEventBody,
  type SandboxBlock,
  sandboxBlockedView,
} from "@halonicjs/events";
import type { HarnessEventLog } from "./run-harness-call.ts";

/** The step whose sandbox refused the accesses. */
export interface BlockedStep {
  readonly state: string;
  readonly agent: string;
}

/** One target the log names, or `others`, with the refused accesses to it so far. */
interface CountedTarget {
  readonly block: LoggedSandboxBlock;
  count: number;
}

/** The key of the `others` target, which no file or site can have. */
const othersKey = "others";

/**
 * The blocked accesses of one step (requirement `engine.sandbox-blocked`).
 *
 * The first block of each target is written straight away with `count: 1`,
 * so a person sees at once why the step is stuck. Each target is a file
 * with its access, or a site with its port. Past
 * {@link maxBlockedTargetsPerStep} targets, further ones are counted
 * together as `others`. When the step ends, {@link writeTotals} writes one
 * more event for each target refused more than once, with its total.
 */
export class BlockedAccesses {
  readonly #log: HarnessEventLog;
  readonly #step: BlockedStep;
  readonly #home: string | null;
  /** The targets in the order they were first refused, by their key. */
  readonly #targets = new Map<string, CountedTarget>();
  /** How many targets the log names, not counting `others`. */
  #named = 0;
  /** The writes of first blocks, which {@link writeTotals} waits for. */
  readonly #firstWrites: Promise<void>[] = [];
  /** The first write that failed; {@link writeTotals} throws it. */
  #failure: { error: unknown } | undefined;

  /** @param home - the person's home folder, which file paths shorten to `~`, or `null` */
  constructor(log: HarnessEventLog, step: BlockedStep, home: string | null) {
    this.#log = log;
    this.#step = step;
    this.#home = home;
  }

  /**
   * Counts one refused access, and writes it when it is its target's first.
   * It doesn't wait for the write, as a sandbox's listener can't.
   */
  note(block: SandboxBlock): void {
    const target = this.#targetOf(sandboxBlockedView(block, this.#home));
    target.count += 1;
    if (target.count === 1) {
      const written = this.#write(target).catch((error: unknown) => {
        this.#failure ??= { error };
      });
      this.#firstWrites.push(written);
    }
  }

  /**
   * Writes the total of each target refused more than once, in the order
   * they were first refused, once every first block is written.
   *
   * @throws the error of a first block's write that failed, or of a total's write
   */
  async writeTotals(): Promise<void> {
    await Promise.all(this.#firstWrites);
    if (this.#failure !== undefined) throw this.#failure.error;
    for (const target of this.#targets.values()) {
      if (target.count > 1) await this.#write(target);
    }
  }

  /** The counted target `block` belongs to, which is `others` once the log names enough targets. */
  #targetOf(block: SandboxBlock): CountedTarget {
    const key = targetKey(block);
    const known = this.#targets.get(key);
    if (known !== undefined) return known;
    if (this.#named < maxBlockedTargetsPerStep) {
      this.#named += 1;
      return this.#add(key, block);
    }
    return this.#targets.get(othersKey) ?? this.#add(othersKey, { kind: "others" });
  }

  #add(key: string, block: LoggedSandboxBlock): CountedTarget {
    const target: CountedTarget = { block, count: 0 };
    this.#targets.set(key, target);
    return target;
  }

  #write(target: CountedTarget): Promise<void> {
    const event: RunEventBody = {
      type: "sandbox.blocked",
      state: this.#step.state,
      agent: this.#step.agent,
      block: target.block,
      count: target.count,
    };
    return this.#log.append(event);
  }
}

/** What makes two blocks the same target: the same file and access, or the same site and port. */
function targetKey(block: SandboxBlock): string {
  return block.kind === "file"
    ? JSON.stringify([block.kind, block.path, block.access])
    : JSON.stringify([block.kind, block.host, block.port]);
}
