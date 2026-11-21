import type { HarnessAgent } from "@halonicjs/engine";
import type { BridgeApprovals, BridgeEvent, SandboxFence, SandboxSession } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { LocalBridgeHost } from "./bridge-host.ts";
import { harnessAgentOf, noTools, RecordingBridgeServer } from "./fakes.test-helper.ts";
import type { SandboxedAsksPaths } from "./sandboxed-asks.ts";

const worktree = "/data/proposals/01JD8Q";
const paths: SandboxedAsksPaths = {
  resolve: async (path) => ({ real: path, linked: false }),
  windows: false,
};

/** The run's own approvals, which no person answers in a headless run. */
const nobodyAnswers: BridgeApprovals = {
  request: async () => ({ approved: false, comment: "Nobody can answer." }),
};

/** A session as the engine hands it over: only its fence and its working folder are read. */
function sessionWith(
  fence: SandboxFence,
  workingFolder = `${worktree}/files/agents/writer`,
): SandboxSession {
  return { fence, profile: { workingFolder } } as SandboxSession;
}

/** The writer, whose kept file says `asks` as given. */
function writerWith(fields: Partial<HarnessAgent["file"]>, harness = "claude-code" as const) {
  const agent = harnessAgentOf("writer", worktree);
  return { ...agent, harness, file: { ...agent.file, ...fields } } as HarnessAgent;
}

/** How a test's run log answers: `refuses` names the event types it fails to take. */
interface RunLog {
  readonly refuses?: readonly BridgeEvent["type"][];
}

/** Opens the writer's bridge, tells it `session` when given, and asks one call through it. */
async function askThrough(
  agent: HarnessAgent,
  session: SandboxSession | undefined,
  tool: string,
  args: unknown,
  given: SandboxedAsksPaths | null = paths,
  runLog: RunLog = {},
) {
  const server = new RecordingBridgeServer();
  const recorded: BridgeEvent[] = [];
  const reported: unknown[] = [];
  const record = async (event: BridgeEvent) => {
    if (runLog.refuses?.includes(event.type)) throw new Error("The run log is full.");
    recorded.push(event);
  };
  const host = new LocalBridgeHost({
    servers: { sandbox: server, "this-computer": server },
    services: {
      servicesFor: async () => ({
        providers: {},
        prices: {},
        tools: noTools,
        approvals: nobodyAnswers,
      }),
    },
    reportError: (error) => void reported.push(error),
    ...(given === null ? {} : { paths: given }),
  });
  const bridge = await host.open(agent, { record }, "sandbox");
  if (session !== undefined) bridge.sessionOpened?.(session);
  const approvals = server.opened[0]?.approvals;
  const answer = await approvals?.request(
    { callId: "c1", tool, args },
    { signal: new AbortController().signal },
  );
  return { answer, recorded, reported };
}

const inSandbox = writerWith({ asks: "in-sandbox" });
const fenced = sessionWith({ state: "fenced" });
const edit = { file_path: `${worktree}/files/agents/writer/reply.md` };

