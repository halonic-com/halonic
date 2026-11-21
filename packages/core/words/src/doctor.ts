import { counted, groupedDigits } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { markPart, type Phrase, phrase } from "./phrase.ts";

/** What Halonic's own data takes on the disk, as the output writes sizes, such as "1.4 GB". */
export interface DataUse {
  readonly total: string;
  readonly runLogs: string;
  /** The count stopped at its limit, so the real use is larger. */
  readonly atLeast?: boolean;
}

/** A model a server on this computer has loaded, with its size as the output writes it, when known. */
export interface LoadedModelSize {
  readonly name: string;
  readonly size?: string;
}

/**
 * The sentences of `halonic doctor` (cli-output 1.9 and 3.7, with the team's
 * calls of revisions 20 and 24), shared with Studio's Check this computer
 * (first-run-progress 4.2, HAL-13406) so both say the same. One line per
 * check after its label, then the summary. A Sandbox line that can't start
 * takes its reason and fix from the CLI's `sandboxMessages`, and `More:` from
 * the error sentences. There's no Engine line and no Halonic sandbox setup
 * command in 0.1.
 */
export const doctorMessages = defineMessages("doctor", {
  summary: () => phrase`Check this computer's sandbox and disk, and a workspace's models`,
  /** What `doctor` was doing, for "✕ Couldn't check ./downloads: …"; "this computer" without `--dir`. */
  action: (folder?: string) => phrase`check ${folder ?? "this computer"}`,
  /** "Halonic 0.1.0 · Linux x64". */
  heading: (version: string, system: string) =>
    phrase`Halonic ${version} ${markPart("separator")} ${system}`,
  workspaceLabel: () => phrase`Workspace`,
  modelsLabel: () => phrase`Models`,
  secretsLabel: () => phrase`Secrets`,
  sandboxLabel: () => phrase`Sandbox`,
  harnessesLabel: () => phrase`Harnesses`,
  nodeLabel: () => phrase`Node.js`,
  networkLabel: () => phrase`Network`,
  diskLabel: () => phrase`Disk`,
  /**
   * Any line whose check ran over its limit (HAL-13405): "didn't answer in 5 seconds".
   * A warning: `doctor` couldn't tell, so it names no fix.
   */
  didntAnswer: (seconds: number) => phrase`didn't answer in ${seconds} seconds`,

  /** Workspace ✓. */
  trusted: (workspace: string) =>
    phrase`${workspace} ${markPart("separator")} trusted on this computer`,
  /** Workspace ✓ when a run there can only reach the test model, so it needs no trust (HAL-6007). */
  testModelOnly: (workspace: string) =>
    phrase`${workspace} ${markPart("separator")} test model only, no trust needed`,
  /**
   * Workspace ✕ when the workspace's files have errors, so `run` refuses it
   * (HAL-6613, built on the Workspace line with Sofia). `validate` is the
   * command that lists them, such as "halonic validate --dir ./acme": the
   * face that shows the line writes it, as only it knows the person's shell.
   */
  fileProblems: (workspace: string, count: number, validate: string) =>
    phrase`${workspace} ${markPart("separator")} ${counted(count, "problem", "problems")} in its files ${markPart("separator")} ${validate}`,
  /**
   * Workspace !, also when the trust record can't be read, because `halonic
   * trust` writes it again. `trust` is that command, such as "halonic trust".
   */
  notTrusted: (trust: string) => phrase`not trusted yet ${markPart("separator")} ${trust}`,
  /** Workspace ! when a file names something that can't be trusted; `halonic trust` says which (HAL-5421). */
  refused: (trust: string) => phrase`can't be trusted ${markPart("separator")} ${trust}`,
  /** Workspace !. */
  changedSinceTrusted: (trust: string) =>
    phrase`changed since you trusted it ${markPart("separator")} ${trust}`,

  /** Workspace ! under WSL, under the trust: the workspace is on a Windows drive (HAL-6517, HAL-12873). */
  onWindowsDrive: (drive: string) =>
    phrase`The workspace is on the Windows drive ${drive}, so runs are slower. If Studio on Windows opens this folder, keep it there.`,
  /** Under {@link onWindowsDrive}, for a folder only the CLI uses (HAL-12873). */
  moveToLinuxHome: () =>
    phrase`Fix: if you use it only from the command line, move it into your Linux home folder (~), then run halonic doctor again.`,
  /**
   * Workspace !, under the trust: more files than Studio's folder watch looks
   * at, worded as the watch's own failure (HAL-12295, signed off by Liam on HAL-12296).
   */
  tooManyFilesToWatch: (limit: number) =>
    phrase`The workspace has more than ${groupedDigits(limit)} files, too many for Studio to watch for changes made outside Halonic.`,
  /** Under {@link tooManyFilesToWatch}. */
  openSmallerFolder: () =>
    phrase`Fix: to see them in Studio as they happen, open a smaller folder, or move files the workspace doesn't use out of this one.`,

  /** Models ✓ for a model server on this computer; `loaded` is left out when no model is loaded. */
  answering: (server: string, address: string, loaded?: Phrase) =>
    loaded === undefined
      ? phrase`${server} answering at ${address}`
      : phrase`${server} answering at ${address} ${markPart("separator")} ${loaded}`,
  /**
   * "llama3.2 loaded (2.0 GB)", after {@link answering}; without the size
   * when the server doesn't say it. Several models are listed with commas.
   */
  loaded: (models: readonly LoadedModelSize[]) => phrase`${models.map(loadedModel).join(", ")}`,
  /** Models ✓ for a cloud provider: the key is never shown. */
  keyStored: (provider: string) => phrase`${provider}: API key stored`,
  /** Models !, one line per provider: "smart and writer need an API key for Anthropic." */
  needKey: (aliases: readonly string[], provider: string) =>
    phrase`${listed(aliases)} ${aliases.length === 1 ? "needs" : "need"} an API key for ${provider}.`,
  /** Models ✕, `model-unreachable`'s sentence. */
  notAnswering: (server: string, address: string) =>
    phrase`${server} isn't answering at ${address}`,

  /**
   * Secrets ✕, one line per secret, in the form of the Models line's key
   * line (C14 on HAL-14257, decided by the team on HAL-14269):
   * "files-token isn't set (connector files) · halonic secret set files-token".
   * `secretWord` is the name as one shell word, so the command can be copied
   * and run. The secret's value is never shown.
   */
  secretNotSet: (secret: string, users: readonly SecretUserName[], secretWord: string) =>
    phrase`${secret} isn't set (${usedBy(users)}) ${markPart("separator")} halonic secret set ${secretWord}`,
  /**
   * Secrets !, one line per secret the store couldn't be asked about, such
   * as with a locked keychain: "couldn't read files-token from the secret
   * store (connector files)".
   */
  secretUnreadable: (secret: string, users: readonly SecretUserName[]) =>
    phrase`couldn't read ${secret} from the secret store (${usedBy(users)})`,

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
  freeUnknown: (use?: DataUse) =>
    use === undefined
      ? phrase`free space unknown`
      : phrase`free space unknown ${markPart("separator")} ${halonicUses(use)}`,
  /** Under {@link freeUnknown}, with no fix line: there's nothing for the person to do. */
  freeUnknownReason: () => phrase`Halonic couldn't read the free space on this drive.`,

  // The Harnesses line: placeholders from P5 on HAL-2264 until the board
  // answers it. Each ! names the harness; a missing one names the agent too.
  /** Harnesses ✓, one per harness that's ready: "Claude Code 2.1.0". */
  harnessReady: (name: string, version: string) => phrase`${name} ${version}`,
  /** Harnesses !: "Writer uses Codex, and it isn't installed." */
  harnessMissing: (agent: string, harness: string) =>
    phrase`${agent} uses ${harness}, and it isn't installed.`,
  /** Under {@link harnessMissing}. */
  installHarness: (harness: string) =>
    phrase`Fix: install ${harness}, then run halonic doctor again.`,
  /**
   * Harnesses !: "Claude Code 0.9.1 isn't supported. Halonic needs 1.0.0 or newer."
   * `supported` as `detect()` writes it, ">=1.0.0".
   */
  harnessUnsupported: (harness: string, version: string, supported: string) =>
    phrase`${harness} ${version} isn't supported. Halonic needs ${oldestSupported(supported)} or newer.`,
  /** Under {@link harnessUnsupported}. */
  updateHarness: (harness: string) =>
    phrase`Fix: update ${harness}, then run halonic doctor again.`,
  /** Harnesses !, with no fix line: the reason is the harness's own. */
  harnessVersionFailed: (harness: string, reason: string) =>
    phrase`Halonic found ${harness} but couldn't ask its version: ${reason}`,
  /**
   * Harnesses !: "Claude Code isn't signed in for Writer." The agent's runs
   * use its own sign-in, never the person's (HAL-5231), so this is the line
   * the harness's sign-in error points to.
   */
  agentSignedOut: (harness: string, agent: string) =>
    phrase`${harness} isn't signed in for ${agent}.`,
  /** Under {@link agentSignedOut}: the sign-in for that agent's folder, to type into the person's own terminal. */
  signInForAgent: (agent: string, command: string) =>
    phrase`Fix: sign in for ${agent} with ${command}`,
  /**
   * Harnesses !: "Writer uses research (perplexity/sonar at OpenRouter), which
   * searches the web by itself, outside Halonic's tools and approvals."
   * A warning, not a fault: the model may be the person's choice (HAL-13603).
   */
  agentModelSearchesWeb: (agent: string, alias: string, model: string, provider: string) =>
    phrase`${agent} uses ${alias} (${model} at ${provider}), which searches the web by itself, outside Halonic's tools and approvals.`,
  /** Under {@link agentModelSearchesWeb}. */
  pickModelWithoutSearch: (alias: string) =>
    phrase`Fix: to keep its searches inside Halonic, point ${alias} in models.yaml at a model that doesn't search by itself.`,

  // The Node.js line (HAL-6517): shown only with one of these problems.
  /** Node.js ! on Windows, when the working folder is a WSL folder. */
  windowsNodeInWsl: () => phrase`This is Windows' Node.js, running in a WSL folder.`,
  /** Under {@link windowsNodeInWsl}. */
  installNodeInWsl: () =>
    phrase`Fix: install Node.js inside WSL, then run halonic doctor again from a WSL terminal.`,
  /** Node.js ! inside WSL, with the path of Windows' pnpm, which is under /mnt. */
  windowsPnpm: (path: string) => phrase`pnpm on the PATH is Windows' one: ${path}`,
  /** Under {@link windowsPnpm}. */
  installPnpmInWsl: () =>
    phrase`Fix: install pnpm inside WSL, for example with npm install -g pnpm, then run halonic doctor again.`,

  // The Network line (HAL-14262, Kim's wording on HAL-14245): shown only with one of these problems.
  /** Network ! when the proxy is another kind: "HTTPS_PROXY is an https:// proxy; Halonic only uses http:// proxies". */
  proxyNotHttp: (variable: string, scheme: string) =>
    phrase`${variable} is ${withArticle(`${scheme}://`)} proxy; Halonic only uses http:// proxies`,
  /** Network ! when the proxy setting can't be used for another reason, with that reason under it. */
  proxyUnusable: (variable: string) => phrase`${variable} is set, and Halonic can't use it.`,
  /** Under {@link proxyUnusable}: the proxy setting's own reason, as it words it. */
  proxyReason: (reason: string) => phrase`${reason}`,

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

/** "an https://", "a socks5://": "an" before a vowel, or an "h" read as "aitch". */
function withArticle(scheme: string): string {
  return /^[aeiouh]/iu.test(scheme) ? `an ${scheme}` : `a ${scheme}`;
}

/** What reads a secret: a connector, a model provider or a webhook routine, by the id in its file. */
export interface SecretUserName {
  readonly kind: "connector" | "provider" | "routine";
  readonly id: string;
}

/** "connector files", "connectors files and notes, provider mock", "routine friday-digest". */
function usedBy(users: readonly SecretUserName[]): string {
  const kinds = [
    { kind: "connector", one: "connector", many: "connectors" },
    { kind: "provider", one: "provider", many: "providers" },
    { kind: "routine", one: "routine", many: "routines" },
  ] as const;
  return kinds
    .map(({ kind, one, many }) => {
      const ids = users.filter((user) => user.kind === kind).map((user) => user.id);
      return ids.length === 0 ? "" : `${ids.length === 1 ? one : many} ${listed(ids)}`;
    })
    .filter((part) => part !== "")
    .join(", ");
}

function loadedModel({ name, size }: LoadedModelSize): string {
  return size === undefined ? `${name} loaded` : `${name} loaded (${size})`;
}

function halonicUses(use: DataUse): string {
  const amount = use.atLeast === true ? `at least ${use.total}` : use.total;
  return `Halonic uses ${amount} (run logs ${use.runLogs})`;
}

/** "smart", "smart and writer", "smart, writer and fast"; or "Ollama or LM Studio". */
function listed(names: readonly string[], conjunction: "and" | "or" = "and"): string {
  const last = names.at(-1) ?? "";
  return names.length < 2 ? last : `${names.slice(0, -1).join(", ")} ${conjunction} ${last}`;
}

/**
 * The oldest version a harness supports, as a person reads it after
 * "Halonic needs": `detect()` writes it as ">=X.Y.Z".
 *
 * @example
 * oldestSupported(">=1.0.0"); // "1.0.0"
 */
export function oldestSupported(supported: string): string {
  return supported.replace(/^>=\s*/, "");
}
