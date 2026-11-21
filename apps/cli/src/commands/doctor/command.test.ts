import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SandboxCheck, TrustStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { DoctorMachine } from "../../doctor-machine.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { pastedKey } from "../../test/pasted-key.ts";
import { profilePlatformOf } from "../../workspace-runs.ts";
import { createDoctorCommand } from "./command.ts";

const gb = 1024 ** 3;

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-doctor-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** A trust store with no records. */
const noTrust: TrustStore = {
  get: async () => null,
  grant: async () => {},
  revoke: async () => {},
  list: async () => [],
};

/** A computer with 48 GB free, the sandbox answering `sandbox`, no harness, and Ollama with llama3.2 loaded. */
function machine(sandbox: SandboxCheck = { ok: true, reason: null, missing: [] }): DoctorMachine {
  return {
    // The real platform: the workspace's folders sit under this profile, and
    // a Windows path isn't absolute on a "linux" profile.
    profile: { platform: profilePlatformOf(process.platform), root: join(folder, "profile") },
    trustStore: noTrust,
    sandbox: {
      check: async () => sandbox,
      capabilities: () => ({ files: "shared", strength: "os" }),
    },
    sandboxKind: "bubblewrap",
    probe: {
      engineMemory: async () => 0,
      childProcesses: async () => [],
      folderSize: async () => ({ bytes: 0, complete: true }),
      freeDisk: async () => 48 * gb,
    },
    harnesses: [],
    http: {
      fetch: async () =>
        new Response(JSON.stringify({ models: [{ name: "llama3.2:latest", size: 2 * gb }] })),
    },
    system: "Linux x64",
    signInShell: "sh",
  };
}

/** Writes the Acme workspace, whose alias `fast` uses Ollama, to `acme` in the test's folder. */
function writeAcme(): void {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "models.yaml": "aliases:\n  fast:\n    provider: ollama\n    model: llama3.2\n",
    "providers/ollama.yaml": "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n",
  };
  for (const [path, text] of Object.entries(files)) {
    const file = join(folder, "acme", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

verifies("cli.commands.doctor.check-this-computer", () => {
  it("checks the computer alone in a folder without a workspace", async () => {
    const io = captureIo(folder);

    const code = await runCli(["doctor"], io, [createDoctorCommand(() => machine())]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Halonic 0.1.0 · Linux x64",
      "",
      "✓ Sandbox     ready · bubblewrap",
      "✓ Disk        48 GB free · Halonic uses 0 KB (run logs 0 KB)",
      "",
      "No problems.",
    ]);
  });

  it("checks the workspace's trust and asks its model server what it has loaded", async () => {
    writeAcme();
    const io = captureIo(folder);

    const code = await runCli(["doctor", "--dir", "acme"], io, [
      createDoctorCommand(() => machine()),
    ]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout.slice(2, 4)).toEqual([
      "! Workspace   not trusted yet · halonic trust --dir acme",
      "✓ Models      Ollama answering at localhost:11434 · llama3.2 loaded (2.0 GB)",
    ]);
    expect(io.stdout.at(-1)).toBe("No problems. 1 warning.");
  });

  it("fails the Models line of a workspace with no model, and exits with 1 (HAL-14301)", async () => {
    // As plain `halonic init` writes it: no models.yaml, so the default model `default` is nowhere.
    mkdirSync(join(folder, "fresh"));
    writeFileSync(join(folder, "fresh", "workspace.yaml"), "id: fresh\nname: Fresh\n");
    const io = captureIo(folder);

    const code = await runCli(["doctor", "--dir", "fresh"], io, [
      createDoctorCommand(() => machine()),
    ]);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout.slice(2, 4)).toEqual([
      "✓ Workspace   Fresh · test model only, no trust needed",
      "✕ Models      no model alias default · copy models.yaml and providers/mock.yaml from Acme, or add your own",
    ]);
    expect(io.stdout.at(-1)).toBe(
      "1 problem. Agents without a model of their own won't run until default is added.",
    );
  });

  it("fails the Models line when an agent with no model of its own gets a default no file has", async () => {
    writeAcme();
    mkdirSync(join(folder, "acme", "agents"));
    writeFileSync(join(folder, "acme", "agents", "clerk.agent.yaml"), "name: Clerk\n");
    const io = captureIo(folder);

    const code = await runCli(["doctor", "--dir", "acme"], io, [
      createDoctorCommand(() => machine()),
    ]);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout.slice(3, 5)).toEqual([
      "✕ Models      Ollama answering at localhost:11434 · llama3.2 loaded (2.0 GB)",
      "              no model alias default · copy models.yaml and providers/mock.yaml from Acme, or add your own",
    ]);
  });

  it("exits with 1 when the sandbox can't start", async () => {
    const io = captureIo(folder);
    const inContainer = machine({ ok: false, reason: "container", missing: ["a container"] });

    const code = await runCli(["doctor"], io, [createDoctorCommand(() => inContainer)]);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout[2]).toBe("✕ Sandbox     can't start on this computer");
    expect(io.stdout.at(-1)).toBe(
      "1 problem. Agents set to run in a sandbox won't start until it's fixed.",
    );
  });

  it("says so and exits with 4 when --dir holds no workspace", async () => {
    const io = captureIo(folder);

    const code = await runCli(["doctor", "--dir", "nowhere"], io, [
      createDoctorCommand(() => machine()),
    ]);

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr[0]).toBe("✕ Couldn't check nowhere: there's no workspace.yaml here.");
  });

  it("writes every check and the counts with --json", async () => {
    const io = captureIo(folder);

    await runCli(["doctor", "--json"], io, [createDoctorCommand(() => machine())]);

    const document = JSON.parse(io.stdout.join("\n"));
    expect(document).toMatchObject({ ok: true, problems: 0, warnings: 0 });
    expect(document.checks).toEqual([
      expect.objectContaining({ check: "sandbox", status: "ok" }),
      expect.objectContaining({ check: "disk", status: "ok", freeBytes: 48 * gb }),
    ]);
  });
});

