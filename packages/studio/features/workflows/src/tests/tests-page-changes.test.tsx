// @vitest-environment jsdom

import { noTryItChanges, type TryItChanges } from "@halonicjs/studio-feature-agents/api";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import type { WorkflowRef, WorkflowsHost, WorkflowTests } from "../api.ts";
import { memoryHost, show, unmount } from "../test-support.tsx";
import { TestsPage } from "./tests-page.tsx";

afterEach(unmount);

const twoTests: WorkflowTests = {
  cases: [
    { name: "invoice run", input: "{}" },
    { name: "spam", input: "{}" },
  ],
};

const line = "Includes 2 changes from the assistant you haven't accepted yet.";

const open = async (overrides: Partial<WorkflowsHost>) => {
  const { host } = memoryHost([], [], [], [], { tests: async () => twoTests, ...overrides });
  return show(<TestsPage host={host} workflow={{ hubId: "acme", id: "digest" }} name="Digest" />);
};

verifies("workflows.tests.try-it-changes", () => {
  it("says above the summary that the tests read the changes not accepted yet", async () => {
    const watched: WorkflowRef[] = [];
    const page = await open({
      watchTryItChanges: (ref, listener: (changes: TryItChanges) => void) => {
        watched.push(ref);
        listener({ ...noTryItChanges, included: 2, workspaceName: "Acme" });
        return () => {};
      },
    });
    expect(watched).toEqual([{ hubId: "acme", id: "digest" }]);
    const text = page.textContent ?? "";
    expect(text).toContain(line);
    expect(text.indexOf(line)).toBeLessThan(text.indexOf("2 tests"));
  });

  it("shows no line where the host has no watch", async () => {
    expect((await open({})).textContent).not.toContain("from the assistant");
  });
});
