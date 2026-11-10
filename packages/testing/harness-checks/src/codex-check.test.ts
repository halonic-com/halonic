import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexConfigText } from "@halonicjs/adapter-harness-codex";
import type { SandboxCommand } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AskOutside } from "./ask-outside.ts";
import type { BridgeSandbox, BridgeSandboxOptions, CheckedRun } from "./bridge-sandbox.ts";
import {
  ageSignIn,
  type CodexCheckOptions,
  checkCodex,
  codexPromptCommand,
  codexSignInKind,
  promptResult,
  signedIn,
  withSettingsFile,
} from "./codex-check.ts";
import type { TappedRequest } from "./header-tap.ts";

/** A made-up `auth.json` in the shape Codex writes for a ChatGPT sign-in: no real token. */
const chatgptAuth = {
  OPENAI_API_KEY: null,
  // Each field holds the word "made-up", put in by name so the leak guard
  // doesn't take the fixture for a real token.
  tokens: Object.fromEntries(
    ["id_token", "access_token", "refresh_token", "account_id"].map((field) => [field, "made-up"]),
  ),
  last_refresh: "2026-11-10T12:00:00Z",
};

function ran(code: number | null, stdout = "", stderr = "", timedOut = false): CheckedRun {
  return { exit: { code, signal: null, reason: "exited", timedOut }, stdout, stderr };
}

const signedCall: TappedRequest = {
  method: "POST",
  path: "/v1/responses",
  headers: { authorization: "present", "chatgpt-account-id": "present" },
  status: 200,
};

/** What the fake sandbox saw when it opened with one settings folder. */
interface Opened {
  options: BridgeSandboxOptions;
  /** The `auth.json` and `config.toml` the folder held then, or `null`. */
  auth: string | null;
  config: string | null;
}

/**
 * A fake bridge and sandbox: `--version` and `login status` answer, the
 * status question leaves a refused host, and the prompt leaves one model
 * call carrying a sign-in.
 */
function fakeOpener(
  opened: Opened[],
  commands: SandboxCommand[] = [],
): (options: BridgeSandboxOptions) => Promise<BridgeSandbox> {
  return async (options) => {
    const read = (name: string) =>
      readFile(join(options.settingsFolder, name), "utf8").catch(() => null);
    opened.push({ options, auth: await read("auth.json"), config: await read("config.toml") });
    const requests: TappedRequest[] = [];
    const denied: string[] = [];
    let modelCalls = 0;
    const answers: Record<string, () => CheckedRun> = {
      "--version": () => ran(0, "codex-cli 0.166.0\n"),
      login: () => {
        denied.push("ab.chatgpt.com:443");
        return ran(0, "Logged in using ChatGPT\n");
      },
      exec: () => {
        requests.push(signedCall);
        modelCalls += 1;
        return ran(0, '{"type":"turn.completed"}\n');
      },
    };
    return {
      bridgeUrl: "http://127.0.0.1:41817",
      run: async (command: SandboxCommand) => {
        commands.push(command);
        return answers[command.args[0] ?? ""]?.() ?? ran(127);
      },
      requests,
      denied,
      get modelCalls() {
        return modelCalls;
      },
      close: async () => {},
    };
  };
}

let scratch: string;
let settings: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "halonic-codex-check-"));
  settings = join(scratch, "settings");
  await mkdir(settings);
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function checkOptions(
  opened: Opened[],
  changes: Partial<CodexCheckOptions> = {},
): CodexCheckOptions {
  const askOutside: AskOutside = async () => ({ code: 1, stdout: "", stderr: "Not logged in\n" });
  return {
    settingsFolder: settings,
    scratchFolder: join(scratch, "check"),
    expireSignIn: false,
    hostEnv: { PATH: "/usr/bin", HOME: join(scratch, "home") },
    keychain: { serviceNames: async () => null },
    askOutside,
    promptTimeoutMs: 1_000,
    openSandbox: fakeOpener(opened),
    ...changes,
  };
}