verifies("cli.doctor-windows-drive", () => {
  it("warns when WSL finds the workspace on a Windows drive, and still exits 0", async () => {
    writeAcme();
    const io = captureIo(folder);
    const asked: string[] = [];
    const onWsl: DoctorMachine = {
      ...machine(),
      windowsDrive: (path) => {
        asked.push(path);
        return "/mnt/c";
      },
    };

    const code = await runCli(["doctor", "--dir", "acme", "--json"], io, [
      createDoctorCommand(() => onWsl),
    ]);

    expect(code).toBe(exitCode.ok);
    expect(asked).toEqual([realpathSync.native(join(folder, "acme"))]);
    const document = JSON.parse(io.stdout.join("\n"));
    expect(document.checks[0]).toEqual({
      check: "workspace",
      status: "warning",
      name: "Acme",
      trust: "new",
      windowsDrive: "/mnt/c",
    });
  });

  it("says nothing about a drive for a workspace in Linux's own files", async () => {
    writeAcme();
    const io = captureIo(folder);
    const onWsl: DoctorMachine = { ...machine(), windowsDrive: () => null };

    await runCli(["doctor", "--dir", "acme", "--json"], io, [createDoctorCommand(() => onWsl)]);

    expect(JSON.parse(io.stdout.join("\n")).checks[0]).not.toHaveProperty("windowsDrive");
  });
});

verifies("cli.doctor-watch-limit", () => {
  // Acme has three files, so a limit of 2 stands for a folder over Studio's 50,000.
  it("warns when the workspace has more files than Studio watches, and still exits 0", async () => {
    writeAcme();
    const io = captureIo(folder);

    const code = await runCli(["doctor", "--dir", "acme", "--json"], io, [
      createDoctorCommand(() => machine(), { watchedFileLimit: 2 }),
    ]);

    expect(code).toBe(exitCode.ok);
    expect(JSON.parse(io.stdout.join("\n")).checks[0]).toEqual({
      check: "workspace",
      status: "warning",
      name: "Acme",
      trust: "new",
      tooManyFilesToWatch: 2,
    });
  });

  it("says nothing about the watch for a workspace at the limit", async () => {
    writeAcme();
    const io = captureIo(folder);

    await runCli(["doctor", "--dir", "acme", "--json"], io, [
      createDoctorCommand(() => machine(), { watchedFileLimit: 3 }),
    ]);

    expect(JSON.parse(io.stdout.join("\n")).checks[0]).not.toHaveProperty("tooManyFilesToWatch");
  });
});

