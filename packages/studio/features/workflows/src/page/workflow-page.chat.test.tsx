// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

verifies("workflows.page.frame-and-states", () => {
  it("puts the Assistant's chat about the workflow on the left, with the canvas beside it", async () => {
    const { host } = memoryHost([], [], [reply]);
    const chatFor = vi.fn((name: string) => ({
      startsOpen: true,
      render: () => <p>Chat about {name}</p>,
    }));
    const page = await show(
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        chatFor={chatFor}
      />,
    );

    expect(chatFor).toHaveBeenLastCalledWith("Support reply");
    expect(page.querySelector("[data-item-chat]")?.textContent).toBe("Chat about Support reply");
    expect(page.querySelector("[data-workflow-view]")).not.toBeNull();
  });
});
