// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { WorkflowConfiguration, WorkflowView } from "../api.ts";
import { WorkflowScreen } from "../page/workflow-page.tsx";
import { buttonNamed, memoryHost, show, unmount } from "../test-support.tsx";

afterEach(unmount);

const view: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "start",
  steps: [
    { id: "start", type: "task" },
    { id: "review", type: "task" },
  ],
  arrows: [{ from: "start", to: "review" }],
  layout: {},
};

const configuration: WorkflowConfiguration = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  description: "Answers a customer",
  initial: "start",
  stepIds: ["start", "review"],
  file: "hubs/acme/workflows/reply.workflow.yaml",
  problems: [
    { severity: "warning", code: "unreachable", message: "m", stepId: "start" },
    { severity: "error", code: "dead-end", message: "m", stepId: "review" },
  ],
};

const open = async (config: readonly WorkflowConfiguration[]) => {
  const { host } = memoryHost([], [], [view], config);
  const page = await show(<WorkflowScreen host={host} hubId="acme" id="reply" />);
  await act(async () => buttonNamed(page, "Configuration")?.click());
  return page;
};

const tab = (page: HTMLElement, name: string) =>
  [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((one) =>
    one.textContent?.startsWith(name),
  );

verifies("workflows.configuration.pages", () => {
  it("opens on General with the description, the first step and the file", async () => {
    const page = await open([configuration]);

    expect(tab(page, "General")?.getAttribute("aria-selected")).toBe("true");
    expect(page.textContent).toContain("Answers a customer");
    expect(page.textContent).toContain("hubs/acme/workflows/reply.workflow.yaml");
  });

  it("shows the number of errors on the tab and on Problems", async () => {
    const page = await open([configuration]);

    expect(tab(page, "Configuration")?.textContent).toContain("1 error");
    expect(tab(page, "Problems")?.textContent).toContain("1");
  });

  it("lists the errors first, and a step link goes to Flow with that card picked", async () => {
    const page = await open([configuration]);
    await act(async () => tab(page, "Problems")?.click());

    const rows = [...page.querySelectorAll("li")].map((row) => row.textContent);
    expect(rows[0]).toContain("has no way out");
    expect(rows[1]).toContain("can't be reached");

    await act(async () => buttonNamed(page, "review")?.click());
    expect(tab(page, "Flow")?.getAttribute("aria-selected")).toBe("true");
    expect(page.querySelector("[aria-pressed=true], [aria-current=true]")?.textContent).toContain(
      "review",
    );
  });

  it("says No problems. when there are none", async () => {
    const page = await open([{ ...configuration, problems: [] }]);
    await act(async () => tab(page, "Problems")?.click());

    expect(page.textContent).toContain("No problems.");
  });

  it("shows whether the workflow is offered in the Inbox", async () => {
    const page = await open([
      { ...configuration, request: { label: "Ask for a reply", field: "message" } },
    ]);
    await act(async () => tab(page, "Request form")?.click());

    expect(page.textContent).toContain("Offered in the Inbox as a request");
    expect(page.textContent).toContain("Ask for a reply");
  });

  it("says why the settings can't be read, and tries again", async () => {
    const page = await open([]);

    expect(page.textContent).toContain("Couldn't load Support reply's settings");
    expect(page.textContent).toContain("This workflow isn't there.");
    expect(buttonNamed(page, "Try again")).toBeDefined();
  });

  it("moves the picked page with the arrow keys", async () => {
    const page = await open([configuration]);
    await act(async () => {
      tab(page, "General")?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });

    expect(tab(page, "Request form")?.getAttribute("aria-selected")).toBe("true");
  });
});
