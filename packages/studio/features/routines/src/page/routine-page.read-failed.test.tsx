// @vitest-environment jsdom

import { EngineNotAnswering } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import type { RoutinesHost } from "../api.ts";
import { buttonNamed, listing, memoryHost, show, unmount } from "../test-support.tsx";
import { screenOf } from "./page.test-helper.tsx";
import { failureReason } from "./page-words.ts";

afterEach(unmount);

const notText = "This file isn't text, so its changes can't be shown.";

/** A host that listed `weekly-report` from its saved file, and whose read of it fails with `error`. */
function hostFailingRead(error: Error, listed = true): RoutinesHost {
  const listings = listed ? [listing("acme", "weekly-report", "Weekly report")] : [];
  const { host } = memoryHost([], listings);
  return {
    ...host,
    read: async () => {
      throw error;
    },
  } as RoutinesHost;
}

verifies("routines.page.frame-and-states", () => {
  it("keeps the saved name in the heading when the routine can't be read, as its row has it", async () => {
    const page = await show(screenOf(hostFailingRead(new Error(notText)), "weekly-report"));

    expect(page.querySelector("h1")?.textContent).toBe("Weekly report");
    expect(page.textContent).toContain("Couldn't load this routine");
    expect(buttonNamed(page, "Try again")).toBeDefined();
  });

  it("shows the id in the heading when the host never read the routine's file", async () => {
    const page = await show(screenOf(hostFailingRead(new Error(notText), false), "weekly-report"));

    expect(page.querySelector("h1")?.textContent).toBe("weekly-report");
  });

  it("doesn't blame the engine for a plain error, and never shows its raw text", async () => {
    const page = await show(screenOf(hostFailingRead(new Error(notText)), "weekly-report"));

    expect(page.textContent).toContain("Halonic ran into a problem it can't explain yet.");
    expect(page.textContent).not.toContain("isn't answering");
    expect(page.textContent).not.toContain(notText);
  });
});

describe("failureReason", () => {
  it("gives the engine's words only when the engine can't be reached", () => {
    expect(failureReason(new EngineNotAnswering(), "The engine isn't answering.")).toBe(
      "The engine isn't answering.",
    );
    expect(failureReason(new Error("ENOENT"), "The engine isn't answering.")).toBe(
      "Halonic ran into a problem it can't explain yet.",
    );
  });
});
