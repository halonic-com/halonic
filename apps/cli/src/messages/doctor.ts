import { counted } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { markPart, type Phrase, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** What Halonic's own data takes on the disk, as the output writes sizes, such as "1.4 GB". */
export interface DataUse {
  readonly total: string;
  readonly runLogs: string;
  /** The count stopped at its limit, so the real use is larger. */
  readonly atLeast?: boolean;
}

/**
 * The sentences of `halonic doctor` (cli-output 1.9 and 3.7, with the team's
 * calls of revisions 20 and 24). One line per check after its label, then the
 * summary. A Sandbox line that can't start takes its reason and fix from
 * `sandboxMessages`, and `More:` from the error sentences. There's no Engine
 * line and no Halonic sandbox setup command in 0.1.
 */
export const doctorMessages = defineMessages("doctor", {
  summary: () => phrase`Check that this computer can run Halonic: models, sandbox, disk`,
  /** "Halonic 0.1.0 · Linux x64". */
  heading: (version: string, system: string) =>
    phrase`Halonic ${version} ${markPart("separator")} ${system}`,
  workspaceLabel: () => phrase`Workspace`,
  modelsLabel: () => phrase`Models`,
  sandboxLabel: () => phrase`Sandbox`,
  diskLabel: () => phrase`Disk`,

  /** Workspace ✓. */
  trusted: (workspace: string) =>
    phrase`${workspace} ${markPart("separator")} trusted on this computer`,
  /** Workspace !, also when the trust record can't be read, because `halonic trust` writes it again. */
  notTrusted: (dir?: string) =>
    phrase`not trusted yet ${markPart("separator")} ${suggestedCommand("trust", dir)}`,
  /** Workspace !. */
  changedSinceTrusted: (dir?: string) =>
    phrase`changed since you trusted it ${markPart("separator")} ${suggestedCommand("trust", dir)}`,

  /** Models ✓ for a model server on this computer; `loaded` is left out when no model is loaded. */
  answering: (server: string, address: string, loaded?: Phrase) =>
    loaded === undefined
      ? phrase`${server} answering at ${address}`
      : phrase`${server} answering at ${address} ${markPart("separator")} ${loaded}`,
  /** "llama3.2 loaded (2.0 GB)", after {@link answering}. */
  loaded: (model: string, size: string) => phrase`${model} loaded (${size})`,
  /** Models ✓ for a cloud provider: the key is never shown. */
  keyStored: (provider: string) => phrase`${provider}: API key stored`,
  /** Models !, one line per provider: "smart and writer need an API key for Anthropic." */
  needKey: (aliases: readonly string[], provider: string) =>
    phrase`${listed(aliases)} ${aliases.length === 1 ? "needs" : "need"} an API key for ${provider}.`,
  /** Models ✕, `model-unreachable`'s sentence. */
  notAnswering: (server: string, address: string) =>
    phrase`${server} isn't answering at ${address}`,

  /** Sandbox ✓: "ready · bubblewrap". */
  sandboxReady: (kind: string) => phrase`ready ${markPart("separator")} ${kind}`,
  /** Sandbox ✕, with the reason, the fix and `More:` under it. */
  sandboxCantStart: () => phrase`can't start on this computer`,

  /** Disk ✓: "48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)", or "48 GB free" when the use can't be read. */
  diskFree: (free: string, use?: DataUse) =>
    use === undefined
      ? phrase`${free} free`
      : phrase`${free} free ${markPart("separator")} ${halonicUses(use)}`,
  /** Disk !, below 1 GB free, as the status bar. */
  lowOnDisk: (free: string) => phrase`Low on disk space: ${free} free`,
  /** Disk ! when the free space can't be read: the line stays, so the failure isn't hidden. */
  freeUnknown: (use: DataUse) =>
    phrase`free space unknown ${markPart("separator")} ${halonicUses(use)}`,
  /** Under {@link freeUnknown}, with no fix line: there's nothing for the person to do. */
  freeUnknownReason: () => phrase`Halonic couldn't read the free space on this drive.`,

  noProblems: () => phrase`No problems.`,
  problems: (count: number) => phrase`${counted(count, "problem", "problems")}.`,
  warnings: (count: number) => phrase`${counted(count, "warning", "warnings")}.`,
  /**
   * After the count, what each ✕ line stops, in the lines' order: Models
   * before Sandbox (cli-output 3.7, revision 24). The count is of ✕ lines, so
   * a Models line with two servers is one problem. Warnings come last.
   */
  modelsStop: (servers: readonly string[]) =>
    servers.length === 1
      ? phrase`Agents that use ${listed(servers, "or")} won't run until it answers.`
      : phrase`Agents that use ${listed(servers, "or")} won't run until they answer.`,
  /** After the count, when the sandbox can't start: what that stops. */
  sandboxStops: () => phrase`Agents set to run in a sandbox won't start until it's fixed.`,
});

function halonicUses(use: DataUse): string {
  const amount = use.atLeast === true ? `at least ${use.total}` : use.total;
  return `Halonic uses ${amount} (run logs ${use.runLogs})`;
}

/** "smart", "smart and writer", "smart, writer and fast"; or "Ollama or LM Studio". */
function listed(names: readonly string[], conjunction: "and" | "or" = "and"): string {
  const last = names.at(-1) ?? "";
  return names.length < 2 ? last : `${names.slice(0, -1).join(", ")} ${conjunction} ${last}`;
}
