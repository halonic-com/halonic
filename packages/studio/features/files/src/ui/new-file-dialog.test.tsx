// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { NewFileDialog } from "./new-file-dialog.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

function setup(create: (path: string) => Promise<void> = async () => {}, start = "hubs/") {
  const host = { create: vi.fn(create) };
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  const page = render(
    <NewFileDialog host={host} start={start} onCreated={onCreated} onCancel={onCancel} />,
  );
  return { page, host, onCreated, onCancel };
}

function field(page: HTMLElement): HTMLInputElement {
  const input = page.ownerDocument.querySelector<HTMLInputElement>("input");
  if (input === null) throw new Error("no field");
  return input;
}

async function type(page: HTMLElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(field(page), value);
    field(page).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function create(page: HTMLElement) {
  const button = [...page.ownerDocument.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith("Create"),
  );
  await act(async () => {
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const text = (page: HTMLElement) => page.ownerDocument.body.textContent ?? "";

verifies("files.ui.new-file", () => {
  it("starts with the given path", () => {
    const { page } = setup(undefined, "hubs/p/agents/");
    expect(field(page).value).toBe("hubs/p/agents/");
  });

  it("says what is missing and does not ask the host", async () => {
    const { page, host, onCreated } = setup();
    await create(page);
    expect(text(page)).toContain("Give the file a name, like hubs/support/agents/new.agent.yaml.");
    expect(host.create).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("refuses a path outside the workspace and the local data", async () => {
    const { page, host } = setup();
    await type(page, "../x.yaml");
    await create(page);
    expect(text(page)).toContain("Files must stay inside the workspace.");
    await type(page, ".studio/x.yaml");
    await create(page);
    expect(text(page)).toContain('".studio/x.yaml" is not part of the workspace definitions');
    expect(host.create).not.toHaveBeenCalled();
  });

  it("shows the host's sentence under the field and stays open", async () => {
    const { page, onCreated } = setup(async () => {
      throw new Error("workspace.yaml already exists.");
    });
    await type(page, "workspace.yaml");
    await create(page);
    expect(text(page)).toContain("workspace.yaml already exists.");
    expect(onCreated).not.toHaveBeenCalled();
    expect(field(page).disabled).toBe(false);
  });

  it("creates the file and tells the caller", async () => {
    const { page, host, onCreated } = setup();
    await type(page, " hubs/p/agents/b.agent.yaml ");
    await create(page);
    expect(host.create).toHaveBeenCalledWith("hubs/p/agents/b.agent.yaml");
    expect(onCreated).toHaveBeenCalledWith("hubs/p/agents/b.agent.yaml");
  });
});
