// The CLI's words for the workspace engine's refusals to read a version
// (HAL-17054): the engine says why with data, and the CLI says it as
// `routines watch`, `serve`, `run` and `runs send` always have.

import { VersionRefusedError } from "@halonicjs/adapter-workspace-engine-node";
import { OwnLineError } from "./command.ts";
import { plainText } from "./messages/phrase.ts";
import { routinesMessages } from "./messages/routines.ts";
import { runMessages } from "./messages/run.ts";
import { HistoryUnavailableError } from "./run-workspace.ts";

/**
 * `error` in the CLI's words when it is the engine's {@link VersionRefusedError},
 * else `error` as it is.
 *
 * @param workspaceName - the workspace's folder name: only the line about
 *   local only names it, which only the watch's versions refuse with
 */
export function inCliWords(error: unknown, workspaceName = ""): unknown {
  if (!(error instanceof VersionRefusedError)) return error;
  const { refusal } = error;
  switch (refusal.reason) {
    case "history-unavailable":
      return new HistoryUnavailableError(runMessages.nothingRan(), error.cause);
    case "nothing-live":
      return new OwnLineError("conflict", runMessages.nothingLive(), runMessages.nothingLiveFix());
    case "local-only-changed": {
      const saved = { now: refusal.savedNow, atStart: refusal.savedAtStart };
      return lineError(routinesMessages.localOnlyChanged(workspaceName, saved));
    }
    case "no-history-for-version":
      return lineError(routinesMessages.noHistoryForVersion(refusal.commit));
    case "no-agent-file":
      return lineError(routinesMessages.noAgentFileInVersion(refusal.hubId, refusal.agentId));
    case "no-skill":
      return lineError(routinesMessages.noSkillInVersion(refusal.hubId, refusal.skillId));
    case "no-version-for-agent-file":
      return lineError(routinesMessages.noVersionForAgentFile(refusal.runId));
  }
}

/** A plain error whose message is the line, as these refusals were thrown before the move. */
function lineError(line: { readonly phrase: Parameters<typeof plainText>[0] }): Error {
  return new Error(plainText(line.phrase));
}
