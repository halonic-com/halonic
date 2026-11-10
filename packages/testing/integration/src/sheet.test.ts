import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkCase, checkDeclaration, checkPolicy } from "./checks.ts";
import { forecastExchange, recording, weatherSubject } from "./fixtures/weather.ts";
import type { ConformanceSubject, ToolCase } from "./run.ts";

const sheet = weatherSubject.sheet as Record<string, unknown>;

function withSheet(changes: Record<string, unknown>): ConformanceSubject {
  return { ...weatherSubject, sheet: { ...sheet, ...changes } };
}

const forecastCase: ToolCase = {
  tool: "forecast",
  scenario: "forecast-ghent",
  args: { city: "Ghent" },
};

verifies("integration.reads-the-sheet", () => {
  it("fails a sheet that breaks its schema", () => {
    expect(() => checkDeclaration(withSheet({ network: "any" }))).toThrow(
      /the sheet is invalid:[\s\S]*unrecognized_keys/,
    );
  });

  it("fails code whose tool text differs from the sheet", () => {
    const integration = {
      ...weatherSubject.integration,
      tools: weatherSubject.integration.tools.map((tool) =>
        tool.name === "forecast" ? { ...tool, description: "Tomorrow's forecast." } : tool,
      ),
    };
    expect(() => checkDeclaration({ ...weatherSubject, integration })).toThrow(
      /"forecast" differs in description between code and sheet/,
    );
  });

  it("fails a recording that isn't a valid halonic.recording/1 file", () => {
    const exchange = forecastExchange({ kind: "empty" });
    const broken = recording("forecast-ghent", [
      { ...exchange, request: { ...exchange.request, method: "get" } },
    ]);
    expect(() => checkDeclaration({ ...weatherSubject, recordings: [broken] })).toThrow(
      /recording 1 isn't a valid halonic.recording\/1 file/,
    );
  });

  it("fails a recording made for another integration", () => {
    const theirs = { ...recording("forecast-ghent", []), integration: "notes" };
    expect(() => checkDeclaration({ ...weatherSubject, recordings: [theirs] })).toThrow(
      /the recording "forecast-ghent" is for "notes"/,
    );
  });

  it("fails a case that calls an undeclared tool or replays a missing recording", () => {
    const undeclared = { ...forecastCase, tool: "delete-city" };
    expect(() => checkDeclaration({ ...weatherSubject, cases: [undeclared] })).toThrow(
      /a case calls "delete-city", which isn't declared/,
    );
    const unrecorded = { ...forecastCase, scenario: "forecast-paris" };
    expect(() => checkDeclaration({ ...weatherSubject, cases: [unrecorded] })).toThrow(
      /a case replays the scenario "forecast-paris", which has no recording/,
    );
  });

  it("resolves a { fromSetting } host only with its setting", () => {
    const local = withSheet({
      hosts: ["api.example.com", { fromSetting: "url", class: "loopback" }],
    });
    expect(() => checkPolicy(local)).toThrow(/setting-missing at hosts.1/);
    expect(() =>
      checkPolicy({ ...local, settings: { url: "http://localhost:8080" } }),
    ).not.toThrow();
  });

  it("runs cases with the sheet's limits", async () => {
    const small = withSheet({ limits: { maxResponseBytes: 1 } });
    await expect(checkCase(small, forecastCase)).rejects.toThrow(/is larger than 1 bytes/);
  });
});
