/**
 * The shell's run commands. Every call names the run folder by the
 * workspace, a folder the person opened in the shell, and optionally a
 * deployment of it; the shell works out the folder in the profile itself,
 * as `runsFolder` in `@halonicjs/profile` does, and keeps the files as
 * `FolderRunStore` in `fs-node` keeps them. The page never names a path.
 *
 * Every call takes `{ workspace, deployment }`, plus the arguments below.
 * The run folder is `<profile>/workspaces/<key>/runs` for the workspace's
 * own runs (`deployment` is `null`), and
 * `<profile>/workspaces/<key>/deployments/<deployment>/runs` for one
 * deployment's. Since the deployment id becomes a folder name, the shell
 * checks it with the rule of `isDeploymentId` in `@halonicjs/profile`.
 */
export const runCommands = {
  /**
   * `{ runId, expectedSeq, lines, snapshot }` → `{ ok: true, lastSeq,
   * snapshotError? }` or `{ ok: false, reason: "conflict", lastSeq }`. With
   * the run's lock held, the shell appends `lines` (whole lines, one event
   * each) when the log's last event is `expectedSeq`, then replaces the
   * snapshot with `snapshot` unless it is `null`. A snapshot it couldn't
   * write doesn't fail the append: `snapshotError` says why.
   */
  append: "run_append",
  /** `{ runId }` → the log's whole lines as text, `""` for a run with no log. */
  events: "run_events",
  /** `{ runId }` → `{ text, logEvents }`, the snapshot file and the log's length, or `null`. */
  snapshot: "run_snapshot",
  /** `{}` → `[{ runId, lines }]`, every run's whole lines, for the list. */
  logs: "run_logs",
} as const;

/** Why the shell refused a run call: the `kind` of its error, which names no secret. */
export const runRefusalKinds = [
  /** The workspace isn't a folder the person opened in the shell. */
  "folder_not_open",
  /** The deployment id isn't one `isDeploymentId` allows. The page checks it first. */
  "invalid_deployment",
  /** The log's lines aren't UTF-8 text; the message names the log. */
  "broken_log",
  /** The run id isn't one the `RunStore` port allows. The page checks it first. */
  "invalid_run_id",
  /** The lines to append aren't whole lines. The page writes them, so this is a bug. */
  "invalid_lines",
  /** Reading or writing the run folder, or taking the run's lock, failed. */
  "io",
] as const;

/** One of {@link runRefusalKinds}. */
export type RunRefusalKind = (typeof runRefusalKinds)[number];

/** What a refused run command rejects with. */
export interface RunRefusal {
  readonly kind: RunRefusalKind;
  readonly message: string;
}

/** Whether a rejection is the shell's run refusal shape, as opposed to an IPC or permission failure. */
export function isRunRefusal(reason: unknown): reason is RunRefusal {
  if (typeof reason !== "object" || reason === null) {
    return false;
  }
  const { kind, message } = reason as Record<string, unknown>;
  return runRefusalKinds.some((known) => known === kind) && typeof message === "string";
}
