// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buttonNamed, openDialogsInJsdom, show, typeInto, unmount } from "../test-support.tsx";
import { NewWorkflowDialog, type NewWorkflowDialogProps } from "./new-workflow-dialog.tsx";
import { workflowFilePath } from "./workflow-file.ts";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const acme = { id: "acme", name: "acme" };
const beta = { id: "beta", name: "beta" };

function dialog(props: Partial<NewWorkflowDialogProps> = {}) {
  const onCreated = vi.fn();
  const create = vi.fn(async (newWorkflow: { name: string; hubId: string }) => ({
    hubId: newWorkflow.hubId,
    id: "invoice-intake",
  }));
  return {
    onCreated,
    create,
    node: (
      <NewWorkflowDialog
        hubs={[acme]}
        takenIds={() => []}
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

verifies("workflows.new.create", () => {
  it("asks for a name with the folder and the note, and no Hub with one hub", async () => {
    await show(dialog().node);

    expect(body()).toContain("New workflow");
    expect(body()).toContain("Folder: hubs/acme/workflows/");
    expect(body()).toContain("It starts with a step “start” that leads to “done”.");
    expect(body()).not.toContain("Hub");
  });

  it("shows the file the name makes, with -2 when the id is taken, and follows the hub", async () => {
    await show(
      dialog({ hubs: [acme, beta], takenIds: (hub) => (hub === "acme" ? ["invoice-intake"] : []) })
        .node,
    );
    await typeInto(nameField(), "Invoice intake");

    expect(body()).toContain("File: hubs/acme/workflows/invoice-intake-2.workflow.yaml");
    expect(body()).toContain("Hub");
  });

  it("creates the workflow in the hub and hands it over to be opened", async () => {
    const { node, create, onCreated } = dialog();
    await show(node);
    await typeInto(nameField(), "  Invoice intake ");

    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(create).toHaveBeenCalledWith({ name: "Invoice intake", hubId: "acme" });
    expect(onCreated).toHaveBeenCalledWith({ hubId: "acme", id: "invoice-intake" });
  });

  it("says 'Give it a name.' and creates nothing while the name is empty", async () => {
    const { node, create } = dialog();
    await show(node);

    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(body()).toContain("Give it a name.");
    expect(create).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(nameField());
  });

  it("says why it couldn't create, and Create tries again", async () => {
    const { node, create, onCreated } = dialog();
    create.mockRejectedValueOnce(new Error("the disk is full"));
    await show(node);
    await typeInto(nameField(), "Invoice intake");

    await act(async () => buttonNamed(document.body, "Create")?.click());
    // The dialog's alert slot fills a frame after the request ends.
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(body()).toContain("Couldn't create the workflow: the disk is full.");
    expect(onCreated).not.toHaveBeenCalled();

    await act(async () => buttonNamed(document.body, "Create")?.click());
    expect(onCreated).toHaveBeenCalledOnce();
  });
});

it("names the folder alone while the name is empty", () => {
  expect(workflowFilePath("acme", "  ", [])).toEqual({
    kind: "folder",
    path: "hubs/acme/workflows/",
  });
});
