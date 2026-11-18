// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoutineTargetChoice } from "../api.ts";
import {
  buttonNamed,
  listing,
  memoryHost,
  openDialogsInJsdom,
  show,
  typeInto,
  unmount,
} from "../test-support.tsx";
import { requestNewRoutine } from "./new-request.ts";
import { RoutinesView } from "./routines-page.tsx";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const acme = { id: "acme", name: "acme" };
const briefing: RoutineTargetChoice = {
  kind: "workflow",
  hubId: "acme",
  id: "briefing",
  name: "Briefing",
};
const starter = (hubId: string) => (hubId === "acme" ? briefing : undefined);

const nameField = () => document.querySelector<HTMLInputElement>("dialog input");
const body = () => document.body.textContent ?? "";

verifies("routines.new.create", () => {
  it("opens the dialog from New routine and opens the routine it creates", async () => {
    const open = vi.fn();
    await show(
      <RoutinesView
        host={memoryHost([acme], [listing("acme", "daily", "Daily")], starter).host}
        open={open}
      />,
    );

    await act(async () => buttonNamed(document.body, "New routine")?.click());
    expect(body()).toContain("It runs Briefing");
    await typeInto(nameField() as HTMLInputElement, "Morning digest");
    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(open).toHaveBeenCalledWith({ hubId: "acme", id: "morning-digest" });
    expect(nameField()).toBeNull();
    expect(body()).toContain("Morning digest");
  });

  it("offers New routine in the empty state too", async () => {
    await show(<RoutinesView host={memoryHost([acme], [], starter).host} />);

    await act(async () => buttonNamed(document.body, "New routine")?.click());

    expect(nameField()).not.toBeNull();
  });

  it("opens the dialog for Ctrl K's New routine, also when asked before the list is read", async () => {
    requestNewRoutine();
    await show(<RoutinesView host={memoryHost([acme], [], starter).host} />);

    expect(nameField()).not.toBeNull();
  });

  it("closes the dialog and asks for New workflow when the hub has nothing to run", async () => {
    const newWorkflow = vi.fn();
    await show(
      <RoutinesView
        host={memoryHost([acme], [], () => undefined).host}
        newWorkflow={newWorkflow}
      />,
    );
    await act(async () => buttonNamed(document.body, "New routine")?.click());

    await act(async () => buttonNamed(document.body, "New workflow")?.click());

    expect(newWorkflow).toHaveBeenCalledOnce();
    expect(nameField()).toBeNull();
  });

  it("offers no New routine and drops Ctrl K's request while the workspace has no hub", async () => {
    requestNewRoutine();
    await show(<RoutinesView host={memoryHost([], []).host} />);

    expect(buttonNamed(document.body, "New routine")).toBeUndefined();
    expect(nameField()).toBeNull();
  });
});
