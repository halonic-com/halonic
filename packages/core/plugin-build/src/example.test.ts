import { describe, expect, it } from "vitest";
import { runExample } from "../examples/build-and-read-back.ts";
import { digest } from "./test/web-crypto.test-helper.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample(digest)).toEqual({
      pluginId: "halonic-ws.acme",
      archive: "halonic-ws.acme-0.1.0.tar",
      added: ["order_status"],
      readBack: 1,
    });
  });
});
