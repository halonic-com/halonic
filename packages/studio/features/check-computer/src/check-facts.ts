// The facts Check this computer shows, one entry per line (first-run-progress
// 4.2). The agent host answers the lines that need Node (HAL-13407) as the
// doctor's own facts; Studio adds the Engine, the Models line's keys and
// tests, Default model, Last run, Google and the Not checked line. The screen
// and the report are both made from these facts: the report through its own
// allow-list (`report/`), never from the screen's sentences.

import type {
  DefaultModelLine,
  DiskLine,
  HarnessesLine,
  LastRunLine,
  ModelsLine,
  NetworkLine,
  SandboxLine,
  TestOutcome,
  TimedOutLine,
  WorkspaceLine,
} from "@halonicjs/app";

/** The Engine line: whether the open workspace's engine answers. */
export interface EngineFact {
  readonly check: "engine";
  readonly running: boolean;
}

/** The last Test of a provider, from the first-run screen or **Test again**: its outcome and when. */
export interface ModelTest {
  /** The provider's name as a person reads it, such as "Anthropic"; it ties the test to its provider. */
  readonly provider: string;
  readonly outcome: TestOutcome;
  readonly at: Date;
}

/** The last test of the provider named `provider`, when it had one this session. */
export function lastTestOf(tests: readonly ModelTest[], provider: string): ModelTest | undefined {
  return tests.filter((test) => test.provider === provider).at(-1);
}

/** A cloud provider the workspace's aliases use, and whether its key is stored here. */
export interface ModelKey {
  /** The provider's name as a person reads it, such as "Anthropic". */
  readonly provider: string;
  /** `unreadable` when the key store couldn't be asked, such as a locked keychain. */
  readonly keyStored: boolean | "unreadable";
}

/**
 * The Models line: the agent host's half (the model servers on this computer), the keys of the
 * cloud providers, whether the workspace runs on Sample answers, and the last tests.
 */
export interface ModelsFact {
  readonly check: "models";
  /** The host's Models line; `undefined` when the workspace uses no server on this computer. */
  readonly servers: ModelsLine | TimedOutLine<"models"> | undefined;
  readonly keys: readonly ModelKey[];
  readonly sampleAnswers: boolean;
  readonly tests: readonly ModelTest[];
}

/** The Google line: a setup that was started and isn't finished, which is progress, not a fault. */
export interface GoogleFact {
  readonly check: "google";
  /** The step it is at, counted from 1, and how many there are. */
  readonly step: number;
  readonly steps: number;
  readonly startedAt: Date;
  /** For the screen only: the report never holds the account's address (4.3). */
  readonly email: string;
}

/** What the workspace doesn't use, so it isn't checked here (4.1). */
export type NotCheckedPart = "sandbox" | "harnesses";

/** The Not checked line: never "fine" for something that wasn't checked (4.4). */
export interface NotCheckedFact {
  readonly check: "not-checked";
  readonly parts: readonly NotCheckedPart[];
}

/** The Last run line, with the hub its run is in, so **Open the run** can open it. */
export type LastRunFact = LastRunLine & {
  /** Left out when the run can't be opened from here; the line then offers no **Open the run**. */
  readonly hub?: string;
};

/** The kind of sandbox the agent host runs, as it names it (`agent-host.doctor-sandbox-kind`). */
export type SandboxKind = "bubblewrap" | "seatbelt" | "windows";

/**
 * The Sandbox line as the agent host answers it: a ready one names the kind of sandbox the host
 * runs. On Windows only the host knows whether it runs on Windows itself or in Halonic's WSL distro.
 */
export type SandboxFact = SandboxLine & { readonly sandboxKind?: SandboxKind };

/** The lines the agent host answers, as the doctor's facts. */
export type HostFact =
  | WorkspaceLine
  | TimedOutLine<"workspace">
  | SandboxFact
  | TimedOutLine<"sandbox">
  | HarnessesLine
  | TimedOutLine<"harnesses">
  | NetworkLine
  | DiskLine
  | TimedOutLine<"disk">;

/** One line of Check this computer, as facts. */
export type CheckFact =
  | EngineFact
  | HostFact
  | ModelsFact
  | DefaultModelLine
  | LastRunFact
  | GoogleFact
  | NotCheckedFact;

/** Which line a fact is: the doctor's ids, and Studio's own. */
export type CheckLineId = CheckFact["check"];
