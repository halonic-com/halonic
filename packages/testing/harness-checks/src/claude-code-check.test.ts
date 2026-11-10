import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxCommand } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { BridgeSandbox, BridgeSandboxOptions, CheckedRun } from "./bridge-sandbox.ts";
import {
  type AskOutside,
  type ClaudeCodeCheckOptions,
  checkClaudeCode,
  expireCredentials,
  promptResult,
  signedIn,
} from "./claude-code-check.ts";
import type { TappedRequest } from "./header-tap.ts";

/** Made-up credentials in the shape Claude Code writes them: no real token. */
const credentials = {
  claudeAiOauth: {
    accessToken: "made-up-access-token",
    refreshToken: "made-up-refresh-token",
    expiresAt: 4_102_444_800_000,
    scopes: ["user:inference"],
  },
};

function ran(code: number | null, stdout = "", stderr = "", timedOut = false): CheckedRun {
  return { exit: { code, signal: null, reason: "exited", timedOut }, stdout, stderr };
}

const signedCall: TappedRequest = {
  method: "POST",
  path: "/v1/messages",
  headers: { authorization: "present", "x-api-key": "absent" },
  status: 200,
};

/** What the fake sandbox did with one settings folder. */
interface Opened {
  options: BridgeSandboxOptions;
  /** The `.credentials.json` the folder held when the sandbox opened, or `null`. */
  credentials: string | null;
}

/** What the fake sandbox notes for a program: requests at the bridge, refused hosts and model calls. */
interface FakeTraces {
  requests: TappedRequest[];
  denied: string[];
  modelCalls: number;
}

/** The prompt answered, leaving one model call carrying a sign-in. */
function answeredPrompt(traces: FakeTraces): CheckedRun {
  traces.requests.push(signedCall);
  traces.modelCalls += 1;
  return ran(0, '{"type":"result","is_error":false,"result":"ok"}');
}

/**
 * A fake bridge and sandbox: `--version` and `auth status` answer, the
 * status question leaves a request at the bridge and a refusal, and the
 * prompt goes as `prompt` says, answered by default.
 */
function fakeOpener(
  opened: Opened[],
  prompt: (traces: FakeTraces) => CheckedRun = answeredPrompt,
): (options: BridgeSandboxOptions) => Promise<BridgeSandbox> {
  return async (options) => {
    opened.push({
      options,
      credentials: await readFile(join(options.settingsFolder, ".credentials.json"), "utf8").catch(
        () => null,
      ),
    });
    const traces: FakeTraces = { requests: [], denied: [], modelCalls: 0 };
    const answers: Record<string, () => CheckedRun> = {
      "--version": () => ran(0, "2.3.1 (Claude Code)\n"),
      auth: () => {
        traces.requests.push({
          ...signedCall,
          method: "GET",
          path: "/api/oauth/profile",
          status: 404,
        });
        traces.denied.push("platform.claude.com:443");
        return ran(0, '{"loggedIn":true,"email":"someone@example.com"}');
      },
      "-p": () => prompt(traces),
    };
    return {
      bridgeUrl: "http://127.0.0.1:41817",
      run: async (command: SandboxCommand) => answers[command.args[0] ?? ""]?.() ?? ran(127),
      requests: traces.requests,
      denied: traces.denied,
      get modelCalls() {
        return traces.modelCalls;
      },
      close: async () => {},
    };
  };
}

let scratch: string;
let settings: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "halonic-claude-check-"));
  settings = join(scratch, "settings");
  await mkdir(settings);
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function checkOptions(
  opened: Opened[],
  changes: Partial<ClaudeCodeCheckOptions> = {},
): ClaudeCodeCheckOptions {
  const askOutside: AskOutside = async () => ({ code: 1, stdout: '{"loggedIn":false}' });
  return {
    settingsFolder: settings,
    scratchFolder: join(scratch, "check"),
    expireSignIn: false,
    oauthToken: undefined,
    hostEnv: { PATH: "/usr/bin", HOME: join(scratch, "home") },
    keychain: { serviceNames: async () => null },
    askOutside,
    promptTimeoutMs: 1_000,
    openSandbox: fakeOpener(opened),
    ...changes,
  };
}

