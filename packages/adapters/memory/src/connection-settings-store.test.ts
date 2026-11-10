import { connectionSettings } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryConnectionSettingsStore } from "./connection-settings-store.ts";

verifies("memory.connection-settings-store", () => {
  it("makes damaged settings unreadable, naming their key", async () => {
    const store = new MemoryConnectionSettingsStore();
    await store.save(connectionSettings("/workspaces/acme"));
    store.damage({ location: "/workspaces/acme", connector: "mail" });
    await expect(store.get({ location: "/workspaces/acme", connector: "mail" })).rejects.toThrow(
      'The connection settings for "mail" in "/workspaces/acme" can\'t be read.',
    );
  });

  it("refuses to damage settings it doesn't hold", async () => {
    const store = new MemoryConnectionSettingsStore();
    const key = { location: "/workspaces/never", connector: "mail" };
    expect(() => store.damage(key)).toThrow(
      'There are no connection settings for "mail" in "/workspaces/never" to damage.',
    );
    expect(await store.get(key)).toBeNull();
  });
});
