import type { PluginService } from "@halonicjs/app";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { acme } from "./acme-plugins.testing.ts";
import { PluginFeed } from "./plugin-feed.ts";

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

  it("keeps the fingerprint each plugin had when it was read, and none for one that can't load", async () => {
    const { service } = acme();
    const feed = new PluginFeed(service);
    expect(feed.fingerprintOf("weather")).toBeUndefined();
    await feed.reload();
    expect(feed.fingerprintOf("weather")).toMatch(/^hpf1:[0-9a-f]{64}$/);
    expect(feed.fingerprintOf("weather")).not.toBe(feed.fingerprintOf("rain"));
    expect(feed.fingerprintOf("broken")).toBeUndefined();
  });

  it("answers a reload made during a read with a read that started after the call", async () => {
    const { service } = acme();
    const feed = new PluginFeed(service);
    await feed.reload();
    const real = service.load.bind(service);
    const load = vi.spyOn(service, "load");
    const release: (() => void)[] = [];
    load.mockImplementation(async () => {
      const entries = await real();
      await new Promise<void>((resolve) => release.push(resolve));
      return entries;
    });
    const first = feed.reload();
    await waitUntil("release to have length 1", () => release.length === 1);
    expect(release).toHaveLength(1);
    const weather = (await real()).find((each) => each.folder === "weather");
    if (weather === undefined || weather.status === "broken")
      throw new Error("weather should load");
    await service.trust("weather", weather.fingerprint, "prompt");
    let settled = false;
    const second = feed.reload().then(() => {
      settled = true;
    });
    const third = feed.reload();
    release[0]?.();
    await first;
    await Promise.resolve();
    expect(settled).toBe(false);
    await waitUntil("release to have length 2", () => release.length === 2);
    expect(release).toHaveLength(2);
    release[1]?.();
    await Promise.all([second, third]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(feed.current().find((each) => each.plugin === "weather")?.status).toBe("on");
  });

  it("never runs two reads at once when a reload lands between a read's end and the next one", async () => {
    const { service } = acme();
    const feed = new PluginFeed(service);
    await feed.reload();
    const real = service.load.bind(service);
    const load = vi.spyOn(service, "load");
    const release: (() => void)[] = [];
    let running = 0;
    let mostRunning = 0;
    load.mockImplementation(async () => {
      running += 1;
      mostRunning = Math.max(mostRunning, running);
      const entries = await real();
      await new Promise<void>((resolve) => release.push(resolve));
      running -= 1;
      return entries;
    });
    let inGap: Promise<void> | undefined;
    const first = feed.reload().then(() => {
      inGap = feed.reload();
    });
    await waitUntil("release to have length 1", () => release.length === 1);
    expect(release).toHaveLength(1);
    const queued = feed.reload();
    release[0]?.();
    await first;
    await waitUntil("release.length to be at least 2", () => release.length >= 2);
    expect(release.length).toBeGreaterThanOrEqual(2);
    for (let next = 1; next < 3 && next < release.length; next += 1) release[next]?.();
    await Promise.all([queued, inGap]);
    expect(mostRunning).toBe(1);
  });
});