verifies("cli.doctor-node", () => {
  it("adds the Node.js line the machine found, and still exits 0", async () => {
    const io = captureIo(folder);
    const inWslFolder: DoctorMachine = {
      ...machine(),
      node: async () => ({ problem: "windows-node-in-wsl" }),
    };

    const code = await runCli(["doctor", "--json"], io, [createDoctorCommand(() => inWslFolder)]);

    expect(code).toBe(exitCode.ok);
    const document = JSON.parse(io.stdout.join("\n"));
    expect(document.checks).toContainEqual({
      check: "node",
      status: "warning",
      problem: "windows-node-in-wsl",
    });
    expect(document.warnings).toBe(1);
  });
});

verifies("cli.doctor-network", () => {
  it("adds the Network line the machine found, and still exits 0", async () => {
    const io = captureIo(folder);
    const behindHttpsProxy: DoctorMachine = {
      ...machine(),
      network: () => ({ problem: "proxy-not-http", variable: "HTTPS_PROXY", scheme: "https" }),
    };

    const code = await runCli(["doctor"], io, [createDoctorCommand(() => behindHttpsProxy)]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toContain(
      "! Network     HTTPS_PROXY is an https:// proxy; Halonic only uses http:// proxies",
    );
  });
});

verifies("cli.workspace-file-problems", () => {
  it("shows the Workspace line as a problem when a provider file has a pasted key, never the key", async () => {
    const files: Record<string, string> = {
      "workspace.yaml": "id: acme\nname: Acme\n",
      "models.yaml": "aliases:\n  smart:\n    provider: anthropic\n    model: claude-sonnet-5-5\n",
      "providers/anthropic.yaml": `id: anthropic\ntype: anthropic\nsecret: ${pastedKey}\napiKey: ${pastedKey}\n`,
    };
    for (const [path, text] of Object.entries(files)) {
      const file = join(folder, "acme", path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    const io = captureIo(folder);

    const code = await runCli(["doctor", "--dir", "acme"], io, [
      createDoctorCommand(() => machine()),
    ]);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout[2]).toBe(
      "✕ Workspace   Acme · 1 problem in its files · halonic validate --dir acme",
    );
    expect(io.stdout.at(-1)).toBe("1 problem.");
    expect([...io.stdout, ...io.stderr].join("\n")).not.toContain(pastedKey);
  });
});

verifies("cli.doctor-secrets", () => {
  /** Writes `files` to `acme` in the test's folder. */
  function writeWorkspace(files: Record<string, string>): void {
    for (const [path, text] of Object.entries(files)) {
      const file = join(folder, "acme", path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  }

  /** C337 row 8: the agent Helper uses the connector files, whose program needs the secret files-token. */
  const filesConnector = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "models.yaml": "aliases:\n  default:\n    provider: mock\n    model: echo\n",
    "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
    "library/connectors/files.connector.yaml":
      "name: Files\ntransport:\n  stdio:\n    command: acme-files\n    secretEnv:\n      FILES_TOKEN: files-token\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/agents/helper.agent.yaml":
      "id: helper\nname: Helper\ninstructions: Help.\nconnectors: [files]\n",
  };

  it("fails a Secrets line with the secret a used connector needs, and exits with 1", async () => {
    writeWorkspace(filesConnector);
    const io = captureIo(folder);

    const code = await runCli(["doctor", "--dir", "acme"], io, [
      createDoctorCommand(() => machine()),
    ]);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toContain(
      "✕ Secrets     files-token isn't set (connector files) · halonic secret set files-token",
    );
    // The connector's program makes the workspace need trust, which is the warning.
    expect(io.stdout.at(-1)).toBe("1 problem. 1 warning.");
  });

  it("fails a Secrets line with the key of a test-model provider, which the Models line doesn't check", async () => {
    writeWorkspace({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "models.yaml": "aliases:\n  default:\n    provider: mock\n    model: echo\n",
      "providers/mock.yaml":
        "id: mock\nname: Test model\ntype: mock\nlocal: true\nsecret: mock-key\n",
    });
    const io = captureIo(folder);

    const code = await runCli(["doctor", "--dir", "acme", "--json"], io, [
      createDoctorCommand(() => machine()),
    ]);

    expect(code).toBe(exitCode.failed);
    expect(JSON.parse(io.stdout.join("\n")).checks).toContainEqual({
      check: "secrets",
      status: "failed",
      missing: [{ secret: "mock-key", usedBy: [{ kind: "provider", id: "mock" }] }],
      unreadable: [],
    });
  });

  it("has no Secrets line once the secret is set, and never shows its value", async () => {
    writeWorkspace(filesConnector);
    const io = captureIo(folder);
    const value = "files-token-value";

    const code = await runCli(
      ["doctor", "--dir", "acme"],
      io,
      [createDoctorCommand(() => machine())],
      { secrets: { get: async (name) => (name === "files-token" ? value : null) } },
    );

    expect(code).toBe(exitCode.ok);
    expect(io.stdout.join("\n")).not.toContain("Secrets");
    expect(io.stdout.join("\n")).not.toContain(value);
  });

  it("fails a Secrets line with the key run gives a sandboxed harness agent without a model (C536 G1, HAL-15086)", async () => {
    writeWorkspace({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "models.yaml": "aliases:\n  default:\n    provider: mock\n    model: echo\n",
      "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
      "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-key\n",
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "agents/writer2.agent.yaml": "id: writer2\nname: Writer two\nharness: claude-code\n",
    });
    const io = captureIo(folder);
    // As in C536: Claude Code is installed and signed out, and every agent runs in the sandbox.
    const sandboxed: DoctorMachine = {
      ...machine(),
      harnesses: [
        {
          id: "claude-code",
          name: "Claude Code",
          signIn: { program: "claude", args: ["login"], folderVariable: "CLAUDE_CONFIG_DIR" },
          detect: async () => ({ status: "signed-out", version: "2.1.325" }),
        },
      ],
      placement: {
        where: async () => ({
          runsOn: "sandbox",
          agentFingerprint: "sha256:0",
          reason: "not-chosen",
        }),
      },
      keyOrigins: { allowedOrigins: async () => undefined },
    };

    const code = await runCli(["doctor", "--dir", "acme"], io, [
      createDoctorCommand(() => sandboxed),
    ]);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toContain(
      "✕ Secrets     anthropic-key isn't set (provider claude) · halonic secret set anthropic-key",
    );
  });

  it("warns about a secret the store couldn't read, and still prints every line", async () => {
    writeWorkspace(filesConnector);
    const io = captureIo(folder);

    await runCli(["doctor", "--dir", "acme"], io, [createDoctorCommand(() => machine())], {
      secrets: {
        get: async () => {
          throw new Error("The keychain is locked.");
        },
      },
    });

    expect(io.stdout).toContain(
      "! Secrets     couldn't read files-token from the secret store (connector files)",
    );
    expect(io.stdout.join("\n")).toContain("Sandbox");
  });

  it("warns on the Models line about a cloud key the store couldn't read, with no command that sets it", async () => {
    writeWorkspace({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "models.yaml": "aliases:\n  smart:\n    provider: anthropic\n    model: big\n",
      "providers/anthropic.yaml":
        "id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: anthropic-key\n",
    });
    const io = captureIo(folder);

    const code = await runCli(
      ["doctor", "--dir", "acme"],
      io,
      [createDoctorCommand(() => machine())],
      {
        secrets: {
          get: async (name) => {
            if (name === "anthropic-key") throw new Error("The keychain is locked.");
            return null;
          },
        },
      },
    );

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toContain(
      "! Models      couldn't read anthropic-key from the secret store (provider anthropic)",
    );
    // The key may be there, so doctor neither calls it missing nor offers to overwrite it (HAL-14629).
    expect(io.stdout.join("\n")).not.toContain("needs an API key");
    expect(io.stdout.join("\n")).not.toContain("halonic secret set");
  });
});
