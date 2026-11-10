import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { runChecks } from "./fixture-repo.ts";

const spec = "packages/core/format/spec/agent.schema.json";
const released = "packages/core/format/spec/released/0.1.0/agent.schema.json";

function schema(version: number, properties: Record<string, unknown>): string {
  const $id = `https://halonic.com/spec/format/agent/v${version}.schema.json`;
  return `${JSON.stringify({ $id, type: "object", properties }, null, 2)}\n`;
}

/** The messages `api-specs` reports for a repo with these spec files. */
function problems(files: Record<string, string>): string[] {
  return runChecks([], { extraFiles: files, rules: ["api-specs"] }).map(({ message }) => message);
}

verifies("check.api-specs-breaking", () => {
  const before = schema(1, { id: { type: "string" }, name: { type: "string" } });

  test("passes a spec without a released copy", () => {
    expect(problems({ [spec]: before })).toEqual([]);
  });

  test("passes an additive change under the same version", () => {
    const after = schema(1, { id: { type: "string" }, name: { type: "string" }, note: {} });
    expect(problems({ [spec]: after, [released]: before })).toEqual([]);
  });

  test("fails a breaking change that keeps the version, naming the change", () => {
    const after = schema(1, { id: { type: "string" } });
    const [message, ...others] = problems({ [spec]: after, [released]: before });
    expect(others).toEqual([]);
    expect(message).toContain('the property "name" was removed');
    expect(message).toContain("still says v1");
  });

  test("passes a breaking change that bumps the version", () => {
    const after = schema(2, { id: { type: "string" } });
    expect(problems({ [spec]: after, [released]: before })).toEqual([]);
  });

  test("compares with the newest released copy", () => {
    const older = schema(1, { id: { type: "string" }, name: { type: "string" }, old: {} });
    const files = {
      [spec]: before,
      [released]: before,
      "packages/core/format/spec/released/0.0.9/agent.schema.json": older,
    };
    expect(problems(files)).toEqual([]);
  });
});
