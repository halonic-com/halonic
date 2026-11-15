// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowHub } from "../api.ts";
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

  it("offers Try again in the failure, which sends the form again", async () => {
    const { node, create, onCreated } = dialog();
    create.mockRejectedValueOnce(new Error("the disk is full"));
    await show(node);
    await typeInto(nameField(), "Invoice intake");
    await act(async () => buttonNamed(document.body, "Create")?.click());
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    await act(async () => buttonNamed(document.body, "Try again")?.click());

    expect(create).toHaveBeenCalledTimes(2);
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("keeps focus in the name while it creates, by making it read-only", async () => {
    let finish: () => void = () => undefined;
    const { node } = dialog({
      create: () => new Promise((resolve) => (finish = () => resolve({ hubId: "acme", id: "x" }))),
    });
    await show(node);
    await typeInto(nameField(), "Invoice intake");
    nameField().focus();

    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(nameField().readOnly).toBe(true);
    expect(nameField().disabled).toBe(false);
    await act(async () => finish());
  });

  it("takes the first hub when the hubs arrive after it opened", async () => {
    const { create, node } = dialog({ hubs: [] });
    let setHubs: (hubs: readonly WorkflowHub[]) => void = () => undefined;
    function Late() {
      const [hubs, set] = useState<readonly WorkflowHub[]>([]);
      setHubs = set;
      return <NewWorkflowDialog {...(node.props as NewWorkflowDialogProps)} hubs={hubs} />;
    }
    await show(<Late />);
    await typeInto(nameField(), "Invoice intake");

    await act(async () => setHubs([beta]));
    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(create).toHaveBeenCalledWith({ name: "Invoice intake", hubId: "beta" });
  });
});

it("names the folder alone while the name is empty", () => {
  expect(workflowFilePath("acme", "  ", [])).toEqual({
    kind: "folder",
    path: "hubs/acme/workflows/",
  });
});
