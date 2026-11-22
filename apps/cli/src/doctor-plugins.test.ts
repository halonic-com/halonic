import type { DoctorWorkspace } from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { doctorPluginProblems, withPluginProblems } from "./doctor-plugins.ts";

/** A connector `id` whose transport is the plugin `plugin`, or a program without one. */
function connector(id: string, plugin?: string): Connector {
  const transport =
    plugin === undefined ? { stdio: { command: "acme-files" } } : { plugin: { id: plugin } };
  return { id, transport } as Connector;
}

verifies("cli.doctor-plugins", () => {
  it("names each connector whose plugin isn't added, and each plugin that is off once", () => {
    const problems = doctorPluginProblems(
      [
        connector("orders", "acme-order"),
        connector("invoices", "tides"),
        connector("refunds", "tides"),
        connector("maps", "atlas"),
        connector("files"),
      ],
      [
        { id: "acme-orders", state: "on" },
        { id: "tides", state: "notTrusted" },
        { id: "atlas", state: "broken" },
      ],
    );

    expect(problems).toEqual([
      { problem: "not-added", connector: "orders", plugin: "acme-order", near: "acme-orders" },
      { problem: "off", plugin: "tides", why: "not-trusted" },
      { problem: "broken", plugin: "atlas" },
    ]);
  });

  it("leaves the workspace as it is when every plugin is on, or the computer can't list them", async () => {
    const workspace = { name: "acme" } as DoctorWorkspace;
    const orders = [connector("orders", "acme-orders")];

    expect(
      await withPluginProblems(workspace, orders, async () => [{ id: "acme-orders", state: "on" }]),
    ).toBe(workspace);
    expect(await withPluginProblems(workspace, orders, undefined)).toBe(workspace);
  });
});
