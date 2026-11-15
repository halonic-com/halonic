// @vitest-environment jsdom

import { engineWords } from "@halonicjs/studio-shell";
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
import { requestNewWorkflow } from "./new-request.ts";
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

  it("shows a row's description under its name, and its last run with the outcome as a glyph", async () => {
    const rows = [
      listing("acme", "mail-triage", "Mail triage", {
        description: "Sorts the inbox every morning.",
        lastRun: { startedAt: new Date().toISOString(), outcome: "failed" },
      }),
      listing("acme", "invoice-intake", "Invoice intake"),
    ];
    const text = (await show(<WorkflowsView host={memoryHost(hubs, rows).host} />)).textContent;

    expect(text).toContain("Sorts the inbox every morning.");
    expect(text).toMatch(/Last run ✕ Today \d\d:\d\d/);
    expect(text?.match(/Last run/g)).toHaveLength(1);
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

  it("offers no New workflow while the workflows load, or when the workspace has no hub", async () => {
    const loading = { ...memoryHost(hubs, []).host, list: () => new Promise<never>(() => {}) };
    expect(
      buttonNamed(await show(<WorkflowsView host={loading} />), "New workflow"),
    ).toBeUndefined();
    unmount();

    const page = await show(<WorkflowsView host={memoryHost([], []).host} />);
    expect(buttonNamed(page, "New workflow")).toBeUndefined();
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
    expect(page.textContent).toContain("The engine isn't answering. It may still be starting.");
    expect(page.textContent).not.toContain("The disk can't be read");

    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.textContent).toContain("Mail triage");
  });

  it("words the failure for the phone's host", async () => {
    const { host } = memoryHost(hubs, workflows);
    const page = await show(
      <WorkflowsView
        host={{ ...host, list: () => Promise.reject(new Error("x")) }}
        engine={engineWords.phone}
      />,
    );

    expect(page.textContent).toContain("Halonic on your computer isn't answering.");
  });

  it("shows the skeleton while Try again reads after a first failure", async () => {
    const { host } = memoryHost(hubs, workflows);
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("x"))
      .mockReturnValue(new Promise(() => undefined));
    const page = await show(<WorkflowsView host={{ ...host, list }} />);

    await act(async () => buttonNamed(page, "Try again")?.click());

    expect(page.textContent).not.toContain("Couldn't load workflows");
    expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("keeps the rows and adds a line with Try again when a refresh fails", async () => {
    const { host, change } = memoryHost(hubs, workflows);
    let failing = false;
    const list = () => (failing ? Promise.reject(new Error("x")) : host.list());
    const page = await show(<WorkflowsView host={{ ...host, list }} />);

    failing = true;
    await act(async () => change(workflows));

    expect(page.textContent).toContain("Mail triage");
    expect(page.textContent).not.toContain("Couldn't load workflows");
    expect(page.textContent).toContain("The engine isn't answering. Showing what it said last.");

    failing = false;
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.textContent).not.toContain("Showing what it said last");
    expect(page.textContent).toContain("Mail triage");
  });

  it("hides the chip glyphs from screen readers", async () => {
    const rows = [listing("acme", "bad", "Bad one", { problems: { errors: 1, warnings: 1 } })];
    const page = await show(<WorkflowsView host={memoryHost(hubs, rows).host} />);

    const glyphs = [...page.querySelectorAll('[aria-hidden="true"]')].map(
      (each) => each.textContent,
    );
    expect(glyphs.some((text) => text?.includes("✕"))).toBe(true);
  });

  it("opens a Ctrl-clicked row in a new tab, else in this one", async () => {
    const open = vi.fn();
    const openInNewTab = vi.fn();
    const page = await show(
      <WorkflowsView
        host={memoryHost(hubs, workflows).host}
        open={open}
        openInNewTab={openInNewTab}
      />,
    );
    const row = [...page.querySelectorAll('[role="gridcell"]')].find((each) =>
      each.textContent?.includes("Mail triage"),
    ) as HTMLElement;

    await act(async () =>
      row.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true })),
    );

    expect(openInNewTab).toHaveBeenCalledWith(expect.objectContaining({ id: "mail-triage" }));
    expect(open).not.toHaveBeenCalled();
  });

  it("opens New workflow when Ctrl K asks for it, even before the page is drawn", async () => {
    requestNewWorkflow();
    await show(<WorkflowsView host={memoryHost(hubs, workflows).host} />);

    expect(document.querySelector("dialog")).not.toBeNull();
  });

  it("drops Ctrl K's New workflow when there is no hub to put one in", async () => {
    requestNewWorkflow();
    await show(<WorkflowsView host={memoryHost([], workflows).host} />);
    expect(document.querySelector("dialog")).toBeNull();

    unmount();
    await show(<WorkflowsView host={memoryHost(hubs, workflows).host} />);
    expect(document.querySelector("dialog")).toBeNull();
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
