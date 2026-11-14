import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { acme } from "./acme-plugins.testing.ts";
import { desktopPluginActions } from "./plugin-actions.ts";
import { PluginFeed } from "./plugin-feed.ts";

/** The actions over the acme plugins, with a keychain that records deletes and can refuse one. */
async function setup() {
  const { service, reader } = acme();
  const feed = new PluginFeed(service);
  await feed.reload();
  const deleted: string[] = [];
  const keychain = { failing: false };
  const onReloadFailed = vi.fn();
  const actions = desktopPluginActions({
    service,
    feed,
    secrets: {
      get: async () => null,
      set: async () => {},
      remove: async (name) => {
        if (keychain.failing) throw new Error("the keychain is locked");
        deleted.push(name);
      },
    },
    reveal: async () => true,
    onReloadFailed,
  });
  const statusOf = (plugin: string) =>
    feed.current().find((each) => each.plugin === plugin)?.status;
  return { actions, feed, reader, service, deleted, keychain, onReloadFailed, statusOf };
}

verifies("studio.desktop-plugins-host", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("trusts what the page showed, then removes the trust and the plugin", async () => {
    const { actions, statusOf, deleted } = await setup();
    expect(statusOf("weather")).toBe("not-trusted");
    await actions.trust("weather");
    expect(statusOf("weather")).toBe("on");
    await actions.revoke("weather");
    expect(statusOf("weather")).toBe("not-trusted");
    await actions.trust("weather");
    await expect(actions.remove("weather")).resolves.toEqual({ kind: "removed" });
    expect(deleted).toEqual(["plugin__weather__example-key"]);
  });

  it("says which secret couldn't be deleted, and keeps the plugin", async () => {
    const { actions, keychain, statusOf } = await setup();
    keychain.failing = true;
    await expect(actions.remove("weather")).resolves.toEqual({
      kind: "secret",
      secret: "example-key",
      reason: "the keychain is locked",
    });
    expect(statusOf("weather")).toBe("not-trusted");
  });

  it("refuses to trust a plugin whose files changed after the page drew the check", async () => {
    const { actions, reader, service, statusOf } = await setup();
    reader.putFile("weather/backend/index.js", "export default { changed: true };\n");
    await expect(actions.trust("weather")).rejects.toThrow("changed since you reviewed it");
    const entry = (await service.load()).find((each) => each.folder === "weather");
    expect(entry?.status).toBe("new");
    expect(statusOf("weather")).toBe("not-trusted");
  });

  it("refuses to trust a plugin that can't load, or one the page never showed", async () => {
    const { actions } = await setup();
    await expect(actions.trust("broken")).rejects.toThrow("can't be read");
    await expect(actions.trust("missing")).rejects.toThrow("can't be read");
  });

  it("keeps a change's result when reading the folder again fails, and reports the failure", async () => {
    const { actions, service, onReloadFailed } = await setup();
    const failure = new Error("the folder can't be listed");
    const load = service.load.bind(service);
    vi.spyOn(service, "load").mockImplementation(async () => {
      throw failure;
    });
    await expect(actions.revoke("weather")).resolves.toBeUndefined();
    expect(onReloadFailed).toHaveBeenCalledWith(failure);
    expect((await load()).length).toBe(3);
  });

  it("says the folder isn't there only when the shell says it wasn't shown", async () => {
    const { service, feed } = await setup();
    const open = (answer: unknown) =>
      desktopPluginActions({
        service,
        feed,
        secrets: { get: async () => null, set: async () => {}, remove: async () => {} },
        reveal: async () => answer as boolean,
        onReloadFailed: () => {},
      }).openFolder("weather");
    await expect(open(true)).resolves.toBeUndefined();
    await expect(open(undefined)).rejects.toThrow("isn't there");
  });
});
