// The srt sandbox the CLI opens sessions in, and the profile's host lock it
// sweeps kept Windows grants under (HAL-6780, after HAL-6256).
//
// On Windows srt keeps a write grant on each session's folders, and the one
// process that holds the profile's host lock sweeps the kept grants that no
// live session uses. Every session the CLI opens is first written to this
// process's kept-grant record in the profile, so the sweep of a Studio agent
// host, or of another CLI process, never takes the grant of a live CLI
// session, however many CLI processes run. Only the harness sandbox sweeps,
// and only once this process holds the lock: a Studio host that starts while
// the CLI holds it serves without a sweep. Elsewhere there are no kept
// grants, and nothing here takes the lock.

import { keptGrantsRecordFolder, SrtSandbox, takeHostLock } from "@halonicjs/adapter-sandbox-srt";
import type { Sandbox } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { privateJournalFolder } from "./sandbox-journals.ts";

/**
 * The srt sandbox for sessions, which records each session's folders in the
 * profile before srt grants them (Windows only; elsewhere it records
 * nothing). Give `sweepRoots` only while this process holds the host lock.
 */
export function recordingSrtSandbox(
  profile: ProfileFolder,
  sweepRoots: readonly string[] = [],
): SrtSandbox {
  return new SrtSandbox(
    undefined,
    undefined,
    privateJournalFolder(profile),
    recordingOptions(profile, sweepRoots),
  );
}

/** The options of {@link recordingSrtSandbox}: the profile's kept-grant record, and these sweep roots. */
export function recordingOptions(
  profile: ProfileFolder,
  sweepRoots: readonly string[],
): { recordFolder: string; sweepRoots: readonly string[] } {
  return { recordFolder: keptGrantsRecordFolder(profile.root), sweepRoots };
}

/** A sandbox that may hold the profile's host lock, until {@link HostLockSandbox.release}. */
export interface HostLockSandbox extends Sandbox {
  /** Gives the host lock up, if this process took it. Call it once its sessions have closed. Safe to call twice. */
  release(): Promise<void>;
}

/** What {@link sweepingUnderHostLock} builds from. */
export interface HostLockSandboxInput {
  readonly platform: NodeJS.Platform;
  readonly profile: ProfileFolder;
  /** The folders that hold the sessions' folders, swept only while this process holds the lock. */
  readonly sweepRoots: readonly string[];
  /** Makes the sandbox with these sweep roots; {@link recordingSrtSandbox} by default. */
  readonly make?: (sweepRoots: readonly string[]) => Sandbox;
  /** Hears why this process doesn't sweep, or lost the lock. */
  readonly warn: (message: string) => void;
}

/**
 * The sandbox that sweeps kept grants only under the profile's host lock. On
 * Windows, the first session it opens tries to take the lock; with it, the
 * sessions open in a sandbox that sweeps once before the first, and without
 * it (a Studio host or another CLI process holds it) in one that doesn't.
 * The lock is held until {@link HostLockSandbox.release}, so a command that
 * opens no session never takes it.
 */
export function sweepingUnderHostLock(input: HostLockSandboxInput): HostLockSandbox {
  const make = input.make ?? ((roots) => recordingSrtSandbox(input.profile, roots));
  const plain = make([]);
  if (input.platform !== "win32") return withoutHostLock(plain);
  let chosen: Promise<Sandbox> | undefined;
  let release: (() => Promise<void>) | undefined;
  const choose = async (): Promise<Sandbox> => {
    const lock = await takeHostLock(input.profile.root, input.warn);
    if (lock === null) return plain;
    release = () => lock.release();
    return make(input.sweepRoots);
  };
  return {
    ...delegateTo(plain),
    open: async (profile, options) => {
      chosen ??= choose();
      return (await chosen).open(profile, options);
    },
    release: async () => {
      await chosen;
      const releasing = release;
      release = undefined;
      await releasing?.();
    },
  };
}

/** The sandbox as it is, which never takes the host lock, such as a test's own. */
export function withoutHostLock(sandbox: Sandbox): HostLockSandbox {
  return { ...delegateTo(sandbox), release: async () => {} };
}

function delegateTo(sandbox: Sandbox): Sandbox {
  return {
    check: () => sandbox.check(),
    capabilities: () => sandbox.capabilities(),
    open: (profile, options) => sandbox.open(profile, options),
  };
}
