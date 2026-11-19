import type { RunFailureKind } from "@halonicjs/events";
import type { DefinitionSource } from "./definition-store.ts";
import type { HttpClient } from "./http-client.ts";
import type { TokenStore } from "./token-store.ts";

/** Version of the {@link DeployTarget} port. A breaking change bumps it and comes with an ADR. */
export const deployTargetVersion = 1;

/** One deployment from `deployments.yaml`, with where it lives on its host. */
export interface DeploymentRef {
  /** The deployment's name in `deployments.yaml`, such as "web". */
  readonly name: string;
  /** The account on the host, by its id. The account is always shown before anything changes. */
  readonly accountId: string;
  /** The service the deployment runs as on the host, such as the Worker "acme". */
  readonly service: string;
  /** A production deploy refuses uncommitted changes; a development one counts and ignores them. */
  readonly environment: "production" | "development";
}

/** An account a token reaches. */
export interface DeployAccount {
  readonly id: string;
  /** The name the host shows, such as "sam@example.com's Account". */
  readonly name: string;
}

/**
 * One thing a deploy creates or destroy removes, in the words the user meets
 * on the host's dashboard and bill: an address, a Worker, a database, a bucket.
 */
export interface DeployResource {
  readonly kind: "address" | "service" | "database" | "bucket";
  readonly name: string;
}

/** A version of a deployment. `number` counts from 1 per deployment; `id` is the host's own. */
export interface DeployedVersion {
  readonly number: number;
  readonly id: string;
  /** The commit it was deployed from, when the host still says. */
  readonly commit: string | undefined;
  /** The Halonic version it runs, when the host still says. */
  readonly halonicVersion: string | undefined;
  /** When it went live, as an ISO time. */
  readonly liveSince: string | undefined;
}

/**
 * Who holds a deployment's lock. `who` is the git email of whoever started
 * the deploy, or the computer's name when there's none, and never anything
 * else about the machine or the host. Times are ISO. The lock frees itself at
 * `expiresAt`, 10 minutes after its last renewal.
 */
export interface DeployLockHolder {
  readonly who: string;
  readonly startedAt: string;
  readonly expiresAt: string;
}

/** What a deploy uploads, taken by the caller from one commit. */
export interface DeploySnapshot {
  readonly commit: string;
  /** The workspace's files at `commit`, read-only. */
  readonly files: DefinitionSource;
  /** The Halonic version of the command line that deploys; the deployment then runs it. */
  readonly halonicVersion: string;
}

/** What `plan` and `deploy` are given. */
export interface DeployRequest {
  readonly deployment: DeploymentRef;
  readonly snapshot: DeploySnapshot;
  /**
   * Secret values by name: the sign-in password's hash and the workspace's
   * keys. A target sends them to the host and nowhere else: never into a
   * result, an event, an error or a log.
   */
  readonly secrets: ReadonlyMap<string, string>;
  /** Use resources with Halonic's names that Halonic didn't create. */
  readonly adopt?: boolean;
  /** Allow a database change that deletes data. Without it such a change is refused with `denied`. */
  readonly allowDataLoss?: boolean;
  /** Aborting stops at the next safe point; see {@link DeployTarget.deploy}. */
  readonly signal?: AbortSignal;
}

/** What a deploy would do, measured against what's live. Nothing was changed. */
export interface DeployPlan {
  readonly account: DeployAccount;
  /** The address once live; `undefined` when the host only gives it on the first deploy. */
  readonly url: string | undefined;
  /** What the deploy would create, in order. Empty when it all exists. */
  readonly creates: readonly DeployResource[];
  /** Ids of the database changes it would apply, in order. */
  readonly databaseChanges: readonly string[];
  /** `true` when one of those changes deletes data. */
  readonly deletesData: boolean;
  /** The live version, or `undefined` when nothing is live. */
  readonly live: DeployedVersion | undefined;
  /** The lock's holder when another deploy is running, checked before any question is asked. */
  readonly lockedBy: DeployLockHolder | undefined;
  /** `true` when the live version has the same commit and Halonic version, so a deploy changes nothing. */
  readonly unchanged: boolean;
  /** Every file the deploy would upload, for `--plan`. */
  readonly files: readonly string[];
}

/** One step of a deploy, as its events name it. */
export type DeployStep =
  | { readonly step: "create"; readonly resource: DeployResource }
  /** `first` is `true` when the database is set up rather than updated. */
  | { readonly step: "database"; readonly changes: number; readonly first: boolean }
  | {
      readonly step: "upload";
      readonly version: number;
      readonly files: number;
      readonly secrets: number;
    }
  | { readonly step: "self-test"; readonly version: number }
  | { readonly step: "switch"; readonly version: number };