verifies("harness-checks.codex", () => {
  it("reads only the exit code and the 'Not logged in' line from `codex login status`", () => {
    expect(signedIn({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" })).toBe("yes");
    expect(signedIn({ code: 1, stdout: "", stderr: "Not logged in\n" })).toBe("no");
    expect(signedIn({ code: 1, stdout: "", stderr: "Error reading auth.json\n" })).toBe("unknown");
    expect(signedIn({ code: null, stdout: "", stderr: "" })).toBe("unknown");
  });

  it("names how the prompt ended", () => {
    expect(promptResult(ran(0, '{"type":"turn.completed"}\n'))).toBe("answered");
    expect(promptResult(ran(0, '{"type":"turn.failed","error":{}}\n'))).toBe("failed");
    expect(promptResult(ran(1, "", "Not logged in\n"))).toBe("signed-out");
    expect(promptResult(ran(1, "", "stream disconnected\n"))).toBe("failed");
    expect(promptResult(ran(null, "", "", true))).toBe("timed-out");
  });

  it("gives the prompt the bridge's address the way the adapter does", () => {
    expect(codexPromptCommand("http://127.0.0.1:41817").args).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--json",
      "-c",
      'model_providers.halonic.base_url="http://127.0.0.1:41817/v1"',
      "-c",
      'mcp_servers.halonic.url="http://127.0.0.1:41817/mcp"',
      "Reply with the single word: ok",
    ]);
  });

  it("tells a ChatGPT sign-in from an API key by the fields that are there", async () => {
    const file = join(scratch, "auth.json");
    expect(await codexSignInKind(file)).toBe("no-file");
    await writeFile(file, JSON.stringify(chatgptAuth));
    expect(await codexSignInKind(file)).toBe("chatgpt");
    await writeFile(file, '{"OPENAI_API_KEY":"made-up-key"}');
    expect(await codexSignInKind(file)).toBe("api-key");
    await writeFile(file, "{}");
    expect(await codexSignInKind(file)).toBe("neither");
  });

  it("ages a copied ChatGPT sign-in by changing only last_refresh", async () => {
    const file = join(scratch, "auth.json");
    await writeFile(file, JSON.stringify(chatgptAuth));
    const now = Date.parse("2026-11-10T12:00:00Z");

    expect(await ageSignIn(file, now)).toBe(true);

    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      ...chatgptAuth,
      last_refresh: "2026-10-11T12:00:00.000Z",
    });
  });

  it("leaves an auth.json without ChatGPT tokens or last_refresh as it was", async () => {
    const file = join(scratch, "auth.json");
    await writeFile(file, '{"OPENAI_API_KEY":"made-up-key"}');
    expect(await ageSignIn(file)).toBe(false);
    await writeFile(file, '{"tokens":{}}');
    expect(await ageSignIn(file)).toBe(false);
    expect(await readFile(file, "utf8")).toBe('{"tokens":{}}');
  });

  it("puts a settings file back, or removes it when there was none", async () => {
    const file = join(scratch, "config.toml");
    await withSettingsFile(file, "halonic", async () => {
      expect(await readFile(file, "utf8")).toBe("halonic");
    });
    await expect(readFile(file, "utf8")).rejects.toThrow();

    await writeFile(file, "the person's own");
    await expect(
      withSettingsFile(file, "halonic", async () => {
        throw new Error("the check failed");
      }),
    ).rejects.toThrow("the check failed");
    expect(await readFile(file, "utf8")).toBe("the person's own");
  });

  it("asks outside and inside the sandbox with the adapter's settings, and reports only what the prompt caused", async () => {
    await writeFile(join(settings, "config.toml"), "the person's own");
    const opened: Opened[] = [];
    const commands: SandboxCommand[] = [];
    const asked: Record<string, string>[] = [];
    const askOutside: AskOutside = async (_program, _args, env) => {
      asked.push(env);
      return { code: 1, stdout: "", stderr: "Not logged in\n" };
    };

    const findings = await checkCodex(
      checkOptions(opened, { askOutside, openSandbox: fakeOpener(opened, commands) }),
    );

    expect(findings).toEqual({
      version: "0.166.0",
      storage: { credentialsFile: "absent", keychainServices: null },
      signInKind: "no-file",
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
      { PATH: "/usr/bin", HOME: join(scratch, "home"), CODEX_HOME: settings },
    ]);
    expect(opened.map(({ options }) => [options.provider, options.allowedSites])).toEqual([
      ["openai", []],
    ]);
    expect(opened[0]?.config).toBe(codexConfigText());
    expect(commands.at(-1)?.args).toContain(
      'model_providers.halonic.base_url="http://127.0.0.1:41817/v1"',
    );
    expect(await readFile(join(settings, "config.toml"), "utf8")).toBe("the person's own");
  });

  it("runs the prompt again on a copy whose sign-in is due a refresh", async () => {
    await writeFile(join(settings, "auth.json"), JSON.stringify(chatgptAuth));
    const opened: Opened[] = [];

    const findings = await checkCodex(checkOptions(opened, { expireSignIn: true }));

    expect(opened.map(({ options }) => options.settingsFolder)).toEqual([
      settings,
      join(scratch, "check", "settings-expired"),
    ]);
    const aged = JSON.parse(opened[1]?.auth ?? "{}");
    expect(Date.parse(aged.last_refresh)).toBeLessThan(Date.now() - 8 * 24 * 60 * 60_000);
    expect(opened[1]?.config).toBe(codexConfigText());
    expect(JSON.parse(await readFile(join(settings, "auth.json"), "utf8"))).toEqual(chatgptAuth);
    await expect(readFile(join(settings, "config.toml"), "utf8")).rejects.toThrow();
    expect(findings.signInKind).toBe("chatgpt");
    expect(findings.refresh).toMatchObject({ result: "answered", modelCalls: 1 });
  });

  it("can't force a refresh without a ChatGPT sign-in in auth.json", async () => {
    await writeFile(join(settings, "auth.json"), '{"OPENAI_API_KEY":"made-up-key"}');
    const opened: Opened[] = [];

    const findings = await checkCodex(checkOptions(opened, { expireSignIn: true }));

    expect(findings.refresh).toBe("not-possible");
    expect(opened).toHaveLength(1);
  });
});
