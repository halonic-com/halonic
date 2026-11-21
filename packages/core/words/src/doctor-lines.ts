// Which of the doctor's sentences each line says, in its order: the same for
// `halonic doctor` and Studio's Check this computer (first-run-progress 4.2,
// HAL-13406). The facts come from `@halonicjs/app`; the face draws the
// result, the CLI with its mark and label column, Studio as a list item.
// The Sandbox line isn't here: its reason and fix differ between the CLI
// and Studio on purpose, so each face words it (`sandboxStartWords` in
// Studio, `sandboxMessages` in the CLI).

import {
  type DiskLine,
  doctorCheckLimitMs,
  type HarnessesLine,
  type HarnessProblem,
  type LimitedCheck,
  type ModelProblem,
  type ModelsLine,
  type NetworkLine,
  type NodeLine,
  type ProviderReport,
  type SecretsLine,
  type TimedOutLine,
  type WorkspaceLine,
} from "@halonicjs/app";
import { type SignInShell, signInCommandText } from "@halonicjs/ports";
import type { Message } from "./define.ts";
import { wsl2FolderDocs } from "./docs.ts";
import { type DataUse, doctorMessages } from "./doctor.ts";
import type { Phrase } from "./phrase.ts";
import { printable } from "./printable.ts";
import { shownSize } from "./size.ts";

/**
 * One item of a line: a sentence, a fix (a sentence that starts with "Fix:"
 * and says what to do), or a docs link the CLI prints as `More:`.
 */
export type DoctorLineItem =
  | { readonly sentence: Phrase }
  | { readonly fix: Phrase }
  | { readonly docs: string };

/** A line's label and its items: the first after the label, the rest under it. */
export interface DoctorLineWords {
  readonly label: Message;
  readonly items: readonly DoctorLineItem[];
}

/** What only the face that shows the line knows. */
export interface DoctorFace {
  /** The command that trusts the workspace, quoted for the person's shell, such as "halonic trust --dir ./acme". */
  readonly trustCommand: string;
  /** The command that lists the workspace's file errors, such as "halonic validate". */
  readonly validateCommand: string;
  /** The terminal the person types a harness's sign-in into: PowerShell on Windows, `sh` elsewhere. */
  readonly signInShell: SignInShell;
  /** The text as one word the person's shell reads back as it is, such as a secret's name in "halonic secret set files-token". */
  readonly shellWord: (text: string) => string;
}

/** The lines this file words: every line of the report but the Sandbox. */
export type WordedLine =
  | WorkspaceLine
  | ModelsLine
  | SecretsLine
  | HarnessesLine
  | NodeLine
  | NetworkLine
  | DiskLine
  | TimedOutLine<Exclude<LimitedCheck, "sandbox">>;

/** Each check's label. */
const labels: Readonly<Record<LimitedCheck, () => Message>> = {
  workspace: doctorMessages.workspaceLabel,
  models: doctorMessages.modelsLabel,
  secrets: doctorMessages.secretsLabel,
  sandbox: doctorMessages.sandboxLabel,
  harnesses: doctorMessages.harnessesLabel,
  node: doctorMessages.nodeLabel,
  disk: doctorMessages.diskLabel,
};

/**
 * The label and the items of a doctor line (requirement `words.doctor-lines`).
 * Text from a workspace file, a model server or a harness is made
 * {@link printable}, so it can't colour a terminal or turn a line around.
 *
 * @example
 * doctorLineWords({ check: "workspace", status: "warning", name: "acme", trust: "changed" }, face);
 * // { label: Workspace, items: [{ sentence: "changed since you trusted it · halonic trust" }] }
 */
export function doctorLineWords(line: WordedLine, face: DoctorFace): DoctorLineWords {
  if ("timedOut" in line) return timedOutWords(line.check);
  switch (line.check) {
    case "workspace":
      return { label: doctorMessages.workspaceLabel(), items: workspaceItems(line, face) };
    case "models":
      return { label: doctorMessages.modelsLabel(), items: modelsItems(line) };
    case "secrets":
      return { label: doctorMessages.secretsLabel(), items: secretsItems(line, face) };
    case "harnesses":
      return { label: doctorMessages.harnessesLabel(), items: harnessesItems(line, face) };
    case "node":
      return { label: doctorMessages.nodeLabel(), items: nodeItems(line) };
    case "network":
      return { label: doctorMessages.networkLabel(), items: networkItems(line) };
    case "disk":
      return { label: doctorMessages.diskLabel(), items: diskItems(line) };
  }
}

