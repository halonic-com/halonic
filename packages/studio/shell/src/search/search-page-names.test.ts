import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { WordsOptions } from "../palette/name-match.ts";
import type { SearchResult } from "../points/commands.ts";
import {
  type NameResult,
  type SearchPageQuery,
  type SearchScope,
  searchPageLocation,
  searchPageNames,
  searchPageWords,
} from "./search-page-names.ts";

const plain: WordsOptions = { matchCase: false, wholeWord: false };

function agent(id: string, label: string, description?: string, hub = "acme"): SearchResult {
  return {
    item: { kind: "agent", hub, id },
    label,
    detail: `Agent · ${hub}`,
    ...(description === undefined ? {} : { description }),
  };
}

function query(
  words: string,
  options: Partial<WordsOptions> = {},
  scope: SearchScope = {},
): SearchPageQuery {
  return { words, options: { ...plain, ...options }, scope };
}

/** The listed labels. */
function labels(results: readonly NameResult[]): string[] {
  return results.map((result) => result.label);
}

/** The highlighted text of the name or, failing that, the description. */
function highlighted(result: NameResult | undefined): string | undefined {
  if (result?.labelMatch !== undefined) {
    return result.label.slice(result.labelMatch.start, result.labelMatch.end);
  }
  const match = result?.descriptionMatch;
  return match && result?.description?.slice(match.start, match.end);
}

