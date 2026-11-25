// @vitest-environment jsdom
import type { Models } from "@halonicjs/studio-feature-models/api";
import { ModelsService } from "@halonicjs/studio-feature-models/api";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MissingModelKey } from "../api.ts";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { keyFieldOpener } from "./key-field.ts";
import { Chat, scriptedHost, sendMessage } from "./try-it-test-support.tsx";

afterEach(unmount);

// Invented: a provider and the name its key would be stored under, never a key.
const smartNeedsKey: MissingModelKey = {
  model: "smart",
  provider: "Anthropic",
  secretName: "ACME_ANTHROPIC",
};
const line = "Sorter has no model it can use: smart needs an API key for Anthropic.";
const status = (page: HTMLElement) => page.querySelector("[role=status]")?.textContent ?? "";
const box = (page: HTMLElement) => page.querySelector("textarea") as HTMLTextAreaElement;

/** The ways the agent page gives the chat, over a window whose services hold `models`. */
function pageWays(models: Models | undefined) {
  const runCommand = vi.fn(() => true);
  const services = {
    find: (key: unknown) => (key === ModelsService ? models : undefined),
  } as unknown as WorkspaceContext["services"];
  const open = keyFieldOpener({ services, runCommand });
  const ways = {
    goToKeyField: () => open?.(),
    openHarness: () => {},
    setTheKey: (secretName: string) => open?.(secretName),
  };
  return { ways, runCommand };
}

function fakeModels(): Models & { readonly opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    keyStored: async () => false,
    openProviderPage: (secretName, target) => opened.push(`${secretName} ${target ?? "page"}`),
    openAlias: () => {},
  };
}

verifies("agents.chat.model-key", () => {
  describe("the line a model without its key puts under the Try it box (H19)", () => {
    it("names the model and its provider, and Send keeps the message and goes to Set the key ›", async () => {
      const missingKeys = { "acme/sorter": smartNeedsKey };
      const { host, requests } = scriptedHost({ missingKeys });
      const page = await show(<Chat host={host} harness="halonic" announce={vi.fn()} />);
      expect(status(page)).toContain(line);
      expect(page.querySelector("[role=status] code")?.textContent).toBe("smart");
      await sendMessage(page, "Sort this mail");
      expect(requests).toHaveLength(0);
      expect(box(page).value).toBe("Sort this mail");
      expect(buttonNamed(page, "Send")?.hasAttribute("disabled")).toBe(false);
      expect(document.activeElement).toBe(buttonNamed(page, "Set the key ›"));
    });

    it("opens the provider's key block through ModelsService on Set the key ›", async () => {
      const models = fakeModels();
      const { ways, runCommand } = pageWays(models);
      const { host } = scriptedHost({ missingKeys: { "acme/sorter": smartNeedsKey } });
      const page = await show(
        <Chat host={host} harness="halonic" announce={vi.fn()} ways={ways} />,
      );
      await act(async () => buttonNamed(page, "Set the key ›")?.click());
      expect(models.opened).toEqual(["ACME_ANTHROPIC key"]);
      expect(runCommand).not.toHaveBeenCalled();
    });

    it("opens Models where the Models feature isn't there", async () => {
      const { ways, runCommand } = pageWays(undefined);
      const { host } = scriptedHost({ missingKeys: { "acme/sorter": smartNeedsKey } });
      const page = await show(
        <Chat host={host} harness="halonic" announce={vi.fn()} ways={ways} />,
      );
      await act(async () => buttonNamed(page, "Set the key ›")?.click());
      expect(runCommand).toHaveBeenCalledExactlyOnceWith("workspace.open-models");
    });

    it("asks for the key again on Send, so a key stored since lets the message go", async () => {
      const missingKeys: Record<string, MissingModelKey> = { "acme/sorter": smartNeedsKey };
      const { host, requests } = scriptedHost({ missingKeys });
      const page = await show(<Chat host={host} harness="halonic" announce={vi.fn()} />);
      delete missingKeys["acme/sorter"];
      await sendMessage(page, "Sort this mail");
      expect(requests[0]?.messages).toEqual([{ role: "user", content: "Sort this mail" }]);
      expect(status(page)).not.toContain("needs an API key");
    });

    it("comes after the harness's line, and shows nothing for a model that can be used", async () => {
      const { host } = scriptedHost({ missingKeys: { "acme/sorter": smartNeedsKey } });
      const page = await show(<Chat host={host} harnessStrip="not-installed" announce={vi.fn()} />);
      expect(status(page)).toContain("Sorter can't run until Claude Code is installed.");
      expect(status(page)).not.toContain("needs an API key");
      unmount();
      const usable = await show(
        <Chat host={scriptedHost().host} harness="halonic" announce={vi.fn()} />,
      );
      expect(status(usable)).toBe("");
    });
  });
});
