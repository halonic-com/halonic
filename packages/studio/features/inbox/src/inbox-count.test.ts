import { showPlace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { inboxSignal } from "./inbox-count.ts";
import { inboxItems } from "./inbox-items.ts";
import { waitingRun } from "./test-runs.test-helper.ts";

verifies("inbox.count", () => {
  it("counts every item, heard as N waiting", () => {
    const items = inboxItems([waitingRun("r1"), waitingRun("r2")]);
    expect(inboxSignal(items)).toEqual({ mark: "count", value: 2, spoken: "2 waiting" });
    expect(showPlace("inbox", inboxSignal(items)).spokenName).toBe("Inbox, 2 waiting");
  });

  it("is zero with nothing waiting, so the sidebar shows nothing", () => {
    expect(inboxSignal([]).value).toBe(0);
    expect(showPlace("inbox", inboxSignal([]))).toMatchObject({
      signal: undefined,
      spokenName: "Inbox",
    });
  });
});