verifies("shell.search-page-names", () => {
  describe("searchPageNames", () => {
    it("lists name matches first, then items whose description alone matches", () => {
      const found = [
        agent("triage", "Mail triage", "Sorts refund mail."),
        agent("checker", "Refund checker", "Checks refund requests against the policy."),
        agent("writer", "Writer", "Writes replies."),
      ];
      const page = searchPageNames(query("refund"), found, false);
      expect(labels(page.results)).toEqual(["Refund checker", "Mail triage"]);
      expect(page.results.map(highlighted)).toEqual(["Refund", "refund"]);
      expect(page.results[1]?.labelMatch).toBeUndefined();
    });

    it("ranks names as Ctrl K does, keeping the providers' order among equals", () => {
      const found = [
        agent("late", "Late refunds"),
        agent("checker", "Refund checker"),
        agent("policy", "Refund policy"),
        agent("refund", "Refund"),
      ];
      const page = searchPageNames(query("refund"), found, false);
      expect(labels(page.results)).toEqual([
        "Refund",
        "Refund checker",
        "Refund policy",
        "Late refunds",
      ]);
    });

    it("ranks a name by where Match case finds the words, as it highlights them", () => {
      // Without Match case, "refund Refund" would start with the words and rank first.
      const found = [agent("twice", "refund Refund"), agent("checker", "Refund checker")];
      const page = searchPageNames(query("Refund", { matchCase: true }), found, false);
      expect(labels(page.results)).toEqual(["Refund checker", "refund Refund"]);
      expect(page.results[1]?.labelMatch).toEqual({ rank: "word-starts-with", start: 7, end: 13 });
    });

    it("ranks a name by where Whole word finds the words", () => {
      // Without Whole word, "Triaged triage" would start with the words and rank first.
      const found = [agent("mail", "Mail triage"), agent("late", "Triaged triage")];
      const page = searchPageNames(query("triage", { wholeWord: true }), found, false);
      expect(page.results.map((result) => result.labelMatch?.rank)).toEqual([
        "word-starts-with",
        "word-starts-with",
      ]);
      expect(labels(page.results)).toEqual(["Mail triage", "Triaged triage"]);
    });

    it("reads the words as plain text", () => {
      const found = [agent("eu", "Billing (EU)"), agent("x", "workspaceXyaml")];
      expect(labels(searchPageNames(query("(EU)"), found, false).results)).toEqual([
        "Billing (EU)",
      ]);
      expect(searchPageNames(query("workspace.yaml"), found, false).results).toEqual([]);
    });

    it("matches only the same capitals with Match case on", () => {
      const found = [agent("big", "Triage"), agent("small", "triage helper")];
      expect(labels(searchPageNames(query("triage"), found, false).results)).toHaveLength(2);
      const page = searchPageNames(query("triage", { matchCase: true }), found, false);
      expect(labels(page.results)).toEqual(["triage helper"]);
    });

    it("skips words inside a longer word with Whole word on", () => {
      const found = [agent("triaged", "Triaged mail"), agent("triage", "Mail triage (EU)")];
      const page = searchPageNames(query("triage", { wholeWord: true }), found, false);
      expect(labels(page.results)).toEqual(["Mail triage (EU)"]);
      expect(highlighted(page.results[0])).toBe("triage");
    });

    it("finds a whole word after the same letters inside another word", () => {
      const found = [agent("one", "Retriage triage")];
      const page = searchPageNames(query("triage", { wholeWord: true }), found, false);
      expect(highlighted(page.results[0])).toBe("triage");
      expect(page.results[0]?.labelMatch?.start).toBe(9);
    });

    it("narrows to the picked kind and hub, offering every kind and hub that matches", () => {
      const flow: SearchResult = {
        item: { kind: "workflow", hub: "beta", id: "flow" },
        label: "Refund flow",
      };
      const found = [agent("checker", "Refund checker"), flow];
      const inBeta = searchPageNames(query("refund", {}, { hub: "beta" }), found, false);
      expect(labels(inBeta.results)).toEqual(["Refund flow"]);
      expect(inBeta.hubs).toEqual(["acme", "beta"]);
      expect(inBeta.kinds).toEqual(["agent", "workflow"]);
      const agents = searchPageNames(query("refund", {}, { kind: "agent" }), found, false);
      expect(labels(agents.results)).toEqual(["Refund checker"]);
    });

    it("lists an item two providers found once", () => {
      const found = [agent("checker", "Refund checker"), agent("checker", "Refund checker")];
      expect(searchPageNames(query("refund"), found, false).results).toHaveLength(1);
    });

    it("finds an item by the description a later provider gave", () => {
      const found = [
        agent("checker", "Refund checker"),
        agent("checker", "Refund checker", "Checks requests against the policy."),
      ];
      const page = searchPageNames(query("policy"), found, false);
      expect(labels(page.results)).toEqual(["Refund checker"]);
      expect(highlighted(page.results[0])).toBe("policy");
    });

    it("says nothing matches, and offers all hubs while a hub is picked", () => {
      const found = [agent("checker", "Refund checker")];
      const everywhere = searchPageNames(query("refnud"), found, false);
      expect(everywhere).toMatchObject({ nothingFound: true, offerAllHubs: false });
      const inBeta = searchPageNames(query("refund", {}, { hub: "beta" }), found, false);
      expect(inBeta).toMatchObject({ nothingFound: true, offerAllHubs: true });
    });

    it("says it couldn't search when a provider failed and nothing matches", () => {
      const failed = searchPageNames(query("refund"), [], true);
      expect(failed).toMatchObject({ nothingFound: false, couldNotSearch: true });
      const partly = searchPageNames(query("refund"), [agent("c", "Refund checker")], true);
      expect(partly).toMatchObject({ nothingFound: false, couldNotSearch: false });
      expect(partly.results).toHaveLength(1);
    });

    it("finds and says nothing while nothing is typed", () => {
      const page = searchPageNames(query("  "), [agent("checker", "Refund checker")], false);
      expect(page).toMatchObject({ results: [], nothingFound: false, couldNotSearch: false });
    });
  });

  describe("searchPageLocation", () => {
    it("makes each search its own place, its tab reading Search: and the words", () => {
      const refund = searchPageLocation(" refund ");
      expect(refund.title).toBe("Search: refund");
      expect(searchPageWords(refund)).toBe("refund");
      expect(refund.key).not.toBe(searchPageLocation("policy").key);
    });

    it("reads no words from another place", () => {
      expect(searchPageWords({ key: "agent/acme/search:x", title: "search:x" })).toBeUndefined();
      expect(searchPageWords({ key: "home", title: "Home" })).toBeUndefined();
    });
  });
});
