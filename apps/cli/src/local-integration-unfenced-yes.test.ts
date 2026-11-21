import { mkdir, mkdtemp, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { FileUnfencedRunConsentStore, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import type { GatedRunner } from "@halonicjs/app";
import type { Sandbox, SandboxCheck } from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder, unfencedRunsFolder } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computerIntegrationMachine, computerPluginMachine } from "./local-integration-machine.ts";
import { type Phrase, plainText } from "./messages/phrase.ts";
import { SavedUnfencedYes } from "./saved-unfenced-yes.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { profilePlatformOf } from "./workspace-runs.ts";

const onWindows = process.platform === "win32";

let base: string;
let dir: OpenWorkspaceDir;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "halonic-cli-unfenced-yes-")));
  const root = join(base, "acme");
  await mkdir(join(root, "integrations", "notes"), { recursive: true });
  await writeFile(join(root, "integrations", "notes", "integration.yaml"), "id: notes\n");
  dir = { root, shown: "./acme", name: "acme", store: new FolderDefinitionStore(root, "./acme") };
});

afterEach(async () => {
  vi.useRealTimers();
  await removeTestFolder(base);
});

const environment = (): ProfileEnvironment => ({
  platform: profilePlatformOf(process.platform),
  homeFolder: join(base, "home"),
  variables: { HALONIC_HOME: join(base, "profile") },
});

/** The folder the agent host writes the yes to, for the same profile. */
const hostFolder = () => unfencedRunsFolder(profileFolder(environment()));

/** A sandbox that only checks; the starts below are faked, so nothing opens. */
function checking(check: SandboxCheck): Sandbox {
  return {
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: "os" }),
    open: async () => {
      throw new Error("the fake start never opens a session");
    },
  };
}

const inContainer = checking({ ok: false, reason: "container", missing: [] });
const passes = checking({ ok: true, reason: null, missing: [] });
const launcher = checking({ ok: true, reason: null, missing: [] });

const trust = () => ({
  trustStore: new MemoryTrustStore(),
  clock: fixedClock(Date.UTC(2026, 10, 21)),
  commandSearch: { path: undefined, endings: [] },
});

async function machine(fenced: Sandbox = inContainer, warnings: Phrase[] = []) {
  return computerIntegrationMachine({
    testFencedSandbox: fenced,
    testLauncher: launcher,
    dir,
    workspace: await loadWorkspace(dir.store),
    trust: trust(),
    environment: environment(),
    lines: { warn: (line) => warnings.push(line), debug: () => undefined },
  });
}

/** A start that counts runners by the sandbox they got; each one stops when closed. */
function counting() {
  const seen = { inLauncher: 0, elsewhere: 0, closed: 0 };
  const startIn = async (sandbox: Sandbox): Promise<GatedRunner> => {
    if (sandbox === launcher) seen.inLauncher += 1;
    else seen.elsewhere += 1;
    let stop = () => {};
    const stopped = new Promise<void>((resolve) => {
      stop = resolve;
    });
    return {
      fence: { state: sandbox === launcher ? "off" : "fenced" },
      stopped,
      close: async () => {
        seen.closed += 1;
        stop();
      },
    };
  };
  return { seen, startIn };
}

/** The yes Studio's agent host would save, in its own folder of this profile. */
async function hostSaves(reason: string): Promise<void> {
  await new FileUnfencedRunConsentStore(hostFolder()).save({
    reason,
    allowedAt: "2026-11-09T10:00:00.000Z",
  });
}

/** Every file in the folder with what it holds and when it last changed, to see that nothing wrote. */
async function folderNow(folder: string): Promise<string[]> {
  const names = (await readdir(folder)).sort();
  return await Promise.all(
    names.map(async (name) => {
      const file = join(folder, name);
      return `${name} ${(await stat(file)).mtimeMs} ${await readFile(file, "utf8")}`;
    }),
  );
}

