// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { WorkflowConfiguration, WorkflowView } from "../api.ts";
import { WorkflowScreen } from "../page/workflow-page.tsx";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";

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
    {
      severity: "warning",
      code: "unreachable",
      message: "Step start is never reached from the first step.",
      stepId: "start",
    },
    {
      severity: "error",
      code: "dead-end",
      message: "Step review has no transitions and is not final.",
      stepId: "review",
    },
  ],
};

const open = async (config: readonly WorkflowConfiguration[]) => {
  const { host } = memoryHost([], [], [view], config);
  const page = await show(
    <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
  );
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
    expect(rows[0]).toBe("✕Error:Step review has no transitions and is not final.review");
    expect(rows[1]).toBe("△Warning:Step start is never reached from the first step.start");

    await act(async () =>
      page.querySelector<HTMLButtonElement>("[aria-label='Open review']")?.click(),
    );
    expect(tab(page, "Flow")?.getAttribute("aria-selected")).toBe("true");
    expect(page.querySelector("[aria-pressed=true], [aria-current=true]")?.textContent).toContain(
      "review",
    );
    expect(document.activeElement?.textContent).toContain("review");
  });

  it("doesn't re-pick the card or take focus when the Flow tab is clicked directly", async () => {
    const page = await open([configuration]);
    await act(async () => tab(page, "Problems")?.click());
    await act(async () =>
      page.querySelector<HTMLButtonElement>("[aria-label='Open review']")?.click(),
    );
    await act(async () => tab(page, "Configuration")?.click());
    await act(async () => tab(page, "Flow")?.click());

    expect(page.querySelector("[aria-pressed=true]")).toBeNull();
    expect(document.activeElement?.getAttribute("aria-pressed")).toBeNull();
  });

  it("shows each request field with its type and Required at the end of a required one", async () => {
    const page = await open([
      {
        ...configuration,
        request: {
          label: "Ask for a reply",
          fields: [
            { name: "message", type: "long-text", required: true },
            { name: "from", type: "email", required: false },
          ],
        },
      },
    ]);
    await act(async () => tab(page, "Request form")?.click());

    const rows = [...page.querySelectorAll("li")].map((li) => li.textContent);
    expect(rows).toContain("messageLong textRequired");
    expect(rows).toContain("fromEmail");
  });

  it("says No problems. when there are none", async () => {
    const page = await open([{ ...configuration, problems: [] }]);
    await act(async () => tab(page, "Problems")?.click());

    expect(page.textContent).toContain("No problems.");
  });

  it("shows whether the workflow is offered in the Inbox", async () => {
    const page = await open([
      {
        ...configuration,
        request: {
          label: "Ask for a reply",
          fields: [
            { name: "message", type: "long-text", required: true },
            { name: "from", type: "email", required: false },
          ],
        },
      },
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

  it("outlines the picked page in high contrast, where its soft fill doesn't show", async () => {
    const page = await open([configuration]);
    await act(async () => tab(page, "Tests")?.click());

    expect(tab(page, "Tests")?.className).toContain("selected-forced");
    expect(tab(page, "General")?.className).not.toContain("selected-forced");
  });

  it("wraps round with the arrow keys, jumps with Home and End, and focus follows", async () => {
    const page = await open([configuration]);
    const press = async (from: string, key: string) =>
      act(async () => {
        tab(page, from)?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });

    await press("General", "ArrowUp");
    expect(tab(page, "Problems")?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab(page, "Problems"));
    await press("Problems", "ArrowDown");
    expect(tab(page, "General")?.getAttribute("aria-selected")).toBe("true");
    await press("General", "End");
    expect(tab(page, "Problems")?.getAttribute("aria-selected")).toBe("true");
    await press("Problems", "Home");
    expect(tab(page, "General")?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab(page, "General"));
  });

  it("keeps one Tab stop in the page list, on the picked page", async () => {
    const page = await open([configuration]);
    const list = page.querySelector<HTMLElement>(
      '[role=tablist][aria-label="Configuration pages"]',
    );

    expect(list?.getAttribute("aria-orientation")).toBe("vertical");
    const stops = [...(list?.querySelectorAll("[role=tab]") ?? [])].filter(
      (one) => one.getAttribute("tabindex") === "0",
    );
    expect(stops.map((one) => one.textContent)).toEqual(["General"]);
  });

  it("names the Problems count for screen readers", async () => {
    const page = await open([configuration]);

    expect(tab(page, "Problems")?.textContent).toContain("1 error");
  });
});
