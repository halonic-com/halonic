import {
  MemoryFolderReader,
  MemoryPluginFolder,
  MemoryRecordStore,
  MemoryTrustStore,
} from "@halonicjs/adapter-memory";
import { PluginService, TrustService } from "@halonicjs/app";
import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { PluginFeed } from "./plugin-feed.ts";

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const manifest = (id: string): string =>
  `id: ${id}
version: 1.0.0
sdk: 1
name: ${id === "rain" ? "Rain" : "Weather"}
backend:
  hosts: [api.acme.example]
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: true }
ui:
  commands:
    - { id: forecast, title: Show the forecast, tool: forecast }
  panel: { title: Weather }`;

/** The plugins `rain` and `weather`, and `broken` whose manifest isn't one. */
function acme() {
  const reader = new MemoryFolderReader("/profile/plugins");
  for (const id of ["rain", "weather"]) {
    reader.putFile(`${id}/plugin.yaml`, manifest(id));
    reader.putFile(`${id}/backend/index.js`, "export default {};\n");
  }
  reader.putFile("broken/plugin.yaml", "id: broken\n");
  const clock = { now: () => new Date("2026-11-14T09:00:00.000Z") };
  const trust = new TrustService({
    store: new MemoryTrustStore(),
    digest,
    clock,
    appVersion: "0.1.0",
  });
  const service = new PluginService({
    plugins: reader,
    writer: new MemoryPluginFolder(),
    digest,
    trust,
    records: new MemoryRecordStore(),
    clock,
  });
  return { service, reader };
}

async function trustWeather(service: PluginService): Promise<void> {
  const entry = (await service.load()).find((each) => each.folder === "weather");
  if (entry === undefined || entry.status === "broken") throw new Error("weather should load");
  const granted = await service.trust("weather", entry.fingerprint, "prompt");
  expect(granted.ok).toBe(true);
}

verifies("studio.desktop-plugins-host", () => {
  it("lists every folder: on, not trusted, and a broken one by its folder's name", async () => {
    const { service } = acme();
    await trustWeather(service);
    const feed = new PluginFeed(service);
    await feed.reload();
    expect(feed.current().map(({ plugin, name, status }) => [plugin, name, status])).toEqual([
      ["broken", "broken", "cant-load"],
      ["rain", "Rain", "not-trusted"],
      ["weather", "Weather", "on"],
    ]);
    const [broken, , weather] = feed.current();
    expect(broken?.problems.length).toBeGreaterThan(0);
    expect(weather).toMatchObject({ panel: { title: "Weather" }, problems: [] });
    expect(weather?.commands).toHaveLength(1);
  });

  it("tells listeners only when a read finds something different", async () => {
    const { service } = acme();
    const feed = new PluginFeed(service);
    const listener = vi.fn();
    feed.subscribe(listener);
    await feed.reload();
    const first = feed.current();
    await feed.reload();
    expect(feed.current()).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
    await trustWeather(service);
    await feed.reload();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(feed.current().find((each) => each.plugin === "weather")?.status).toBe("on");
  });

  it("keeps the plugins it had when the folder can't be listed", async () => {
    const { service } = acme();
    const feed = new PluginFeed(service);
    await feed.reload();
    const had = feed.current();
    vi.spyOn(service, "load").mockRejectedValueOnce(new Error("the folder can't be listed"));
    await expect(feed.reload()).rejects.toThrow("the folder can't be listed");
    expect(feed.current()).toBe(had);
  });

  it("stops telling a listener that unsubscribed", async () => {
    const { service } = acme();
    const feed = new PluginFeed(service);
    const listener = vi.fn();
    feed.subscribe(listener)();
    await feed.reload();
    expect(listener).not.toHaveBeenCalled();
  });
});
