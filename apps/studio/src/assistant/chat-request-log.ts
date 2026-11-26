// The local request log a Build chat about a local integration reads
// (`assistant.build.read-request-log`). The chat is about a connector; a
// connector of the `integration` transport names the integration's folder,
// and the folder's permission sheet names its id, which names the log.

import {
  AgentHostRequestLogs,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { integrationsFolder, type RequestLogLine, readIntegrationSheets } from "@halonicjs/app";
import type { RequestLogReading } from "@halonicjs/assistant";
import type { DefinitionSource, SavedChatAbout } from "@halonicjs/ports";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";

/** Reads one local integration's request log, by the id its sheet names, oldest first. */
export type RequestLogs = (integration: string) => Promise<readonly RequestLogLine[]>;

/**
 * The request logs of the window's workspace, which the CLI's engine keeps in the profile, read
 * through the agent host (`agent-host.request-log-routes`). Every read names `location`, the
 * window's own workspace, so the log of another workspace's integration with the same id, which
 * may be local-only, is never read (Julian, HAL-19291).
 */
export function engineRequestLogs(transport: AgentHostTransport, location: string): RequestLogs {
  const logs = new AgentHostRequestLogs(transport, location);
  return (integration) => logs.lines(integration);
}

/**
 * What a chat's `read_request_log` reads: the log of the local integration the chat is about,
 * looked up again on every call.
 *
 * @param about - the item the chat is about, read on every call
 */
export function requestLogReading(
  files: DefinitionSource,
  about: () => Promise<SavedChatAbout | undefined>,
  logs: RequestLogs,
): RequestLogReading {
  return {
    integration: async () => localIntegrationOf(await loadWorkspace(files), files, await about()),
    lines: logs,
  };
}

/**
 * The id of the local integration a chat about `about` is about: the sheet id of the folder its
 * connector runs. `undefined` for a chat about no item, another kind of item, or a connector of
 * any other transport.
 */
export async function localIntegrationOf(
  loaded: LoadedWorkspace,
  files: DefinitionSource,
  about: SavedChatAbout | undefined,
): Promise<string | undefined> {
  if (about?.kind !== "connector") return undefined;
  const connector = filesOf(loaded, "connector").find(
    (file) => file.hub === about.hub && file.value.id === about.id,
  );
  const transport = connector?.value.transport;
  if (transport === undefined || !("integration" in transport)) return undefined;
  const folder = `${integrationsFolder}/${transport.integration.folder}`;
  return (await readIntegrationSheets(files)).find((each) => each.folder === folder)?.sheet.id;
}
