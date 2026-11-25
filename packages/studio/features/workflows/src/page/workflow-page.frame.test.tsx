// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

/** The name the header shows as its title, after the kind, where the host can't rename. */
const shownName = (page: HTMLElement) => page.querySelector("h1")?.lastElementChild?.textContent;

verifies("workflows.page.frame-and-states", () => {
  it("shows the name and the cards at once, with no skeleton and no ⤢ or ✕", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );

    expect(shownName(page)).toBe("Support reply");
    // The item page's header shows the kind in small caps: "WORKFLOW".
    expect(page.querySelector("h1 .uppercase")?.textContent).toBe("Workflow");
    expect(page.querySelector("[role=status]")).toBeNull();
    expect(page.querySelector("[aria-label*=ximise], [aria-label=Close]")).toBeNull();
    expect(page.querySelector("[data-item-chat]")).toBeNull();
  });

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
