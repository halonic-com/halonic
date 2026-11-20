// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoutineTargetChoice } from "../api.ts";
import { buttonNamed, openDialogsInJsdom, show, typeInto, unmount } from "../test-support.tsx";
import { NewRoutineDialog, type NewRoutineDialogProps } from "./new-routine-dialog.tsx";
import { routineFilePath } from "./routine-file.ts";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const acme = { id: "acme", name: "acme" };
const beta = { id: "beta", name: "beta" };
const briefing: RoutineTargetChoice = {
  kind: "workflow",
  hubId: "acme",
  id: "briefing",
  name: "Briefing",
};

function dialog(props: Partial<NewRoutineDialogProps> = {}) {
  const onCreated = vi.fn();
  const create = vi.fn(async (newRoutine: { name: string; hubId: string }) => ({
    hubId: newRoutine.hubId,
    id: "morning-digest",
  }));
  return {
    onCreated,
    create,
    node: (
      <NewRoutineDialog
        hubs={[acme]}
        takenIds={() => []}
        starterTarget={async (hubId) => (hubId === "acme" ? briefing : undefined)}
        create={create}
        onCreated={onCreated}
        onCancel={() => undefined}
        returnFocus={() => null}
        {...props}
      />
    ),
  };
}

function nameField(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>("dialog input, [role=dialog] input");
  if (input === null) throw new Error("no name field");
  return input;
}

const body = () => document.body.textContent ?? "";

/** What the dialog's `aria-describedby` reads: empty when it names nothing. */
function description(): string {
  const ids = document.querySelector("dialog")?.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
}
const settle = () =>
  act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

verifies("routines.new.create", () => {
  it("asks for a name with the folder and what it runs, and no Hub with one hub", async () => {
    await show(dialog().node);

    expect(body()).toContain("New routine");
    expect(body()).toContain("Folder: hubs/acme/workflows/routines/");
    expect(body()).toContain(
      "It runs Briefing when you press Run now. Pick when it runs on its own next.",
    );
    expect(body()).not.toContain("Hub");
    expect(document.activeElement).toBe(nameField());
  });

  it("draws the note's info icon in an icon-sized box, so it doesn't shrink to nothing", async () => {
    await show(dialog().node);

    const note = [...document.querySelectorAll("p")].find((line) =>
      line.textContent?.startsWith("It runs Briefing"),
    );
    // The kit's icons have no size of their own: in the note's flex row a bare one has no width.
    const icon = note?.querySelector("svg")?.parentElement;
    expect(icon).not.toBe(note);
    expect(icon?.className).toContain("size-icon-sm");
    expect(icon?.className).toContain("*:size-full");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("reads what it runs on opening, as the dialog's description", async () => {
    await show(dialog().node);
    await settle();

    expect(description()).toContain("It runs Briefing when you press Run now.");
  });

  it("names the hub's first agent and says Halonic can't run an agent on its own yet", async () => {
    const analyst: RoutineTargetChoice = {
      kind: "agent",
      hubId: "acme",
      id: "analyst",
      name: "Analyst",
    };
    await show(dialog({ starterTarget: async () => analyst }).node);

    expect(body()).toContain(
      "This routine starts Analyst, but Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow, then pick it under Starts on the routine's page.",
    );
    expect(body()).not.toContain("when you press Run now");
  });

  it("shows the file the name makes, with -2 when the id is taken, and follows the hub", async () => {
    await show(
      dialog({ hubs: [acme, beta], takenIds: (hub) => (hub === "acme" ? ["morning-digest"] : []) })
        .node,
    );
    await typeInto(nameField(), "Morning digest");

    expect(body()).toContain("File: hubs/acme/workflows/routines/morning-digest-2.routine.yaml");
    expect(body()).toContain("Hub");
  });

  it("creates the routine in the hub and hands it over to be opened", async () => {
    const { node, create, onCreated } = dialog();
    await show(node);
    await typeInto(nameField(), "  Morning digest ");

    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(create).toHaveBeenCalledWith({ name: "Morning digest", hubId: "acme" });
    expect(onCreated).toHaveBeenCalledWith({ hubId: "acme", id: "morning-digest" });
  });

  it("says 'Give it a name.' and creates nothing while the name is empty", async () => {
    const { node, create } = dialog();
    await show(node);

    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(body()).toContain("Give it a name.");
    expect(create).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(nameField());
  });

  it("says why it couldn't create, and Try again sends the form again", async () => {
    const { node, create, onCreated } = dialog();
    create.mockRejectedValueOnce(new KindedError("unavailable", "the disk is full"));
    await show(node);
    await typeInto(nameField(), "Morning digest");

    await act(async () => buttonNamed(document.body, "Create")?.click());
    await settle();
    expect(body()).toContain("Couldn't create the routine: the disk is full.");
    expect(onCreated).not.toHaveBeenCalled();

    await act(async () => buttonNamed(document.body, "Try again")?.click());
    expect(create).toHaveBeenCalledTimes(2);
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("replaces Create with the nothing-to-run line, and New workflow closes the dialog and opens that", async () => {
    const onNewWorkflow = vi.fn();
    await show(dialog({ hubs: [beta], onNewWorkflow }).node);

    expect(body()).toContain("Create a workflow or an agent first; a routine runs one of them.");
    expect(buttonNamed(document.body, "Create")).toBeUndefined();
    await act(async () => buttonNamed(document.body, "New workflow")?.click());
    expect(onNewWorkflow).toHaveBeenCalledOnce();
  });

  it("shows no New workflow button when the app can't open the dialog", async () => {
    await show(dialog({ hubs: [beta] }).node);

    expect(body()).toContain("Create a workflow or an agent first");
    expect(buttonNamed(document.body, "New workflow")).toBeUndefined();
  });
});

it("names the folder alone while the name is empty, and numbers a taken id", () => {
  expect(routineFilePath("acme", "  ", [])).toEqual({
    kind: "folder",
    path: "hubs/acme/workflows/routines/",
  });
  expect(routineFilePath("acme", "Morning digest", ["morning-digest"]).path).toBe(
    "hubs/acme/workflows/routines/morning-digest-2.routine.yaml",
  );
});
