import { describe, expect, it } from "vitest";
import { runExample } from "../examples/check-an-acme-setup.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual([
      "acme-calendar: works",
      "acme-notes: allowed",
      "acme-files: scopeNotGranted",
      "acme-mail: apiOff (enable it at https://console.cloud.google.com/apis/library/acmemail.googleapis.com?project=acme-demo-1)",
      "acme-sheets: checkFailed",
      "acme-maps: unreachable",
    ]);
  });
});
