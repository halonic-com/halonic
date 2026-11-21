import { createRemoteExecutor, RemoteHostError } from "@halonicjs/adapter-executor-remote";
import type { RunSummary } from "@halonicjs/events";
import type { RunExecutor, SendOptions } from "@halonicjs/ports";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import {
  EngineCallRefused,
  type EngineFetch,
  engineBaseUrl,
  type TauriCallbacks,
  type TauriIpc,
  tauriEngineFetch,
} from "@halonicjs/studio-services";
import { EngineNotAnswering } from "@halonicjs/studio-shell";
import type { RoutineRunStart } from "./engine-service.ts";
import type { PageRuns } from "./page-refusal.ts";

/** What a {@link RemoteEngine} needs: the way to its engine, and where a stream's errors go. */
export interface RemoteEngineOptions {
  /** The window's engine through the shell (`tauriEngineFetch`). */
  readonly fetch: EngineFetch;
  readonly reportError: (error: unknown) => void;
}

/** The kind of error the engine's refusal is, by its HTTP status. */
const kindsByStatus: Readonly<Record<number, ErrorKind>> = {
  400: "invalid_input",
  403: "denied",
  404: "not_found",
  409: "conflict",
  415: "invalid_input",
  429: "limit_reached",
};

/**
 * The engine process that runs the window's workspace in the background (B1, design note D3 on
 * HAL-14206), as the page's hosts reach it: the same slices the page's own `EngineService` gives
 * them, each a call through the shell. The engine runs the routines and keeps the workspace's
 * lock, so a page with a `RemoteEngine` opens no engine of its own. The engine records a start's
 * trigger itself, as `manual`, on its own clock. When the engine has gone, every call fails as
 * `unavailable` (`EngineNotAnswering`); starting it again is the shell's job.
 */
export class RemoteEngine {
  readonly #fetch: EngineFetch;
  readonly #executor: RunExecutor;

  /**
   * The engine runs harness programs and a run's connectors itself, and refuses an agent it can't
   * run when it starts, so the page refuses nothing ahead of it.
   */
  readonly pageRuns: PageRuns = { runsHarnesses: true, startsConnectors: true };

  constructor({ fetch, reportError }: RemoteEngineOptions) {
    this.#fetch = fetch;
    // No password: the shell holds the engine's token, so there is no sign-in.
    this.#executor = createRemoteExecutor({ baseUrl: engineBaseUrl, fetch, reportError });
  }

