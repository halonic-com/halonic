import type { Sandbox } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { sandboxProfileSchema } from "../sandbox/profile-schema.ts";
import { openSession, sendHostStopping, sendTooManySessions } from "../sandbox/sandbox-routes.ts";
import type { SessionTable } from "../sandbox/session-table.ts";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { isRefusal, type UnfencedGate } from "./unfenced-gate.ts";
import type { UnfencedSessions } from "./unfenced-sessions.ts";

const openBody = s
  .object({
    workspace: s.string().min(1),
    hubId: s.string().min(1),
    agentId: s.string().min(1),
    profile: sandboxProfileSchema,
  })
  .strict();

const notOfferedMessage =
  "This agent host can't start an agent outside the sandbox on this computer.";

const profileTakenMessage = "A session already opened with this profile.";

/** What the host runs an agent on this computer with; `undefined` where it can't. */
export interface ThisComputerLauncher {
  /**
   * The launcher, `createHostSandbox()`, behind the profile builder's
   * `removingTempFolders`: its open takes the profile from the unopened ones.
   */
  readonly launcher: Sandbox;
  readonly gate: Pick<UnfencedGate, "check" | "isStillUnopened">;
}

/**
 * Sessions without the sandbox, for an agent a person set to "On this
 * computer" (requirement `agent-host.this-computer-sessions`):
 *
 * - `GET /v1/sandbox/this-computer` answers `{ offered }`: whether this host
 *   can open such a session at all, which Studio shows instead of a hint;
 * - `POST /v1/sandbox/this-computer/open` with `{ workspace, hubId, agentId,
 *   profile }` opens one with the launcher once {@link UnfencedGate} passes,
 *   and answers `{ session, fence }` like the sandbox's route, with the fence
 *   `off`. The session is then closed, streamed and started in through the
 *   sandbox's routes and the harness's, which check its run's environment
 *   (`UnfencedSessions`).
 *
 * Refusals: 403 `not_offered` where the host offers none, then the gate's
 * own (404 `unknown_workspace` and `unknown_agent`, 403
 * `workspace_not_trusted`, `not_on_this_computer` and `profile_not_built`),
 * 503 `host_stopping`, 429 `too_many_sessions` and 422
 * `sandbox_open_failed` as for the sandbox. Nothing starts before the gate passes.
 */
export function thisComputerRoutes(
  thisComputer: ThisComputerLauncher | undefined,
  sessions: SessionTable,
  unfenced: UnfencedSessions,
): HostRoute[] {
  return [
    {
      method: "GET",
      path: "/v1/sandbox/this-computer",
      handle: (_request, response) =>
        sendJson(response, 200, { offered: thisComputer !== undefined }),
    },
    {
      method: "POST",
      path: "/v1/sandbox/this-computer/open",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, openBody);
        if (body === undefined) return;
        if (thisComputer === undefined) {
          sendError(response, 403, "not_offered", notOfferedMessage);
          return;
        }
        if (sessions.isStopping) {
          sendHostStopping(response);
          return;
        }
        const release = sessions.reserve();
        if (release === undefined) {
          sendTooManySessions(response);
          return;
        }
        try {
          const { gate } = thisComputer;
          const checked = await gate.check(body);
          if (isRefusal(checked)) {
            sendError(response, checked.status, checked.kind, checked.message);
            return;
          }
          // No await between this and the open, which takes the profile.
          if (!gate.isStillUnopened(checked)) {
            sendError(response, 403, "profile_not_built", profileTakenMessage);
            return;
          }
          await openSession(thisComputer.launcher, sessions, body.profile, response, (id) =>
            unfenced.add(id, checked),
          );
        } finally {
          release();
        }
      },
    },
  ];
}
