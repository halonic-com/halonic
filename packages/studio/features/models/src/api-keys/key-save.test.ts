import { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { AllowAddressResult, KeyAddresses } from "../api.ts";
import { readAddress } from "./key-address.ts";
import { AddressRefused, saveKey } from "./key-save.ts";

/** A key store and its addresses in memory, logging each call in order. */
function store(stored: boolean, answer?: AllowAddressResult["result"]) {
  const log: string[] = [];
  let has = stored;
  const keys = {
    save: async (name: string) => {
      log.push(`save ${name}`);
      has = true;
    },
    remove: async (name: string) => {
      log.push(`remove ${name}`);
      has = false;
    },
  };
  const addresses: KeyAddresses = {
    allowed: async () => undefined,
    allow: async (name, address) => {
      log.push(`allow ${name} ${address}`);
      if (!has) return { result: "no-key" };
      if (answer === "full") return { result: "full" };
      return { result: "added", origin: new URL(address).origin };
    },
    usualAddress: () => undefined,
  };
  return { keys, addresses, log };
}

const key = new SecretText("sk-acme-test-123");

verifies("models.api-keys.address-field", () => {
  it("stores a new key, then its address", async () => {
    const { keys, addresses, log } = store(false);

    const kept = await saveKey(keys, addresses, "acme", {
      key,
      address: "https://llm.example.com",
    });

    expect(kept).toBe("https://llm.example.com");
    expect(log).toEqual([
      "allow acme https://llm.example.com",
      "save acme",
      "allow acme https://llm.example.com",
    ]);
  });

  it("adds the address before a stored key's new value, which keeps it", async () => {
    const { keys, addresses, log } = store(true);

    await saveKey(keys, addresses, "acme", { key, address: "https://llm.example.com" });

    expect(log).toEqual(["allow acme https://llm.example.com", "save acme"]);
  });

  it("removes a new key again when its address isn't kept", async () => {
    const { keys, addresses, log } = store(false, "full");

    const saving = saveKey(keys, addresses, "acme", { key, address: "https://llm.example.com" });

    await expect(saving).rejects.toBeInstanceOf(AddressRefused);
    expect(log.at(-1)).toBe("remove acme");
  });

  it("stores only the key where the Studio keeps no addresses", async () => {
    const { keys, log } = store(false);

    expect(await saveKey(keys, undefined, "acme", { key, address: "https://x.example" })).toBe(
      undefined,
    );
    expect(log).toEqual(["save acme"]);
  });

  it("reads the typed text as the address that is kept", () => {
    expect(readAddress(" https://Gateway.example.com:443/v1?x=1 ")).toEqual({
      kind: "address",
      address: "https://gateway.example.com",
      partDropped: true,
      unencrypted: false,
    });
    expect(readAddress("http://localhost:11434")).toMatchObject({ unencrypted: false });
    expect(readAddress("http://127.0.0.1:1234/")).toMatchObject({ partDropped: false });
    expect(readAddress("http://192.168.1.20:8080")).toMatchObject({ unencrypted: true });
    expect(readAddress("")).toEqual({ kind: "problem", problem: "empty" });
    expect(readAddress("llm.example.com")).toEqual({ kind: "problem", problem: "not-an-address" });
    expect(readAddress("localhost:11434")).toEqual({
      kind: "problem",
      problem: "not-an-address",
    });
    expect(readAddress("ftp://llm.example.com")).toEqual({ kind: "problem", problem: "scheme" });
    expect(readAddress("https://user:pw@llm.example.com")).toEqual({
      kind: "problem",
      problem: "user-info",
    });
  });
});
