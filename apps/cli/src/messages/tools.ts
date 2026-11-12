import { counted } from "./counts.ts";
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
  approveSummary: () => phrase`Approve listed tools by name, or every waiting one with --all`,
  revokeSummary: () => phrase`Remove your approval of listed tools`,
  /** What the three were doing, for "✕ Couldn't list the tools from notes-mcp: …". */
  action: (source?: string) =>
    source === undefined ? phrase`list the tools` : phrase`list the tools from ${source}`,
  /** Ends line 1 of the untrusted workspace's error: listing starts the connector. */
  nothingStarted: () => phrase`Nothing started.`,

  allOption: () => phrase`Approve every tool waiting now, at the fingerprint printed.`,
  fingerprintOption: () =>
    phrase`Approve only at the fingerprint you reviewed. Goes with one tool.`,

  /**
   * Usage errors: line 1 says what's missing, as 1.3 does, and the usage
   * line shows under it. No example id: the workspace may not have it.
   */
  nameTheSource: (subcommand: string) =>
    phrase`halonic tools ${subcommand} needs a connector's id.`,
  nameTheTools: () => phrase`halonic tools approve needs tool names, or --all.`,
  nameToolsToRevoke: () => phrase`halonic tools revoke needs tool names.`,
  /** N9: tool names together with `--all`. Nothing is approved. */
  namesAndAll: () => phrase`Give either tool names or --all, not both.`,
  namesAndAllFix: () => phrase`Run halonic tools approve --help to see its options.`,
  /** HAL-3004: `--fingerprint` with two or more tool names. Nothing is approved. */
  fingerprintManyTools: (names: readonly string[]) =>
    phrase`--fingerprint goes with one tool, and you named ${names.length}: ${names.join(", ")}.`,
  /** HAL-3004: `--fingerprint` with `--all`. */
  fingerprintWithAll: () => phrase`--fingerprint goes with one tool, not with --all.`,
  oneAtATime: () =>
    phrase`Approve them one at a time: halonic tools approve <source> <tool> --fingerprint <fingerprint>`,

  // `approve`.
  approvedOne: (tool: string, source: string) =>
    phrase`Approved ${tool} from ${source}, as it is now.`,
  approvedAlready: (tool: string, source: string) =>
    phrase`${tool} from ${source} is approved already.`,
  changedSinceFingerprint: (tool: string, fingerprint: string) =>
    phrase`Couldn't approve ${tool}: it changed since that fingerprint. It's now ${fingerprint}.`,
  readNewVersionFirst: (command: string) => phrase`Read the new version first: ${command}`,
  refused: (tool: string, reason: string) =>
    phrase`Couldn't approve ${tool}: Halonic refused it: ${reason}.`,
  notListed: (tool: string, source: string) =>
    phrase`Couldn't approve ${tool}: ${source} doesn't list a tool called ${tool}.`,
  didYouMean: (name: string) => phrase`Did you mean ${name}?`,
  seeItsTools: (command: string) => phrase`See its tools: ${command}`,
  nothingWaiting: (source: string) => phrase`Nothing from ${source} is waiting for your approval.`,
  onlyBuiltIn: (source: string) =>
    phrase`${source} has no listed tools to approve. Its tools come with the integration.`,
  /** `--all`: one row per tool, the fingerprint cut to 12 hex digits. */
  approvedRow: (tool: string) => phrase`Approved ${tool}`,
  leftOutKeepsChanging: (tool: string, source: string, command: string) =>
    phrase`Left out ${tool}: ${source} keeps changing it. Approve it by name: ${command}`,
  /** The C2 sentence; its second sentence is Studio's line under Approve all. */
  approvedAsTheyAre: (count: number, source: string) =>
    phrase`Approved ${counted(count, "tool", "tools")} from ${source}, as ${count === 1 ? "it is" : "they are"} now. Tools that change later ask again.`,

  // `revoke`.
  revoked: (tool: string, source: string) =>
    phrase`Removed your approval for ${tool} from ${source}. It's off until you approve it again.`,
  notApprovedToRevoke: (tool: string, source: string) =>
    phrase`Couldn't remove the approval for ${tool}: it isn't approved in ${source}.`,

  // Errors shared by the three.
  unknownSource: (typed: string, workspace: string) =>
    phrase`There's no connector or integration called "${typed}" in ${workspace}.`,
  /**
   * Line 2 under {@link unknownSource} when no connector's id is close. The
   * id is the file name in the workspace and in a hub alike.
   */
  seeConnectors: () => phrase`Use the connector's file name, without .connector.yaml.`,
  listingRefused: (source: string, reason: string) =>
    phrase`Couldn't use the tool list from ${source}: ${reason}. None of its listed tools are on.`,
  unreadable: (tool: string, source: string) =>
    phrase`Couldn't read your approval for ${tool} in ${source}, so none of its listed tools are on.`,
  unreadableFix: (command: string) => phrase`Remove it, then approve it again: ${command}`,
  /** N2: the approval that can't be read doesn't say which tool it is for. */
  unreadableUnnamed: (source: string) =>
    phrase`Couldn't read an approval in ${source}, so none of its listed tools are on.`,
  /** A connector with no server address to approve its tools at. */
  cantList: (source: string, reason: string) =>
    phrase`Couldn't list the tools from ${source}: ${reason}.`,
});
