// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewConnectorHost } from "../new-connector-host.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { NewConnectorDialog } from "./new-connector-dialog.tsx";

fakeModal();
afterEach(() => {
  unmountAll();
  restoreModal();
  fakeModal();
});

function setup(hubIds: readonly string[] = ["acme"], create?: NewConnectorHost["create"]) {
  const made = vi.fn(async () => ({ hub: "acme", id: "notes" }));
  const host: NewConnectorHost = {
    prepare: async () => {},
    hubs: () => hubIds.map((id) => ({ id, name: id })),
    ways: () => ["google", "http", "stdio"],
    file: ({ name }) =>
      `hubs/acme/library/connectors/${name.trim() === "" ? "" : `${name.trim().toLowerCase()}.connector.yaml`}`,
    create: create ?? made,
  };
  const onCreated = vi.fn();
  const root = render(<NewConnectorDialog host={host} onCreated={onCreated} onCancel={() => {}} />);
  return { root, made, onCreated };
}

async function type(root: HTMLElement, label: string, value: string) {
  const found = [...root.ownerDocument.querySelectorAll("label")].find((each) =>
    each.textContent?.startsWith(label),
  );
  const input = root.ownerDocument.getElementById(found?.htmlFor ?? "") as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pick(root: HTMLElement, label: string) {
  const row = [...root.ownerDocument.querySelectorAll("label")].find((each) =>
    each.textContent?.includes(label),
  );
  await act(async () => {
    row?.querySelector("input")?.click();
  });
}

async function press(root: HTMLElement, label: string) {
  const button = [...root.ownerDocument.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith(label),
  );
  await act(async () => {
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const page = (root: HTMLElement) => root.ownerDocument.body.textContent ?? "";

verifies("library.new-connector", () => {
  describe("NewConnectorDialog", () => {
    it("shows the folder under Name, then the file once there is a name", async () => {
      const { root } = setup();
      expect(page(root)).toContain("Folder: hubs/acme/library/connectors/");
      await type(root, "Name", "Notes");
      expect(page(root)).toContain("File: hubs/acme/library/connectors/notes.connector.yaml");
    });

    it("shows no line on what Create writes until a way is picked", async () => {
      const { root } = setup();
      expect(page(root)).not.toContain("will ask a person first");
      await pick(root, "Local program");
      expect(page(root)).toContain(
        "Every tool this connector offers will ask a person first. You can change that in its file.",
      );
      await pick(root, "Gmail and Google Drive");
      expect(page(root)).toContain("Tools that change or send something ask a person first.");
    });

    it("asks for the name and a way, and makes nothing", async () => {
      const { root, made } = setup();
      await press(root, "Create");
      expect(page(root)).toContain("Give it a name.");
      expect(page(root)).toContain("Choose how it connects.");
      expect(made).not.toHaveBeenCalled();
    });

    it("checks the field of the picked way", async () => {
      const { root, made } = setup();
      await type(root, "Name", "Notes");
      await pick(root, "MCP server");
      await type(root, "URL", "notes");
      await press(root, "Create");
      expect(page(root)).toContain("Enter a full address, like https://mcp.example.com.");
      await pick(root, "Local program");
      await press(root, "Create");
      expect(page(root)).toContain("Enter the command that starts the server.");
      await pick(root, "Gmail and Google Drive");
      await type(root, "Account", "fin");
      await press(root, "Create");
      expect(page(root)).toContain("Enter the account's email address, like fin@acme.example.");
      expect(made).not.toHaveBeenCalled();
    });

    it("refuses a secret that is not a name", async () => {
      const { root, made } = setup();
      await type(root, "Name", "Notes");
      await pick(root, "Local program");
      await type(root, "Command", "npx -y @acme/notes-mcp");
      await type(root, "Secret", "not a name");
      await press(root, "Create");
      expect(page(root)).toContain("Use letters, numbers and underscores, like NOTES_TOKEN.");
      expect(made).not.toHaveBeenCalled();
    });

    it("says where a program's secret goes", async () => {
      const { root } = setup();
      await pick(root, "Local program");
      await type(root, "Secret", "NOTES_TOKEN");
      expect(page(root)).toContain(
        "Passed to the program as NOTES_TOKEN. Its value stays on this computer.",
      );
    });

    it("makes the connector and hands it on", async () => {
      const { root, made, onCreated } = setup();
      await type(root, "Name", "Notes");
      await pick(root, "Local program");
      await type(root, "Command", "npx -y @acme/notes-mcp");
      await type(root, "Secret", "NOTES_TOKEN");
      await press(root, "Create");
      expect(made).toHaveBeenCalledWith({
        name: "Notes",
        hub: "acme",
        way: "stdio",
        account: "",
        url: "",
        command: "npx -y @acme/notes-mcp",
        secret: "NOTES_TOKEN",
      });
      expect(onCreated).toHaveBeenCalledWith({ hub: "acme", id: "notes" });
    });

    it("has no Secret for Gmail and Google Drive", async () => {
      const { root } = setup();
      await pick(root, "Gmail and Google Drive");
      expect(page(root)).not.toContain("Secret");
    });

    it("shows the Hub field only with more than one hub", () => {
      expect(page(setup(["acme"]).root)).not.toContain("Hub");
      unmountAll();
      expect(page(setup(["acme", "beta"]).root)).toContain("Hub");
    });

    it("says why it couldn't create the connector and keeps what was typed", async () => {
      const { root, onCreated } = setup(["acme"], async () => {
        throw new Error("The disk is full.");
      });
      await type(root, "Name", "Notes");
      await pick(root, "Local program");
      await type(root, "Command", "notes-server");
      await press(root, "Create");
      // The alert slot fills a frame after the request ends.
      await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(page(root)).toContain("Couldn't create the connector: The disk is full.");
      expect(onCreated).not.toHaveBeenCalled();
    });
  });
});
