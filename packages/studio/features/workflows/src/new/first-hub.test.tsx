// @vitest-environment jsdom

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
});