verifies("harness-checks.claude-code", () => {
  it("reads only the exit code and loggedIn from `claude auth status`", () => {
    expect(signedIn(0, '{"loggedIn":true,"email":"someone@example.com"}')).toBe("yes");
    expect(signedIn(1, '{"loggedIn":false}')).toBe("no");
    expect(signedIn(0, "not JSON")).toBe("unknown");
    expect(signedIn(2, '{"loggedIn":false}')).toBe("unknown");
    expect(signedIn(0, "[true]")).toBe("unknown");
  });

  it("names how the prompt ended", () => {
    expect(promptResult(ran(0, '{"is_error":false,"result":"ok"}'))).toBe("answered");
    expect(promptResult(ran(null, "", "", true))).toBe("timed-out");
    expect(
      promptResult(ran(1, '{"is_error":true,"result":"Not logged in · Please run /login"}')),
    ).toBe("signed-out");
    expect(promptResult(ran(1, "", "Login expired · Please run /login\n"))).toBe("sign-in-expired");
    expect(promptResult(ran(0, '{"is_error":true,"result":"API Error: 500"}'))).toBe("failed");
  });

  it("moves only the sign-in's expiry, to a minute before now", async () => {
    const file = join(scratch, ".credentials.json");
    await writeFile(file, JSON.stringify(credentials));

    expect(await expireCredentials(file, 1_000_000)).toBe(true);

    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      claudeAiOauth: { ...credentials.claudeAiOauth, expiresAt: 940_000 },
    });
  });

  it("leaves a file without an expiry as it is", async () => {
    const file = join(scratch, ".credentials.json");
    await writeFile(file, '{"claudeAiOauth":{"expiresAt":"soon"}}');

    expect(await expireCredentials(file)).toBe(false);
    expect(await readFile(file, "utf8")).toBe('{"claudeAiOauth":{"expiresAt":"soon"}}');
  });

  it("asks outside and inside the sandbox, and reports only what the prompt caused", async () => {
    const opened: Opened[] = [];
    const asked: Record<string, string>[] = [];
    const askOutside: AskOutside = async (_program, _args, env) => {
      asked.push(env);
      return { code: 1, stdout: '{"loggedIn":false}' };
    };

    const findings = await checkClaudeCode(
      checkOptions(opened, { askOutside, oauthToken: "made-up-oauth-token" }),
    );

    expect(findings).toEqual({
      version: "2.3.1",
      storage: { credentialsFile: "absent", keychainServices: null },
      oauthTokenVariable: "passed",
      signedInOutside: "no",
      signedInInside: "yes",
      prompt: {
        result: "answered",
        exitCode: 0,
        requests: [signedCall],
        denied: [],
        modelCalls: 1,
      },
      refresh: "not-forced",
    });
    expect(asked).toEqual([
      {
        PATH: "/usr/bin",
        HOME: join(scratch, "home"),
        CLAUDE_CONFIG_DIR: settings,
        CLAUDE_CODE_OAUTH_TOKEN: "made-up-oauth-token",
      },
    ]);
    expect(opened.map(({ options }) => [options.provider, options.allowedSites])).toEqual([
      ["anthropic", []],
    ]);
    expect(opened[0]?.options.extraEnv).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: "made-up-oauth-token",
    });
  });

  it("reports a host the prompt was refused at, also when an earlier question was refused there", async () => {
    const opened: Opened[] = [];
    const signedOutPrompt = (traces: FakeTraces): CheckedRun => {
      traces.denied.push("platform.claude.com:443", "platform.claude.com:443");
      return ran(1, '{"is_error":true,"result":"Not logged in · Please run /login"}');
    };

    const findings = await checkClaudeCode({
      ...checkOptions(opened),
      openSandbox: fakeOpener(opened, signedOutPrompt),
    });

    expect(findings.prompt).toMatchObject({
      result: "signed-out",
      denied: ["platform.claude.com:443"],
    });
  });

  it("runs the prompt again on a copy whose sign-in has expired", async () => {
    await writeFile(join(settings, ".credentials.json"), JSON.stringify(credentials));
    const opened: Opened[] = [];

    const findings = await checkClaudeCode(checkOptions(opened, { expireSignIn: true }));

    expect(opened.map(({ options }) => options.settingsFolder)).toEqual([
      settings,
      join(scratch, "check", "settings-expired"),
    ]);
    const expired = JSON.parse(opened[1]?.credentials ?? "{}");
    expect(expired.claudeAiOauth.expiresAt).toBeLessThan(Date.now());
    expect(JSON.parse(await readFile(join(settings, ".credentials.json"), "utf8"))).toEqual(
      credentials,
    );
    expect(findings.refresh).toMatchObject({ result: "answered", modelCalls: 1 });
  });

  it("can't force a refresh when the sign-in isn't in .credentials.json", async () => {
    const opened: Opened[] = [];

    const findings = await checkClaudeCode(checkOptions(opened, { expireSignIn: true }));

    expect(findings.refresh).toBe("not-possible");
    expect(opened).toHaveLength(1);
  });
});
