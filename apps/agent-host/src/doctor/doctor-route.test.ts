import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readDoctorWorkspace } from "@halonicjs/adapter-doctor-node";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { TrustService } from "@halonicjs/app";
import type { HttpClient, ResourceProbe, SandboxCheck, TrustStore } from "@halonicjs/ports";
import { systemClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { doctorRoute } from "./doctor-route.ts";
import { HostDoctor, type HostDoctorParts } from "./host-doctor.ts";

const token = randomLaunchToken();
const appVersion = "0.1.0";
/** Text an error could quote from a file. Not a real credential. */
const leakyKey = "sk-test-not-a-real-key";
/** Where no command is found, so no connector's program is looked for on this computer. */
const noCommands = { path: "", endings: [] };
const digest = {
  sha256: async (data: Uint8Array) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
};

const acmeFiles = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "models.yaml": [
    "aliases:",
    "  smart: { provider: anthropic, model: claude }",
    "  local: { provider: ollama, model: llama3.2 }",
    "  shared: { provider: lan, model: qwen3 }",
    "",
  ].join("\n"),
  "providers/anthropic.yaml":
    "id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: anthropic\n",
  "providers/ollama.yaml":
    "id: ollama\nname: Ollama\ntype: ollama\nbaseUrl: http://localhost:11434/v1\nlocal: true\n",
  "providers/lan.yaml":
    "id: lan\nname: LM Studio\ntype: lmstudio\nbaseUrl: http://10.0.0.5:1234/v1\nlocal: true\n",
};

let root: string;
let profile: string;
let workspace: string;
let server: HostServer | undefined;
let asked: string[];
let logged: string[];

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "halonic-doctor-route-")));
  profile = join(root, "profile");
  workspace = join(root, "acme");
  await mkdir(profile);
  await writeFiles(workspace, acmeFiles);
  asked = [];
  logged = [];
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(root, { recursive: true, force: true });
});

async function writeFiles(folder: string, files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), text);
  }
}

/** A model server that has qwen3 loaded, wherever it is asked. */
const http: HttpClient = {
  fetch: async (url) => {
    asked.push(String(url));
    return new Response(JSON.stringify({ models: [{ name: "qwen3" }] }));
  },
};

const probe: ResourceProbe = {
  engineMemory: async () => 0,
  childProcesses: async () => [],
  folderSize: async () => ({ bytes: 100, complete: true }),
  freeDisk: async () => 1024 ** 4,
};

const sandboxWorks = async (): Promise<SandboxCheck> => ({ ok: true, reason: null, missing: [] });

/** The host's doctor on fakes of the computer, with the profile's real trust records unless given. */
function doctorParts(changes: Partial<HostDoctorParts["machine"]> = {}): HostDoctorParts {
  return {
    machine: {
      profile: { platform: "linux", root: profile },
      trustStore: new FileTrustStore(join(profile, "trust")),
      sandbox: { check: sandboxWorks, capabilities: () => ({ files: "shared", strength: "os" }) },
      probe,
      harnesses: [
        {
          id: "claude-code",
          name: "Claude Code",
          detect: async () => ({ status: "ready", version: "2.1.400" }),
        },
      ],
      http,
      network: () => null,
      ...changes,
    },
    appVersion,
    commandSearch: noCommands,
    onWsl: false,
    sandboxKind: "bubblewrap",
  };
}

async function serve(parts: HostDoctorParts = doctorParts()): Promise<void> {
  const doctor = new HostDoctor(parts);
  server = await startHostServer(token, [
    doctorRoute(doctor, [workspace], (text) => logged.push(text)),
  ]);
}

