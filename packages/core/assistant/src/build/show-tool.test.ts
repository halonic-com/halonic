import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { digest, testWorkspace } from "../testing/test-workspace.test-helper.ts";
import type { BuildToolsOptions } from "./build-chat.ts";
import { buildChatTools } from "./build-tools.ts";

const files = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
};

/** Calls the chat's `show` tool with `args`, the host showing items with `show`. */
async function callShow(args: Record<string, unknown>, show?: BuildToolsOptions["show"]) {
  const { store, review, trust } = testWorkspace(files);
  const tools = buildChatTools({
    chatId: "c1",
    files: store,
    review,
    isTrusted: () => trust.trusted,
    digest,
    show,
    personMessages: async () => [],
  });
  const tool = tools.find((each) => each.definition.name === "show");
  if (tool === undefined) throw new Error("no show tool");
  return tool.call({ id: "call-1", name: "show", arguments: args });
}

const r42 = { kind: "run", hub: "support", id: "r42" };

verifies("assistant.build.show-tool", () => {
  it("shows an item of the workspace's hubs and says where", async () => {
    const show = vi.fn(async () => "shown" as const);
    expect(await callShow(r42, show)).toBe("Showed run r42 in the main view, next to the chat.");
    expect(show).toHaveBeenCalledWith(r42);
  });

  it("answers an error for an item that isn't there, without failing", async () => {
    const show = vi.fn(async () => "unknown" as const);
    expect(await callShow({ ...r42, id: "r99" }, show)).toBe(
      'Error: there is no run "r99" in hub support.',
    );
  });

  it("refuses an item of another hub without showing anything", async () => {
    const show = vi.fn(async () => "shown" as const);
    expect(await callShow({ ...r42, hub: "billing" }, show)).toBe(
      'Error: there is no run "r42" in hub billing.',
    );
    expect(show).not.toHaveBeenCalled();
  });

  it("says when the chat has nowhere to show items", async () => {
    const nowhere = "Error: there's nowhere to show items in this chat.";
    expect(await callShow(r42)).toBe(nowhere);
    expect(await callShow(r42, async () => "nowhere")).toBe(nowhere);
  });

  it("asks for each of kind, hub and id as a text", async () => {
    await expect(callShow({ kind: "run", hub: "support" }, async () => "shown")).rejects.toThrow(
      '"id" must be a text.',
    );
  });
});
