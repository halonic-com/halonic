import type { SandboxChoice, SandboxChoiceService } from "@halonicjs/app";
import { s } from "@halonicjs/schema-kit";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";

/** What the routes need of the choice: the service of `core/app`, or a stand-in in tests. */
export type SandboxChoiceSource = Pick<
  SandboxChoiceService,
  "current" | "start" | "settingsChanged"
>;

/** The POST takes an empty object: the person's choice is read from the profile, never from the caller. */
const emptyBody = s.object({}).strict();

/** Answers with the choice, or with 500 when the saved setting can't be read or isn't valid. */
async function answerWith(
  response: Parameters<HostRoute["handle"]>[1],
  choose: () => Promise<SandboxChoice>,
): Promise<void> {
  try {
    sendJson(response, 200, await choose());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendError(response, 500, "sandbox_choice_failed", message);
  }
}

/**
 * Which sandbox runs, for Studio (HAL-10796):
 *
 * - `GET /v1/sandbox/choice` answers the `SandboxChoice` of this start: the
 *   latest one, or the first, which also runs the trust check. Codes only,
 *   never sentences;
 * - `POST /v1/sandbox/choice/settings-changed` with `{}` chooses again, after
 *   the shell saved or removed the person's setting, and answers the new choice.
 *
 * The routes never save a setting and never download anything: only the
 * shell saves, and only from a person's press.
 */
export function sandboxChoiceRoutes(choice: SandboxChoiceSource): HostRoute[] {
  // Two first asks at once share one start, so the trust check runs once.
  let firstStart: Promise<SandboxChoice> | undefined;
  const latest = async () => {
    const known = choice.current();
    if (known !== null) return known;
    firstStart ??= choice.start();
    try {
      return await firstStart;
    } catch (error) {
      firstStart = undefined; // a failed start is asked again, not remembered
      throw error;
    }
  };
  return [
    {
      method: "GET",
      path: "/v1/sandbox/choice",
      handle: (_request, response) => answerWith(response, latest),
    },
    {
      method: "POST",
      path: "/v1/sandbox/choice/settings-changed",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, emptyBody);
        if (body === undefined) return;
        await answerWith(response, () => choice.settingsChanged());
      },
    },
  ];
}
