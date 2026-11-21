import type { TrustCheck } from "@halonicjs/app";
import type { KeyOrigins } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import type { ProviderTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { keyAddressLists } from "./key-address-lists.ts";

const fingerprint = "hfp1:0000";
const provider = (id: string, secret?: string): ProviderTrustContent => ({
  id,
  type: "openai-compatible",
  baseUrl: "https://other.example.com/v1",
  ...(secret === undefined ? {} : { secret: `‹secret ${secret}›` }),
  local: false,
});
const newCheck = (providers: ProviderTrustContent[]): TrustCheck => ({
  status: "new",
  content: { connectors: [], providers },
  fingerprint,
  unpinned: [],
});

/** Lists by key name; a name in `broken` can't be read. */
function origins(lists: Record<string, string[]>, broken: string[] = []) {
  const asked: string[] = [];
  const keyOrigins: KeyOrigins = {
    allowedOrigins: async (name) => {
      asked.push(name);
      if (broken.includes(name)) throw new Error("unreadable");
      return lists[name];
    },
  };
  return { keyOrigins, asked };
}

verifies("cli.workspace-provider-key-trust", () => {
  it("reads the list of each key the providers name, once, and keeps the keys that have one", async () => {
    const { keyOrigins, asked } = origins({ "gw-key": ["https://llm.example.com"] });

    const lists = await keyAddressLists(
      newCheck([provider("a", "gw-key"), provider("b", "gw-key"), provider("c", "old-key")]),
      keyOrigins,
    );

    expect([...lists]).toEqual([["gw-key", ["https://llm.example.com"]]]);
    expect(asked).toEqual(["gw-key", "old-key"]);
  });

  it("leaves out a key whose list can't be read, and a provider with no key", async () => {
    const { keyOrigins, asked } = origins({ "ok-key": ["https://llm.example.com"] }, ["bad-key"]);

    const lists = await keyAddressLists(
      newCheck([provider("a", "bad-key"), provider("b"), provider("c", "ok-key")]),
      keyOrigins,
    );

    expect([...lists.keys()]).toEqual(["ok-key"]);
    expect(asked).toEqual(["bad-key", "ok-key"]);
  });

  it("reads nothing without the profile's lists", async () => {
    expect((await keyAddressLists(newCheck([provider("a", "gw-key")]), undefined)).size).toBe(0);
  });
});
