import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { kernelAtLeast, kernelOf, parseKernelVersion } from "./detect.ts";
import { decodeWslOutput, parseDistroList, parseRegDword } from "./system-host.ts";

verifies("sandbox-srt.wsl-setup", () => {
  describe("reading wsl.exe's text", () => {
    it("reads a kernel version and compares it part by part", () => {
      expect(parseKernelVersion("5.15.153.1-2")).toEqual([5, 15, 153, 1]);
      expect(parseKernelVersion("none")).toBeNull();
      expect(kernelAtLeast([5, 15, 153, 1], [5, 15, 153, 1])).toBe(true);
      expect(kernelAtLeast([5, 15, 90], [5, 15, 153, 1])).toBe(false);
      expect(kernelAtLeast([6, 0, 0], [5, 15, 153, 1])).toBe(true);
      expect(kernelOf({ code: 1, output: "6.6.1" })).toBeNull();
      expect(kernelOf({ code: 0, output: "5.15.153.1-microsoft-standard-WSL2\n" })).toEqual([
        5, 15, 153, 1,
      ]);
    });

    it("decodes UTF-16 output with NULs", () => {
      expect(decodeWslOutput(Buffer.from("\uFEFFhalonic  Running  2", "utf16le"))).toBe(
        "halonic  Running  2",
      );
      expect(decodeWslOutput(Buffer.from("plain"))).toBe("plain");
    });

    it("parses the distro list and a policy value", () => {
      const list =
        "  NAME      STATE           VERSION\n* Ubuntu    Running         2\n  halonic   Stopped         2\n";
      expect(parseDistroList(list)).toEqual([
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
        { name: "halonic", state: "Stopped", version: 2, isDefault: false },
      ]);
      expect(parseRegDword("    AllowWSL    REG_DWORD    0x0")).toBe(0);
      expect(parseRegDword("nothing")).toBeUndefined();
    });
  });
});
