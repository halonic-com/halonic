import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type DoctorPluginProblem, pluginsLine } from "./doctor-plugins-line.ts";

const changed: DoctorPluginProblem = { problem: "off", plugin: "acme-orders", why: "changed" };
const notAdded: DoctorPluginProblem = {
  problem: "not-added",
  connector: "orders",
  plugin: "acme-order",
  near: "acme-orders",
};

verifies("app.doctor-plugins", () => {
  it("warns about a plugin that is off or can't be read", () => {
    const broken: DoctorPluginProblem = { problem: "broken", plugin: "weather" };
    expect(pluginsLine([changed, broken])).toEqual({
      check: "plugins",
      status: "warning",
      problems: [changed, broken],
    });
  });

  it("fails while a plugin a connector uses isn't added", () => {
    expect(pluginsLine([changed, notAdded])).toEqual({
      check: "plugins",
      status: "failed",
      problems: [changed, notAdded],
    });
  });

  it("has no line when every plugin is on", () => {
    expect(pluginsLine([])).toBeUndefined();
  });
});