/**
 * What a deploy reports as it goes, in order. Each step is `started`, then
 * `done`; `waiting` comes while a step has waited over 10 seconds for the
 * host; `warning` is a line the user must see, such as a database change that
 * goes live without a trial.
 */
export type DeployEvent =
  | (DeployStep & { readonly phase: "started" | "done" })
  | {
      readonly phase: "waiting";
      readonly step: DeployStep["step"];
      /** Whole seconds since the step started. */
      readonly seconds: number;
    }
  | { readonly phase: "warning"; readonly message: string };

/** A deploy that went live. */
export interface DeployDone {
  readonly outcome: "deployed";
  readonly url: string;
  readonly version: DeployedVersion;
  /** The version before it, which a rollback goes back to; `undefined` on the first deploy. */
  readonly previous: DeployedVersion | undefined;
  /**
   * What went wrong after traffic switched, such as the lock lost after the
   * switch. The deploy is live. A caller shows every entry.
   */
  readonly warnings: readonly string[];
}

/** A deploy whose commit and Halonic version were live already. No new version was made. */
export interface DeployUnchanged {
  readonly outcome: "unchanged";
  readonly url: string;
  readonly version: DeployedVersion;
}

/**
 * The new version failed its self-test. `stillLive` is the version that
 * still serves, or `undefined` when the new one went live before the test (a
 * first deploy, or a change the host only applies by going live) and doesn't
 * work. `restoreFailed` is `true` when putting the previous version back failed.
 */
export interface DeploySelfTestFailed {
  readonly outcome: "self-test-failed";
  readonly version: DeployedVersion;
  readonly failedChecks: readonly string[];
  readonly stillLive: DeployedVersion | undefined;
  readonly restoreFailed: boolean;
}

/** How a deploy ended when nothing was thrown. */
export type DeployResult = DeployDone | DeployUnchanged | DeploySelfTestFailed;

/** Runs by state, for `status`. Only these states are counted; nothing about a run leaves the count. */
export interface DeployRunCounts {
  readonly running: number;
  readonly waiting: number;
  readonly lastDay: number;
}

/** What `status` reads. It never changes anything. */
export interface DeploymentStatus {
  readonly account: DeployAccount;
  readonly url: string | undefined;
  readonly live: DeployedVersion | undefined;
  /** The version a rollback would go back to. */
  readonly previous: DeployedVersion | undefined;
  /** Whether the address answers, and when the routine tick last ran (ISO). */
  readonly health:
    | { readonly answering: true; readonly lastRoutineTick: string | undefined }
    | { readonly answering: false };
  /** `undefined` when the count failed: status never fails on it. */
  readonly runs: DeployRunCounts | undefined;
  readonly lockedBy: DeployLockHolder | undefined;
  /** The step the last deploy stopped in, when it stopped without finishing. */
  readonly unfinished: DeployStep["step"] | undefined;
}

/** What `rollback` did, or would do with `plan`. */
export interface DeployRollback {
  readonly mode: "plan" | "rolled-back";
  readonly from: DeployedVersion;
  readonly to: DeployedVersion;
}

/** How much `export` wrote or `import` read. Secrets and tokens are never in a transfer. */
export interface DeployTransferCounts {
  readonly runs: number;
  readonly records: number;
  readonly files: number;
  readonly bytes: number;
}

/** One thing destroy removes, with what it holds, for the list the user confirms. */
export interface DestroyItem {
  readonly resource: DeployResource;
  readonly secrets?: number;
  readonly runs?: number;
  readonly bytes?: number;
}

/** What `destroy` is given. */
export interface DestroyRequest {
  /**
   * Shown the list before anything is removed; `false` stops with nothing
   * removed. The caller asks the user to type the service's name.
   */
  readonly confirm: (items: readonly DestroyItem[]) => Promise<boolean>;
  /** List what would be removed and remove nothing. */
  readonly plan?: boolean;
  readonly signal?: AbortSignal;
}

/** What `destroy` did. `left` holds what it didn't remove because Halonic didn't create it. */
export interface DestroyResult {
  readonly mode: "plan" | "destroyed" | "cancelled";
  readonly items: readonly DestroyItem[];
  readonly left: readonly DeployResource[];
}

/**
 * Why a target call failed. `code` is stable and goes into `--json`; callers
 * branch on `kind`, so a new code keeps the port's version.
 */
export type DeployFailureCode =
  | "token-missing"
  | "token-inactive"
  | "missing-permission"
  | "no-account"
  | "ambiguous-account"
  | "free-plan"
  | "host-unreachable"
  | "host-request-failed"
  | "unmarked-resources"
  | "uncommitted-changes"
  | "deploy-locked"
  | "older-than-live"
  | "data-loss"
  | "not-deployed"
  | "nothing-to-roll-back"
  | "rollback-not-possible"
  | "transfer-failed"
  | "destroy-changed"
  | "stopped";

