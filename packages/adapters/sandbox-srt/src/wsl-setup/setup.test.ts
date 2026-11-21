import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type FakeWsl, fakeWsl } from "./fake-wsl-host.test-helper.ts";
import { WslSetup } from "./setup.ts";
import { memoryWslSetupStore } from "./state.ts";

function setupOn(fake: FakeWsl, store = memoryWslSetupStore()) {
  const setup = new WslSetup({
    host: fake.host,
    store,
    location: "%LOCALAPPDATA%\\Halonic\\wsl",
    rootfs: "image.tar.gz",
    resumeCommand: '"Halonic.exe" --resume-sandbox-setup',
    runtime: { version: "0.1.0+0123456789ab", sha256: "ab".repeat(32), archive: "runtime.tar.gz" },
  });
  return { setup, store };
}

const imports = (fake: FakeWsl) => fake.calls.filter((call) => call.startsWith("wsl --import"));
const installs = (fake: FakeWsl) => fake.calls.filter((call) => call.startsWith("wsl --install"));

verifies("sandbox-srt.wsl-setup", () => {
  describe("WslSetup", () => {
    it("installs WSL once, waits for the restart, then imports and finishes", async () => {
      const fake = fakeWsl();
      const { setup, store } = setupOn(fake);

      expect(await setup.run()).toEqual({ outcome: "restart-needed" });
      expect((await store.load()).step).toBe("restart-needed");
      expect(fake.runOnce).toContain("--resume-sandbox-setup");
      expect(await setup.run()).toEqual({ outcome: "restart-needed" });
      expect(installs(fake)).toHaveLength(1);

      fake.machine.bootedAt = "boot-2";
      expect(await setup.run()).toEqual({ outcome: "done", residuals: ["default-distro"] });
      expect(imports(fake)).toHaveLength(1);
      expect(fake.runOnce).toBeNull();
      expect((await store.load()).step).toBe("done");
    });

    it("sets the RunOnce key before the administrator prompt", async () => {
      const fake = fakeWsl();
      await setupOn(fake).setup.run();

      expect(fake.calls.indexOf("set RunOnce")).toBeLessThan(
        fake.calls.indexOf("wsl --install --no-distribution --web-download"),
      );
    });

    it("skips the install and the restart when WSL is there and the install needs none", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      const { setup } = setupOn(fake);

      expect(await setup.run()).toMatchObject({ outcome: "done" });
      expect(installs(fake)).toHaveLength(0);
    });

    it("ends cancelled and not-started when the administrator prompt is turned down", async () => {
      const fake = fakeWsl();
      fake.machine.cancel = true;
      const { setup, store } = setupOn(fake);

      expect(await setup.run()).toEqual({ outcome: "cancelled" });
      expect((await store.load()).step).toBe("not-started");
      expect(fake.runOnce).toBeNull();
    });

    it.each([
      [
        "not-supported",
        (f: FakeWsl) => {
          f.machine.build = 18363;
        },
      ],
      [
        "blocked-by-policy",
        (f: FakeWsl) => {
          f.machine.policy = { allowWsl: 0 };
        },
      ],
      [
        "virtualisation-off",
        (f: FakeWsl) => {
          f.machine.installed = true;
          f.machine.virtualisationOff = true;
        },
      ],
    ])("is blocked with %s and installs and imports nothing", async (reason, arrange) => {
      const fake = fakeWsl();
      arrange(fake);
      const { setup } = setupOn(fake);

      expect(await setup.run()).toMatchObject({ outcome: "blocked", reason });
      expect(installs(fake)).toHaveLength(0);
      expect(imports(fake)).toHaveLength(0);
    });

    it("is blocked with virtualisation-off when the install says so, and clears RunOnce", async () => {
      const fake = fakeWsl();
      fake.machine.virtualisationOff = true;
      const { setup, store } = setupOn(fake);

      // wsl --status says "not installed" first, so the install runs and fails on 0x80370102.
      const result = await setup.run();

      expect(result).toMatchObject({ outcome: "blocked", reason: "virtualisation-off" });
      expect(fake.runOnce).toBeNull();
      expect((await store.load()).step).toBe("not-started");
    });

    it("fails with wsl-install-failed on another install error", async () => {
      const fake = fakeWsl();
      fake.machine.installCode = 5;
      const { setup } = setupOn(fake);

      expect(await setup.run()).toMatchObject({ outcome: "failed", code: "wsl-install-failed" });
      expect(fake.runOnce).toBeNull();
    });

    it("fails with import-failed when wsl --import ends with an error", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      fake.machine.importCode = 1;

      expect(await setupOn(fake).setup.run()).toMatchObject({
        outcome: "failed",
        code: "import-failed",
      });
    });

    it("W8: refuses a halonic distro it didn't import and never runs wsl --import", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      fake.distros.push({ name: "halonic", state: "Stopped", version: 2, isDefault: false });
      const { setup } = setupOn(fake);

      expect(await setup.run()).toMatchObject({ outcome: "failed", code: "distro-not-ours" });
      expect(imports(fake)).toHaveLength(0);
      expect(fake.distros).toHaveLength(1);
    });

    it("W8: runs again over its own recorded import without importing twice", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      const { setup } = setupOn(fake);
      await setup.run();

      expect(await setup.run()).toMatchObject({ outcome: "done" });
      expect(imports(fake)).toHaveLength(1);
    });

    it("W11: fails below the kernel floor with the fix wsl --update, and passes after it", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      fake.machine.kernel = "5.10.16.3-microsoft-standard-WSL2";
      const { setup } = setupOn(fake);

      expect(await setup.run()).toMatchObject({
        outcome: "failed",
        code: "kernel-too-old",
        fix: "update-wsl",
      });
      expect(await setup.updateWsl()).toEqual({ done: true, cancelled: false });
      expect(await setup.run()).toMatchObject({ outcome: "done" });
    });

    it("W11: fails closed when no kernel version can be read", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      fake.machine.kernel = "unknown";

      expect(await setupOn(fake).setup.run()).toMatchObject({
        outcome: "failed",
        code: "kernel-unreadable",
      });
    });

    it("W11: reads the kernel inside the distro, whatever language wsl.exe speaks", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;

      expect(await setupOn(fake).setup.run()).toMatchObject({ outcome: "done" });
      expect(fake.calls).toContain("in distro: uname -r");
      expect(
        fake.calls.some((call) => call.includes("--version") && !call.includes("--import")),
      ).toBe(false);
    });

    it("carries on after the restart when Windows' start time can't be read", async () => {
      const fake = fakeWsl();
      fake.machine.bootedAt = "";

      expect(await setupOn(fake).setup.run()).toMatchObject({ outcome: "done" });
      expect(installs(fake)).toHaveLength(1);
    });

    it("W6: reports the default distro and Docker Desktop's socket and folders", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      fake.machine.dockerSocket = true;

      expect(await setupOn(fake).setup.run()).toEqual({
        outcome: "done",
        residuals: ["default-distro", "docker-desktop-visible"],
      });

      const folder = fakeWsl();
      folder.machine.installed = true;
      folder.machine.wslFolder = "docker-desktop\ndocker-desktop-bind-mounts\n";
      expect(await setupOn(folder).setup.run()).toMatchObject({
        residuals: expect.arrayContaining(["docker-desktop-visible"]),
      });
    });

    it("W6: reports no residual when another distro is the default and Docker is out of sight", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      fake.distros.push({ name: "Ubuntu", state: "Stopped", version: 2, isDefault: true });

      expect(await setupOn(fake).setup.run()).toEqual({ outcome: "done", residuals: [] });
    });

    it("fails with distro-wont-start when nothing starts in the distro", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      fake.machine.distroStarts = false;

      expect(await setupOn(fake).setup.run()).toMatchObject({
        outcome: "failed",
        code: "distro-wont-start",
      });
    });

    it("never touches .wslconfig", async () => {
      const fake = fakeWsl();
      await setupOn(fake).setup.run();
      fake.machine.bootedAt = "boot-2";
      await setupOn(fake).setup.run();

      expect(fake.calls.join("\n").toLowerCase()).not.toContain("wslconfig");
      expect(Object.keys(fake.host).join(" ").toLowerCase()).not.toContain("config");
    });
  });
});
