import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { removeUnhealthyWorkflows } from "./health-rule.ts";

const cascade = {
  workflowId: "W-d3-cascade",
  steps: [{ variant: { model: "deepseek-flash" } }, { variant: { model: "opus" } }],
};
const opusOnly = {
  workflowId: "W-opus",
  steps: [{ variant: { model: "opus" } }, { variant: { model: "opus" } }],
};
const simple = { workflowId: "W-simple", steps: [{ variant: { model: "deepseek-flash" } }] };

function outAre(...aliases: string[]): (alias: string) => boolean {
  return (alias) => !aliases.includes(alias);
}

verifies("router.unhealthy-alias-rule", () => {
  it("removes a workflow with any step on an alias that is out", () => {
    const result = removeUnhealthyWorkflows([cascade, opusOnly], outAre("deepseek-flash"));
    expect(result.allowed).toEqual([opusOnly]);
    expect(result.removed).toEqual([
      { workflowId: "W-d3-cascade", unhealthyAliases: ["deepseek-flash"] },
    ]);
  });

  it("names each unhealthy alias once, by name", () => {
    const result = removeUnhealthyWorkflows([cascade, opusOnly], outAre("opus", "deepseek-flash"));
    expect(result.allowed).toEqual([]);
    expect(result.removed).toEqual([
      { workflowId: "W-d3-cascade", unhealthyAliases: ["deepseek-flash", "opus"] },
      { workflowId: "W-opus", unhealthyAliases: ["opus"] },
    ]);
  });

  it("leaves nothing when every workflow is hit, so the router falls back", () => {
    expect(removeUnhealthyWorkflows([cascade], outAre("opus")).allowed).toEqual([]);
  });

  it("keeps every workflow, in order and unchanged, when all aliases are healthy", () => {
    const result = removeUnhealthyWorkflows([simple, cascade, opusOnly], outAre());
    expect(result.allowed).toEqual([simple, cascade, opusOnly]);
    expect(result.allowed[1]).toBe(cascade);
    expect(result.removed).toEqual([]);
  });
});
