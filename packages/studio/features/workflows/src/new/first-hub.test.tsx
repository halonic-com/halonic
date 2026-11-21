// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkflowsView } from "../list/workflows-page.tsx";
import {
  buttonNamed,
  memoryHost,
  openDialogsInJsdom,
  show,
  typeInto,
  unmount,
} from "../test-support.tsx";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

verifies("workflows.new.first-hub", () => {
  it("shows the Default hub's file, creates the workflow there and opens it", async () => {
    const { host, created } = memoryHost([], []);
    const open = vi.fn();
    const page = await show(<WorkflowsView host={host} open={open} />);

    await act(async () => buttonNamed(page, "New workflow")?.click());
    const dialog = document.querySelector("dialog");
    const input = document.querySelector<HTMLInputElement>("dialog input");
    if (input === null) throw new Error("no name field");
    expect(dialog?.textContent).not.toContain("Hub");
    await typeInto(input, "Daily summary");
    expect(dialog?.textContent).toContain(
      "File: hubs/default/workflows/daily-summary.workflow.yaml",
    );
    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(created).toEqual([{ name: "Daily summary", hubId: "default" }]);
    expect(open).toHaveBeenCalledWith({ hubId: "default", id: "made" });
  });

  it("says the Default hub's file can't be read, with its line, and keeps the dialog open", async () => {
    const refusal = new KindedError(
      "invalid_input",
      "hubs/default/hub.yaml can't be read right now (line 3).",
      { fix: "Fix it in the file, then try again." },
    );
    const create = async () => {
      throw Object.assign(refusal, { file: "hubs/default/hub.yaml", line: 3 });
    };
    const host = { ...memoryHost([], []).host, create };
    const open = vi.fn();
    const page = await show(<WorkflowsView host={host} open={open} />);

    await act(async () => buttonNamed(page, "New workflow")?.click());
    const input = document.querySelector<HTMLInputElement>("dialog input");
    if (input === null) throw new Error("no name field");
    await typeInto(input, "Daily summary");
    await act(async () => buttonNamed(document.body, "Create")?.click());
    // The dialog's alert slot fills a frame after the request ends.
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    expect(document.body.textContent).toContain(
      "Couldn't create the workflow: hubs/default/hub.yaml can't be read right now (line 3). Fix it in the file, then try again.",
    );
    expect(open).not.toHaveBeenCalled();
  });
});
