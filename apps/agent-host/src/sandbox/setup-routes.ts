import type { ServerResponse } from "node:http";
import type { SandboxRemoval, SandboxSetup } from "@halonicjs/adapter-sandbox-srt";
import { s } from "@halonicjs/schema-kit";
import { type HostRoute, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import type { SessionTable } from "./session-table.ts";

/** What the routes need of the sandbox: its one-time setup and its removal (see `SrtSandbox`). */
export interface SandboxSetter {
  setUp(): Promise<SandboxSetup>;
  remove(): Promise<SandboxRemoval>;
}

type Verb = "setup" | "remove";

/** Both POSTs take an empty object: nothing about the setup comes from the caller. */
const emptyBody = s.object({}).strict();

/** A setup or removal that has ended, and when. */
export interface FinishedSetup {
  verb: Verb;
  result: SandboxSetup | SandboxRemoval;
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

  constructor(setter: SandboxSetter, now: () => Date = () => new Date()) {
    this.#setter = setter;
    this.#now = now;
  }

  /** Which one runs now, if any, and the last one that ended. */
  status(): { running: Verb | null; last: FinishedSetup | null } {
    return { running: this.#running?.verb ?? null, last: this.#last };
  }

  /**
   * Starts `verb`, or joins it when it already runs.
   *
   * @returns its end, or the other verb when that one runs
   */
  run(verb: Verb): Promise<FinishedSetup> | { busy: Verb } {
    if (this.#running !== null) {
      return this.#running.verb === verb ? this.#running.done : { busy: this.#running.verb };
    }
    const started: Promise<SandboxSetup | SandboxRemoval> =
      verb === "setup" ? this.#setter.setUp() : this.#setter.remove();
    // Both never throw; if one did, the slot must still free up.
    const done = started.catch(thrown).then((result) => {
      const finished = { verb, result, finishedAt: this.#now().toISOString() };
      this.#last = finished;
      this.#running = null;
      return finished;
    });
    this.#running = { verb, done };
    return done;
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
function answerJob(jobs: SetupJobs, verb: Verb, response: ServerResponse): void {
  const job = jobs.run(verb);
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
 *   sandboxed program runs here. It doesn't stop them (checklist 1.6, D5).
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
  ];
}
