import { createShell, placeNames } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { desktopFeatures } from "./desktop-features.ts";

verifies("studio.desktop-search-overview", () => {
  it("gives Ctrl K the Search feature's provider", () => {
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });

    const providers = shell.contributions.search.providers();

    expect(providers.map((provider) => provider.featureId)).toContain("search");
  });

  it("lists Overview in the sidebar's places, under Team", () => {
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });

    const overview = shell.contributions.places.list().find((place) => place.id === "overview");

    expect(overview?.featureId).toBe("overview");
    expect(placeNames.overview).toEqual({ label: "Overview", icon: "overview", group: "team" });
  });
});
