// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  buttonNamed,
  openDialogsInJsdom,
  show,
  typeInto,
  typeIntoArea,
  unmount,
} from "../test-support.tsx";
import { agentFilePath } from "./agent-file.ts";
import { NewAgentDialog, type NewAgentDialogProps } from "./new-agent-dialog.tsx";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const acme = { id: "acme", name: "acme" };
const beta = { id: "beta", name: "beta" };

function dialog(props: Partial<NewAgentDialogProps> = {}) {
  const onCreated = vi.fn();
  const create = vi.fn(
    async (newAgent: { name: string; hubId: string; instructions?: string | undefined }) => ({
      hubId: newAgent.hubId,
      id: "refund-checker",
    }),
  );
  return {
    onCreated,
    create,
    node: (
      <NewAgentDialog
        hubs={[acme]}
        takenIds={() => []}
        defaultModelOf={async () => "fast"}
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
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

verifies("agents.new.create", () => {
  it("asks for a name with the folder, and no Hub or note with one hub", async () => {
    await show(dialog().node);

    expect(body()).toContain("New agent");
    expect(body()).toContain("Folder: hubs/acme/agents/");
    expect(body()).not.toContain("Hub");
    expect(body()).not.toContain("It has no model yet");
  });

  it("shows the file the name makes, with -2 when the id is taken, and follows the hub", async () => {
    await show(
      dialog({ hubs: [acme, beta], takenIds: (hub) => (hub === "acme" ? ["refund-checker"] : []) })
        .node,
    );
    await typeInto(nameField(), "Refund checker");

    expect(body()).toContain("File: hubs/acme/agents/refund-checker-2.agent.yaml");
    expect(body()).toContain("Hub");
  });

  it("creates the agent in the hub and hands it over to be opened", async () => {
    const { node, create, onCreated } = dialog();
    await show(node);
    await typeInto(nameField(), "  Refund checker ");

    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(create).toHaveBeenCalledWith({
      name: "Refund checker",
      hubId: "acme",
      instructions: "",
    });
    expect(onCreated).toHaveBeenCalledWith({ hubId: "acme", id: "refund-checker" });
  });

  it("hands the written instructions over, and refuses a key in them", async () => {
    const { node, create } = dialog();
    await show(node);
    await typeInto(nameField(), "Refund checker");
    const area = document.querySelector("textarea") as HTMLTextAreaElement;

    await typeIntoArea(area, `use sk-${"a1B2".repeat(6)}`);
    await act(async () => buttonNamed(document.body, "Create")?.click());
    expect(body()).toContain("This looks like a key. Keep it as a secret instead?");
    expect(create).not.toHaveBeenCalled();

    await typeIntoArea(area, " Check refunds against the policy. ");
    await act(async () => buttonNamed(document.body, "Create")?.click());
    expect(create).toHaveBeenCalledWith({
      name: "Refund checker",
      hubId: "acme",
      instructions: "Check refunds against the policy.",
    });
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
    create.mockRejectedValueOnce(new KindedError("unavailable", "the disk is full"));
    await show(node);
    await typeInto(nameField(), "Refund checker");

    await act(async () => buttonNamed(document.body, "Create")?.click());
    // The dialog's alert slot fills a frame after the request ends.
    await act(frame);
    expect(body()).toContain("Couldn't create the agent: the disk is full.");
    expect(onCreated).not.toHaveBeenCalled();

    await act(async () => buttonNamed(document.body, "Create")?.click());
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("says the agent has no model yet when the workspace has no default model", async () => {
    await show(dialog({ defaultModelOf: async () => undefined }).node);

    expect(body()).toContain("It has no model yet. Pick one in Configuration › Model.");
    expect(body()).not.toContain("It starts with");
  });

  it("says it starts with the workspace's default model, without promising a sandbox", async () => {
    await show(dialog().node);

    expect(body()).toContain("It starts with the workspace's default model.");
    expect(body()).not.toContain("sandbox");
    expect(body()).not.toContain("It has no model yet");
  });

  it("says nothing about the model when the default can't be read", async () => {
    await show(
      dialog({
        defaultModelOf: async () => {
          throw new Error("The hub didn't answer.");
        },
      }).node,
    );

    expect(body()).not.toContain("It starts with");
    expect(body()).not.toContain("It has no model yet");
  });

  it("names the folder alone while the name is empty", () => {
    expect(agentFilePath("acme", "  ", [])).toEqual({ kind: "folder", path: "hubs/acme/agents/" });
  });
});
