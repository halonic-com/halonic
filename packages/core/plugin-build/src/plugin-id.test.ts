import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { archiveFileName, isPluginId, pluginIdFor, releaseFileName } from "./plugin-id.ts";

verifies("plugin-build.plugin-id", () => {
  it("builds halonic-ws.<name> from the workspace's name", () => {
    expect(pluginIdFor("acme")).toEqual({ ok: true, value: "halonic-ws.acme" });
    expect(pluginIdFor("acme-support-2")).toEqual({ ok: true, value: "halonic-ws.acme-support-2" });
    expect(pluginIdFor("0")).toEqual({ ok: true, value: "halonic-ws.0" });
  });

  it("takes a name of 63 characters and refuses one of 64", () => {
    expect(pluginIdFor("a".repeat(63)).ok).toBe(true);
    expect(pluginIdFor("a".repeat(64)).ok).toBe(false);
  });

  it.each([
    "",
    "Acme",
    "../acme",
    "acme/tools",
    "acme.tools",
    "-acme",
    "acme tools",
    "acme\n",
    "äcme",
  ])("refuses the workspace name %j, without changing it to fit", (name) => {
    expect(pluginIdFor(name)).toEqual({
      ok: false,
      error: { code: "bad-plugin-id", pluginId: `halonic-ws.${name}` },
    });
  });

  it("names the archive and release file from the id and version", () => {
    expect(isPluginId("halonic-ws.acme")).toBe(true);
    expect(archiveFileName("halonic-ws.acme", "0.3.0")).toBe("halonic-ws.acme-0.3.0.tar");
    expect(releaseFileName("halonic-ws.acme", "0.3.0")).toBe("halonic-ws.acme-0.3.0.release.json");
  });
});
