import { dirname, join } from "node:path";
import {
  addHarnessEnvironment,
  type HarnessBridge,
  type HarnessEvent,
  type HarnessRun,
  type HarnessTask,
  type SandboxProfile,
} from "@halonicjs/ports";
import { type FakeProgram, FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import {
  assistantLine,
  claudeAnswering,
  claudeFailing,
  claudeFinishing,
  MemorySettingsFolder,
  successLine,
  userMessageText,
} from "./fake-claude.test-helper.ts";
import { claudeCodeHarness } from "./harness.ts";
import { claudeCodeSettingsFiles } from "./settings.ts";
import { SignInError } from "./sign-in.ts";

/** A probe the run cases never ask: they don't call `detect`. */
const unusedProbe = {
  ask: async () => {
    throw new Error("The run cases don't detect Claude Code");
  },
};

function newHarness(settings = new MemorySettingsFolder(), ownSandbox = async () => true) {
  return claudeCodeHarness({ probe: unusedProbe, settings, ownSandbox });
}

const task: HarnessTask = {
  runId: "run-1",
  hubId: "acme",
  agentId: "writer",
  instructions: "Answer in one short sentence.",
  prompt: "Name a colour of the sea.",
  model: "claude-sonnet-5-5",
};

const bridge: HarnessBridge = {
  url: "http://127.0.0.1:4100",
  token: `made-up-token-${crypto.randomUUID()}`,
};

const engineProfile: SandboxProfile = {
  workingFolder: "/agents/writer/work",
  tempFolder: "/sessions/one/temp",
  settingsFolder: "/agents/writer/settings",
  readOnlyPaths: [],
  deniedPaths: [],
  env: { PATH: "/usr/bin", HOME: "/agents/writer/home" },
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

/** A session opened the way the engine opens one, running `program` as `claude`. */
function openSession(program: FakeProgram): FakeSandboxSession {
  const env = addHarnessEnvironment(
    engineProfile.env,
    newHarness().environment?.(bridge, engineProfile) ?? {},
  );
  return new FakeSandboxSession({ profile: { ...engineProfile, env }, program });
}

/**
 * The texts of the files written to the agent's settings folder, leaving out
 * the run's own files. The harness names each file with `join`, which puts
 * `\` between the parts on Windows, so the folder is compared in that form.
 */
function settingsFolderTexts(files: MemorySettingsFolder): string[] {
  const folder = join(engineProfile.settingsFolder ?? "");
  return [...files.files].filter(([path]) => dirname(path) === folder).map(([, text]) => text);
}

async function readAll(run: HarnessRun): Promise<{ events: HarnessEvent[]; error?: unknown }> {
  const events: HarnessEvent[] = [];
  try {
    for await (const event of run) events.push(event);
  } catch (error) {
    return { events, error };
  }
  return { events };
}

verifies("harness-claude-code.command", () => {
  describe("claudeCodeHarness: instructions", () => {
    it("writes the instructions to the session's temp folder and names that file", async () => {
      const settings = new MemorySettingsFolder();
      const session = openSession(claudeFinishing);
      await readAll(newHarness(settings).start(task, session, bridge));

      const instructionsFile = join(engineProfile.tempFolder, "halonic-instructions.md");
      expect(settings.files.get(instructionsFile)).toBe(task.instructions);
      const args = session.started[0]?.args ?? [];
      expect(args[args.indexOf("--append-system-prompt-file") + 1]).toBe(instructionsFile);
    });

    // Windows caps a whole command line at 32,767 characters.
    it("keeps long instructions off the command line", async () => {
      const instructions = "Answer in one short sentence. ".repeat(1_400);
      const settings = new MemorySettingsFolder();
      const session = openSession(claudeFinishing);
      await readAll(newHarness(settings).start({ ...task, instructions }, session, bridge));

      const command = session.started[0];
      const commandLine = [command?.program, ...(command?.args ?? [])].join(" ");
      expect(instructions.length).toBeGreaterThan(40_000);
      expect(commandLine.length).toBeLessThan(32_767);
      expect(settings.files.get(join(engineProfile.tempFolder, "halonic-instructions.md"))).toBe(
        instructions,
      );
    });

    it("writes no instructions file when the agent's file sets none", async () => {
      const settings = new MemorySettingsFolder();
      const session = openSession(claudeFinishing);
      await readAll(newHarness(settings).start({ ...task, instructions: "" }, session, bridge));

      expect(
        [...settings.files.keys()].some((path) => path.startsWith(engineProfile.tempFolder)),
      ).toBe(false);
      expect(session.started[0]?.args).not.toContain("--append-system-prompt-file");
    });
  });
});

verifies("harness-claude-code.start", () => {
  describe("claudeCodeHarness: start", () => {
    it("sends the prompt as the first user message, never in the arguments", async () => {
      let received: string | undefined;
      const session = openSession(async (io) => {
        received = userMessageText(await io.readLine());
        io.write(`${successLine("Teal.")}\n`);
        return 0;
      });
      await readAll(newHarness().start(task, session, bridge));

      expect(received).toBe("Name a colour of the sea.");
      expect(session.started[0]?.args.join(" ")).not.toContain(task.prompt);
    });

    it("writes the settings folder before claude starts", async () => {
      const settings = new MemorySettingsFolder();
      let filesWhenStarted: string[] = [];
      const session = openSession(async (io) => {
        filesWhenStarted = [...settings.files.keys()];
        return claudeFinishing(io);
      });
      await readAll(newHarness(settings).start(task, session, bridge));

      expect(filesWhenStarted).toEqual(
        expect.arrayContaining(
          Object.keys(claudeCodeSettingsFiles()).map((name) =>
            join(engineProfile.settingsFolder ?? "", name),
          ),
        ),
      );
      const settingsJson = [...settings.files].find(([path]) => path.endsWith("settings.json"));
      expect(JSON.parse(settingsJson?.[1] ?? "{}")).toMatchObject({
        permissions: { deny: ["WebFetch", "WebSearch"] },
      });
    });

    // The engine runs an agent "on this computer" through another Sandbox,
    // the launcher's unfenced one, with a profile of its own. The harness
    // can't tell the two apart, so the settings, and the web tools they
    // deny, are the same (decision 7, HAL-2076).
    it("writes the same settings in sandbox and this-computer mode", async () => {
      const sandboxMode = new MemorySettingsFolder();
      await readAll(newHarness(sandboxMode).start(task, openSession(claudeFinishing), bridge));
      const thisComputerMode = new MemorySettingsFolder();
      const thisComputer = new FakeSandboxSession({
        profile: { ...engineProfile, workingFolder: "/projects/notes" },
        program: claudeFinishing,
      });
      await readAll(newHarness(thisComputerMode).start(task, thisComputer, bridge));

      expect(settingsFolderTexts(thisComputerMode)).toEqual(settingsFolderTexts(sandboxMode));
      expect(settingsFolderTexts(sandboxMode)).toEqual(Object.values(claudeCodeSettingsFiles()));
    });

    it("turns Claude Code's own sandbox on outside the fence, where it works", async () => {
      const thisComputer = new FakeSandboxSession({
        profile: engineProfile,
        program: claudeFinishing,
        fence: { state: "off" },
      });
      const { events } = await readAll(newHarness().start(task, thisComputer, bridge));

      expect(events.at(-1)).toMatchObject({ type: "agent.finished", output: "Teal." });
      expect(thisComputer.started[0]?.args).toContain("--settings");
    });

    it("still starts outside the fence where Claude Code's own sandbox doesn't work, without it", async () => {
      const thisComputer = new FakeSandboxSession({
        profile: engineProfile,
        program: claudeFinishing,
        fence: { state: "off" },
      });
      const harness = newHarness(new MemorySettingsFolder(), async () => false);
      const { events } = await readAll(harness.start(task, thisComputer, bridge));

      expect(events.at(-1)).toMatchObject({ type: "agent.finished", output: "Teal." });
      expect(thisComputer.started[0]?.args).not.toContain("--settings");
    });

    it("leaves Claude Code's own sandbox off inside the fence, without asking", async () => {
      let asked = 0;
      const harness = newHarness(new MemorySettingsFolder(), async () => {
        asked += 1;
        return true;
      });
      const session = openSession(claudeFinishing);
      await readAll(harness.start(task, session, bridge));

      expect(session.started[0]?.args).not.toContain("--settings");
      expect(asked).toBe(0);
    });

    it("ends Claude Code's input after its result, and ends the stream once it has exited", async () => {
      const session = openSession(claudeFinishing);
      const { events } = await readAll(newHarness().start(task, session, bridge));

      expect(events.at(-1)).toMatchObject({ type: "agent.finished", output: "Teal." });
      expect(session.running).toBe(0);
    });

    it("stops Claude Code that doesn't exit after its result, and ends with an error", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const neverExits: FakeProgram = async (io) => {
        await io.readLine();
        io.write(`${successLine("Teal.")}\n`);
        // Ignores the end of its input, as a hung program would.
        return new Promise<number>(() => {});
      };
      const session = openSession(neverExits);
      let settled = false;
      const read = readAll(newHarness().start(task, session, bridge)).finally(() => {
        settled = true;
      });

      // The wait starts once the result is read, so the clock moves on in steps until it ends.
      for (let step = 0; step < 30 && !settled; step++) await vi.advanceTimersByTimeAsync(1_000);
      const { error } = await read;
      vi.useRealTimers();
      expect((error as Error).message).toBe(
        "Claude Code didn't exit within 10 seconds, so Halonic stopped it.",
      );
      expect(session.running).toBe(0);
    });

    it("passes a person's answer on as the next user message", async () => {
      const received: (string | undefined)[] = [];
      const session = openSession(async (io) => {
        received.push(userMessageText(await io.readLine()));
        io.write(`${assistantLine("Which sea?")}\n`);
        received.push(userMessageText(await io.readLine()));
        io.write(`${successLine("Teal.")}\n`);
        return 0;
      });
      const run = newHarness().start(task, session, bridge);
      const reading = readAll(run);
      await session.whenStarted();
      await run.send({ type: "answer", text: "The North Sea." });

      expect((await reading).events.at(-1)).toMatchObject({ output: "Teal." });
      expect(received).toEqual(["Name a colour of the sea.", "The North Sea."]);
    });

    it("refuses an approval decision: Claude Code asks for approvals through the bridge", async () => {
      const session = openSession(idleProgram);
      const run = newHarness().start(task, session, bridge);
      const reading = readAll(run);
      await session.whenStarted();

      await expect(
        run.send({ type: "approval", callId: "call-1", approved: true }),
      ).rejects.toThrow('No approval with call id "call-1" is waiting');
      await run.cancel();
      await reading;
    });

    it("ends with a SignInError when Claude Code says on standard error that no one is signed in", async () => {
      const session = openSession(claudeFailing("Not logged in · Please run /login"));
      const { error } = await readAll(newHarness().start(task, session, bridge));

      expect(error).toBeInstanceOf(SignInError);
      expect(error).toMatchObject({ problem: "signed-out" });
    });

    it("says how Claude Code ended, with the last line it printed and without the token", async () => {
      const session = openSession(claudeFailing(`warming up\nrefused ${bridge.token}`));
      const { error } = await readAll(newHarness().start(task, session, bridge));

      expect(String(error)).toContain("Claude Code stopped with exit code 1 before it finished");
      expect(String(error)).toContain("refused");
      expect(String(error)).not.toContain(bridge.token);
    });

    it("ends with an error when the profile has no settings folder, and starts nothing", async () => {
      const session = new FakeSandboxSession({
        profile: { ...engineProfile, settingsFolder: null },
        program: claudeFinishing,
      });
      const { error } = await readAll(newHarness().start(task, session, bridge));

      expect(String(error)).toContain("Claude Code needs a settings folder");
      expect(session.started).toEqual([]);
    });

    it("stops claude when the reader stops reading early", async () => {
      const call = { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } };
      const line = { type: "assistant", message: { role: "assistant", content: [call] } };
      const session = openSession(claudeAnswering([JSON.stringify(line)]));
      for await (const _event of newHarness().start(task, session, bridge)) break;

      expect(session.running).toBe(0);
    });
  });
});