/**
 * What every {@link DeployTarget} method rejects with when it fails: an
 * `Error` with one of the kit's error kinds (`RunFailureKind`, which the
 * engine's type test keeps equal to `@halonicjs/std`'s `ErrorKind`), so
 * `errorKindOf` reads it and the command line's exit code needs no new number. The message and `fix` are
 * safe to show: no token, secret or host response body.
 *
 * `stopped` (kind `conflict`) is the abort of a request's signal. Its `live`
 * says what still serves, so the caller can say "Version 1 is still live."
 */
export interface DeployFailure extends Error {
  readonly kind: RunFailureKind;
  readonly code: DeployFailureCode;
  readonly fix: string | undefined;
  /** What serves after the failure: a version, `"none"`, or `undefined` when not known. */
  readonly live?: DeployedVersion | "none";
  /** The step a `stopped` deploy stopped after. */
  readonly stoppedAfter?: DeployStep;
}

/**
 * What a target is created with. The caller's host builds it; the target
 * gets nothing else from the machine.
 */
export interface DeployTargetContext {
  readonly http: HttpClient;
  /** Where `login` keeps the host's token: the user's keychain. */
  readonly tokens: TokenStore;
  /** A token from the environment, for CI. It wins over the saved one and is never saved. */
  readonly environmentToken: string | undefined;
  /** Who runs this, for the lock: the git email, else the computer's name. */
  readonly who: string;
}

/**
 * Deploys a workspace to a host such as Cloudflare, and reads, rolls back,
 * moves data in and out of and removes what it deployed (ADR 5.6; requirement
 * `ports.deploy-target`). The `halonic deploy` command calls it through the
 * deploy app service, and never imports a target package: it loads one by
 * name and checks its {@link DeployTargetEntry}.
 *
 * Every method that changes the host holds the deployment's lock while it
 * does; a second one rejects with `deploy-locked` and the holder. Results are
 * data. Failures are {@link DeployFailure}s.
 *
 * @example
 * const target = entry.create({ http, tokens, environmentToken, who });
 * const plan = await target.plan(request);
 * if (plan.lockedBy === undefined && (await ask(plan))) {
 *   const result = await target.deploy(request, (event) => output.show(event));
 * }
 */
export interface DeployTarget {
  /**
   * Checks a pasted token, saves it and lists the accounts it reaches.
   * Rejects with `token-inactive` or `missing-permission`.
   */
  login(token: string): Promise<{ readonly accounts: readonly DeployAccount[] }>;

  /** Measures a deploy against what's live. Changes nothing and takes no lock. */
  plan(request: DeployRequest): Promise<DeployPlan>;

  /**
   * Creates what's missing, updates the database, uploads a new version,
   * self-tests it and makes it live, reporting each step to `onEvent`.
   * Aborting the signal stops at once before anything changed or during the
   * self-test, finishes the step it's in otherwise, and rejects with
   * `stopped`; making it live is one step and always finishes.
   */
  deploy(request: DeployRequest, onEvent: (event: DeployEvent) => void): Promise<DeployResult>;

  status(deployment: DeploymentRef): Promise<DeploymentStatus>;

  /** Goes back one version. Rejects with `rollback-not-possible` when the database has moved on. */
  rollback(
    deployment: DeploymentRef,
    options?: { readonly plan?: boolean; readonly signal?: AbortSignal },
  ): Promise<DeployRollback>;

  /** Writes the deployment's runs, records and files to a local folder. */
  export(
    deployment: DeploymentRef,
    folder: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<DeployTransferCounts>;

  /** Reads a folder `export` wrote into the deployment. */
  import(
    deployment: DeploymentRef,
    folder: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<DeployTransferCounts>;

  /** Frees a lock left by a deploy that stopped without finishing. Gives the holder it freed, if any. */
  unlock(deployment: DeploymentRef): Promise<{ readonly freed: DeployLockHolder | undefined }>;

  /** Signs out every browser signed in to the deployment. */
  revokeSessions(deployment: DeploymentRef): Promise<void>;

  /** Removes what Halonic created for the deployment, after `confirm` says yes. */
  destroy(deployment: DeploymentRef, request: DestroyRequest): Promise<DestroyResult>;
}

/**
 * What a target package exports as `deployTarget`. The loader checks `host`
 * and `version` before it calls `create`, and that what `create` gives has
 * every {@link DeployTarget} method.
 */
export interface DeployTargetEntry {
  /** The `host` in `deployments.yaml` this target serves, such as "cloudflare". */
  readonly host: string;
  /** The port version the target was built against. */
  readonly version: number;
  create(context: DeployTargetContext): DeployTarget;
}
