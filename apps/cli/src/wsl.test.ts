import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isWslKernel, windowsDriveOf } from "./wsl.ts";

verifies("cli.doctor-windows-drive", () => {
  it("knows WSL by the Microsoft kernel in /proc/version", () => {
    expect(
      isWslKernel("Linux version 6.6.87.2-microsoft-standard-WSL2 (root@4d6c5bd8a0a5) #1 SMP"),
    ).toBe(true);
    expect(isWslKernel("Linux version 4.4.0-19041-Microsoft (Microsoft@Microsoft.com)")).toBe(true);
    expect(isWslKernel("Linux version 6.8.0-45-generic (buildd@lcy02-amd64-115) #45-Ubuntu")).toBe(
      false,
    );
  });

  it("finds the Windows drive WSL mounts under /mnt", () => {
    const onDriveC = "/mnt/c/work/acme"; // leak-guard: allow absolute-path an example WSL drive
    expect(windowsDriveOf(onDriveC)).toBe("/mnt/c");
    expect(windowsDriveOf("/mnt/D/work")).toBe("/mnt/D");
    expect(windowsDriveOf("/mnt/c")).toBe("/mnt/c");
  });

  it("finds none in Linux's own files, or in a folder under /mnt that isn't a drive", () => {
    expect(windowsDriveOf("/srv/acme")).toBeNull();
    expect(windowsDriveOf("/mnt/wslg/runtime")).toBeNull();
    expect(windowsDriveOf("/srv/mnt/c/acme")).toBeNull();
  });
});
