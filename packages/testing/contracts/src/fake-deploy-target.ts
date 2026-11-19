import type { RunFailureKind } from "@halonicjs/events";
import type {
  Clock,
  DeployAccount,
  DeployDone,
  DeployEvent,
  DeployedVersion,
  DeployFailure,
  DeployFailureCode,
  DeployLockHolder,
  DeploymentRef,
  DeploymentStatus,
  DeployPlan,
  DeployReach,
  DeployRequest,
  DeployResource,
  DeployResult,
  DeployRollback,
  DeployStep,
  DeployTarget,
  DeployTargetEntry,
  DeployTransferCounts,
  DestroyRequest,
  DestroyResult,
} from "@halonicjs/ports";
import { deployTargetVersion } from "@halonicjs/ports";

/** How a {@link FakeDeployTarget} answers. */
export interface FakeDeployTargetOptions {
  /** The one account the token reaches. Defaults to "sam@example.com's Account". */
  account?: DeployAccount;
  /** The token `login` accepts. Defaults to "fake-deploy-token". */
  token?: string;
  /** Who takes the lock. Defaults to "sam@example.com". */
  who?: string;
  /** Where `liveSince` and the lock's times come from. Defaults to a fixed time. */
  clock?: Clock;
}

/** What one deployment holds on the fake host. */
interface FakeDeployment {
  /** Every version that went live and wasn't rolled back, oldest first. */
  history: { version: DeployedVersion; reaches: readonly DeployReach[] }[];
  created: DeployResource[];
  lock: DeployLockHolder | undefined;
  data: DeployTransferCounts;
  sessionsRevoked: number;
}

const lockMs = 10 * 60 * 1000;
const empty: DeployTransferCounts = { runs: 0, records: 0, files: 0, bytes: 0 };

/**
 * A {@link DeployTarget} that keeps its host in memory and opens no socket,
 * so the deploy app service and the `halonic deploy` command can be tested
 * without Cloudflare (requirement `contracts.fake-deploy-target`). It passes
 * the `contracts.deploy-target` suite. A test can hold a deployment's lock,
 * fail the next self-test, add a warning after the next switch and seed the
 * data an export finds.
 */
export class FakeDeployTarget implements DeployTarget {
  /** Tokens `login` saved, in order. */
  readonly savedTokens: string[] = [];
  private readonly account: DeployAccount;
  private readonly token: string;
  private readonly who: string;
  private readonly clock: Clock;
  private readonly deployments = new Map<string, FakeDeployment>();
  private readonly folders = new Map<string, DeployTransferCounts>();
  private nextSelfTestFailure: readonly string[] | undefined;
  private nextWarnings: string[] = [];

  constructor(options: FakeDeployTargetOptions = {}) {
    this.account = options.account ?? { id: "fake-account", name: "sam@example.com's Account" };
    this.token = options.token ?? "fake-deploy-token";
    this.who = options.who ?? "sam@example.com";
    this.clock = options.clock ?? { now: () => new Date("2026-11-19T14:30:00.000Z") };
  }

  /** Makes another deploy hold the deployment's lock until `unlock`. */
  holdLock(deployment: DeploymentRef, holder: DeployLockHolder): void {
    this.state(deployment).lock = holder;
  }

  /** Makes the next deploy's self-test fail with these checks. */
  failNextSelfTest(failedChecks: readonly string[]): void {
    this.nextSelfTestFailure = failedChecks;
  }

  /** Adds a warning to the next deploy that goes live, as a lock lost after the switch would. */
  warnAfterSwitch(message: string): void {
    this.nextWarnings.push(message);
  }

  /** Sets what the deployment holds, for `export` to count. */
  seed(deployment: DeploymentRef, data: DeployTransferCounts): void {
    this.state(deployment).data = data;
  }

  /** How often `revokeSessions` ran for the deployment. */
  sessionsRevoked(deployment: DeploymentRef): number {
    return this.state(deployment).sessionsRevoked;
  }

  async login(token: string): Promise<{ readonly accounts: readonly DeployAccount[] }> {
    if (token !== this.token) {
      throw failure("unauthenticated", "token-inactive", "The token isn't active.");
    }
    this.savedTokens.push(token);
    return { accounts: [this.account] };
  }

