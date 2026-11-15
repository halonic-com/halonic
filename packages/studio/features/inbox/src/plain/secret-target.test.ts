import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { InboxItem, SetupItem } from "../inbox-items.ts";
import { secretTarget } from "./secret-target.ts";

function setup(account: string, needsSecret?: boolean, provider = "google"): SetupItem {
  return {
    kind: "setup",
    key: `setup:${provider}:${account}`,
    provider,
    account,
    title: `Set up ${provider}`,
    progress: "Step 3 of 7 · Consent screen",
    changedAt: "2026-11-12T02:10:00.000Z",
    ...(needsSecret === undefined ? {} : { needsSecret }),
  };
}

verifies("inbox.secret-hold", () => {
  describe("secretTarget", () => {
    it("opens the one account's item", () => {
      expect(secretTarget("google", [setup("a1")])).toEqual({
        kind: "setup",
        provider: "google",
        account: "a1",
      });
    });

    it("opens the first account that still needs a secret", () => {
      const items: InboxItem[] = [setup("a1", false), setup("a2", true), setup("a3", true)];
      expect(secretTarget("google", items)).toMatchObject({ account: "a2" });
    });

    it("opens the first account when none needs a secret", () => {
      expect(secretTarget("google", [setup("a1", false), setup("a2", false)])).toMatchObject({
        account: "a1",
      });
    });

    it("ignores another provider's items", () => {
      expect(secretTarget("google", [setup("x1", true, "other")])).toEqual({ kind: "connectors" });
    });

    it("sends you to add a connector when no account needs setup", () => {
      expect(secretTarget("google", [])).toEqual({ kind: "connectors" });
    });
  });
});
