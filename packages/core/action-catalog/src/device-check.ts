import {
  type ResultField,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import { githubOwner, githubRepo } from "./github-parameters.ts";

// Shared by the device-check definitions. It sits next to src/device/, not in it,
// because every file in a service folder is a definition.

/** The longest note a user may add to a device-check result. */
export const maxNoteLength = 500;

/** A release tag such as `v0.3.1`: one path segment, so it can't change the page. */
const releaseTag = { kind: "text", pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/ } as const;

/** The only answers a device check accepts; the requesting agent gets one of these three. */
export const deviceCheckResult: ResultField = {
  label: "how it went: works, works-with-problems or doesnt-install",
  pattern: "^(works|works-with-problems|doesnt-install)$",
};

/** The one note a user may add: plain text, never a password or key. */
export const deviceCheckNotePattern = `^[^\\n\\r]{0,${maxNoteLength}}$`;

/** What one device check says, in the user's words. */
export interface DeviceCheckText {
  id: string;
  title: string;
  summary: string;
  /** The device and build, such as `the Windows build`, for the preview sentence. */
  subject: string;
  /** Numbered things to try, written for the user and ending with what counts as working. */
  instructions: readonly string[];
  checkedOn: string;
}

/**
 * Builds one hands-on device check: open the build's GitHub release page, try
 * the listed things, then give one of three fixed answers and a short note.
 */
export function deviceCheck(
  text: DeviceCheckText,
): StepperDefinition<Record<string, string | number>> {
  return {
    id: text.id,
    version: 1,
    service: "device",
    title: text.title,
    summary: text.summary,
    // Nothing changes on any account; the user installs a build they chose to try.
    risk: "routine",
    parameters: strictParameters({ owner: githubOwner, repo: githubRepo, tag: releaseTag }),
    steps: [
      {
        kind: "guided",
        address: "https://github.com/{owner}/{repo}/releases/tag/{tag}",
        instructions: text.instructions,
        checkedOn: text.checkedOn,
        result: deviceCheckResult,
      },
      {
        kind: "input",
        name: "note",
        label: `a short note on what happened (at most ${maxNoteLength} characters; never a password or key)`,
        secret: false,
        pattern: deviceCheckNotePattern,
      },
    ],
    targets: (parameters) => [
      {
        service: "github",
        kind: "release",
        name: `${parameters["owner"]}/${parameters["repo"]}@${parameters["tag"]}`,
      },
    ],
    preview: (parameters) => [
      `Opens the ${parameters["tag"]} release of ${parameters["owner"]}/${parameters["repo"]} on GitHub, where you download ${text.subject} and try it. Halonic can't check it; you answer works, works with problems or doesn't install, with a short note.`,
    ],
  };
}
