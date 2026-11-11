import { isRunId } from "@halonicjs/ports";
import { isDeploymentId } from "@halonicjs/profile";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type { RunRefusal, RunRefusalKind } from "./run-commands.ts";
import type { TauriShell } from "./shell.ts";

/** One run's files in a run folder. */
interface RunFiles {
  log: string;
  snapshot?: string;
}

/** A run's files, with the number of the write that last changed its log. */
interface StoredRun extends RunFiles {
  written: number;
}

/**
 * A shell that answers the `run_*` commands as the Rust shell does, written
 * out on its own rather than from the adapter: a run folder per workspace
 * and deployment, each run's log kept as text and its snapshot as the text
 * the page sent. It answers only for a workspace in `opened` and a safe
 * deployment id, appends only
 * whole lines when the log ends at `expectedSeq`, and a new run drops an
 * old snapshot. Calls take turns, as the run lock makes them.
 *
 * Every call is kept in `calls`.
 */
export class FakeRunShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  /** The folders the person opened in the shell. */
  readonly opened: readonly string[];
  /** The run ids whose lines `run_logs` gave, in order: each one is a log read. */
  readonly logsRead: string[] = [];
  readonly #folders = new Map<string, Map<string, StoredRun>>();
  #writes = 0;
  readonly #granted: boolean;
  #nextRefusal: RunRefusalKind | undefined;
  #snapshotFails = false;

  /**
   * @param options.opened - the folders the person opened in the shell
   * @param options.granted - whether the page has the capability for the run commands; the served Studio doesn't
   */
  constructor(options: { opened: readonly string[]; granted?: boolean }) {
    this.opened = [...options.opened];
    this.#granted = options.granted ?? true;
  }

  /** Writes a run's files directly, as another writer or a damaged disk leaves them. */
  plant(workspace: string, runId: string, files: RunFiles, deployment: string | null = null): void {
    this.#folder(workspace, deployment).set(runId, { ...files, written: ++this.#writes });
  }

  /** Makes the next call fail this way, before anything is read or written. */
  refuseNext(kind: RunRefusalKind): void {
    this.#nextRefusal = kind;
  }

  /** Makes every snapshot write fail from now on, as a full disk would. */
  failSnapshots(): void {
    this.#snapshotFails = true;
  }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ command, args: structuredClone(args) });
    if (!this.#granted) {
      // What Tauri rejects with for a command the capability doesn't allow: text, not a refusal.
      throw `Command ${command} not allowed by ACL`;
    }
    if (this.#nextRefusal !== undefined) {
      const kind = this.#nextRefusal;
      this.#nextRefusal = undefined;
      throw refusal(kind, `refused by the test (${kind})`);
    }
    const workspace = String(args["workspace"]);
    if (!this.opened.includes(workspace)) {
      throw refusal("folder_not_open", `${workspace} is not an opened folder`);
    }
    const deployment = (args["deployment"] as string | null) ?? null;
    if (deployment !== null && !isDeploymentId(deployment)) {
      throw refusal("invalid_deployment", `unsafe deployment id ${deployment}`);
    }
    const folder = this.#folder(workspace, deployment);
    if (command === "run_logs") {
      return this.#logs(folder, args["known"] as Record<string, string>);
    }
    const runId = String(args["runId"]);
    if (!isRunId(runId)) {
      throw refusal("invalid_run_id", `unsafe run id ${runId}`);
    }
    switch (command) {
      case "run_append":
        return this.#append(folder, runId, args);
      case "run_events":
        return folder.get(runId)?.log ?? "";
      case "run_snapshot":
        return this.#snapshot(folder.get(runId));
      default:
        throw `Command ${command} not found`;
    }
  }

  #logs(folder: Map<string, StoredRun>, known: Record<string, string>): unknown {
    return [...folder.keys()]
      .sort((left, right) => (left < right ? -1 : 1))
      .map((runId) => {
        const { log, written } = folder.get(runId) as StoredRun;
        const stamp = `${log.length}:${written}`;
        if (known[runId] === stamp) {
          return { runId, stamp, lines: null };
        }
        this.logsRead.push(runId);
        return { runId, stamp, lines: log };
      });
  }

  #append(folder: Map<string, StoredRun>, runId: string, args: Record<string, unknown>): unknown {
    const lines = String(args["lines"]);
    if (!lines.endsWith("\n") || lines.split("\n").slice(0, -1).includes("")) {
      throw refusal("invalid_lines", "not whole lines");
    }
    const files = folder.get(runId) ?? { log: "", written: 0 };
    const lastSeq = countLines(files.log);
    if (lastSeq !== args["expectedSeq"]) {
      return { ok: false, reason: "conflict", lastSeq };
    }
    const appended: StoredRun = { log: files.log + lines, written: ++this.#writes };
    if (args["expectedSeq"] !== 0 && files.snapshot !== undefined) {
      appended.snapshot = files.snapshot;
    }
    folder.set(runId, appended);
    const answer = { ok: true, lastSeq: lastSeq + countLines(lines) };
    const snapshot = args["snapshot"];
    if (typeof snapshot !== "string") {
      return answer;
    }
    if (this.#snapshotFails) {
      return { ...answer, snapshotError: "No space left on device" };
    }
    appended.snapshot = snapshot;
    return answer;
  }

  #snapshot(files: RunFiles | undefined): unknown {
    if (files?.snapshot === undefined) {
      return null;
    }
    return { text: files.snapshot, logEvents: countLines(files.log) };
  }

  #folder(workspace: string, deployment: string | null): Map<string, StoredRun> {
    const key = JSON.stringify([workspace, deployment]);
    let folder = this.#folders.get(key);
    if (folder === undefined) {
      folder = new Map();
      this.#folders.set(key, folder);
    }
    return folder;
  }
}

function countLines(text: string): number {
  return text.split("\n").length - 1;
}

function refusal(kind: RunRefusalKind, message: string): RunRefusal {
  return { kind, message };
}
