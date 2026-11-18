import type { RunFailureCause, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { SourcedRun } from "../api.ts";
import { minutesLater, summaryWith } from "../summary.test-helper.ts";
import { apiOffOf, currentApiOffs, googleConsoleAddress } from "./api-off.ts";

const enableUrl = "https://console.cloud.google.com/apis/library/gmail.googleapis.com";

function failedWith(cause: RunFailureCause | undefined, reason: RunSummary["reason"] = null) {
  return summaryWith({
    status: "failed",
    reason,
    error: "Gmail API has not been used in project 123 before",
    ...(cause === undefined ? {} : { cause }),
  });
}

const apiDisabled = (detail: Record<string, string>): RunFailureCause => ({
  kind: "denied",
  code: "google.api-disabled",
  detail,
});

verifies("runs.run-view.api-off", () => {
  describe("apiOffOf", () => {
    it("reads the API, the project and the address from the typed cause", () => {
      const cause = apiDisabled({ api: "gmail.googleapis.com", project: "halonic-x", enableUrl });
      expect(apiOffOf(failedWith(cause))).toEqual({
        api: "gmail",
        project: "halonic-x",
        enableUrl,
      });
      expect(apiOffOf(failedWith(apiDisabled({ api: "drive.googleapis.com" })))?.api).toBe("drive");
    });

    it("has no project or address when the cause names none, or an empty project", () => {
      expect(
        apiOffOf(failedWith(apiDisabled({ api: "gmail.googleapis.com", project: " " }))),
      ).toEqual({
        api: "gmail",
        project: undefined,
        enableUrl: undefined,
      });
    });

    it("never guesses from the free text (A5): no cause, another code or an API it doesn't know gives nothing", () => {
      expect(apiOffOf(failedWith(undefined))).toBeUndefined();
      expect(apiOffOf(failedWith({ kind: "denied" }))).toBeUndefined();
      expect(
        apiOffOf(
          failedWith({
            kind: "denied",
            code: "google.other",
            detail: { api: "gmail.googleapis.com" },
          }),
        ),
      ).toBeUndefined();
      expect(apiOffOf(failedWith(apiDisabled({ api: "calendar.googleapis.com" })))).toBeUndefined();
      expect(apiOffOf(failedWith(apiDisabled({})))).toBeUndefined();
    });

    it("says nothing for a run that didn't fail", () => {
      const running = summaryWith({
        status: "running",
        cause: apiDisabled({ api: "gmail.googleapis.com" }),
      });
      expect(apiOffOf(running)).toBeUndefined();
    });

    it("drops an address that isn't a Google console address", () => {
      const cause = apiDisabled({
        api: "gmail.googleapis.com",
        enableUrl: "http://console.cloud.google.com/x",
      });
      expect(apiOffOf(failedWith(cause))?.enableUrl).toBeUndefined();
    });
  });

  describe("googleConsoleAddress (A3)", () => {
    it("keeps an https address on one of the two console hosts", () => {
      expect(googleConsoleAddress(enableUrl)).toBe(enableUrl);
      expect(googleConsoleAddress("https://console.developers.google.com/apis/api/x")).toBe(
        "https://console.developers.google.com/apis/api/x",
      );
    });

    it.each([
      undefined,
      "",
      "not an address",
      "http://console.cloud.google.com/x",
      "https://console.cloud.google.com.evil.example/x",
      "https://evil.example/console.cloud.google.com",
      "https://notconsole.cloud.google.com/x",
      "https://google.com/x",
      "https://user@console.cloud.google.com/x",
      "https://console.cloud.google.com:8443/x",
      "javascript:alert(1)",
    ])("refuses %s", (address) => {
      expect(googleConsoleAddress(address)).toBeUndefined();
    });
  });

  describe("currentApiOffs", () => {
    const off = (id: string, minutes: number, api = "gmail.googleapis.com") =>
      ({
        summary: {
          ...failedWith(apiDisabled({ api })),
          id,
          startedAt: minutesLater(minutes),
        },
      }) as SourcedRun;
    const later = (id: string, minutes: number, changes: Partial<RunSummary> = {}) =>
      ({
        summary: summaryWith({
          id,
          status: "completed",
          startedAt: minutesLater(minutes),
          endedAt: minutesLater(minutes + 1),
          ...changes,
        }),
      }) as SourcedRun;

    it("gives one entry for each API, from its newest failed run", () => {
      const found = currentApiOffs([off("a", 0), off("b", 3), off("c", 1, "drive.googleapis.com")]);
      expect(found.map((entry) => [entry.api, entry.run.id])).toEqual([
        ["gmail", "b"],
        ["drive", "c"],
      ]);
    });

    it("clears when a later run of the same workflow ended without the cause (A8)", () => {
      expect(currentApiOffs([off("a", 0), later("b", 5)])).toEqual([]);
    });

    it("stays while the later run is still going, for another workflow, a test run or older", () => {
      const keeps = (other: SourcedRun) => currentApiOffs([off("a", 5), other]).length === 1;
      expect(keeps(later("b", 8, { status: "running", endedAt: null }))).toBe(true);
      expect(keeps(later("b", 8, { workflowId: "other" }))).toBe(true);
      expect(keeps(later("b", 8, { kind: "test" }))).toBe(true);
      expect(keeps(later("b", 1))).toBe(true);
    });
  });
});
