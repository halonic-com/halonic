import { findProgram } from "@halonicjs/adapter-system-node";
import { type Harness, signInCommandText } from "@halonicjs/ports";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import type { TerminalCommand, TerminalOpened } from "../terminal/open-terminal.ts";
import { signInBody } from "./harness-schemas.ts";

/**
 * What the route answers: a window opened, or why none did and the command
 * the person can run by hand instead, in their own terminal.
 */
export type SignInOpened = { opened: true } | { opened: false; reason: string; command: string };

/** What the sign-in route reaches; tests pass their own. */
export interface SignInRouteDeps {
  harnesses: readonly Harness[];
  /** The program's absolute path on the `PATH`, or `undefined` when it isn't there. */
  findProgram?: (name: string) => Promise<string | undefined>;
  /** Opens a terminal the person can see (`openTerminal`). */
  openTerminal: (command: TerminalCommand) => Promise<TerminalOpened>;
  platform?: NodeJS.Platform;
}

/**
 * `POST /v1/harnesses/sign-in` with `{ harness, settingsFolder }`: opens a
 * terminal the person can see, running the harness program's own sign-in
 * pointed at one agent's settings folder (HAL-5395). The person signs in
 * there as usual; Halonic never sees or copies the sign-in.
 *
 * It answers `{ opened: true }`, or `{ opened: false, reason, command }`
 * when no window could open or the program isn't on this computer, so
 * Studio can show the command to run by hand. A harness without a sign-in
 * of its own gets `422 no_sign_in`, and a command `openTerminal` refuses
 * (a folder under a skill's `scripts/`) `422 sign_in_refused`.
 */
export function signInRoute(deps: SignInRouteDeps): HostRoute {
  const platform = deps.platform ?? process.platform;
  const find = deps.findProgram ?? ((name: string) => findProgram(name));
  return {
    method: "POST",
    path: "/v1/harnesses/sign-in",
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, signInBody);
      if (body === undefined) return;
      const harness = deps.harnesses.find((each) => each.id === body.harness);
      if (harness === undefined) {
        return sendError(
          response,
          404,
          "unknown_harness",
          "The agent host has no harness with this id.",
        );
      }
      const signIn = harness.signIn;
      if (signIn === undefined) {
        return sendError(response, 422, "no_sign_in", `${harness.name} has no sign-in of its own.`);
      }
      // In the person's own terminal: PowerShell on Windows, `sh` elsewhere.
      const shell = platform === "win32" ? "powershell" : "sh";
      const byHand = signInCommandText(signIn, body.settingsFolder, shell);
      const program = await find(signIn.program);
      if (program === undefined) {
        const reason = `${harness.name} wasn't found on this computer.`;
        return sendJson(response, 200, { opened: false, reason, command: byHand });
      }
      const variables = { [signIn.folderVariable]: body.settingsFolder };
      let opened: TerminalOpened;
      try {
        opened = await deps.openTerminal({ program, args: signIn.args, variables });
      } catch (error) {
        // A refusal, such as a folder under a skill's `scripts/`: nothing opened, and the
        // command would be refused by hand too, so there is none to show.
        return sendError(response, 422, "sign_in_refused", messageOf(error));
      }
      const answer: SignInOpened = opened.opened
        ? { opened: true }
        : { opened: false, reason: opened.reason, command: byHand };
      sendJson(response, 200, answer);
    },
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