  async plan(request: DeployRequest): Promise<DeployPlan> {
    const state = this.state(request.deployment);
    const live = state.history.at(-1);
    const snapshot = request.snapshot;
    return {
      account: this.account,
      url: urlOf(request.deployment),
      creates: state.created.length === 0 ? resourcesOf(request.deployment) : [],
      databaseChanges: [],
      deletesData: false,
      live: live?.version,
      liveReaches: live?.reaches,
      lockedBy: state.lock,
      unchanged:
        live !== undefined &&
        live.version.commit === snapshot.commit &&
        live.version.halonicVersion === snapshot.halonicVersion,
      files: await snapshot.files.list(),
    };
  }

  async deploy(
    request: DeployRequest,
    onEvent: (event: DeployEvent) => void,
  ): Promise<DeployResult> {
    const state = this.state(request.deployment);
    const previous = state.history.at(-1)?.version;
    stopIfAborted(request.signal, previous, undefined);
    if (state.lock !== undefined) throw lockedFailure(state.lock);
    const plan = await this.plan(request);
    if (plan.unchanged && previous !== undefined) {
      return { outcome: "unchanged", url: urlOf(request.deployment), version: previous };
    }

    const now = this.clock.now();
    state.lock = {
      who: this.who,
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + lockMs).toISOString(),
    };
    try {
      const run = (step: DeployStep) => {
        onEvent({ ...step, phase: "started" });
        onEvent({ ...step, phase: "done" });
      };
      for (const resource of plan.creates) {
        run({ step: "create", resource });
        state.created.push(resource);
        stopIfAborted(request.signal, previous, { step: "create", resource });
      }
      if (plan.creates.length > 0) {
        run({ step: "database", changes: 0, first: true });
      }
      const number = (previous?.number ?? 0) + 1;
      const upload: DeployStep = {
        step: "upload",
        version: number,
        files: plan.files.length,
        secrets: request.secrets.size,
      };
      run(upload);
      stopIfAborted(request.signal, previous, upload);
      const uploaded: DeployedVersion = {
        number,
        id: `fake-v${number}`,
        commit: request.snapshot.commit,
        halonicVersion: request.snapshot.halonicVersion,
        liveSince: undefined,
      };

      onEvent({ step: "self-test", version: number, phase: "started" });
      const failedChecks = this.nextSelfTestFailure;
      this.nextSelfTestFailure = undefined;
      if (failedChecks !== undefined) {
        return {
          outcome: "self-test-failed",
          version: uploaded,
          failedChecks,
          stillLive: previous,
          restoreFailed: false,
        };
      }
      onEvent({ step: "self-test", version: number, phase: "done" });

      run({ step: "switch", version: number });
      const version = { ...uploaded, liveSince: this.clock.now().toISOString() };
      state.history.push({ version, reaches: request.reaches });
      const warnings = this.nextWarnings;
      this.nextWarnings = [];
      const done: DeployDone = {
        outcome: "deployed",
        url: urlOf(request.deployment),
        version,
        previous,
        warnings,
      };
      return done;
    } finally {
      state.lock = undefined;
    }
  }

  async status(deployment: DeploymentRef): Promise<DeploymentStatus> {
    const state = this.state(deployment);
    const live = state.history.at(-1)?.version;
    return {
      account: this.account,
      url: state.created.length > 0 ? urlOf(deployment) : undefined,
      live,
      previous: state.history.at(-2)?.version,
      health:
        live === undefined ? { answering: false } : { answering: true, lastRoutineTick: undefined },
      runs: live === undefined ? undefined : { running: 0, waiting: 0, lastDay: 0 },
      lockedBy: state.lock,
      unfinished: undefined,
    };
  }

  async rollback(
    deployment: DeploymentRef,
    options: { readonly plan?: boolean; readonly signal?: AbortSignal } = {},
  ): Promise<DeployRollback> {
    const state = this.deployed(deployment);
    const from = state.history.at(-1)?.version;
    const to = state.history.at(-2)?.version;
    if (from === undefined || to === undefined) {
      throw failure(
        "conflict",
        "nothing-to-roll-back",
        "There's no earlier version to go back to.",
      );
    }
    if (state.lock !== undefined) throw lockedFailure(state.lock);
    stopIfAborted(options.signal, from, undefined);
    if (options.plan === true) return { mode: "plan", from, to };
    state.history.pop();
    return { mode: "rolled-back", from, to };
  }

  async export(deployment: DeploymentRef, folder: string): Promise<DeployTransferCounts> {
    const { data } = this.deployed(deployment);
    this.folders.set(folder, data);
    return data;
  }

  async import(deployment: DeploymentRef, folder: string): Promise<DeployTransferCounts> {
    const state = this.deployed(deployment);
    const data = this.folders.get(folder);
    if (data === undefined) {
      throw failure("not_found", "transfer-failed", `No export was found in ${folder}.`);
    }
    state.data = data;
    return data;
  }

  async unlock(
    deployment: DeploymentRef,
  ): Promise<{ readonly freed: DeployLockHolder | undefined }> {
    const state = this.state(deployment);
    const freed = state.lock;
    state.lock = undefined;
    return { freed };
  }

  async revokeSessions(deployment: DeploymentRef): Promise<void> {
    this.deployed(deployment).sessionsRevoked += 1;
  }

  async destroy(deployment: DeploymentRef, request: DestroyRequest): Promise<DestroyResult> {
    const state = this.state(deployment);
    if (state.created.length === 0) {
      throw failure("not_found", "not-deployed", `${deployment.name} isn't deployed.`);
    }
    if (state.lock !== undefined) throw lockedFailure(state.lock);
    const items = state.created.map((resource) => ({ resource }));
    if (request.plan === true) return { mode: "plan", items, left: [] };
    if (!(await request.confirm(items))) return { mode: "cancelled", items, left: [] };
    this.deployments.delete(deployment.name);
    return { mode: "destroyed", items, left: [] };
  }

  private state(deployment: DeploymentRef): FakeDeployment {
    let state = this.deployments.get(deployment.name);
    if (state === undefined) {
      state = { history: [], created: [], lock: undefined, data: empty, sessionsRevoked: 0 };
      this.deployments.set(deployment.name, state);
    }
    return state;
  }

  /** The deployment's state, or a `not-deployed` failure when nothing is live. */
  private deployed(deployment: DeploymentRef): FakeDeployment {
    const state = this.state(deployment);
    if (state.history.length === 0) {
      throw failure("not_found", "not-deployed", `${deployment.name} isn't deployed.`);
    }
    return state;
  }
}

