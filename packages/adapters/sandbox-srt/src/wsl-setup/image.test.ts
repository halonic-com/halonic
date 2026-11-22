import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type FakeWsl, fakeWsl } from "./fake-wsl-host.test-helper.ts";
import { imageVersion, WSL_IMAGE_MIN } from "./runtime.ts";
import { WslSetup } from "./setup.ts";
import { HALONIC_DISTRO, memoryWslSetupStore } from "./state.ts";

// A distro Halonic imported, with Studio's runtime current and another distro the default.
function importedDistro(image: string) {
  const fake = fakeWsl();
  fake.machine.installed = true;
  fake.machine.runtime = "0.1.0+0123456789ab";
  fake.machine.image = image;
  fake.distros.push(
    { name: HALONIC_DISTRO, state: "Stopped", version: 2, isDefault: false },
    { name: "Ubuntu", state: "Stopped", version: 2, isDefault: true },
  );
  return fake;
}

function setupOn(fake: FakeWsl, minImage?: number) {
  return new WslSetup({
    host: fake.host,
    store: memoryWslSetupStore({
      step: "done",
      importedDistro: { name: HALONIC_DISTRO, location: "%LOCALAPPDATA%\\Halonic\\wsl" },
    }),
    location: "%LOCALAPPDATA%\\Halonic\\wsl",
    rootfs: "image.tar.gz",
    resumeCommand: '"Halonic.exe" --resume-sandbox-setup',
    runtime: { version: "0.1.0+0123456789ab", sha256: "ab".repeat(32), archive: "runtime.tar.gz" },
    ...(minImage === undefined ? {} : { minImage }),
  });
}

const imports = (fake: FakeWsl) => fake.calls.filter((call) => call.startsWith("wsl --import"));
const unregisters = (fake: FakeWsl) => fake.calls.filter((call) => call.includes("--unregister"));

verifies("sandbox-srt.wsl-setup", () => {
  describe("the image version (HAL-15161)", () => {
    it("reports nothing when the distro's image is new enough", async () => {
      const fake = importedDistro("3");

      expect(await setupOn(fake, 3).run()).toEqual({ outcome: "done", residuals: [] });
    });

    it("reports an older image as image-outdated and keeps the distro", async () => {
      const fake = importedDistro("2");

      expect(await setupOn(fake, 3).run()).toEqual({
        outcome: "done",
        residuals: ["image-outdated"],
      });
      expect(imports(fake)).toHaveLength(0);
      expect(unregisters(fake)).toHaveLength(0);
    });

    it("counts an image from before the version as image 0", async () => {
      const fake = importedDistro("");

      expect(await setupOn(fake).run()).toEqual({ outcome: "done", residuals: ["image-outdated"] });
    });

    it("asks for no image newer than the one the repo builds", () => {
      const built = readFileSync(
        new URL("../../../../../infra/wsl-image/image-version", import.meta.url),
        "utf8",
      );

      expect(WSL_IMAGE_MIN).toBeLessThanOrEqual(Number(built.trim()));
    });
  });

  describe("imageVersion", () => {
    it("reads the image version from the updater's status", () => {
      expect(
        imageVersion('{"current":"1.2.0","previous":"","securityUpdated":"","image":"12"}\n'),
      ).toBe(12);
    });

    it.each([
      '{"current":"1.2.0","previous":"","securityUpdated":""}',
      '{"image":""}',
      '{"image":2}',
      '{"image":"2.1"}',
      '{"image":"-1"}',
      "null",
      "not json",
    ])("counts %j as image 0", (output) => {
      expect(imageVersion(output)).toBe(0);
    });
  });
});
