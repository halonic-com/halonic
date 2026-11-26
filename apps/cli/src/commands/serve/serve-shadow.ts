// The auto approvals shadow runner as `serve` runs it (`cli.commands.serve.auto-approvals-shadow`,
// HAL-19971): a timer that polls through the read-only Paperclip reader, the ledger file and one
// digest file a day, all in the serve profile. It posts nothing to Paperclip: the reader can only
// send GETs on its short list, and nothing else here talks to Paperclip.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { FileApprovalLedgerStore, privateFileAt } from "@halonicjs/adapter-fs-node";
import { PaperclipShadowReader } from "@halonicjs/adapter-paperclip-client";
import {
  callsBetween,
  noCalls,
  type ShadowCallCounts,
  ShadowRunner,
  shadowDigest,
} from "@halonicjs/auto-approvals";
import type { SecretStore } from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import { type Phrase, plainText } from "../../messages/phrase.ts";
import { serveShadowMessages } from "../../messages/serve-shadow.ts";
import { halonicVersion } from "../../version.ts";
import { webCryptoDigest } from "../../workspace-runs.ts";
import { readStoredKey } from "./serve-messaging.ts";
import { readShadowConfig, shadowFolder } from "./serve-shadow-config.ts";

/** What {@link openServeShadow} needs. */
export interface ServeShadowOptions {
  /** The serve profile's folder; the config, the ledger and the digests are in it. */
  profileFolder: string;
  /** The serve profile's secrets file, for the config's connection's key. */
  keys: Pick<SecretStore, "get">;
  /** Where every halt, stop and failure is written; never a key or an answer's text. */
  log: (failure: unknown) => void;
  clock: Clock;
  /** The `fetch` under the reader's own GET-only guard; the global one by default. */
  fetch?: typeof fetch;
  /** Runs `run` after `ms`; tests pass their own. By default a timer that doesn't keep `serve` running. */
  setTimer?: (ms: number, run: () => void) => () => void;
}

/** The running shadow runner, started once when `serve` starts. */
export interface ServeShadow {
  /** Checks the ledger, records the start and polls until the runner halts or {@link close}. */
  start(): Promise<void>;
  /** Stops the timer; a poll under way finishes, and no other starts. */
  close(): void;
}

/** The ledger file and the digests' folder, in the profile's shadow folder. */
interface ShadowFiles {
  readonly ledger: string;
  readonly digests: string;
}

const dayMs = 24 * 60 * 60 * 1000;

/**
 * The shadow runner for the profile's config, or `undefined` when there is no config, so the
 * runner stays off. A config that can't be used, or a connection without a stored key, is
 * logged and leaves it off too: the runner never starts on a guess.
 */
