import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { ServedAccountMenu } from "./served-account-menu.ts";

const sofia = {
  name: "Sofia Marin",
  productName: "Acme Agents",
  plan: "Pro",
  usedPercent: 62,
  accountUrl: "https://account.example.com/acme",
  planUrl: "https://account.example.com/acme#plan",
};

/** The page's fetch, answering each `<method> <path>` from `answers`, with what it was sent. */
function pageFetch(answers: Record<string, () => Response>) {
  const sent: string[] = [];
  const fetchPage = async (path: string, init?: RequestInit) => {
    const request = `${init?.method ?? "GET"} ${path}`;
    sent.push(request);
    const answer = answers[request];
    return answer === undefined ? Response.json({ code: "not_found" }, { status: 404 }) : answer();
  };
  return { fetchPage, sent };
}

function served(answers: Record<string, () => Response>, open = vi.fn()) {
  const { fetchPage, sent } = pageFetch(answers);
  return { menu: new ServedAccountMenu(fetchPage, open), sent, open };
}

verifies("studio.served-account-menu", () => {
  describe("the served account menu", () => {
    it("has no menu when the computer answers 404", async () => {
      const { menu, sent } = served({});
      expect(await menu.load()).toBeNull();
      expect(sent).toEqual(["GET /api/account-menu"]);
    });

    it("reads the customer's facts from the answer", async () => {
      const { menu } = served({ "GET /api/account-menu": () => Response.json(sofia) });
      expect(await menu.load()).toEqual(sofia);
    });

    it("reads a customer with no plan and no cost limit", async () => {
      const bare = { ...sofia, plan: null, usedPercent: null };
      const { menu } = served({ "GET /api/account-menu": () => Response.json(bare) });
      expect(await menu.load()).toEqual(bare);
    });

    it("rejects a refusal with the status only", async () => {
      const { menu } = served({
        "GET /api/account-menu": () => Response.json({ code: "boom" }, { status: 503 }),
      });
      await expect(menu.load()).rejects.toThrow(
        "The computer answered 503 to GET /api/account-menu.",
      );
    });

    it.each([
      ["an http: account address", { ...sofia, accountUrl: "http://account.example.com/acme" }],
      ["a user in the plan address", { ...sofia, planUrl: "https://eve@account.example.com/" }],
      ["a script address", { ...sofia, planUrl: "javascript:alert(1)" }],
      ["a field too many", { ...sofia, extra: true }],
      ["a missing name", { ...sofia, name: undefined }],
    ])("rejects an answer with %s", async (_, answer) => {
      const { menu } = served({ "GET /api/account-menu": () => Response.json(answer) });
      await expect(menu.load()).rejects.toThrow("answer isn't an account menu");
    });

    it("posts the sign-out, and rejects when the computer didn't end the session", async () => {
      const ended = served({ "POST /api/sign-out": () => new Response(null, { status: 204 }) });
      await ended.menu.signOut();
      expect(ended.sent).toEqual(["POST /api/sign-out"]);

      const refused = served({ "POST /api/sign-out": () => new Response(null, { status: 500 }) });
      await expect(refused.menu.signOut()).rejects.toThrow(
        "The computer answered 500 to POST /api/sign-out.",
      );
    });

    it("remembers the product it signed out of, and only once the computer ended the session", async () => {
      const answers = {
        "GET /api/account-menu": () => Response.json(sofia),
        "POST /api/sign-out": () => new Response(null, { status: 204 }),
      };
      const { menu } = served(answers);
      await menu.load();
      expect(menu.signedOutOf()).toBeNull();
      await menu.signOut();
      expect(menu.signedOutOf()).toBe("Acme Agents");

      const refused = served({
        "GET /api/account-menu": () => Response.json(sofia),
        "POST /api/sign-out": () => new Response(null, { status: 500 }),
      });
      await refused.menu.load();
      await expect(refused.menu.signOut()).rejects.toThrow();
      expect(refused.menu.signedOutOf()).toBeNull();
    });

    it("signs in again at the computer's sign-in route, and opens addresses in the page", () => {
      const { menu, open } = served({});
      expect(menu.signInAddress).toBe("/api/sign-in");
      menu.open(sofia.planUrl);
      expect(open).toHaveBeenCalledWith(sofia.planUrl);
    });
  });
});
