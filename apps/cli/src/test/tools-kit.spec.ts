// A spec helper, not a test file of its own: it uses Vitest, so its name ends in `.spec.ts`.
// `halonic tools` run in-process on Acme's `notes-mcp` (`acme-notes.ts`),
// for the tests of `review`, `approve` and `revoke`.

import { join } from "node:path";
import { afterEach, beforeEach, expect } from "vitest";
import type { QuestionTerminal } from "../output/question.ts";
import { runCli, type Terminal } from "../run-cli.ts";
import { type AcmeNotes, acmeNotes } from "./acme-notes.ts";
import { captureIo } from "./capture-io.ts";
import { type GoldenRun, goldenText, runGolden } from "./golden.ts";
import { checklistProblems } from "./golden-checklist.ts";

/** What a test file of `halonic tools` runs its command lines with. */
export interface ToolsKit {
  /** This test's Acme. */
  notes(): AcmeNotes;
  /**
   * Runs one command line in every golden mode on the approvals the test
   * started from, checks the design's checklist, and compares it with
   * `commands/tools/golden/<name>.txt`.
   */
  expectGolden(name: string, args: string[]): Promise<GoldenRun>;
  /** Runs `halonic tools …` from Acme on the approvals every run of the test shares. */
  tools(
    args: string[],
    terminal?: Terminal,
  ): Promise<{ code: number; stdout: string[]; stderr: string[] }>;
  /** `notes-mcp`'s listed tools now: the ones on, and the ones waiting with their fingerprints. */
  listedNow(): Promise<ListedNow>;
  /** The `--json` document of `halonic tools review notes-mcp` now. */
  reviewJson(): Promise<ReviewJson>;
}

/** The fields of `review`'s document the tests read. */
export interface ReviewJson {
  readonly on: string[];
  readonly waiting: { name: string; state: string; fingerprint: string; serverChanged: boolean }[];
}

/** What {@link ToolsKit.listedNow} gives back. */
export interface ListedNow {
  readonly on: string[];
  readonly waiting: { name: string; state: "changed" | "not_approved"; fingerprint: string }[];
}

const goldenFolder = join(import.meta.dirname, "..", "commands", "tools", "golden");

/** A fresh Acme before each test of the file, removed after it. */
export function toolsKit(): ToolsKit {
  let notes: AcmeNotes | undefined;
  beforeEach(async () => {
    notes = await acmeNotes();
  });
  afterEach(async () => {
    await notes?.remove();
  });
  const current = (): AcmeNotes => {
    if (notes === undefined) throw new Error("Acme is made before each test.");
    return notes;
  };
  const tools: ToolsKit["tools"] = async (args, terminal) => {
    const io = captureIo(current().acme);
    const code = await runCli(
      ["tools", ...args],
      io,
      current().sharedCommands(),
      terminal === undefined ? {} : { terminal },
    );
    return { code, stdout: io.stdout, stderr: io.stderr };
  };
  return {
    notes: current,
    async expectGolden(name, args) {
      const run = await runGolden(args, () => current().commands(), current().acme);
      expect(checklistProblems(run)).toEqual([]);
      await expect(goldenText(args, run)).toMatchFileSnapshot(join(goldenFolder, `${name}.txt`));
      return run;
    },
    tools,
    async listedNow() {
      const check = await current().check();
      if (check === "built_in") throw new Error("notes-mcp lists its tools.");
      return {
        on: check.tools.flatMap((tool) => (tool.kind === "listed" ? [tool.listedName] : [])),
        waiting: check.waiting.map((waiting) => ({
          name: waiting.listedName,
          state: waiting.approved === null ? "not_approved" : "changed",
          fingerprint: waiting.fingerprint,
        })),
      };
    },
    async reviewJson() {
      const { stdout } = await tools(["review", "notes-mcp", "--json"]);
      return JSON.parse(stdout.join("\n")) as ReviewJson;
    },
  };
}

/** A terminal where the user types `answers`, one per question, keeping what was written to stderr. */
export function terminalTyping(...answers: (string | undefined)[]) {
  const written: string[] = [];
  const questions: QuestionTerminal = {
    write: (text) => written.push(text),
    readLine: async () => answers.shift(),
  };
  const terminal: Terminal = {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions,
  };
  return { terminal, written };
}