/**
 * "didn't answer in 5 seconds", for any check that ran over its limit,
 * the Sandbox's included (HAL-13405).
 *
 * @example
 * timedOutWords("sandbox"); // { label: Sandbox, items: [{ sentence: "didn't answer in 5 seconds" }] }
 */
export function timedOutWords(check: LimitedCheck): DoctorLineWords {
  return {
    label: labels[check](),
    items: [{ sentence: doctorMessages.didntAnswer(doctorCheckLimitMs / 1000).phrase }],
  };
}

function workspaceItems(line: WorkspaceLine, face: DoctorFace): DoctorLineItem[] {
  const items: DoctorLineItem[] = [{ sentence: workspaceTrust(line, face).phrase }];
  if (line.windowsDrive !== undefined) {
    items.push(
      { sentence: doctorMessages.onWindowsDrive(line.windowsDrive).phrase },
      { fix: doctorMessages.moveToLinuxHome().phrase },
      { docs: wsl2FolderDocs },
    );
  }
  if (line.tooManyFilesToWatch !== undefined) {
    items.push(
      { sentence: doctorMessages.tooManyFilesToWatch(line.tooManyFilesToWatch).phrase },
      { fix: doctorMessages.openSmallerFolder().phrase },
    );
  }
  return items;
}

function workspaceTrust(line: WorkspaceLine, face: DoctorFace): Message {
  if (line.fileProblems !== undefined) {
    return doctorMessages.fileProblems(line.name, line.fileProblems, face.validateCommand);
  }
  switch (line.trust) {
    case "trusted":
      return doctorMessages.trusted(line.name);
    case "not-needed":
      return doctorMessages.testModelOnly(line.name);
    case "changed":
      return doctorMessages.changedSinceTrusted(face.trustCommand);
    case "refused":
      return doctorMessages.refused(face.trustCommand);
    case "new":
    case "unreadable":
      // A record that can't be read reads as not trusted, because `halonic trust` writes it again.
      return doctorMessages.notTrusted(face.trustCommand);
  }
}

/** The providers that are ready, one per item, then the problems, the unreachable ones first. */
function modelsItems(line: ModelsLine): DoctorLineItem[] {
  return [...line.ready.map(readyProvider), ...modelProblems(line.problems)].map((sentence) => ({
    sentence,
  }));
}

function readyProvider(provider: ProviderReport): Phrase {
  // Provider names and addresses come from workspace files, model names from the server's reply.
  if ("keyStored" in provider) return doctorMessages.keyStored(printable(provider.name)).phrase;
  const loaded =
    provider.models.length === 0
      ? undefined
      : doctorMessages.loaded(
          provider.models.map(({ name, memoryBytes }) =>
            memoryBytes === undefined
              ? { name: printable(name) }
              : { name: printable(name), size: shownSize(memoryBytes) },
          ),
        ).phrase;
  return doctorMessages.answering(printable(provider.name), printable(provider.address), loaded)
    .phrase;
}

/**
 * A default model no file has, one sentence per unreachable server, then one
 * per provider naming its aliases without a key, then one per provider whose
 * key couldn't be read.
 */
function modelProblems(problems: readonly ModelProblem[]): Phrase[] {
  const lines: Phrase[] = [];
  const unreadable: Phrase[] = [];
  const aliasesByProvider = new Map<string, { name: string; aliases: string[] }>();
  for (const problem of problems) {
    if (problem.problem === "no-alias") {
      lines.push(doctorMessages.noModelAlias(printable(problem.alias)).phrase);
      continue;
    }
    if (problem.problem === "unreachable") {
      lines.push(
        doctorMessages.notAnswering(printable(problem.name), printable(problem.address)).phrase,
      );
      continue;
    }
    if (problem.problem === "key-unreadable") {
      unreadable.push(
        // The Secrets line's words, with no command that sets the key: it may be there (HAL-14629).
        doctorMessages.secretUnreadable(printable(problem.secret), [
          { kind: "provider", id: printable(problem.provider) },
        ]).phrase,
      );
      continue;
    }
    const entry = aliasesByProvider.get(problem.provider) ?? { name: problem.name, aliases: [] };
    entry.aliases.push(problem.alias);
    aliasesByProvider.set(problem.provider, entry);
  }
  for (const { name, aliases } of aliasesByProvider.values()) {
    lines.push(doctorMessages.needKey(aliases.map(printable), printable(name)).phrase);
  }
  return [...lines, ...unreadable];
}

/**
 * One sentence per secret that isn't set, with what uses it and the command
 * that sets it, then one per secret the store couldn't be asked about.
 */