function ask(body: unknown, withToken = true): Promise<Response> {
  return fetch(`${server?.url}/v1/doctor`, {
    method: "POST",
    headers: {
      ...(withToken ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

interface AnsweredLine {
  check: string;
  status: string;
  actions: string[];
  [fact: string]: unknown;
}

async function answerOf(response: Response): Promise<{ checks: AnsweredLine[]; summary: unknown }> {
  expect(response.status).toBe(200);
  return (await response.json()) as { checks: AnsweredLine[]; summary: unknown };
}

/** Trusts the workspace as it is now, as `halonic trust` would. */
async function trustWorkspace(): Promise<void> {
  const read = await readDoctorWorkspace(
    { root: workspace, shown: workspace, name: "acme" },
    { watchedFileLimit: 50_000, commandSearch: noCommands },
  );
  if (read === null) throw new Error("The test workspace has no workspace.yaml.");
  const trust = new TrustService({
    store: new FileTrustStore(join(profile, "trust")),
    digest,
    clock: systemClock,
    appVersion,
  });
  const check = await trust.check(read.workspace.trust);
  if (check.status === "refused") throw new Error("The test workspace can't be trusted.");
  expect((await trust.grant(read.workspace.trust, check.fingerprint, "cli")).ok).toBe(true);
}

/** Every file and folder under `folder`, with its size and when it last changed. */
async function snapshot(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true });
  const lines = await Promise.all(
    entries.map(async (entry) => {
      const info = await stat(join(folder, entry));
      return `${entry} ${info.size} ${info.mtimeMs}`;
    }),
  );
  return lines.sort();
}

verifies("agent-host.doctor-route", () => {
  it("checks only the computer when no workspace is given", async () => {
    await serve();

    const { checks, summary } = await answerOf(await ask({}));

    expect(checks.map((line) => line.check)).toEqual(["sandbox", "harnesses", "disk"]);
    expect(checks.every((line) => Array.isArray(line.actions))).toBe(true);
    expect(summary).toEqual({ problems: 0, warnings: 0, needsFixing: false });
  });

  it("answers the workspace's lines as facts and ids, without the key lines, Node.js, Default model or Last run", async () => {
    await serve();

    const { checks } = await answerOf(await ask({ workspace }));

    expect(checks.map((line) => line.check)).toEqual([
      "workspace",
      "models",
      "sandbox",
      "harnesses",
      "disk",
    ]);
    expect(checks[0]).toMatchObject({
      check: "workspace",
      name: "Acme",
      trust: "new",
      actions: ["review-trust"],
    });
    expect(JSON.stringify(checks)).not.toContain("anthropic");
  });

  it("asks only the model servers on this computer while the workspace isn't trusted, and never a cloud provider", async () => {
    await serve();

    const { checks } = await answerOf(await ask({ workspace }));

    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((url) => url.startsWith("http://localhost:11434/"))).toBe(true);
    expect(checks.find((line) => line.check === "models")).toMatchObject({
      problems: [expect.objectContaining({ problem: "unreachable", provider: "lan" })],
    });
  });

  it("asks a server at another address once the workspace is trusted here, still never a cloud provider", async () => {
    await trustWorkspace();
    await serve();

    await answerOf(await ask({ workspace }));

    expect(asked.some((url) => url.startsWith("http://10.0.0.5:1234/"))).toBe(true);
    expect(asked.some((url) => url.includes("anthropic"))).toBe(false);
  });

  it("writes nothing in the profile or the workspace, not even a trust record the check would shrink", async () => {
    await trustWorkspace();
    await rm(join(workspace, "providers", "lan.yaml"));
    const record = await readdir(join(profile, "trust"));
    const recordBytes = await readFile(join(profile, "trust", record[0] ?? ""), "utf8");
    const before = [await snapshot(profile), await snapshot(workspace)];
    await serve();

    const { checks } = await answerOf(await ask({ workspace }));

    expect(checks[0]).toMatchObject({ check: "workspace", trust: "trusted" });
    expect([await snapshot(profile), await snapshot(workspace)]).toEqual(before);
    expect(await readFile(join(profile, "trust", record[0] ?? ""), "utf8")).toBe(recordBytes);
  });

  it("refuses a folder the launcher didn't name, and a named one without workspace.yaml", async () => {
    await serve();
    const other = join(root, "other");
    await writeFiles(other, { "workspace.yaml": "id: other\nname: Other\n" });

    const unnamed = await ask({ workspace: other });
    expect(unnamed.status).toBe(404);
    expect(await unnamed.json()).toMatchObject({ error: { kind: "unknown_workspace" } });

    await rm(join(workspace, "workspace.yaml"));
    const empty = await ask({ workspace });
    expect(empty.status).toBe(404);
    expect(await empty.json()).toMatchObject({ error: { kind: "no_workspace" } });
  });

  it("refuses a second check while one runs, without queueing it", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let checking = false;
    await serve(
      doctorParts({
        sandbox: {
          check: async () => {
            checking = true;
            await held;
            return { ok: true, reason: null, missing: [] };
          },
          capabilities: () => ({ files: "shared", strength: "os" }),
        },
      }),
    );

    const first = ask({});
    await expect.poll(() => checking).toBe(true);
    const second = await ask({});
    release();

    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ error: { kind: "busy" } });
    expect((await first).status).toBe(200);
    expect((await ask({})).status).toBe(200);
  });

  it("answers a check that threw with a fixed message, and keeps its text out of the answer and the log", async () => {
    await serve(
      doctorParts({
        sandbox: {
          check: () => Promise.reject(new Error(`srt printed ${leakyKey}`)),
          capabilities: () => ({ files: "shared", strength: "os" }),
        },
      }),
    );

    const response = await ask({ workspace });

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ error: { kind: "doctor_failed" } });
    expect(text).not.toContain(leakyKey);
    expect(logged.join("")).not.toContain(leakyKey);
  });

  it("keeps the text of trust records it couldn't read out of the answer", async () => {
    const unreadable: TrustStore = {
      get: async () => {
        throw new Error(`The record holds ${leakyKey}`);
      },
      grant: async () => {},
      revoke: async () => {},
      list: async () => [],
    };
    await serve(doctorParts({ trustStore: unreadable }));

    const response = await ask({ workspace });

    expect(await response.text()).not.toContain(leakyKey);
    expect(logged.join("")).not.toContain(leakyKey);
  });

  it("takes nothing but the workspace in its body, and nothing without the launch token", async () => {
    await serve();

    expect((await ask({ workspace, agentsWithProviderKey: ["writer"] })).status).toBe(400);
    expect((await ask({ workspace: "acme" })).status).toBe(400);
    expect((await ask({}, false)).status).toBe(401);
  });
});

verifies("agent-host.doctor-sandbox-kind", () => {
  it("names the kind of sandbox it runs on a ready Sandbox line, and on no other line", async () => {
    await serve();

    const { checks } = await answerOf(await ask({}));

    expect(checks.find((line) => line.check === "sandbox")).toMatchObject({
      status: "ok",
      sandboxKind: "bubblewrap",
    });
    expect(checks.filter((line) => "sandboxKind" in line)).toHaveLength(1);
  });

  it("names no kind when the sandbox can't start", async () => {
    const cantStart = async (): Promise<SandboxCheck> => ({
      ok: false,
      reason: "runtime-missing",
      missing: [],
    });
    await serve(
      doctorParts({
        sandbox: { check: cantStart, capabilities: () => ({ files: "shared", strength: "os" }) },
      }),
    );

    const { checks } = await answerOf(await ask({}));

    expect(checks.find((line) => line.check === "sandbox")).not.toHaveProperty("sandboxKind");
  });
});
