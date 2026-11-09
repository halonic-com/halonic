import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { freeDisk } from "./free-disk.ts";
import { removeTempFolders, tempFolder, writeSizedFile } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

verifies("system-node.resource-probe", () => {
  it("reads the drive of the nearest existing parent for a path where nothing is yet", async () => {
    const root = await tempFolder();
    const free = await freeDisk(root);
    expect(free).toBeGreaterThan(0);
    const later = await freeDisk(join(root, "a", "b", "c"));
    // Other programs write to the same drive meanwhile, so only the drive is compared.
    expect(Math.abs(later - free)).toBeLessThan(1024 ** 3);
  });

  it("goes up past a file in the path", async () => {
    const root = await tempFolder();
    await writeSizedFile(join(root, "file"), 1);
    expect(await freeDisk(join(root, "file", "below"))).toBeGreaterThan(0);
  });
});
