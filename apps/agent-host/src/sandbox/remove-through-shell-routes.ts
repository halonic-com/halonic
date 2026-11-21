import type { ServerResponse } from "node:http";
import type { SandboxRemoval } from "@halonicjs/adapter-sandbox-srt";
import { s } from "@halonicjs/schema-kit";
import { type HostRoute, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import type { SessionTable } from "./session-table.ts";
import type { SetupJobs } from "./setup-routes.ts";

/**
 * The two halves of a removal that Studio's shell runs through the signed helper, with its own
 * administrator prompt (HAL-14841): this host's half before the prompt, and how it ended after.
 * `removalBeforeHelper` and `removalAfterHelper` give the real ones.
 */
export interface ShellRemoval {
  /** Takes back the grants srt kept for this user, before the prompt. */
  before(): Promise<SandboxRemoval>;
  /** How the removal ended, from the helper's exit code. */
  after(exitCode: number): SandboxRemoval;
}

const emptyBody = s.object({}).strict();

/** The helper's exit code, as Windows gives it: a 32-bit unsigned number. Nothing else. */
const elevatedBody = s.object({ exitCode: s.number().int().min(0).max(0xffff_ffff) }).strict();

/**
 * The removal's routes for Studio's shell, on Windows with the host beside it (HAL-14841):
 *
 * - `POST /v1/sandbox/remove/before` takes an empty object and does this host's half of the
 *   removal: it answers 200 `{ ok: true }` when the shell may start the helper, or how it failed.
 *   It refuses with 409 `sandbox_in_use` and `runs` while a sandboxed program runs here, and with
 *   409 `sandbox_busy` while the host runs a setup or removal itself, both before any prompt;
 * - `POST /v1/sandbox/remove/elevated` takes `{ exitCode }` after the shell ran the helper, and
 *   answers 200 with how the removal ended. It refuses with 409 `sandbox_busy` as above.
 *
 * Nothing about the removal comes from the caller but the exit code.
 */
export function removeThroughShellRoutes(
  jobs: SetupJobs,
  sessions: SessionTable,
  removal: ShellRemoval,
): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/sandbox/remove/before",
      handle: async (request, response) => {
        if ((await readCheckedBody(request, response, emptyBody)) === undefined) return;
        if (refusedBusy(jobs, response) || refusedInUse(sessions, response)) return;
        sendJson(response, 200, await removal.before());
      },
    },
    {
      method: "POST",
      path: "/v1/sandbox/remove/elevated",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, elevatedBody);
        if (body === undefined || refusedBusy(jobs, response)) return;
        sendJson(response, 200, removal.after(body.exitCode));
      },
    },
  ];
}

/** Answers 409 `sandbox_busy` while the host runs a setup or removal itself. */
function refusedBusy(jobs: SetupJobs, response: ServerResponse): boolean {
  const running = jobs.status().running;
  if (running === null) return false;
  const doing = running === "setup" ? "being set up" : "being removed";
  sendJson(response, 409, {
    error: { kind: "sandbox_busy", message: `The sandbox is ${doing}. Wait until that ends.` },
  });
  return true;
}

/** Answers 409 `sandbox_in_use` while a sandboxed program runs here (checklist 1.6, D5). */
function refusedInUse(sessions: SessionTable, response: ServerResponse): boolean {
  const runs = sessions.openCount;
  if (runs === 0) return false;
  const using = runs === 1 ? "1 run is" : `${runs} runs are`;
  sendJson(response, 409, {
    error: { kind: "sandbox_in_use", message: `${using} using the sandbox.` },
    runs,
  });
  return true;
}
