// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type WorkflowListing, WorkflowsHostService } from "../api.ts";
import {
  buttonNamed,
  listing,
  memoryHost,
  openDialogsInJsdom,
  show,
  typeInto,
  unmount,
} from "../test-support.tsx";
import { WorkflowsPage, WorkflowsView } from "./workflows-page.tsx";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const hubs = [
  { id: "acme", name: "acme" },
  { id: "beta", name: "beta" },
];

const workflows: readonly WorkflowListing[] = [
  listing("acme", "mail-triage", "Mail triage", { runs: { waiting: 1, running: 1 } }),
  listing("acme", "invoice-intake", "Invoice intake", { problems: { errors: 0, warnings: 2 } }),
];

verifies("workflows.list.rows-and-states", () => {
  it("lists each hub's workflows by name, with a letter avatar and the chips", async () => {
    const page = await show(<WorkflowsView host={memoryHost(hubs, workflows).host} />);
    const text = page.textContent ?? "";

    expect(page.querySelector("h1")?.textContent).toBe("Workflows");
    expect(text.indexOf("Invoice intake")).toBeLessThan(text.indexOf("Mail triage"));
    expect(text).toContain("△ 2 warnings");
    expect(text).toContain("No workflows in beta yet.");
    expect(text).toContain("IInvoice intake");
  });

  it("shows only 'needs you' when runs wait and others run, and problems as a count", async () => {
    const rows = [
      ...workflows,
      listing("beta", "bad", "Bad one", { problems: { errors: 1, warnings: 1 } }),
    ];
    const text = (await show(<WorkflowsView host={memoryHost(hubs, rows).host} />)).textContent;

    expect(text).toContain("1 needs you");
    expect(text).not.toContain("1 running");
    expect(text).toContain("✕ 2 problems");
  });

  it("opens the workflow of the chosen row", async () => {
    const open = vi.fn();
    const page = await show(<WorkflowsView host={memoryHost(hubs, workflows).host} open={open} />);
    const row = [...page.querySelectorAll('[role="gridcell"]')].find((each) =>
      each.textContent?.includes("Mail triage"),
    );

    await act(async () => (row as HTMLElement).click());

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ hubId: "acme", id: "mail-triage" }),
    );
  });

  it("shows only the empty state, with its one button, when there are no workflows", async () => {
    const page = await show(<WorkflowsView host={memoryHost(hubs, []).host} />);

    expect(page.textContent).toContain("No workflows yet");
    expect(page.textContent).toContain(
      "A workflow is a set of steps your agents work through, one after the other.",
    );
    expect(page.querySelector('input[type="search"]')).toBeNull();
    expect(page.querySelectorAll("button")).toHaveLength(1);
    expect(buttonNamed(page, "New workflow")).toBeDefined();
  });

  it("says nothing matches a search, and Clear search brings the rows back", async () => {
    const page = await show(<WorkflowsView host={memoryHost(hubs, workflows).host} />);
    const field = page.querySelector<HTMLInputElement>('input[type="search"]');
    if (field === null) throw new Error("no search field");

    await typeInto(field, "zzz");
    expect(page.textContent).toContain('No workflows match "zzz".');

    await act(async () => buttonNamed(page, "Clear search")?.click());
    expect(page.textContent).toContain("Mail triage");
  });

  it("says Loading workflows while it reads", async () => {
    const { host } = memoryHost(hubs, workflows);
    const page = await show(
      <WorkflowsView host={{ ...host, list: () => new Promise(() => undefined) }} />,
    );

    expect(
      page.querySelector('[aria-label="Loading workflows"], [aria-busy="true"]'),
    ).not.toBeNull();
    expect(page.textContent).not.toContain("Mail triage");
  });

  it("says why it couldn't load, and Try again reads again", async () => {
    const { host } = memoryHost(hubs, workflows);
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("The disk can't be read"))
      .mockResolvedValue(workflows);
    const page = await show(<WorkflowsView host={{ ...host, list }} />);

    expect(page.textContent).toContain("Couldn't load workflows");
    expect(page.textContent).toContain("The disk can't be read.");

    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.textContent).toContain("Mail triage");
  });

  it("reads again when the host says the workflows changed", async () => {
    const { host, change } = memoryHost(hubs, workflows);
    const page = await show(<WorkflowsView host={host} />);

    await act(async () => change([...workflows, listing("beta", "new", "Fresh one")]));

    expect(page.textContent).toContain("Fresh one");
  });

  it("creates a workflow from New workflow and opens it", async () => {
    const open = vi.fn();
    const { host, created } = memoryHost(hubs, workflows);
    const page = await show(<WorkflowsView host={host} open={open} />);

    await act(async () => buttonNamed(page, "New workflow")?.click());
    const input = document.querySelector<HTMLInputElement>("dialog input");
    if (input === null) throw new Error("no name field");
    await typeInto(input, "Fresh one");
    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(created).toEqual([{ name: "Fresh one", hubId: "acme" }]);
    expect(open).toHaveBeenCalledWith({ hubId: "acme", id: "made" });
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("opens a workflow as an item of the workflow kind from the place", async () => {
    const openItem = vi.fn();
    const { host } = memoryHost(hubs, workflows);
    const context = {
      openItem,
      services: { get: (key: unknown) => (key === WorkflowsHostService ? host : undefined) },
    };
    const page = await show(<WorkflowsPage context={context as never} />);
    const row = [...page.querySelectorAll('[role="gridcell"]')].find((each) =>
      each.textContent?.includes("Mail triage"),
    );

    await act(async () => (row as HTMLElement).click());

    expect(openItem).toHaveBeenCalledWith({ kind: "workflow", hub: "acme", id: "mail-triage" });
  });
});

verifies("workflows.list.rows-and-states", () => {
  it("keeps the newest read when an older read settles after it", async () => {
    const reads: ((rows: readonly WorkflowListing[]) => void)[] = [];
    let changed = () => {};
    const host = {
      ...memoryHost(hubs, []).host,
      list: () => new Promise<readonly WorkflowListing[]>((resolve) => reads.push(resolve)),
      subscribe: (listener: () => void) => {
        changed = listener;
        return () => {};
      },
    };
    const page = await show(<WorkflowsView host={host} />);
    await act(async () => changed());
    expect(reads).toHaveLength(2);

    await act(async () => reads[1]?.(workflows));
    await act(async () => reads[0]?.([]));

    expect(page.textContent).toContain("Mail triage");
    expect(page.textContent).not.toContain("No workflows yet");
  });
});
