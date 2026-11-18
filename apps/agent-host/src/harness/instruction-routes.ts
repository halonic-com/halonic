import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { instructionsBody, releaseInstructionsBody } from "./harness-schemas.ts";
import type { HostRunInstructions } from "./host-instructions.ts";

/**
 * The instructions folders of harness runs over loopback, so Studio can give
 * the engine a `HarnessInstructionSource` whose folders are made next to the
 * sandbox: `POST /v1/harnesses/instructions` with `{ workspace, files }`
 * answers `{ folder, pin }`, and `…/instructions/release` with `{ folder }`
 * answers `{}`.
 *
 * It answers 404 `unknown_workspace` for a folder the launcher didn't name,
 * and 422 `instructions_refused` with the reason for a name that isn't
 * `AGENTS.md` or a skill's `SKILL.md`, or files that can't be written.
 * Release removes only a folder this host made, and answers `{}` for any
 * other path, so a page can't remove anything else through it.
 */
export function instructionRoutes(instructions: HostRunInstructions): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/harnesses/instructions",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, instructionsBody);
        if (body === undefined) return;
        try {
          const opened = await instructions.open(body.workspace, body.files);
          if (opened === undefined) {
            return sendError(
              response,
              404,
              "unknown_workspace",
              "The agent host was not told to serve this workspace.",
            );
          }
          sendJson(response, 200, opened);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          sendError(response, 422, "instructions_refused", reason);
        }
      },
    },
    {
      method: "POST",
      path: "/v1/harnesses/instructions/release",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, releaseInstructionsBody);
        if (body === undefined) return;
        await instructions.release(body.folder);
        sendJson(response, 200, {});
      },
    },
  ];
}
