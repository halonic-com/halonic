import type { Sandbox } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import type { BuiltProfiles } from "../sandbox/built-profiles.ts";
import { sandboxProfileSchema } from "../sandbox/profile-schema.ts";
import {
  openSession,
  sendHostStopping,
  sendNotBuilt,
  sendTooManySessions,
} from "../sandbox/sandbox-routes.ts";
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

/** What the host opens a session on this computer with; `undefined` where it can't. */
export interface ThisComputerLauncher {
  /**
   * The launcher, `createHostSandbox()`, behind the profile builder's
   * `removingTempFolders`, so a session removes its temp folder when it closes.
   */
  readonly launcher: Sandbox;
  readonly gate: Pick<UnfencedGate, "check">;
  /** The profiles the host built: the open takes the one the gate passed, so it opens once. */
  readonly built: BuiltProfiles;
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
 *   `off`. The session is then streamed, closed and started in through the
 *   sandbox's routes and the harness's, which hold its runs to what the gate
 *   let out (`agent-host.unfenced-start`).
 *
 * Refusals: 403 `not_offered` where the host offers none, 503
 * `host_stopping` and 429 `too_many_sessions` as for the sandbox, then the
 * gate's own (`agent-host.unfenced-gate`), 403 `profile_not_built` when a
 * session took the profile in the meantime, and 422 `sandbox_open_failed`.
 * Nothing starts before the gate passes.
 */
export function thisComputerRoutes(
  thisComputer: ThisComputerLauncher | undefined,
  sessions: SessionTable,
  unfenced: Pick<UnfencedSessions, "add">,
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
          const checked = await thisComputer.gate.check(body);
          if (isRefusal(checked)) {
            sendError(response, checked.status, checked.kind, checked.message);
            return;
          }
          // No await since the gate's check of this profile: of two requests with it, one opens.
          if (!thisComputer.built.take(body.profile)) {
            sendNotBuilt(response);
            return;
          }
          const vetted = {
            profile: checked.profile,
            hubId: checked.agent.hubId,
            agentId: checked.agent.agentId,
            instructionsFolder: checked.instructionsFolder,
          };
          await openSession(thisComputer.launcher, sessions, body.profile, response, (id) =>
            unfenced.add(id, vetted),
          );
        } finally {
          release();
        }
      },
    },
  ];
}
