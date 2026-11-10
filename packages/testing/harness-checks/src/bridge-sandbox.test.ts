import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Fetch } from "@halonicjs/adapter-harness-bridge";
import { claudeCodeEnvironment } from "@halonicjs/adapter-harness-claude-code";
import type {
  Sandbox,
  SandboxCapabilities,
  SandboxCheck,
  SandboxCommand,
  SandboxExit,
  SandboxProcess,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type BridgeSandbox, openBridgeSandbox } from "./bridge-sandbox.ts";

/** The person's sign-in as Claude Code sends it. Made up: not a real token. */
const signIn = "Bearer made-up-subscription-sign-in-0123456789";

/** What a program in the fake sandbox does: it gets the profile's variables and gives an exit code. */
type FakeProgram = (env: Readonly<Record<string, string>>, stop: AbortSignal) => Promise<number>;

/** A sandbox that runs a function in place of a program, and keeps the profile it was opened with. */
function fakeSandbox(programs: Record<string, FakeProgram>): Sandbox & {
  profile: SandboxProfile | undefined;
} {
  const fake = {
    profile: undefined as SandboxProfile | undefined,
    check: async (): Promise<SandboxCheck> => ({ ok: true, reason: null, missing: [] }),
    capabilities: (): SandboxCapabilities => ({ files: "shared", strength: "os" }),
    open: async (profile: SandboxProfile): Promise<SandboxSession> => {
      fake.profile = profile;
      return {
        profile,
        fence: { state: "fenced" },
        start: async (command: SandboxCommand) => startFake(programs, command, profile.env),
        onBlocked: () => () => {},
        close: async () => {},
      };
    },
  };
  return fake;
}

function startFake(
  programs: Record<string, FakeProgram>,
  command: SandboxCommand,
  env: Readonly<Record<string, string>>,
): SandboxProcess {
  const stop = new AbortController();
  const program = programs[command.program] ?? (async () => 127);
  const exited: Promise<SandboxExit> = program(env, stop.signal).then((code) =>
    stop.signal.aborted
      ? { code: null, signal: "SIGTERM", reason: "stopped" }
      : { code, signal: null, reason: "exited" },
  );
  const done = (stream: ReadableStreamDefaultController<Uint8Array>): void => {
    void exited.then(() => stream.close());
  };
  return {
    stdin: new WritableStream(),
    stdout: new ReadableStream({ start: done }),
    stderr: new ReadableStream({ start: done }),
    exited,
    kill: async () => stop.abort(),
  };
}

/** Claude Code's model call, as it makes it with the variables its adapter sets. */
const claude: FakeProgram = async (env) => {
  const [name = "", value = ""] = (env["ANTHROPIC_CUSTOM_HEADERS"] ?? "").split(": ");
  const answer = await fetch(`${env["ANTHROPIC_BASE_URL"]}/v1/messages?beta=true`, {
    method: "POST",
    headers: {
      authorization: signIn,
      [name]: value,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "Hi" }],
    }),
  });
  await answer.text();
  return answer.ok ? 0 : 1;
};

/** A program that runs until it is stopped. */
const hangs: FakeProgram = (_env, stop) =>
  new Promise((resolve) => stop.addEventListener("abort", () => resolve(143)));

/** Anthropic, made up: notes the sign-in it got and answers with 10 input and 3 output tokens. */
function fakeAnthropic(): { fetch: Fetch; got: { url: string; authorization: string | null }[] } {
  const got: { url: string; authorization: string | null }[] = [];
  const fetch: Fetch = async (input, init) => {
    got.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return new Response(
      JSON.stringify({
        type: "message",
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 10, output_tokens: 3 },
      }),
      { headers: { "content-type": "application/json" } },
    );
  };
  return { fetch, got };
}

let scratch: string;
let opened: BridgeSandbox | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "halonic-bridge-sandbox-"));
});

afterEach(async () => {
  await opened?.close();
  opened = undefined;
  await rm(scratch, { recursive: true, force: true });
});

async function open(sandbox: Sandbox, fetch: Fetch): Promise<BridgeSandbox> {
  opened = await openBridgeSandbox({
    provider: "anthropic",
    watched: ["authorization", "x-api-key", "x-halonic-run-token"],
    environment: claudeCodeEnvironment,
    settingsFolder: join(scratch, "settings"),
    scratchFolder: scratch,
    allowedSites: [],
    extraEnv: { CLAUDE_CODE_OAUTH_TOKEN: "made-up-oauth-token" },
    sandbox: () => sandbox,
    fetch,
  });
  return opened;
}

verifies("harness-checks.bridge-sandbox", () => {
  it("lets the sandbox reach only the tap, and points Claude Code at it", async () => {
    const sandbox = fakeSandbox({});
    const checked = await open(sandbox, fakeAnthropic().fetch);
    await checked.run({ program: "claude", args: [] }, 5_000);

    const profile = sandbox.profile;
    const [, port = ""] = profile?.env["ANTHROPIC_BASE_URL"]?.split(/:(?=\d+$)/) ?? [];
    expect(profile?.network).toEqual({
      bridge: { host: "127.0.0.1", port: Number(port) },
      allowedSites: [],
    });
    expect(checked.bridgeUrl).toBe(profile?.env["ANTHROPIC_BASE_URL"]);
    expect(profile?.settingsFolder).toBe(join(scratch, "settings"));
    expect(profile?.env).toMatchObject({
      HOME: join(scratch, "work", "home"),
      CLAUDE_CONFIG_DIR: join(scratch, "settings"),
      CLAUDE_CODE_TMPDIR: join(scratch, "temp"),
      CLAUDE_CODE_OAUTH_TOKEN: "made-up-oauth-token",
    });
  });

  it("carries the program's sign-in through the tap and the bridge to Anthropic", async () => {
    const anthropic = fakeAnthropic();
    const checked = await open(fakeSandbox({ claude }), anthropic.fetch);

    const run = await checked.run({ program: "claude", args: [] }, 5_000);

    expect(run.exit).toMatchObject({ code: 0, timedOut: false });
    expect(anthropic.got).toEqual([
      { url: "https://api.anthropic.com/v1/messages?beta=true", authorization: signIn },
    ]);
    expect(checked.requests).toEqual([
      {
        method: "POST",
        path: "/v1/messages",
        headers: {
          authorization: "present",
          "x-api-key": "absent",
          "x-halonic-run-token": "present",
        },
        status: 200,
      },
    ]);
    expect(checked.modelCalls).toBe(1);
  });

  it("stops a program that runs past its time and says so", async () => {
    const checked = await open(fakeSandbox({ claude: hangs }), fakeAnthropic().fetch);

    const run = await checked.run({ program: "claude", args: [] }, 50);

    expect(run.exit.timedOut).toBe(true);
  });
});
