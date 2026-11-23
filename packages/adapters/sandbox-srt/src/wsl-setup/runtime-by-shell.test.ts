import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type FakeWsl, fakeWsl } from "./fake-wsl-host.test-helper.ts";
import { WslSetup } from "./setup.ts";
import { HALONIC_DISTRO, memoryWslSetupStore, type WslSetupState } from "./state.ts";

const location = "%LOCALAPPDATA%\\Halonic\\wsl";

function setupLeftToShell(fake: FakeWsl, saved?: WslSetupState) {
  return new WslSetup({
    host: fake.host,
    store: memoryWslSetupStore(saved),
    location,
    rootfs: "image.tar.gz",
    resumeCommand: '"Halonic.exe"',
    runtime: "left-to-shell",
  });
}

const runtimeInstalls = (fake: FakeWsl) =>
  fake.calls.filter((call) => call.startsWith("install runtime"));
const imports = (fake: FakeWsl) => fake.calls.filter((call) => call.startsWith("wsl --import"));

verifies("sandbox-srt.wsl-runtime-by-shell", () => {
  describe("the installing-runtime step left to the shell", () => {
    it("imports and checks the distro, installs no runtime, and says the shell does it", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;

      expect(await setupLeftToShell(fake).run()).toEqual({
        outcome: "done",
        residuals: ["default-distro"],
        runtime: "left-to-shell",
      });
      expect(imports(fake)).toHaveLength(1);
      expect(runtimeInstalls(fake)).toEqual([]);
      expect(fake.machine.runtime).toBeNull();
      expect(fake.runOnce).toBeNull();
    });

    it("runs again over its own import without importing or installing anything", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      fake.distros.push({ name: HALONIC_DISTRO, state: "Stopped", version: 2, isDefault: false });
      const saved: WslSetupState = {
        step: "done",
        importedDistro: { name: HALONIC_DISTRO, location },
      };

      expect(await setupLeftToShell(fake, saved).run()).toEqual({
        outcome: "done",
        residuals: [],
        runtime: "left-to-shell",
      });
      expect(imports(fake)).toEqual([]);
      expect(runtimeInstalls(fake)).toEqual([]);
    });

    it("still reports an image older than the lowest Studio works with", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      fake.machine.image = "";

      expect(await setupLeftToShell(fake).run()).toMatchObject({
        outcome: "done",
        residuals: expect.arrayContaining(["image-outdated"]),
        runtime: "left-to-shell",
      });
    });

    it("leaves runtime out of the result when the setup installs the runtime itself", async () => {
      const fake = fakeWsl();
      fake.machine.installed = true;
      const setup = new WslSetup({
        host: fake.host,
        store: memoryWslSetupStore(),
        location,
        rootfs: "image.tar.gz",
        resumeCommand: '"Halonic.exe"',
        runtime: { version: "0.1.0+0123456789ab", sha256: "ab".repeat(32), archive: "rt.tar.gz" },
      });

      const result = await setup.run();
      expect(result).toMatchObject({ outcome: "done" });
      expect(result).not.toHaveProperty("runtime");
    });
  });
});