  /**
   * Starts a run of the workflow with `input` (`POST /api/runs`).
   *
   * @returns the new run's id
   * @throws KindedError with the engine's own sentence, `RunTargetNotFound`, or `EngineNotAnswering`
   */
  async startRun(
    { hubId, workflowId }: { readonly hubId: string; readonly workflowId: string },
    input: Record<string, unknown>,
  ): Promise<{ readonly id: string }> {
    const { id } = await asStudioError(this.#executor.start({ hubId, workflowId, input }));
    return { id };
  }

  /**
   * Starts what a routine runs, for its Run now (`POST /api/routines/<hub>/<routine>/run`): the
   * engine reads the routine itself, so only its key goes, never what it starts.
   *
   * @returns the new run's id
   * @throws KindedError `conflict` for a routine that is off, `not_found` for one that is gone,
   *   `denied` for a workspace that isn't trusted, or `EngineNotAnswering`
   */
  async startRoutine(
    _start: RoutineRunStart,
    { routineKey }: { readonly routineKey: string; readonly at: string },
  ): Promise<{ readonly id: string }> {
    // The key is `<hub>/<routine>`, `@workspace` for the workspace root's routines.
    const [hub = "", ...routine] = routineKey.split("/");
    const path = `/api/routines/${encodeURIComponent(hub)}/${encodeURIComponent(routine.join("/"))}/run`;
    const answer = await this.#json(path, { method: "POST", body: "{}" });
    const runId = (answer as { runId?: unknown } | null)?.runId;
    if (typeof runId !== "string") {
      throw new KindedError("unavailable", "The engine's answer to Run now named no run.");
    }
    return { id: runId };
  }

  /** Sends `event` to a waiting run (`RunExecutor.send`); the engine decides which answer was first. */
  send(
    runId: string,
    event: string,
    payload?: unknown,
    options?: SendOptions,
  ): Promise<RunSummary> {
    return asStudioError(this.#executor.send(runId, event, payload, options));
  }

  /** Cancels a run (`RunExecutor.cancel`). No screen offers it yet: the contract suite reads it. */
  cancel(runId: string): Promise<RunSummary> {
    const { cancel } = this.#executor;
    // The port leaves `cancel` out for an executor that can't cancel; the remote one always can.
    if (cancel === undefined) return Promise.reject(new Error("The engine can't cancel a run."));
    return asStudioError(cancel.call(this.#executor, runId));
  }

  /** The runs that wait for a person now (`GET /api/waiting-runs`). */
  async waiting(): Promise<RunSummary[]> {
    const answer = await this.#json("/api/waiting-runs", { method: "GET" });
    const runs = (answer as { runs?: unknown } | null)?.runs;
    if (!Array.isArray(runs)) {
      throw new KindedError("unavailable", "The engine's list of waiting runs wasn't readable.");
    }
    return runs as RunSummary[];
  }

  /** Calls a JSON route of the engine and gives its body; a refusal throws as {@link studioErrorOf} says. */
  async #json(path: string, init: RequestInit): Promise<unknown> {
    const headers = init.body === undefined ? {} : { "Content-Type": "application/json" };
    let response: Response;
    try {
      response = await this.#fetch(new Request(`${engineBaseUrl}${path}`, { ...init, headers }));
    } catch (error) {
      throw studioErrorOf(error);
    }
    if (!response.ok) throw studioErrorOf(await refusalOf(response));
    // The shell has read the engine's JSON already; an empty answer comes as an empty body.
    const text = await response.text();
    return text === "" ? null : JSON.parse(text);
  }
}

/**
 * Asks the shell whether an engine runs for the window's workspace, once, when the folder opens:
 * a `RemoteEngine` when the engine answered, `undefined` when the shell has none
 * (`engine_unavailable`). Anything else that stops the call is reported, and the page then runs
 * its own engine, which the engine lock keeps from running beside another.
 */
export async function openRemoteEngine(
  options: RemoteEngineOptions,
): Promise<RemoteEngine | undefined> {
  try {
    await options.fetch(new Request(`${engineBaseUrl}/api/hello`));
    return new RemoteEngine(options);
  } catch (error) {
    if (!(error instanceof EngineCallRefused && error.kind === "engine_unavailable")) {
      options.reportError(error);
    }
    return undefined;
  }
}

/** {@link openRemoteEngine} through the shell's IPC, logging what goes wrong on a stream. */
export function openShellEngine(ipc: TauriIpc & TauriCallbacks): Promise<RemoteEngine | undefined> {
  return openRemoteEngine({
    fetch: tauriEngineFetch(ipc),
    reportError: (error) => console.error("The background engine", error),
  });
}

/** The engine's `{ code, message }` refusal as the executor reads it. */
async function refusalOf(response: Response): Promise<RemoteHostError> {
  const body = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown };
  return new RemoteHostError(
    response.status,
    typeof body?.code === "string" ? body.code : "unexpected_response",
    typeof body?.message === "string" ? body.message : `The engine answered ${response.status}.`,
  );
}

/** `promise`, rejecting with {@link studioErrorOf} its error. */
async function asStudioError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    throw studioErrorOf(error);
  }
}

/**
 * What the hosts word by kind, as a `KindedError`: the engine's refusal with its own fixed
 * sentence, and an engine the shell no longer reaches as `EngineNotAnswering`. Anything else,
 * such as `RunTargetNotFound`, stays as it is.
 */
function studioErrorOf(error: unknown): unknown {
  if (error instanceof EngineCallRefused && ["engine_unavailable", "io"].includes(error.kind)) {
    return Object.assign(new EngineNotAnswering(), { cause: error });
  }
  if (error instanceof RemoteHostError) {
    return new KindedError(kindsByStatus[error.status] ?? "unavailable", error.message, {
      cause: error,
    });
  }
  return error;
}
