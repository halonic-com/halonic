import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BoxFolders } from "../src/box-folders.ts";
import { MxcCanary } from "../src/canary.ts";
import { makeFolders, type RealMxc, realMxc, type TestFolders } from "./real-box.ts";

/** The trust-check canary against the real fence: it opens, finds no leak and no too-strict control. */
describe("MxcCanary with the real fence", () => {
  let mxc: RealMxc;
  let folders: TestFolders;

  beforeAll(async () => {
    mxc = await realMxc();
    folders = await makeFolders(mxc.base);
  });

  afterAll(async () => {
    await mxc?.remove();
  });

  it("finds nothing leaking, and every control working", async () => {
    const canary = new MxcCanary({
      projectFolder: folders.work,
      bridgePort: 4100,
      boxes: new BoxFolders(join(mxc.dataFolder, "canary"), process.pid),
    });
    const session = await mxc.sandbox.open(await canary.profile());
    try {
      const findings = await canary.probe(session);
      expect(findings).toMatchObject({
        started: true,
        leaks: [],
        controls: { readOnlyFileRead: true, workFolderScriptLoaded: true },
      });
    } finally {
      await session.close();
      await canary.release();
    }
  });
});
