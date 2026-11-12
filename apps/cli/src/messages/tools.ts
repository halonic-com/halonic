import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * The sentences of `halonic tools review | approve | revoke` (cli-output
 * 3.10, revisions 33, 36 and 49, and HAL-3004 for `--fingerprint`). Studio's
 * review screen says the same things (microcopy 27). The source is named by
 * its id as the workspace writes it, never "source" or "server". Tool names,
 * descriptions and reasons come from a server and arrive escaped; commands
 * Halonic suggests arrive whole, with the user's own `--dir`.
 */
export const toolsMessages = defineMessages("tools", {
  summary: () => phrase`Review and approve the tools your connectors list`,
  revokeSummary: () => phrase`Remove your approval of listed tools`,
  /** What the three were doing, for "✕ Couldn't list the tools from notes-mcp: …". */
  action: (source?: string) =>
    source === undefined ? phrase`list the tools` : phrase`list the tools from ${source}`,

  /**
   * Usage errors: line 1 says what's missing, as 1.3 does, and the usage
   * line shows under it. No example id: the workspace may not have it.
   */
  nameTheSource: (subcommand: string) =>
    phrase`halonic tools ${subcommand} needs a connector's id.`,
  nameToolsToRevoke: () => phrase`halonic tools revoke needs tool names.`,

  // `revoke`.
  revoked: (tool: string, source: string) =>
    phrase`Removed your approval for ${tool} from ${source}. It's off until you approve it again.`,
  notApprovedToRevoke: (tool: string, source: string) =>
    phrase`Couldn't remove the approval for ${tool}: it isn't approved in ${source}.`,

  // Errors shared by the three.
  unknownSource: (typed: string, workspace: string) =>
    phrase`There's no connector or integration called "${typed}" in ${workspace}.`,
  /** Line 2 under {@link unknownSource} when a connector's id is close. */
  didYouMean: (name: string) => phrase`Did you mean ${name}?`,
  /**
   * Line 2 under {@link unknownSource} when no connector's id is close. The
   * id is the file name in the workspace and in a hub alike.
   */
  seeConnectors: () => phrase`Use the connector's file name, without .connector.yaml.`,
});
