import { join } from "node:path";
import {
  addHarnessEnvironment,
  type HarnessBridge,
  type HarnessEvent,
  type HarnessRun,
  type HarnessTask,
  type SandboxProfile,
  type SandboxSession,
} from "@halonicjs/ports";
import { type FakeProgram, FakeSandboxSession } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { codexConfigText } from "./config.ts";
import {
  answer,
  CodexLog,
  codexFailing,
  codexFinishing,
  fakeCodex,
  fakeThreadId,
  fakeTurnId,
  MemorySettingsFolder,
} from "./fake-codex.test-helper.ts";
import { codexHarness } from "./harness.ts";

/** A probe the run cases never ask: they don't call `detect`. */
const unusedProbe = {
  ask: async () => {
    throw new Error("The run cases don't detect Codex");
  },
};

function newHarness(settings = new MemorySettingsFolder()) {
  return codexHarness({ probe: unusedProbe, settings, ownSandbox: async () => true });
}

const task: HarnessTask = {
  runId: "run-1",
  hubId: "acme",
  agentId: "writer",
  instructions: "Answer in one short sentence.",
  prompt: "Name a colour of the sea.",
  model: "gpt-5.5",
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
  network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

const configPath = join("/agents/writer/settings", "config.toml");

/** A session opened the way the engine opens one, running `program` as `codex`. */
function openSession(program: FakeProgram, profile = engineProfile): FakeSandboxSession {
  const env = addHarnessEnvironment(profile.env, newHarness().environment?.(bridge, profile) ?? {});
  return new FakeSandboxSession({ profile: { ...profile, env }, program });
}

/**
 * `session`, except that each `kill` of a program it started goes through
 * `kill`, which gets the real one to call.
 */
function withKill(
  session: SandboxSession,
  kill: (realKill: () => Promise<void>) => Promise<void>,
): SandboxSession {
  return {
    profile: session.profile,
    get fence() {
      return session.fence;
    },
    onBlocked: (listener) => session.onBlocked(listener),
    close: () => session.close(),
    start: async (command) => {
      const process = await session.start(command);
      return {
        stdin: process.stdin,
        stdout: process.stdout,
        stderr: process.stderr,
        exited: process.exited,
        kill: () => kill(() => process.kill()),
      };
    },
  };
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

/** A command item and its approval request, as Codex sends them when a rule asks for an OK. */
async function askForCommand(codex: Parameters<Parameters<typeof fakeCodex>[0]>[0]) {
  const command = { type: "commandExecution", id: "call-1", command: "touch a", cwd: "/w" };
  codex.notify("item/started", { turnId: fakeTurnId, item: { ...command, status: "inProgress" } });
  return codex.request("item/commandExecution/requestApproval", {
    turnId: fakeTurnId,
    itemId: "call-1",
    command: "touch a",
    cwd: "/w",
  });
}

verifies("harness-codex.start", () => {
  describe("codexHarness: start", () => {
    it("writes config.toml before codex starts, and gives the bridge's address on the command line", async () => {
      const settings = new MemorySettingsFolder();
      let configWhenStarted: string | undefined;
      const session = openSession(async (io) => {
        configWhenStarted = settings.files.get(configPath);
        return codexFinishing(io);
      });
      await readAll(newHarness(settings).start(task, session, bridge));

      expect(configWhenStarted).toBe(codexConfigText());
      expect(session.started[0]).toEqual({
        program: "codex",
        args: [
          "app-server",
          "-c",
          'model_providers.halonic.base_url="http://127.0.0.1:4100/v1"',
          "-c",
          'mcp_servers.halonic.url="http://127.0.0.1:4100/mcp"',
        ],
      });
    });

    it("starts a thread in the working folder with the agent's model and instructions, and sends the prompt", async () => {
      const log = new CodexLog();
      const session = openSession(fakeCodex((codex) => answer(codex, "Teal."), log));
      await readAll(newHarness().start(task, session, bridge));

      expect(log.paramsOf("thread/start")).toEqual({
        cwd: "/agents/writer/work",
        ephemeral: true,
        model: "gpt-5.5",
        developerInstructions: "Answer in one short sentence.",
      });
      expect(log.paramsOf("turn/start")).toEqual({
        threadId: "thread-fake",
        input: [{ type: "text", text: "Name a colour of the sea.", text_elements: [] }],
      });
      expect(session.started[0]?.args.join(" ")).not.toContain(task.prompt);
    });

    it("leaves the model and instructions to Codex when the agent's file sets none", async () => {
      const log = new CodexLog();
      const session = openSession(fakeCodex((codex) => answer(codex, "Teal."), log));
      const { model: _model, ...withoutModel } = task;
      const bare = { ...withoutModel, instructions: " " };
      await readAll(newHarness().start(bare, session, bridge));

      expect(log.paramsOf("thread/start")).toEqual({ cwd: "/agents/writer/work", ephemeral: true });
    });

    it("ends with the agent's answer once Codex has stopped", async () => {
      const session = openSession(codexFinishing);
      const { events, error } = await readAll(newHarness().start(task, session, bridge));

      expect(error).toBeUndefined();
      expect(events).toEqual([{ type: "agent.finished", agent: "writer", output: "Teal." }]);
      expect(session.running).toBe(0);
    });

    it("ends with the session's error, without the token, when it can't stop Codex", async () => {
      const session = openSession(codexFinishing);
      const failingKill = withKill(session, async (realKill) => {
        await realKill();
        throw new Error(`could not stop the program started with ${bridge.token}`);
      });
      const { events, error } = await readAll(newHarness().start(task, failingKill, bridge));

      expect(String(error)).toContain("could not stop the program");
      expect(String(error)).not.toContain(bridge.token);
      expect(events.map(({ type }) => type)).not.toContain("agent.finished");
    });

    it("stops Codex once when it says more after the turn has completed", async () => {
      let kills = 0;
      const session = withKill(
        openSession(
          fakeCodex(async (codex) => {
            await answer(codex, "Teal.");
            codex.notify("turn/completed", {
              turn: { id: fakeTurnId, status: "completed", error: null },
            });
          }),
        ),
        async (realKill) => {
          kills += 1;
          await realKill();
        },
      );
      const { events, error } = await readAll(newHarness().start(task, session, bridge));

      expect(error).toBeUndefined();
      expect(events).toEqual([{ type: "agent.finished", agent: "writer", output: "Teal." }]);
      // One for the turn's end, one when the stream closes; none for the second notification.
      expect(kills).toBe(2);
    });

    it("passes a person's answer into the running turn", async () => {
      const log = new CodexLog();
      const session = openSession(
        fakeCodex(async (codex) => {
          await codex.received("turn/steer");
          await answer(codex, "Teal.");
        }, log),
      );
      const run = newHarness().start(task, session, bridge);
      const reading = readAll(run);
      await session.whenStarted();
      await run.send({ type: "answer", text: "The North Sea." });

      expect((await reading).events.at(-1)).toMatchObject({ output: "Teal." });
      expect(log.paramsOf("turn/steer")).toEqual({
        threadId: "thread-fake",
        expectedTurnId: fakeTurnId,
        input: [{ type: "text", text: "The North Sea.", text_elements: [] }],
      });
    });

    it("reports Codex's approval request, and answers it with the person's decision", async () => {
      let decision: unknown;
      const session = openSession(
        fakeCodex(async (codex) => {
          decision = await askForCommand(codex);
          await answer(codex, "Done.");
        }),
      );
      const run = newHarness().start(task, session, bridge);
      const events: HarnessEvent[] = [];
      for await (const event of run) {
        events.push(event);
        if (event.type === "approval.requested") {
          await run.send({ type: "approval", callId: event.callId, approved: true });
        }
      }

      expect(events[1]).toEqual({
        type: "approval.requested",
        agent: "writer",
        tool: "shell",
        args: { command: "touch a", cwd: "/w" },
        callId: "call-1",
      });
      expect(decision).toMatchObject({ result: { decision: "accept" } });
    });

    it("refuses a decision on a request Codex says is resolved", async () => {
      const session = openSession(
        fakeCodex(async (codex) => {
          void askForCommand(codex);
          codex.notify("serverRequest/resolved", { requestId: 100 });
          await codex.received("turn/steer");
          await answer(codex, "Done.");
        }),
      );
      const run = newHarness().start(task, session, bridge);
      let refused: unknown;
      for await (const event of run) {
        if (event.type !== "approval.requested") continue;
        // The answer reaches Codex after the notification, so it has been read by then.
        await run.send({ type: "answer", text: "Go on." });
        refused = await run
          .send({ type: "approval", callId: event.callId, approved: true })
          .catch((error: unknown) => error);
      }

      expect(String(refused)).toContain('No approval with call id "call-1" is waiting.');
    });

    it("declines at once a request about a thread that isn't the run's", async () => {
      let decision: unknown;
      const session = openSession(
        fakeCodex(async (codex) => {
          decision = await codex.request("item/commandExecution/requestApproval", {
            threadId: "thread-other",
            turnId: "turn-other",
            itemId: "call-1",
          });
          await answer(codex, "Done.");
        }),
      );
      const { events } = await readAll(newHarness().start(task, session, bridge));

      expect(decision).toMatchObject({ result: { decision: "decline" } });
      expect(events.map(({ type }) => type)).toEqual(["agent.finished"]);
    });

    it("declines at once a request that comes after the turn has completed", async () => {
      let decision: unknown;
      const session = openSession(
        fakeCodex(async (codex) => {
          await answer(codex, "Done.");
          decision = await askForCommand(codex);
        }),
      );
      const { events } = await readAll(newHarness().start(task, session, bridge));

      expect(decision).toMatchObject({ result: { decision: "decline" } });
      expect(events.map(({ type }) => type)).not.toContain("approval.requested");
    });

    it("refuses a decision no approval waits for", async () => {
      const session = openSession(fakeCodex(() => new Promise(() => undefined)));
      const run = newHarness().start(task, session, bridge);
      const reading = readAll(run);
      await session.whenStarted();

      await expect(
        run.send({ type: "approval", callId: "call-9", approved: false }),
      ).rejects.toThrow('No approval with call id "call-9" is waiting.');
      await run.cancel();
      await reading;
    });

    it("answers a request Halonic doesn't handle with an error, so Codex doesn't wait", async () => {
      let reply: unknown;
      const session = openSession(
        fakeCodex(async (codex) => {
          reply = await codex.request("item/tool/requestUserInput", {
            itemId: "q-1",
            questions: [],
          });
          await answer(codex, "Teal.");
        }),
      );
      await readAll(newHarness().start(task, session, bridge));

      expect(reply).toMatchObject({
        error: { code: -32_601, message: "Halonic doesn't answer `item/tool/requestUserInput`." },
      });
    });

    it("says how Codex ended, with the last line it printed and without the token", async () => {
      const session = openSession(codexFailing(`warming up\nrefused ${bridge.token}`));
      const { error } = await readAll(newHarness().start(task, session, bridge));

      expect(String(error)).toContain("Codex stopped with exit code 1 before it finished: refused");
      expect(String(error)).not.toContain(bridge.token);
    });

    it("says how Codex ended when it printed nothing", async () => {
      const session = openSession(async () => 1);
      const { error } = await readAll(newHarness().start(task, session, bridge));

      expect(String(error)).toMatch(/Codex stopped with exit code 1 before it finished$/);
    });

    it("ends with an error when Codex prints a line that isn't JSON-RPC", async () => {
      const session = openSession(async (io) => {
        io.write(`not json ${bridge.token}\n`);
        return idleUntilInputEnds(io);
      });
      const { error } = await readAll(newHarness().start(task, session, bridge));

      expect(String(error)).toContain("Codex printed a line that isn't JSON-RPC");
      expect(String(error)).not.toContain(bridge.token);
      expect(session.running).toBe(0);
    });

    it("ends with an error when Codex starts a thread without an id", async () => {
      const session = openSession(async (io) => {
        for (let line = await io.readLine(); line !== null; line = await io.readLine()) {
          const { id } = JSON.parse(line) as { id?: number };
          if (id !== undefined) io.write(`${JSON.stringify({ id, result: {} })}\n`);
        }
        return 0;
      });
      const { error } = await readAll(newHarness().start(task, session, bridge));

      expect(String(error)).toContain("Codex started a thread but didn't say its id.");
      expect(session.running).toBe(0);
    });

    it("lets its events be read only once", async () => {
      const session = openSession(codexFinishing);
      const run = newHarness().start(task, session, bridge);
      await readAll(run);

      expect(() => run[Symbol.asyncIterator]()).toThrow("can be read only once");
    });

    it("ends with the turn's error when the turn fails", async () => {
      const session = openSession(
        fakeCodex(async (codex) => {
          const error = { message: "Quota exceeded", codexErrorInfo: null };
          codex.notify("turn/completed", { turn: { id: fakeTurnId, status: "failed", error } });
        }),
      );
      const { error } = await readAll(newHarness().start(task, session, bridge));

      expect(String(error)).toContain("Codex stopped with an error: Quota exceeded");
      expect(session.running).toBe(0);
    });

    it("finishes the subagents still working before it ends with the turn's error", async () => {
      const session = openSession(
        fakeCodex(async (codex) => {
          const spawn = {
            type: "collabAgentToolCall",
            id: "spawn-1",
            tool: "spawnAgent",
            status: "completed",
            senderThreadId: fakeThreadId,
            receiverThreadIds: ["thread-helper"],
            prompt: "Read the notes.",
          };
          codex.notify("item/completed", { turnId: fakeTurnId, item: spawn });
          const error = { message: "Quota exceeded", codexErrorInfo: null };
          codex.notify("turn/completed", { turn: { id: fakeTurnId, status: "failed", error } });
        }),
      );
      const { events, error } = await readAll(newHarness().start(task, session, bridge));

      expect(events).toEqual([
        { type: "agent.started", agent: "subagent", prompt: "Read the notes.", parent: "writer" },
        {
          type: "agent.finished",
          agent: "subagent",
          output: "The task agent finished before this subagent did.",
          parent: "writer",
        },
      ]);
      expect(String(error)).toContain("Codex stopped with an error: Quota exceeded");
      expect(session.running).toBe(0);
    });

    it("ends with an error when the profile has no settings folder, and starts nothing", async () => {
      const session = new FakeSandboxSession({
        profile: { ...engineProfile, settingsFolder: null },
        program: codexFinishing,
      });
      const { error } = await readAll(newHarness().start(task, session, bridge));

      expect(String(error)).toContain("Codex needs a settings folder");
      expect(session.started).toEqual([]);
    });

    it("stops codex when the reader stops reading early", async () => {
      const session = openSession(
        fakeCodex(async (codex) => {
          await askForCommand(codex);
        }),
      );
      for await (const _event of newHarness().start(task, session, bridge)) break;

      expect(session.running).toBe(0);
    });
  });
});

verifies("harness-codex.config", () => {
  // The engine runs an agent "on this computer" through another Sandbox,
  // the launcher's unfenced one, with a profile of its own. The harness
  // can't tell the two apart, so `config.toml`, and the web search it turns
  // off, are the same (decision 7, HAL-2076).
  it("writes the same config.toml, with web search off, in sandbox and this-computer mode", async () => {
    const sandboxMode = new MemorySettingsFolder();
    await readAll(newHarness(sandboxMode).start(task, openSession(codexFinishing), bridge));
    const thisComputerMode = new MemorySettingsFolder();
    const thisComputer = openSession(codexFinishing, {
      ...engineProfile,
      workingFolder: "/projects/notes",
    });
    await readAll(newHarness(thisComputerMode).start(task, thisComputer, bridge));

    expect(thisComputerMode.files.get(configPath)).toBe(sandboxMode.files.get(configPath));
    expect(sandboxMode.files.get(configPath)).toContain('\nweb_search = "disabled"\n');
  });
});

/** Reads standard input until it ends, as Codex does. */
async function idleUntilInputEnds(io: { readLine(): Promise<string | null> }): Promise<number> {
  while ((await io.readLine()) !== null) {
    // Codex reads requests until its input ends.
  }
  return 0;
}
