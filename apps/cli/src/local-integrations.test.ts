import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileSystemFolderReader, FileTrustStore } from "@halonicjs/adapter-fs-node";
import { MemoryFolderReader, MemoryUnfencedRunConsentStore } from "@halonicjs/adapter-memory";
import {
  type GatedRunner,
  IntegrationNotTrustedError,
  RunnerStartGate,
  readIntegrationFolder,
  TrustedRunnerStart,
  UnfencedRuns,
} from "@halonicjs/app";
import type { Sandbox } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCommandWith } from "./commands/run/command.ts";
import { exitCode } from "./exit-code.ts";
import { plainText } from "./messages/phrase.ts";
import { trustCheckLines } from "./output/trust-check.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";
import { testRunSetup } from "./test/run-setup.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import { readLocalIntegrations } from "./workspace-integrations.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";
import {
  assertTrustable,
  cliTrustService,
  readWorkspaceTrust,
  workspaceIntegrations,
} from "./workspace-trust.ts";

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const clock = fixedClock(Date.UTC(2026, 10, 11, 9));
const noCommands = { path: undefined, endings: [] };

/** A folder link on Windows is a junction, which needs no special rights. */
const folderLinkType = process.platform === "win32" ? "junction" : "dir";

/** A local integration that reaches the weather station at the address in its `station_url` setting. */
const stationSheet = `id: station
version: 0.1.0
kit: 1
provides: [connector]
hosts: [{ fromSetting: station_url, class: private }]
tools:
  - { name: station-reading, description: The station's last reading., risk: read, untrusted: true }
`;

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-local-integrations-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Writes `files` into Acme, each path from the workspace folder. */
async function putFiles(files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(acme, path)), { recursive: true });
    await writeFile(join(acme, path), text);
  }
}

/** Acme with the station integration in `integrations/station`. */
async function addStation(): Promise<void> {
  await putFiles({
    "integrations/station/integration.yaml": stationSheet,
    "integrations/station/src/index.js": "export default {};\n",
  });
}

/** Acme's trust check as `halonic trust` makes it, on a trust store in the test's folder. */
async function acmeTrust() {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const service = cliTrustService(new FileTrustStore(join(folder, "trust")), clock);
  const check = async () => {
    const read = await readWorkspaceTrust(dir, noCommands);
    const shown = await service.check(read.subject);
    assertTrustable(shown, read);
    return shown;
  };
  const trust = async () => {
    const { subject } = await readWorkspaceTrust(dir, noCommands);
    const shown = await check();
    expect((await service.grant(subject, shown.fingerprint, "cli")).ok).toBe(true);
  };
  return { check, trust };
}

/** A runner start in Acme whose runner is never real: `started` counts the starts the gate let through. */
function runnerStarts() {
  const sandbox = (strength: "os" | "none"): Sandbox => ({
    check: async () => ({ ok: true, reason: null, missing: [] }),
    capabilities: () => ({ files: "shared", strength }),
    open: async () => {
      throw new Error("This test opens no sandbox session.");
    },
  });
  const gate = new RunnerStartGate({
    platform: "linux",
    fenced: sandbox("os"),
    launcher: sandbox("none"),
    runs: new UnfencedRuns({ store: new MemoryUnfencedRunConsentStore(), clock }),
  });
  const starts = new TrustedRunnerStart({
    workspace: new FileSystemFolderReader(acme),
    digest: webCryptoDigest,
    gate,
  });
  const started: Sandbox[] = [];
  const startIn = async (picked: Sandbox): Promise<GatedRunner> => {
    started.push(picked);
    throw new Error("This test starts no runner.");
  };
  return { starts, started, startIn };
}

async function refusal(promise: Promise<unknown>): Promise<IntegrationNotTrustedError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(IntegrationNotTrustedError);
  return error as IntegrationNotTrustedError;
}

