import { enableApiUrl, isApiHost, isProjectId } from "./console-links.ts";
import type { RefreshRefusal } from "./refresh-answer.ts";
import { refusalReason } from "./refresh-refused.ts";
import type { SetupRecord } from "./setup-record.ts";
import type { StepId } from "./setup-step.ts";

/**
 * Google answered a run's request with 403 `SERVICE_DISABLED`. The host makes
 * this from the integration's `GoogleApiDisabledError`, which has already read
 * Google's answer, so it isn't read a second time here. A field is missing
 * when Google didn't name it.
 */
export interface ApiDisabled {
  readonly kind: "apiDisabled";
  /** The API's host as Google named it, such as `example.googleapis.com`. */
  readonly api?: string;
  /** The project as Google named it, usually its number. */
  readonly project?: string;
}

/** What went wrong with a connector: a refused refresh, or an API switched off during a run. */
export type ConnectorProblem = RefreshRefusal | ApiDisabled;

/**
 * A connector state after a problem (design 5.2, section 6 item 8). Each one
 * names the steps the setup item reopens at, in the order the user does them.
 */
export type ConnectorState =
  | {
      readonly kind: "needs-sign-in-again";
      /**
       * True when Studio leads with "Your app is probably still in Testing".
       * The item then opens at step 3 (Publish) before step 7.
       */
      readonly testingHint: boolean;
      readonly reopenAt: readonly StepId[];
    }
  | {
      readonly kind: "needs-new-secret";
      /**
       * True when Google refused a new secret too, so the client is gone: the
       * item reopens at steps 5 to 7 for a new client and a new sign-in.
       */
      readonly clientGone: boolean;
      readonly reopenAt: readonly StepId[];
    }
  | {
      readonly kind: "api-off";
      /** The API's host, when Google named it in the `<name>.googleapis.com` shape. */
      readonly api?: string;
      /** The record's project ID, or else the project Google named. */
      readonly project?: string;
      /** The API's page in the Console, where its "Enable" button is. Present when `api` is. */
      readonly enableUrl?: string;
      readonly reopenAt: readonly StepId[];
    };

/** The parts of a setup record the connector state reads. */
export type ConnectorStateRecord = Pick<
  SetupRecord,
  "accountType" | "inProductionTickedAt" | "lastSignInAt" | "projectId" | "refreshRefused"
>;

const hourMs = 60 * 60 * 1000;

/**
 * Google ends a Testing app's sign-in 7 days after it was given. The window
 * is 6½ to 7½ days after the last sign-in, both ends included, so a refresh a
 * little early or late still counts.
 */
export const testingHintWindowMs = { from: 156 * hourMs, to: 180 * hourMs } as const;

/** A project number, as Google names a project in its errors. */
const projectNumberPattern = /^[0-9]{1,30}$/;

/**
 * Gives the connector state for a problem. It holds no token and none of
 * Google's free text, so it is safe to show, to log and to keep.
 *
 * For `clientRefused` it sees this one record only, but whether the client is
 * gone depends on every account that uses it. So the host saves the refusal
 * with `SetupRecords.refreshRefused` and calls `savedConnectorState` on each
 * record that returns, which also gives every account on the client its badge.
 *
 * @param record - the account's setup record, as it was before this problem
 * @param problem - the refused refresh, or the API switched off during a run
 * @param now - the time of the refusal, from the caller's `Clock`
 * @returns the state, with the steps the setup item reopens at
 */
export function connectorState(
  record: ConnectorStateRecord,
  problem: ConnectorProblem,
  now: Date,
): ConnectorState {
  switch (problem.kind) {
    case "signInRefused":
      return needsSignInAgain(record, now);
    case "clientRefused":
      return needsNewSecret(refusalReason(record, problem, [record]) === "client-gone");
    case "apiDisabled":
      return apiOff(record, problem);
  }
}

/**
 * The state a saved refusal stands for, so the badge comes back after Studio
 * restarts. `null` when no refusal is saved. The Testing hint is judged at
 * the time of the refusal.
 *
 * @param record - the account's setup record
 */
export function savedConnectorState(record: ConnectorStateRecord): ConnectorState | null {
  const saved = record.refreshRefused;
  if (saved === null) {
    return null;
  }
  switch (saved.reason) {
    case "sign-in":
      return needsSignInAgain(record, new Date(saved.at));
    case "client":
      return needsNewSecret(false);
    case "client-gone":
      return needsNewSecret(true);
  }
}

function needsNewSecret(clientGone: boolean): ConnectorState {
  if (clientGone) {
    return { kind: "needs-new-secret", clientGone, reopenAt: ["client", "credentials", "sign-in"] };
  }
  // Only the secret is replaced: the client ID and the sign-in are kept (design 4.3).
  return { kind: "needs-new-secret", clientGone, reopenAt: ["credentials"] };
}

function needsSignInAgain(record: ConnectorStateRecord, now: Date): ConnectorState {
  if (shouldLeadWithTestingHint(record, now)) {
    return { kind: "needs-sign-in-again", testingHint: true, reopenAt: ["consent", "sign-in"] };
  }
  return { kind: "needs-sign-in-again", testingHint: false, reopenAt: ["sign-in"] };
}

/**
 * Whether the timing points at an app left in Testing. Only a personal
 * account's app can be in Testing: a Workspace app is Internal and never has
 * the "In production" tick. If the user ticked it, the timing is taken as a
 * coincidence, because telling someone who did it right that they did it
 * wrong costs more trust than the hint saves (design 5.2).
 */
function shouldLeadWithTestingHint(record: ConnectorStateRecord, now: Date): boolean {
  if (record.accountType !== "personal" || record.inProductionTickedAt !== null) {
    return false;
  }
  if (record.lastSignInAt === null) {
    return false;
  }
  const sinceSignIn = now.getTime() - Date.parse(record.lastSignInAt);
  return sinceSignIn >= testingHintWindowMs.from && sinceSignIn <= testingHintWindowMs.to;
}

/**
 * The `api-off` state. It reopens at step 2, where the APIs are switched on;
 * step 7's **Check again** then confirms it. Each part is there only when it
 * has a shape we trust, so nothing else from Google's answer reaches a link.
 */
function apiOff(record: ConnectorStateRecord, problem: ApiDisabled): ConnectorState {
  const project = trustedProject(record.projectId, problem.project);
  const api = problem.api !== undefined && isApiHost(problem.api) ? problem.api : undefined;
  return {
    kind: "api-off",
    ...(api === undefined ? {} : { api, enableUrl: enableApiUrl(api, project) }),
    ...(project === undefined ? {} : { project }),
    reopenAt: ["apis"],
  };
}

/** The record's project ID when it is valid, or else Google's project when it looks like one. */
function trustedProject(
  projectId: string | null,
  googleProject: string | undefined,
): string | undefined {
  if (projectId !== null && isProjectId(projectId)) {
    return projectId;
  }
  if (googleProject === undefined) {
    return undefined;
  }
  return isProjectId(googleProject) || projectNumberPattern.test(googleProject)
    ? googleProject
    : undefined;
}
