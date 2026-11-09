import { resourceProbeContract } from "@halonicjs/testing-contracts";
import { afterAll } from "vitest";
import { NodeResourceProbe } from "./resource-probe.ts";
import { removeTempFolders, tempFolder, writeSizedFile } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

// The real machine: this test process is the engine, and the folders are real folders.
resourceProbeContract("node", async () => ({
  probe: new NodeResourceProbe(),
  folder: tempFolder,
  writeFile: writeSizedFile,
}));