verifies("cli.local-integrations", () => {
  describe("workspaceIntegrations", () => {
    it("reads every folder under integrations/ with an integration.yaml, hashed as a runner start hashes it", async () => {
      await addStation();
      await putFiles({
        "integrations/notes/README.md": "Not an integration yet.\n",
        "integrations/README.md": "One folder per integration.\n",
      });
      const integrations = await workspaceIntegrations(acme, "./acme");
      const station = await readIntegrationFolder(
        new FileSystemFolderReader(acme),
        webCryptoDigest,
        "integrations/station",
      );
      if (!station.ok) throw new Error("The station folder reads");
      expect(integrations).toEqual([
        {
          sheet: station.value.sheet,
          settings: {},
          folder: "integrations/station",
          code: station.value.code,
        },
      ]);
    });

    it("leaves out a folder with a link in it, and a second folder with an id already read", async () => {
      await addStation();
      await putFiles({
        "integrations/linked/integration.yaml": stationSheet.replace("id: station", "id: linked"),
        "integrations/station-copy/integration.yaml": stationSheet,
      });
      await symlink(join(acme, "library"), join(acme, "integrations/linked/data"), folderLinkType);
      const integrations = await workspaceIntegrations(acme, "./acme");
      expect(integrations.map((integration) => integration.folder)).toEqual([
        "integrations/station",
      ]);
    });

    it("leaves out a folder whose files can't be read, and still reads the others", async () => {
      const workspace = new MemoryFolderReader();
      for (const id of ["broken", "station"]) {
        workspace.putFile(
          `integrations/${id}/integration.yaml`,
          stationSheet.replace("id: station", `id: ${id}`),
        );
        workspace.putFile(`integrations/${id}/src/index.js`, "export default {};\n");
      }
      const read = workspace.read.bind(workspace);
      workspace.read = async (path) => {
        if (path.startsWith("integrations/broken/src/")) throw new Error("The disk failed.");
        return await read(path);
      };
      const integrations = await readLocalIntegrations(workspace, webCryptoDigest);
      expect(integrations.map((integration) => integration.folder)).toEqual([
        "integrations/station",
      ]);
    });

    // Windows allows no backslash in a file name.
    it.skipIf(process.platform === "win32")(
      "[platform:win32] allows no backslash in a file name: leaves out a folder with a backslash in its name, and still reads the others",
      async () => {
        await addStation();
        await putFiles({
          "integrations/back\\slash/integration.yaml": stationSheet.replace(
            "id: station",
            "id: back",
          ),
        });
        const integrations = await workspaceIntegrations(acme, "./acme");
        expect(integrations.map((integration) => integration.folder)).toEqual([
          "integrations/station",
        ]);
      },
    );

    it("reads none when the integrations folder is itself a link", async () => {
      const elsewhere = join(folder, "elsewhere");
      await mkdir(join(elsewhere, "station"), { recursive: true });
      await writeFile(join(elsewhere, "station/integration.yaml"), stationSheet);
      await symlink(elsewhere, join(acme, "integrations"), folderLinkType);
      expect(await workspaceIntegrations(acme, "./acme")).toEqual([]);
    });

    it("reads none in a workspace without an integrations folder", async () => {
      expect(await workspaceIntegrations(acme, "./acme")).toEqual([]);
    });
  });

  describe("the trust check", () => {
    it("lists a local integration's setting as not set, as the workspace holds no settings yet", async () => {
      await addStation();
      const check = await (await acmeTrust()).check();
      const lines = trustCheckLines(check, { name: "Acme", folder: "./acme" }).map(plainText);
      expect(lines).toContain("  station       station_url   not set");
    });

    it("shows code changed when a file of a trusted integration changed, and its runner doesn't start", async () => {
      await addStation();
      const { check, trust } = await acmeTrust();
      await trust();
      await putFiles({ "integrations/station/src/index.js": "export default { changed: 1 };\n" });

      const changed = await check();
      expect(changed.status).toBe("changed");
      const lines = trustCheckLines(changed, { name: "Acme", folder: "./acme" }).map(plainText);
      expect(lines.slice(0, 5)).toEqual([
        "What changed in Acme since you trusted it on 11 Nov",
        "1 changed address since you trusted this on 11 Nov.",
        "",
        "Addresses",
        "  station       code changed   Changed",
      ]);

      // Even with the record from before the change, the start hashes the folder again.
      const { starts, started, startIn } = runnerStarts();
      await putFiles({ "integrations/station/src/index.js": "export default {};\n" });
      const trusted = await check();
      expect(trusted.status).toBe("trusted");
      await putFiles({ "integrations/station/src/index.js": "export default { changed: 2 };\n" });
      const error = await refusal(
        starts.start({ trust: trusted, folder: "integrations/station", settings: {} }, startIn),
      );
      expect(error.reason).toBe("code-changed");
      expect(started).toEqual([]);
    });
  });

  describe("the 8a lock-in", () => {
    it("refuses to run an untrusted workspace with one local integration with exit code 3, and starts no runner", async () => {
      await addStation();
      const io = captureIo(acme);
      const profile = {
        ...nodeProfileEnvironment(),
        variables: { HALONIC_HOME: join(folder, "home") },
      };
      const run = runCommandWith(testRunSetup(folder, profile));
      const args = ["run", "support-reply", "--input", "examples/refund-question.json"];

      // Without the integration, Acme reaches only the test model and runs without trust.
      expect(await runCli(args, io, [run])).toBe(exitCode.notTrusted);
      expect([...io.stdout, ...io.stderr].join("\n")).toContain("station_url");

      const { starts, started, startIn } = runnerStarts();
      const check = await (await acmeTrust()).check();
      expect(check.status).toBe("new");
      const error = await refusal(
        starts.start({ trust: check, folder: "integrations/station", settings: {} }, startIn),
      );
      expect(error.reason).toBe("workspace-not-trusted");
      expect(started).toEqual([]);
    });
  });
});
