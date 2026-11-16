import type { ServerResponse } from "node:http";
import type {
  SandboxRemoval,
  SandboxSetup,
  WslRemoveChoice,
  WslRemoveResult,
} from "@halonicjs/adapter-sandbox-srt";
import { s } from "@halonicjs/schema-kit";
import { type HostRoute, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import type { SessionTable } from "./session-table.ts";
import type { WslRemover } from "./wsl-remove-host.ts";

/** What the routes need of the sandbox: its one-time setup and its removal (see `SrtSandbox`). */
export interface SandboxSetter {
  setUp(): Promise<SandboxSetup>;
  remove(): Promise<SandboxRemoval>;
}

/** The WSL setup's removal, when this host can do it (HAL-10974). */
export type WslRemoval = WslRemover;

type Verb = "setup" | "remove" | "remove-wsl";

/** Both POSTs take an empty object: nothing about the setup comes from the caller. */
const emptyBody = s.object({}).strict();

/**
 * What `POST /v1/sandbox/remove-wsl` takes: the user's explicit choice for the
 * distro's files. There is no default, and no distro name: the host removes
 * only Halonic's own. A backup file goes with `export-then-remove` only.
 */
const removeWslBody = s.union([
  s.object({ choice: s.literal("export-then-remove"), file: s.string().min(1) }).strict(),
  s.object({ choice: s.literal("remove-only") }).strict(),
]);

/** A setup or removal that has ended, and when. */
export interface FinishedSetup {
  verb: Verb;
  result: SandboxSetup | SandboxRemoval | WslRemoveResult;
  /** ISO time it ended. */
  finishedAt: string;
}

/**
 * The one setup or removal that may run at a time, and the last one that
 * ended. A second press while one runs joins it rather than ask Windows
 * again (UX checklist on HAL-1444, 1.3), and nothing stops it early: the
 * administrator prompt may be approved late (HAL-1415, 2 point 5).
 */
export class SetupJobs {
  readonly #setter: SandboxSetter;
  readonly #now: () => Date;
  #running: { verb: Verb; done: Promise<FinishedSetup> } | null = null;
  #last: FinishedSetup | null = null;

  readonly #wsl: WslRemoval | undefined;

  constructor(setter: SandboxSetter, now: () => Date = () => new Date(), wsl?: WslRemoval) {
    this.#setter = setter;
    this.#now = now;
    this.#wsl = wsl;
  }

  /** Whether this host can remove the WSL setup. */
  get canRemoveWsl(): boolean {
    return this.#wsl !== undefined;
  }

  /** Which one runs now, if any, and the last one that ended. */
  status(): { running: Verb | null; last: FinishedSetup | null } {
    return { running: this.#running?.verb ?? null, last: this.#last };
  }

  /**
   * Starts `verb`, or joins it when it already runs.
   *
   * @param choice - for `remove-wsl` only: what the user chose; a second press joins the job that runs, whatever it chose
   * @returns its end, or the other verb when that one runs
   */
  run(verb: Verb, choice?: WslRemoveChoice): Promise<FinishedSetup> | { busy: Verb } {
    if (this.#running !== null) {
      return this.#running.verb === verb ? this.#running.done : { busy: this.#running.verb };
    }
    const started = this.#start(verb, choice);
    // None of them throws; if one did, the slot must still free up.
    const done = started.catch(thrown).then((result) => {
      const finished = { verb, result, finishedAt: this.#now().toISOString() };
      this.#last = finished;
      this.#running = null;
      return finished;
    });
    this.#running = { verb, done };
    return done;
  }

  #start(
    verb: Verb,
    choice: WslRemoveChoice | undefined,
  ): Promise<SandboxSetup | SandboxRemoval | WslRemoveResult> {
    if (verb === "setup") return this.#setter.setUp();
    if (verb === "remove") return this.#setter.remove();
    return this.#removeWsl(choice);
  }

  #removeWsl(choice: WslRemoveChoice | undefined): Promise<WslRemoveResult> {
    if (this.#wsl === undefined || choice === undefined) {
      return Promise.reject(new Error("This host can't remove the WSL setup."));
    }
    return this.#wsl(choice);
  }
}

/** A setup or removal that threw, as the failure it is. */
function thrown(error: unknown): SandboxRemoval {
  const reason = error instanceof Error ? error.message : String(error);
  return { ok: false, outcome: "failed", reason };
}

/**
 * Starts the job, or joins it, and answers 202 with the status at once: the
 * job can outlast Studio's 120-second limit on a call while Windows' prompt
 * waits, so the caller follows it with `GET /v1/sandbox/setup`. Answers 409
 * `sandbox_busy` while the other verb runs.
 */
function answerJob(
  jobs: SetupJobs,
  verb: Verb,
  response: ServerResponse,
  choice?: WslRemoveChoice,
): void {
  const job = jobs.run(verb, choice);
  if ("busy" in job) {
    const doing = job.busy === "setup" ? "being set up" : "being removed";
    sendJson(response, 409, {
      error: { kind: "sandbox_busy", message: `The sandbox is ${doing}. Wait until that ends.` },
    });
    return;
  }
  // Nobody waits on the job here: its end is kept in `status`.
  sendJson(response, 202, jobs.status());
}

/**
 * The agent sandbox's one-time setup and its removal, for Studio's Settings ›
 * Agent sandbox (HAL-1451). Desktop only: Studio relays them from its own
 * window, never from a served page, and they are never a tool for an agent
 * or a harness (HAL-1415, risk 6).
 *
 * - `GET /v1/sandbox/setup` answers `{ running, last }`: the verb that runs
 *   now, if any, and the last {@link FinishedSetup}, so a Settings opened
 *   during a setup shows it;
 * - `POST /v1/sandbox/setup` starts the setup, with one administrator
 *   prompt, or joins the one that runs, and answers 202 with `{ running,
 *   last }` at once; the caller follows it with the GET until `running` is
 *   null, however long Windows' prompt takes;
 * - `POST /v1/sandbox/remove` does the same for the removal, but refuses
 *   with 409 `sandbox_in_use` and `runs`, before any prompt, while a
 *   sandboxed program runs here. It doesn't stop them (checklist 1.6, D5);
 * - `POST /v1/sandbox/remove-wsl` takes `{ choice: "export-then-remove", file }`
 *   or `{ choice: "remove-only" }` and removes Halonic's WSL distro, with the
 *   same 202, job slot and 409s. A failed export removes nothing. It is served
 *   only by a host that can do it.
 */
export function setupRoutes(jobs: SetupJobs, sessions: SessionTable): HostRoute[] {
  return [
    {
      method: "GET",
      path: "/v1/sandbox/setup",
      handle: (_request, response) => sendJson(response, 200, jobs.status()),
    },
    {
      method: "POST",
      path: "/v1/sandbox/setup",
      handle: async (request, response) => {
        if ((await readCheckedBody(request, response, emptyBody)) === undefined) return;
        answerJob(jobs, "setup", response);
      },
    },
    {
      method: "POST",
      path: "/v1/sandbox/remove",
      handle: async (request, response) => {
        if ((await readCheckedBody(request, response, emptyBody)) === undefined) return;
        const runs = sessions.openCount;
        if (runs > 0) {
          const using = runs === 1 ? "1 run is" : `${runs} runs are`;
          sendJson(response, 409, {
            error: { kind: "sandbox_in_use", message: `${using} using the sandbox.` },
            runs,
          });
          return;
        }
        answerJob(jobs, "remove", response);
      },
    },
    ...(jobs.canRemoveWsl ? [removeWslRoute(jobs, sessions)] : []),
  ];
}

function removeWslRoute(jobs: SetupJobs, sessions: SessionTable): HostRoute {
  return {
    method: "POST",
    path: "/v1/sandbox/remove-wsl",
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, removeWslBody);
      if (body === undefined) return;
      const runs = sessions.openCount;
      if (runs > 0) {
        const using = runs === 1 ? "1 run is" : `${runs} runs are`;
        sendJson(response, 409, {
          error: { kind: "sandbox_in_use", message: `${using} using the sandbox.` },
          runs,
        });
        return;
      }
      const choice: WslRemoveChoice =
        body.choice === "export-then-remove"
          ? { choice: "export-then-remove", file: body.file }
          : { choice: "remove-without-export" };
      answerJob(jobs, "remove-wsl", response, choice);
    },
  };
}
