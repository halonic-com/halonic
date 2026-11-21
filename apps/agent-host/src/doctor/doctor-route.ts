import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { namedWorkspace } from "../server/named-workspace.ts";
import { doctorBody } from "./doctor-schemas.ts";
import type { HostDoctor } from "./host-doctor.ts";

/**
 * The checks of Studio's "Check this computer" that need Node, over loopback
 * (requirement `agent-host.doctor-route`): `POST /v1/doctor` with
 * `{ workspace? }` answers `{ checks, summary }`, the doctor's lines as facts
 * and ids, each with the actions it offers.
 *
 * It answers 404 `unknown_workspace` for a folder the launcher didn't name,
 * 404 `no_workspace` for a named folder without `workspace.yaml`, 429 `busy`
 * while another check runs (it doesn't queue), and 500 `doctor_failed` with a
 * fixed message when a check throws. Neither the answer nor the log holds
 * an error's own text, which could quote a file of the workspace.
 *
 * @param workspaceRoots - the folders the launcher named as workspaces
 * @param log - where the host writes a line for a check that threw
 */
export function doctorRoute(
  doctor: HostDoctor,
  workspaceRoots: readonly string[],
  log: (text: string) => void,
): HostRoute {
  return {
    method: "POST",
    path: "/v1/doctor",
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, doctorBody);
      if (body === undefined) return;
      const root =
        body.workspace === undefined ? null : await namedWorkspace(workspaceRoots, body.workspace);
      if (root === undefined) {
        return sendError(
          response,
          404,
          "unknown_workspace",
          "The agent host was not told to serve this workspace.",
        );
      }
      let answer: Awaited<ReturnType<HostDoctor["check"]>>;
      try {
        answer = await doctor.check(root);
      } catch {
        log("The agent host's doctor couldn't finish a check.\n");
        return sendError(response, 500, "doctor_failed", "The agent host couldn't check.");
      }
      if (answer === "busy") {
        return sendError(response, 429, "busy", "The agent host is already checking.");
      }
      if (answer === "no_workspace") {
        return sendError(response, 404, "no_workspace", "The folder has no workspace.yaml.");
      }
      sendJson(response, 200, answer);
    },
  };
}