export async function openServeShadow(
  options: ServeShadowOptions,
): Promise<ServeShadow | undefined> {
  const config = await readShadowConfig(options.profileFolder);
  if (config === undefined) return undefined;
  if (typeof config === "string") {
    options.log(logLine(serveShadowMessages.configProblem(config)));
    return undefined;
  }
  const stored = await readStoredKey(options.keys, config.connection);
  if (stored === undefined) {
    options.log(logLine(serveShadowMessages.noStoredKey()));
    return undefined;
  }
  const reader = new PaperclipShadowReader({
    address: stored.address,
    key: stored.key,
    company: stored.company,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const folder = shadowFolder(options.profileFolder);
  const files = { ledger: join(folder, "shadow-ledger.jsonl"), digests: join(folder, "digests") };
  const runner = new ShadowRunner({
    source: reader,
    store: new FileApprovalLedgerStore(files.ledger),
    digest: webCryptoDigest,
    clock: options.clock,
    pins: { ...config, workspaceId: stored.company },
  });
  return new ShadowLoop(runner, reader, files, options);
}

/** The ledger head the newest digest file names, or `undefined` before the first digest. */
export async function lastDigestHead(digestFolder: string): Promise<string | undefined> {
  let names: string[];
  try {
    names = await readdir(digestFolder);
  } catch {
    return undefined;
  }
  const newest = names
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.txt$/u.test(name))
    .sort()
    .at(-1);
  if (newest === undefined) return undefined;
  const text = (await privateFileAt(join(digestFolder, newest)).read()) ?? "";
  const head = /^Ledger head: (\S+)$/mu.exec(text)?.[1];
  return head === undefined || head === "none" ? undefined : head;
}

/**
 * Polls on the runner's own delay, and after every poll writes the day's digest again, so the
 * file always says how the day went so far. On a new UTC day it finishes the last day's digest
 * first and starts the call counts over. A halt ends the loop for good: only a person restarting
 * `serve` starts the runner again, since a timer must never clear a halt (Julian, #6621).
 */
class ShadowLoop implements ServeShadow {
  readonly #runner: ShadowRunner;
  readonly #reader: PaperclipShadowReader;
  readonly #files: ShadowFiles;
  readonly #options: ServeShadowOptions;
  #cancel: (() => void) | undefined;
  #closed = false;
  /**
   * The head the last digest named, kept after a `ledger.head_mismatch` halt: a digest naming
   * the current ledger's head instead would let the next restart pass the check (A44).
   */
  #keptHead: string | undefined;
  /** The UTC day the call counts are for, and where they start. */
  #day: { name: string; from: ShadowCallCounts; since: Date };

  constructor(
    runner: ShadowRunner,
    reader: PaperclipShadowReader,
    files: ShadowFiles,
    options: ServeShadowOptions,
  ) {
    this.#runner = runner;
    this.#reader = reader;
    this.#files = files;
    this.#options = options;
    const now = options.clock.now();
    // The reader is new, so its counts start now, not at midnight: the digest says so.
    this.#day = { name: dayOf(now), from: noCalls, since: now };
  }

  async start(): Promise<void> {
    const expectedHead = await lastDigestHead(this.#files.digests);
    const halted = await this.#runner.start(expectedHead);
    if (halted === "ledger.head_mismatch") this.#keptHead = expectedHead;
    if (halted !== undefined) {
      this.#options.log(logLine(serveShadowMessages.halted(halted)));
      await this.#writeDigests();
      return;
    }
    this.#schedule(0);
  }

  close(): void {
    this.#closed = true;
    this.#cancel?.();
  }

  #schedule(ms: number): void {
    if (this.#closed) return;
    const setTimer = this.#options.setTimer ?? unrefTimer;
    this.#cancel = setTimer(ms, () => {
      this.#tick().catch(this.#options.log);
    });
  }

  async #tick(): Promise<void> {
    try {
      // Before the poll, so its calls count toward the day they were made on.
      await this.#finishLastDay();
      const report = await this.#runner.poll();
      const halted = this.#runner.halted();
      if (halted !== undefined) {
        this.#options.log(logLine(serveShadowMessages.halted(halted)));
      } else if (report.stopped !== undefined) {
        this.#options.log(logLine(serveShadowMessages.pollStopped(report.stopped)));
      }
    } finally {
      await this.#writeDigests().catch(this.#options.log);
      // A poll that threw is logged and tried again; a halt is never retried.
      if (this.#runner.halted() === undefined) this.#schedule(this.#runner.nextDelayMs());
    }
  }

  /** Finishes the last day's digest when the day changed, then writes today's so far. */
  async #writeDigests(): Promise<void> {
    await this.#finishLastDay();
    await this.#writeDigest(this.#options.clock.now());
  }

  /** On a new UTC day: writes the last day's digest to its end, and starts the call counts over. */
  async #finishLastDay(): Promise<void> {
    const today = dayOf(this.#options.clock.now());
    if (today === this.#day.name) return;
    await this.#writeDigest(new Date(Date.parse(`${this.#day.name}T00:00:00.000Z`) + dayMs));
    this.#day = {
      name: today,
      from: this.#reader.counts(),
      since: new Date(`${today}T00:00:00.000Z`),
    };
  }

  async #writeDigest(until: Date): Promise<void> {
    const entries = await new FileApprovalLedgerStore(this.#files.ledger).entries();
    const documents = this.#runner.documents();
    const halted = this.#runner.haltedState();
    const text = shadowDigest({
      day: this.#day.name,
      entries,
      calls: callsBetween(this.#day.from, this.#reader.counts()),
      callsSince: this.#day.since,
      ...(documents === undefined ? {} : { documents }),
      ...(halted === undefined ? {} : { halted }),
      ...(this.#keptHead === undefined ? {} : { head: this.#keptHead }),
      build: halonicVersion,
      until,
    });
    await privateFileAt(join(this.#files.digests, `${this.#day.name}.txt`)).write(`${text}\n`);
  }
}

/** A log line with our own sentence: a reason code at most, never Paperclip's text. */
function logLine(message: { phrase: Phrase }): Error {
  return new Error(plainText(message.phrase));
}

function dayOf(time: Date): string {
  return time.toISOString().slice(0, 10);
}

function unrefTimer(ms: number, run: () => void): () => void {
  const timer = setTimeout(run, ms);
  timer.unref();
  return () => clearTimeout(timer);
}
