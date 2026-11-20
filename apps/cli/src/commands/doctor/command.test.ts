import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SandboxCheck, TrustStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AddedPlugin } from "../../connector-plugin.ts";
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

verifies("cli.doctor-plugins", () => {
  /** Acme with the connectors `orders` and `returns`, both using the plugin `plugin`. */
  function writeAcmeUsing(plugin: string): void {
    writeAcme();
    for (const id of ["orders", "returns"]) {
      const file = join(folder, "acme", "library", "connectors", `${id}.connector.yaml`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `name: ${id}\ntransport:\n  plugin:\n    id: ${plugin}\n`);
    }
  }

  async function doctorWith(plugins: AddedPlugin[], args: string[] = []) {
    const io = captureIo(folder);
    const computer: DoctorMachine = { ...machine(), plugins: async () => plugins };
    const code = await runCli(["doctor", "--dir", "acme", ...args], io, [
      createDoctorCommand(() => computer),
    ]);
    return { code, stdout: io.stdout };
  }

  it("fails a Plugins line for each connector whose plugin isn't added, and exits with 1", async () => {
    writeAcmeUsing("acme-order");

    const { code, stdout } = await doctorWith([{ id: "acme-orders", state: "on" }]);

    expect(code).toBe(exitCode.failed);
    expect(stdout.slice(4, 6)).toEqual([
      "✕ Plugins     orders uses the plugin acme-order, which isn't added. Did you mean acme-orders?",
      "              returns uses the plugin acme-order, which isn't added. Did you mean acme-orders?",
    ]);
  });

  it("says how to add a plugin when no added one is close", async () => {
    writeAcmeUsing("acme-orders");

    const { stdout } = await doctorWith([], ["--json"]);

    expect(JSON.parse(stdout.join("\n")).checks).toContainEqual({
      check: "plugins",
      status: "failed",
      problems: ["orders", "returns"].map((connector) => ({
        problem: "not-added",
        connector,
        plugin: "acme-orders",
      })),
    });
    const lines = await doctorWith([]);
    expect(lines.stdout[4]).toBe(
      "✕ Plugins     orders uses the plugin acme-orders, which isn't added. Add it with halonic plugin add <folder>.",
    );
  });

  it("warns once about a plugin that is off, however many connectors use it, and exits 0", async () => {
    writeAcmeUsing("acme-orders");

    const { code, stdout } = await doctorWith([{ id: "acme-orders", state: "changed" }]);

    expect(code).toBe(exitCode.ok);
    expect(stdout.slice(4, 6)).toEqual([
      "! Plugins     acme-orders is off: changed since you trusted it · halonic trust --plugin acme-orders",
      "✓ Sandbox     ready · bubblewrap",
    ]);
  });

  it("has no Plugins line while every plugin the connectors use is on", async () => {
    writeAcmeUsing("acme-orders");

    const { stdout } = await doctorWith([{ id: "acme-orders", state: "on" }]);

    expect(stdout.some((line) => line.includes("Plugins"))).toBe(false);
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
      "✕ Workspace   Acme · 2 problems in its files · halonic validate --dir acme",
    );
    expect(io.stdout.at(-1)).toBe("1 problem.");
    expect([...io.stdout, ...io.stderr].join("\n")).not.toContain(pastedKey);
  });
});