verifies("harness-host.sandboxed-asks", () => {
  it("lets an in-sandbox agent's edit in its working folder through, fenced, and logs it first", async () => {
    const { answer, recorded } = await askThrough(inSandbox, fenced, "Edit", edit);

    expect(answer).toEqual({ approved: true });
    expect(recorded).toEqual([
      {
        type: "harness.allowed",
        agent: "writer",
        tool: "Edit",
        detail: edit.file_path,
        rule: "asks-in-sandbox",
      },
    ]);
  });

  it("lets its command through too, as the run log says", async () => {
    const { answer, recorded } = await askThrough(inSandbox, fenced, "Bash", {
      command: "npm test",
    });

    expect(answer).toEqual({ approved: true });
    expect(recorded).toMatchObject([{ tool: "Bash", detail: "npm test" }]);
  });

  describe("asks the run's approvals as before", () => {
    const refused = { approved: false, comment: "Nobody can answer." };

    it.each([
      ["without asks", writerWith({})],
      ["with asks: always", writerWith({ asks: "always" })],
      ["in Codex, which never takes asks", writerWith({ asks: "in-sandbox" }, "codex" as never)],
    ])("for an agent %s, even fenced", async (_what, agent) => {
      const { answer, recorded } = await askThrough(agent, fenced, "Edit", edit);

      expect(answer).toEqual(refused);
      expect(recorded).toEqual([]);
    });

    it.each([
      ["before the engine hands over the session", undefined],
      ["on the launcher's session, with no fence", sessionWith({ state: "off" })],
      [
        "when the fence failed its proof",
        sessionWith({ state: "not-fenced", reason: "a probe got in" }),
      ],
      ["after the session closed", sessionWith({ state: "stopped" })],
    ])("%s", async (_what, session) => {
      const { answer, recorded } = await askThrough(inSandbox, session, "Edit", edit);

      expect(answer).toEqual(refused);
      expect(recorded).toEqual([]);
    });

    it("when the host gives no way to resolve paths", async () => {
      const { answer } = await askThrough(inSandbox, fenced, "Bash", { command: "ls" }, null);

      expect(answer).toEqual(refused);
    });

    it("when the path can't be resolved, and the run log says why", async () => {
      const failing: SandboxedAsksPaths = {
        resolve: async () => {
          throw new Error("Permission denied.");
        },
        windows: false,
      };

      const { answer, recorded } = await askThrough(inSandbox, fenced, "Edit", edit, failing);

      expect(answer).toEqual(refused);
      expect(recorded).toEqual([
        {
          type: "bridge.failed",
          agent: "writer",
          kind: "asks-path",
          message: expect.stringContaining("Permission denied."),
        },
      ]);
    });

    it("when the run log can't take the call, and says so", async () => {
      const { answer, recorded } = await askThrough(
        inSandbox,
        fenced,
        "Bash",
        { command: "ls" },
        paths,
        {
          refuses: ["harness.allowed"],
        },
      );

      expect(answer).toEqual(refused);
      expect(recorded).toEqual([
        {
          type: "bridge.failed",
          agent: "writer",
          kind: "asks-record",
          message: expect.stringContaining("The run log is full."),
        },
      ]);
    });

    it("and tells the host when the run log takes nothing at all", async () => {
      const { answer, reported } = await askThrough(
        inSandbox,
        fenced,
        "Bash",
        { command: "ls" },
        paths,
        {
          refuses: ["harness.allowed", "bridge.failed"],
        },
      );

      expect(answer).toEqual(refused);
      expect(reported).toEqual([
        expect.objectContaining({ message: expect.stringContaining("asks-record") }),
      ]);
    });
  });

  describe("on Windows, as the host's platform says", () => {
    const windowsPaths: SandboxedAsksPaths = { ...paths, windows: true };
    const windowsFolder = "C:\\data\\proposals\\01JD8Q\\files\\agents\\writer"; // leak-guard: allow absolute-path fixture path
    const windowsFenced = sessionWith({ state: "fenced" }, windowsFolder);

    it("lets an edit in the working folder through, whatever its letter case", async () => {
      const { answer } = await askThrough(
        inSandbox,
        windowsFenced,
        "Edit",
        { file_path: "c:\\Data\\Proposals\\01JD8Q\\files\\agents\\writer\\reply.md" }, // leak-guard: allow absolute-path fixture path
        windowsPaths,
      );

      expect(answer).toEqual({ approved: true });
    });

    it.each([
      ["a device path", "\\\\.\\C:\\data\\proposals\\01JD8Q\\files\\agents\\writer\\reply.md"],
      ["a UNC path", "\\\\server\\share\\reply.md"],
    ])("asks the run's approvals for %s", async (_what, path) => {
      const { answer, recorded } = await askThrough(
        inSandbox,
        windowsFenced,
        "Edit",
        { file_path: path },
        windowsPaths,
      );

      expect(answer).toEqual({ approved: false, comment: "Nobody can answer." });
      expect(recorded).toEqual([]);
    });
  });
});
