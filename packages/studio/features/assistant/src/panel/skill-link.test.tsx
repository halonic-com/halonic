// @vitest-environment jsdom
import type { StudioHost, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { buttonNamed, chatOf, fakeHost, show, unmount } from "../test-support.tsx";
import { AssistantPanel } from "./assistant-panel.tsx";

afterEach(unmount);

const skillPath = "library/skills/halonic-authoring/SKILL.md";

function panel(fake: ReturnType<typeof fakeHost>, host?: StudioHost) {
  const openItemInNewTab = vi.fn();
  const save = vi.fn((_item: unknown, write: () => Promise<void>) => write().then(() => true));
  const context = {
    services: { get: () => fake.host, find: () => fake.host },
    announcer: { announce: vi.fn() },
    openItemInNewTab,
    saving: { save, setFieldsNotSaved: vi.fn() },
    host,
  } as unknown as WorkspaceContext;
  const node = <AssistantPanel context={context} title="Assistant" onClose={() => {}} />;
  return { node, openItemInNewTab, save };
}

verifies("assistant.build.authoring-skill-override", () => {
  it("writes the built-in skill as a save, opens it in a tab, and then reads edit skill", async () => {
    const fake = fakeHost();
    const { node, openItemInNewTab, save } = panel(fake);
    const page = await show(node);
    await act(async () => buttonNamed(page, "customize skill")?.click());
    expect(fake.customized()).toBe(1);
    expect(save).toHaveBeenCalledOnce();
    expect(openItemInNewTab).toHaveBeenCalledWith({
      kind: "file",
      hub: "workspace",
      id: skillPath,
    });
    expect(buttonNamed(page, "customize skill")).toBeUndefined();
    expect(buttonNamed(page, "edit skill")?.className).toContain("text-accent-text");
  });

  it("opens the workspace's own skill with edit skill, writing nothing", async () => {
    const fake = fakeHost();
    const own = `hubs/support/${skillPath}`;
    fake.ownSkill(own);
    const { node, openItemInNewTab } = panel(fake);
    const page = await show(node);
    await act(async () => buttonNamed(page, "edit skill")?.click());
    expect(fake.customized()).toBe(0);
    expect(openItemInNewTab).toHaveBeenCalledWith({ kind: "file", hub: "workspace", id: own });
  });

  it("opens nothing when the skill couldn't be written", async () => {
    const fake = fakeHost();
    const { node, openItemInNewTab, save } = panel(fake);
    save.mockResolvedValue(false);
    const page = await show(node);
    await act(async () => buttonNamed(page, "customize skill")?.click());
    expect(openItemInNewTab).not.toHaveBeenCalled();
    expect(buttonNamed(page, "customize skill")).toBeDefined();
  });

  it("has no link in an agent chat, nor on a phone", async () => {
    const agentChat = {
      ...chatOf("a1", [{ role: "user", content: "Hi" }], "Hi"),
      kind: "agent:support/sorter" as const,
    };
    const inAgentChat = await show(panel(fakeHost([agentChat])).node);
    expect(buttonNamed(inAgentChat, "customize skill")).toBeUndefined();
    unmount();
    const onPhone = await show(panel(fakeHost(), "phone").node);
    expect(onPhone.querySelector("textarea")).not.toBeNull();
    expect(buttonNamed(onPhone, "customize skill")).toBeUndefined();
  });
});