function secretsItems(line: SecretsLine, face: DoctorFace): DoctorLineItem[] {
  // Secret names and ids come from workspace files.
  const users = (usedBy: SecretsLine["missing"][number]["usedBy"]) =>
    usedBy.map(({ kind, id }) => ({ kind, id: printable(id) }));
  return [
    ...line.missing.map(
      ({ secret, usedBy }) =>
        doctorMessages.secretNotSet(printable(secret), users(usedBy), face.shellWord(secret))
          .phrase,
    ),
    ...line.unreadable.map(
      ({ secret, usedBy }) =>
        doctorMessages.secretUnreadable(printable(secret), users(usedBy)).phrase,
    ),
  ].map((sentence) => ({ sentence }));
}

/** The harnesses that are ready as one sentence, then each problem with its fix. */
function harnessesItems(line: HarnessesLine, face: DoctorFace): DoctorLineItem[] {
  const ready = line.installed.map(
    ({ name, version }) => doctorMessages.harnessReady(name, printable(version)).phrase,
  );
  const readyItems: DoctorLineItem[] = ready.length === 0 ? [] : [{ sentence: joined(ready) }];
  return [
    ...readyItems,
    ...line.problems.flatMap((problem) => harnessProblem(problem, face.signInShell)),
  ];
}

function harnessProblem(problem: HarnessProblem, shell: SignInShell): DoctorLineItem[] {
  switch (problem.problem) {
    case "missing":
      return [
        { sentence: doctorMessages.harnessMissing(problem.agent, problem.name).phrase },
        { fix: doctorMessages.installHarness(problem.name).phrase },
      ];
    case "signed-out": {
      const command = signInCommandText(problem.signIn, problem.settingsFolder, shell);
      return [
        { sentence: doctorMessages.agentSignedOut(problem.name, problem.agent).phrase },
        { fix: doctorMessages.signInForAgent(problem.agent, printable(command)).phrase },
      ];
    }
    case "unsupported":
      return [
        {
          sentence: doctorMessages.harnessUnsupported(
            problem.name,
            printable(problem.version),
            problem.supported,
          ).phrase,
        },
        { fix: doctorMessages.updateHarness(problem.name).phrase },
      ];
    case "failed":
      return [
        {
          sentence: doctorMessages.harnessVersionFailed(problem.name, printable(problem.error))
            .phrase,
        },
      ];
  }
}

/** What is wrong with the Node.js that runs Halonic, and the fix. */
function nodeItems(line: NodeLine): DoctorLineItem[] {
  return line.problem === "windows-node-in-wsl"
    ? [
        { sentence: doctorMessages.windowsNodeInWsl().phrase },
        { fix: doctorMessages.installNodeInWsl().phrase },
      ]
    : [
        { sentence: doctorMessages.windowsPnpm(printable(line.pnpm)).phrase },
        { fix: doctorMessages.installPnpmInWsl().phrase },
      ];
}

/** What is wrong with the proxy setting; the setting's own reason under it when it isn't the scheme. */
function networkItems(line: NetworkLine): DoctorLineItem[] {
  // The variable's name comes from the environment, but only as one of the names Halonic reads.
  return line.problem === "proxy-not-http"
    ? [{ sentence: doctorMessages.proxyNotHttp(line.variable, printable(line.scheme)).phrase }]
    : [
        { sentence: doctorMessages.proxyUnusable(line.variable).phrase },
        { sentence: doctorMessages.proxyReason(printable(line.reason)).phrase },
      ];
}

function diskItems(line: DiskLine): DoctorLineItem[] {
  const use = dataUse(line);
  if (line.freeBytes === null) {
    return [
      { sentence: doctorMessages.freeUnknown(use).phrase },
      { sentence: doctorMessages.freeUnknownReason().phrase },
    ];
  }
  const free = shownSize(line.freeBytes);
  const words =
    line.problem === "low" ? doctorMessages.lowOnDisk(free) : doctorMessages.diskFree(free, use);
  return [{ sentence: words.phrase }];
}

/** What Halonic's data takes, or nothing when a folder couldn't be read. */
function dataUse(line: DiskLine): DataUse | undefined {
  if (line.data === null) return undefined;
  return {
    total: shownSize(line.data.bytes),
    runLogs: shownSize(line.data.runLogBytes),
    ...(line.data.complete ? {} : { atLeast: true }),
  };
}

/** Phrases as one, with " · " between them. */
function joined(phrases: readonly Phrase[]): Phrase {
  return phrases.flatMap((part, index) =>
    index === 0 ? part : [" ", { mark: "separator" as const }, " ", ...part],
  );
}
