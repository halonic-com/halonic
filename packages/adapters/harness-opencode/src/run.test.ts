import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { diskSettingsFolder } from "@halonicjs/adapter-harness-kit";
import type {
  HarnessBridge,
  HarnessEvent,
  HarnessRun,
  HarnessTask,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { type FakeProgram, FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { opencodeCommand } from "./command.ts";
import { opencodeEnvironment } from "./environment.ts";
import { opencodeFiles } from "./files.ts";
import { OpenCodeRun } from "./run.ts";

const task: HarnessTask = {
  runId: "run-1",
  hubId: "acme",
  agentId: "writer",
  instructions: "Answer in one short sentence.",
  prompt: "What does hello.txt say?",
  model: "acme-model",
  asks: "in-sandbox",
};

const bridge: HarnessBridge = {
  url: "http://127.0.0.1:4100",
  token: `made-up-token-${crypto.randomUUID()}`,
};

let root: string;
let profile: SandboxProfile;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "opencode-run-"));
  profile = {
    workingFolder: join(root, "work"),
    tempFolder: join(root, "temp"),
    settingsFolder: join(root, "settings"),
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 60_000,
  };
  // The engine adds the harness's environment to the profile before it opens the session.
  profile.env = opencodeEnvironment(bridge, task, opencodeFiles(profile));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** The text of a recorded file in `fixtures/`. */
function fixture(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

/** A program that prints the recorded run, after reading the prompt, then exits with `code`. */
function recorded(name: string, code = 0, errorText = ""): FakeProgram {
  return async (io) => {
    while ((await io.readLine()) !== null) {
      // OpenCode reads its prompt to the end of its input before it starts.
    }
    io.write(await fixture(name));
    io.writeError(errorText);
    return code;
  };
}

function newRun(session: SandboxSession, platform = "linux"): HarnessRun {
  return new OpenCodeRun(task, session, bridge, { settings: diskSettingsFolder, platform });
}

async function readAll(run: HarnessRun): Promise<{ events: HarnessEvent[]; error?: Error }> {
  const events: HarnessEvent[] = [];
  try {
    for await (const event of run) events.push(event);
  } catch (error) {
    return { events, error: error as Error };
  }
  return { events };
}

/** Every file under `folder`, by path. */
async function filesUnder(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

verifies("harness-opencode.run", () => {
  describe("OpenCodeRun", () => {
    it("starts `opencode run` with the prompt on standard input and ends with agent.finished", async () => {
      const promptLines: string[] = [];
      const session = new FakeSandboxSession({
        profile,
        program: async (io) => {
          for (let line = await io.readLine(); line !== null; line = await io.readLine()) {
            promptLines.push(line);
          }
          return recorded("opencode-2.3.0-ok.jsonl")(io);
        },
      });

      const { events, error } = await readAll(newRun(session));

      expect(error).toBeUndefined();
      expect(session.started).toEqual([opencodeCommand(task)]);
      // The house rules come first (harness-opencode.house-rules); the task's prompt ends it.
      expect(promptLines.at(-1)).toBe(task.prompt);
      expect(events.filter((event) => event.type === "tool.called")).toHaveLength(2);
      expect(events.at(-1)).toEqual({
        type: "agent.finished",
        agent: "writer",
        output: "The file says hello from acme.",
      });
    });

    it("leaves only Halonic's files in the settings folder and writes the instructions file", async () => {
      const files = opencodeFiles(profile);
      await diskSettingsFolder.write(
        join(files.dataFolder, "log", "old.log"),
        "from the last run\n",
      );
      const session = new FakeSandboxSession({
        profile,
        program: recorded("opencode-2.3.0-ok.jsonl"),
      });

      await readAll(newRun(session));

      expect((await filesUnder(join(root, "settings"))).sort()).toEqual(
        [files.updatePolicyFile, files.modelCatalog].sort(),
      );
      expect(await readFile(files.instructionsFile, "utf8")).toContain(task.instructions);
    });

    it("writes the run token into no file of the settings folder after a run against a scripted bridge", async () => {
      const files = opencodeFiles(profile);
      // Like OpenCode, the scripted program logs the config it got into its data folder.
      const session = new FakeSandboxSession({
        profile,
        program: async (io) => {
          const log = join(files.dataFolder, "log", "opencode.log");
          await diskSettingsFolder.write(log, `${io.profile.env["OPENCODE_CONFIG_CONTENT"]}\n`);
          return recorded("opencode-2.3.0-ok.jsonl")(io);
        },
      });

      await readAll(newRun(session));

      const written = await filesUnder(join(root, "settings"));
      expect(written.length).toBeGreaterThan(2);
      for (const file of [...written, files.instructionsFile]) {
        expect(await readFile(file, "utf8"), file).not.toContain(bridge.token);
      }
    });

    it("refuses before anything starts or is written", async () => {
      const session = new FakeSandboxSession({ profile, program: idleProgram });

      const { error } = await readAll(newRun(session, "darwin"));

      expect(error?.message).toBe(
        "OpenCode runs only on Linux for now. Pick another harness for this agent on this computer.",
      );
      expect(session.started).toEqual([]);
      expect(await filesUnder(root).catch(() => [])).toEqual([]);
    });

    it("ends with the exit code and the last line of standard error, without the token", async () => {
      const session = new FakeSandboxSession({
        profile,
        program: async (io) => {
          io.writeError(`starting\nbridge refused the token ${bridge.token}\n`);
          return 1;
        },
      });

      const { error } = await readAll(newRun(session));

      expect(error?.message).toMatch(
        /^OpenCode stopped with exit code 1 before it finished: bridge refused the token /,
      );
      expect(error?.message).not.toContain(bridge.token);
    });

    it("ends with OpenCode's error line", async () => {
      const session = new FakeSandboxSession({
        profile,
        program: recorded("opencode-2.3.0-fail.jsonl", 1),
      });

      const { error } = await readAll(newRun(session));

      expect(error?.message).toBe(
        "OpenCode stopped with an error: The bridge refused the model acme-other.",
      );
      expect(session.running).toBe(0);
    });

    it("stops OpenCode on cancel and ends with 'cancelled'", async () => {
      const session = new FakeSandboxSession({ profile, program: idleProgram });
      const run = newRun(session);
      const reading = readAll(run);
      await session.whenStarted();

      await run.cancel();

      expect((await reading).error?.message).toBe("The OpenCode run was cancelled.");
      expect(session.running).toBe(0);
    });

    it("ends with the stop's error when OpenCode can't be stopped", async () => {
      const fake = new FakeSandboxSession({ profile, program: idleProgram });
      const session: SandboxSession = {
        profile,
        fence: { state: "fenced" },
        onBlocked: (listener) => fake.onBlocked(listener),
        close: () => fake.close(),
        start: async (command) => ({
          ...(await fake.start(command)),
          kill: async () => {
            throw new Error(`The sandbox couldn't stop it (${bridge.token}).`);
          },
        }),
      };
      const run = newRun(session);
      await fake.whenStarted();

      const cancel = run.cancel();

      await expect(cancel).rejects.toThrow("The sandbox couldn't stop it (");
      await expect(cancel).rejects.not.toThrow(bridge.token);
      await fake.close();
      expect((await readAll(run)).error?.message).toMatch(/^The sandbox couldn't stop it/);
    });

    it("takes no answer once started", async () => {
      const session = new FakeSandboxSession({ profile, program: idleProgram });
      const run = newRun(session);

      await expect(run.send({ type: "answer", text: "Go on." })).rejects.toThrow(
        "OpenCode takes no answer once it has started",
      );
      await run.cancel();
    });
  });
});
