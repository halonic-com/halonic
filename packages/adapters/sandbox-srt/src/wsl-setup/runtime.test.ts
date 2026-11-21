import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type FakeWsl, fakeWsl } from "./fake-wsl-host.test-helper.ts";
import { currentRuntime } from "./runtime.ts";
import { WslSetup } from "./setup.ts";
import { HALONIC_DISTRO, memoryWslSetupStore, type WslSetupState } from "./state.ts";

const runtime = {
  version: "0.1.0+0123456789ab",
  sha256: "ab".repeat(32),
  archive: "runtime.tar.gz",
};
const location = "%LOCALAPPDATA%\\Halonic\\wsl";

function setupOn(fake: FakeWsl, saved: WslSetupState = { step: "not-started" }) {
  const store = memoryWslSetupStore(saved);
  const setup = new WslSetup({
    host: fake.host,
    store,
    location,
    rootfs: "image.tar.gz",
    resumeCommand: '"Halonic.exe" --resume-sandbox-setup',
    runtime,
  });
  return { setup, store };
}

/** WSL installed, with Halonic's own import of the distro registered. */
function imported(): { fake: FakeWsl; saved: WslSetupState } {
  const fake = fakeWsl();
  fake.machine.installed = true;
  fake.distros.push({ name: HALONIC_DISTRO, state: "Stopped", version: 2, isDefault: false });
  return { fake, saved: { step: "done", importedDistro: { name: HALONIC_DISTRO, location } } };
}

const runtimeInstalls = (fake: FakeWsl) =>
  fake.calls.filter((call) => call.startsWith("install runtime"));
const imports = (fake: FakeWsl) => fake.calls.filter((call) => call.startsWith("wsl --import"));

verifies("sandbox-srt.wsl-runtime", () => {
  describe("the installing-runtime step", () => {
    it("installs the shipped runtime on a fresh setup, after the distro passed its check", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      const { setup, store } = setupOn(fake);

      expect(await setup.run()).toEqual({ outcome: "done", residuals: ["default-distro"] });
      expect(runtimeInstalls(fake)).toEqual([
        `install runtime ${runtime.version} ${runtime.sha256} ${runtime.archive}`,
      ]);
      expect(fake.calls.indexOf("in distro: uname -r")).toBeLessThan(
        fake.calls.indexOf(runtimeInstalls(fake)[0] ?? ""),
      );
      expect(fake.machine.runtime).toBe(runtime.version);
      expect((await store.load()).step).toBe("done");
    });

    it("repairs a distro without a runtime and never imports it again", async () => {
      const { fake, saved } = imported();
      const { setup } = setupOn(fake, saved);

      expect(await setup.run()).toEqual({ outcome: "done", residuals: [] });
      expect(runtimeInstalls(fake)).toHaveLength(1);
      expect(imports(fake)).toHaveLength(0);
    });

    it("changes nothing when the shipped version is already current", async () => {
      const { fake, saved } = imported();
      fake.machine.runtime = runtime.version;

      expect(await setupOn(fake, saved).setup.run()).toMatchObject({ outcome: "done" });
      expect(runtimeInstalls(fake)).toHaveLength(0);
    });

    it("replaces a runtime of another version", async () => {
      const { fake, saved } = imported();
      fake.machine.runtime = "0.0.9+aaaaaaaaaaaa";

      expect(await setupOn(fake, saved).setup.run()).toMatchObject({ outcome: "done" });
      expect(fake.machine.runtime).toBe(runtime.version);
    });

    it.each([
      [3, "a sandbox session runs"],
      [8, "another install holds the updater's lock"],
    ])("ends runtime-busy on exit %s (%s), and finishes on the next run", async (code) => {
      const { fake, saved } = imported();
      fake.machine.runtimeInstallCode = code;
      const { setup, store } = setupOn(fake, saved);

      expect(await setup.run()).toMatchObject({
        outcome: "failed",
        code: "runtime-busy",
        reason: "other",
      });
      expect((await store.load()).step).toBe("installing-runtime");
      fake.machine.runtimeInstallCode = 0;
      expect(await setup.run()).toMatchObject({ outcome: "done" });
      expect(imports(fake)).toHaveLength(0);
    });

    it.each([4, 5, 1, null])(
      "ends runtime-install-failed when the updater ends with %s",
      async (code) => {
        const { fake, saved } = imported();
        fake.host.installRuntime = async () => ({ code, output: "refused\nmore" });

        expect(await setupOn(fake, saved).setup.run()).toEqual({
          outcome: "failed",
          code: "runtime-install-failed",
          reason: "other",
          detail: `exit ${code}: refused`,
        });
      },
    );

    it("counts exit 2 as done when another run made the version current", async () => {
      const { fake, saved } = imported();
      fake.host.installRuntime = async () => {
        fake.machine.runtime = runtime.version;
        return { code: 2, output: "already the current version" };
      };

      expect(await setupOn(fake, saved).setup.run()).toMatchObject({ outcome: "done" });
    });

    it("doesn't send the runtime into a distro that won't start", async () => {
      const { fake, saved } = imported();
      fake.machine.distroStarts = false;

      expect(await setupOn(fake, saved).setup.run()).toMatchObject({ code: "distro-wont-start" });
      expect(runtimeInstalls(fake)).toHaveLength(0);
    });
  });

  describe("currentRuntime", () => {
    it("reads the current version from the updater's status", () => {
      expect(currentRuntime('{"current":"1.2.0","previous":"1.0.0","securityUpdated":""}\n')).toBe(
        "1.2.0",
      );
    });

    it.each([
      '{"current":"","previous":""}',
      '{"previous":"1.0.0"}',
      '{"current":1}',
      "null",
      "not json",
      "",
    ])("finds none in %j", (output) => {
      expect(currentRuntime(output)).toBeNull();
    });
  });
});
