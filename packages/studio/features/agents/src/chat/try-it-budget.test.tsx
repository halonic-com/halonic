// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MissingModelKey } from "../api.ts";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { Chat, scriptedHost, sendMessage } from "./try-it-test-support.tsx";

afterEach(unmount);

// The Inbox's monthly notice, as the host hands it over.
const line =
  "This month's estimated spend reached its budget of €50.00. Runs won't start until 1 December (UTC) or until you change the budget.";
const status = (page: HTMLElement) => page.querySelector("[role=status]")?.textContent ?? "";
const box = (page: HTMLElement) => page.querySelector("textarea") as HTMLTextAreaElement;
const ways = (changeBudget?: () => void) => ({
  goToKeyField: () => {},
  openHarness: () => {},
  setTheKey: () => {},
  changeBudget,
});

verifies("agents.chat.budget", () => {
  describe("the line the month's used-up budget puts under the Try it box (H21)", () => {
    it("says the Inbox's sentence with Change budget, and Send sends nothing", async () => {
      const { host, requests } = scriptedHost({ budgetReached: () => line });
      const page = await show(
        <Chat host={host} harness="halonic" announce={vi.fn()} ways={ways(() => {})} />,
      );
      expect(status(page)).toContain(line);
      expect(buttonNamed(page, "Change budget")).toBeDefined();
      await sendMessage(page, "Sort this mail");
      expect(requests).toHaveLength(0);
      expect(box(page).value).toBe("Sort this mail");
      const send = buttonNamed(page, "Send");
      expect(send?.getAttribute("aria-disabled")).toBe("true");
      const reason = page.querySelector(`[id="${send?.getAttribute("aria-describedby")}"]`);
      expect(reason?.textContent).toContain(line);
    });

    it("opens the budget on Change budget, and leaves it out where the page can't", async () => {
      const changeBudget = vi.fn();
      const { host } = scriptedHost({ budgetReached: () => line });
      const page = await show(
        <Chat host={host} harness="halonic" announce={vi.fn()} ways={ways(changeBudget)} />,
      );
      await act(async () => buttonNamed(page, "Change budget")?.click());
      expect(changeBudget).toHaveBeenCalledOnce();
      unmount();
      const without = await show(
        <Chat host={host} harness="halonic" announce={vi.fn()} ways={ways()} />,
      );
      expect(status(without)).toContain(line);
      expect(buttonNamed(without, "Change budget")).toBeUndefined();
    });

    it("comes after the harness's line and before the model's key, and shows nothing with room", async () => {
      const smart: MissingModelKey = { model: "smart", provider: "Anthropic", secretName: "KEY" };
      const missingKeys = { "acme/sorter": smart };
      const { host } = scriptedHost({ budgetReached: () => line, missingKeys });
      const page = await show(<Chat host={host} harnessStrip="not-installed" announce={vi.fn()} />);
      expect(status(page)).toContain("Sorter can't run until Claude Code is installed.");
      expect(status(page)).not.toContain(line);
      unmount();
      const keyless = await show(<Chat host={host} harness="halonic" announce={vi.fn()} />);
      expect(status(keyless)).toContain(line);
      expect(status(keyless)).not.toContain("needs an API key");
      unmount();
      const room = scriptedHost({ budgetReached: () => undefined });
      const page2 = await show(<Chat host={room.host} harness="halonic" announce={vi.fn()} />);
      expect(status(page2)).toBe("");
    });
  });
});