/**
 * A {@link DeployTargetEntry} for the host "fake" that hands out the one
 * target it was given, so a test can drive the target the loader loads.
 */
export function fakeDeployTargetEntry(target: FakeDeployTarget): DeployTargetEntry {
  return { host: "fake", version: deployTargetVersion, create: () => target };
}

function urlOf(deployment: DeploymentRef): string {
  return `https://${deployment.service}.fake-deploy.invalid`;
}

function resourcesOf(deployment: DeploymentRef): DeployResource[] {
  return [
    { kind: "service", name: deployment.service },
    { kind: "database", name: `${deployment.service}-data` },
  ];
}

function failure(
  kind: RunFailureKind,
  code: DeployFailureCode,
  message: string,
  extra: Partial<Pick<DeployFailure, "fix" | "live" | "stoppedAfter">> = {},
): DeployFailure {
  return Object.assign(new Error(message), { kind, code, fix: undefined, ...extra });
}

function lockedFailure(holder: DeployLockHolder): DeployFailure {
  return failure("conflict", "deploy-locked", `A deploy by ${holder.who} is still running.`);
}

/** Rejects with `stopped` when the signal was aborted, saying what still serves. */
function stopIfAborted(
  signal: AbortSignal | undefined,
  live: DeployedVersion | undefined,
  stoppedAfter: DeployStep | undefined,
): void {
  if (signal?.aborted !== true) return;
  throw failure("conflict", "stopped", "The deploy was stopped.", {
    live: live ?? "none",
    ...(stoppedAfter === undefined ? {} : { stoppedAfter }),
  });
}
