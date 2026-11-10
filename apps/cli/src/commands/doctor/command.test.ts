import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SandboxCheck, TrustStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { DoctorMachine } from "../../doctor-machine.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
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
    profile: { platform: "linux", root: join(folder, "profile") },
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
