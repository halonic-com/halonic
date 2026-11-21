import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type DoctorPluginProblem, pluginsLine } from "./doctor-plugins-line.ts";
import { doctor, workspace } from "./testing/doctor-fixtures.ts";

const notAdded: DoctorPluginProblem = {
  problem: "not-added",
  connector: "orders",
  plugin: "acme-order",
  near: "acme-orders",
};
const changed: DoctorPluginProblem = { problem: "off", plugin: "tides", why: "changed" };
const broken: DoctorPluginProblem = { problem: "broken", plugin: "maps" };

verifies("app.doctor-plugins", () => {
  it("fails while a plugin a connector uses isn't added", () => {
    expect(pluginsLine([changed, notAdded])).toEqual({
      check: "plugins",
      status: "failed",
      problems: [changed, notAdded],
    });
  });

  it("only warns while every such plugin is added, but off or can't be read", () => {
    expect(pluginsLine([changed, broken])?.status).toBe("warning");
  });

  it("has no line without a problem", () => {
    expect(pluginsLine([])).toBeUndefined();
  });

  it("reports the problems the host found, and counts the line in the summary", async () => {
    const { service } = doctor();
    const report = await service.check({ ...workspace(), pluginProblems: [notAdded] });

    expect(report.plugins).toEqual({ check: "plugins", status: "failed", problems: [notAdded] });
    expect(report.summary).toMatchObject({ problems: 1, needsFixing: true });
  });

  it("counts a plugin that is only off as a warning, and has no line outside a workspace", async () => {
    const { service } = doctor();
    const off = await service.check({ ...workspace(), pluginProblems: [changed] });

    expect(off.summary).toMatchObject({ problems: 0, warnings: 1, needsFixing: false });
    expect((await service.check(workspace())).plugins).toBeUndefined();
    expect((await service.check(null)).plugins).toBeUndefined();
  });
});