verifies("cli.local-integration-unfenced-yes", () => {
  describe("a local integration where the sandbox can't start", () => {
    it("reads the yes from the folder the agent host writes", () => {
      expect(new SavedUnfencedYes(hostFolder()).file).toBe(
        new FileUnfencedRunConsentStore(hostFolder()).file,
      );
    });

    it("starts once in the launcher's sandbox with a yes for this reason, and warns once", async () => {
      const warnings: Phrase[] = [];
      const computer = await machine(inContainer, warnings);
      const { reason } = await asksFirst(computer);
      await hostSaves(reason);
      const { seen, startIn } = counting();

      const started = await computer.gate.start(startIn);
      expect(started.run).toBe("unfenced");
      expect(seen).toEqual({ inLauncher: 1, elsewhere: 0, closed: 0 });
      computer.startedUnfenced?.(reason);
      computer.startedUnfenced?.(reason);
      expect(warnings.map(plainText)).toEqual([
        "! Integration code runs without the sandbox on this computer, so it may be able to use your files, programs and sign-ins, and reach other addresses.",
        // The reason this platform gives: "container" here, "windows" on Windows.
        expect.stringMatching(
          reason === "windows" ? /^ {2}On Windows, .*WSL 2.*\.$/ : /^ {2}\S.*container.*\S$/,
        ),
        expect.stringMatching(
          new RegExp(
            `^ {2}More: https://docs\\.halonic\\.dev/security/sandbox/.* \\(${reason}\\)$`,
          ),
        ),
      ]);
      if (started.run === "unfenced") await started.runner.close();
      await computer.dispose();
    });

    it("starts nothing with a yes for another reason, or with none", async () => {
      const computer = await machine();
      const { seen, startIn } = counting();
      const { reason } = await asksFirst(computer);
      expect(await computer.gate.start(startIn)).toEqual({ run: "needs-yes", reason });
      await hostSaves(reason === "windows" ? "container" : "windows");
      expect(await computer.gate.start(startIn)).toEqual({ run: "needs-yes", reason });
      expect(seen).toEqual({ inLauncher: 0, elsewhere: 0, closed: 0 });
      await computer.dispose();
    });

    it("starts nothing when the saved yes can't be read, and names its file", async () => {
      const computer = await machine();
      const { reason } = await asksFirst(computer);
      const { seen, startIn } = counting();
      const saved = new SavedUnfencedYes(hostFolder());
      for (const broken of [
        "{ not json",
        JSON.stringify({ reason, allowedAt: "2026-11-09T10:00:00.000Z", more: true }),
        JSON.stringify({ reason, allowedAt: "not a date" }),
      ]) {
        await mkdir(hostFolder(), { recursive: true });
        await writeFile(saved.file, broken);
        expect(await computer.gate.start(startIn)).toEqual({ run: "needs-yes", reason });
        expect(computer.unreadableYes?.()).toBe(saved.file);
      }
      expect(seen).toEqual({ inLauncher: 0, elsewhere: 0, closed: 0 });
      await computer.dispose();
    });

    it("stops a running integration at the next check once Studio takes the yes back", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const computer = await machine();
      const { reason } = await asksFirst(computer);
      await hostSaves(reason);
      const { seen, startIn } = counting();
      expect((await computer.gate.start(startIn)).run).toBe("unfenced");

      await new FileUnfencedRunConsentStore(hostFolder()).remove();
      await vi.advanceTimersByTimeAsync(1000);
      await vi.waitFor(() => expect(seen.closed).toBe(1));
      await computer.dispose();
    });
  });

  describe("what the command writes to the yes's folder", () => {
    it("never gives a yes: a save throws and the file stays as it was", async () => {
      await hostSaves("container");
      const before = await folderNow(hostFolder());
      const saved = new SavedUnfencedYes(hostFolder());
      await expect(
        saved.save({ reason: "windows", allowedAt: "2026-11-21T10:00:00.000Z" }),
      ).rejects.toThrow(/never saves a yes/);
      expect(await folderNow(hostFolder())).toEqual(before);
    });

    it("leaves the folder as it was through every start and status where the sandbox can't start", async () => {
      const computer = await machine();
      const plugins = computerPluginMachine(computer, {
        trust: trust(),
        environment: environment(),
      });
      const { reason } = await asksFirst(computer);
      const { startIn } = counting();
      await hostSaves(reason);
      const before = await folderNow(hostFolder());

      const started = await computer.gate.start(startIn);
      if (started.run === "unfenced") await started.runner.close();
      await computer.gate.status();
      await plugins.gate.start(startIn);
      await plugins.gate.status();
      expect(await folderNow(hostFolder())).toEqual(before);
      await computer.dispose();
    });

    it("only removes the yes once the computer passes the sandbox check, as every host does", async () => {
      const computer = await machine(passes);
      await hostSaves("container");
      // On Windows integration code never runs in the sandbox in this version, so no check
      // passes there and the yes stays.
      expect(await computer.gate.status()).toEqual(
        onWindows ? { run: "needs-yes", reason: "windows" } : { run: "fenced" },
      );
      expect(await readdir(hostFolder())).toEqual(
        onWindows ? [basename(new FileUnfencedRunConsentStore(hostFolder()).file)] : [],
      );
      await computer.dispose();
    });
  });
});

/** The reason a start needs the yes for on this platform, read before any yes is saved. */
async function asksFirst(computer: Awaited<ReturnType<typeof machine>>) {
  const status = await computer.gate.status();
  if (status.run !== "needs-yes") throw new Error(`expected needs-yes, got ${status.run}`);
  return status;
}
