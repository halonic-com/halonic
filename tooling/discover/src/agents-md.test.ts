import { describe, expect, it } from "vitest";
import { renderAgentsMd } from "./agents-md.ts";
import { packageFiles } from "./templates.ts";

const input = { name: "@halonicjs/std", owner: "maya", layer: "core", isFeature: false };

describe("renderAgentsMd", () => {
  it("fills in the owner, layer, name and purpose", () => {
    const text = renderAgentsMd({ ...input, purpose: "Small utilities." });
    expect(text).toContain("# @halonicjs/std");
    expect(text).toContain("Owner: maya · Layer: core · ");
    expect(text).toContain("Small utilities.");
    expect(text).toContain("`pnpm exec turbo run test --filter=@halonicjs/std -- --maxWorkers=2`");
    expect(text).not.toContain("| `pnpm verify`");
    expect(text).not.toContain("{{");
  });

  it("writes the to-do line when no purpose is given", () => {
    expect(renderAgentsMd(input)).toContain("TODO: one-line purpose");
    expect(renderAgentsMd({ ...input, purpose: "  " })).toContain("TODO: one-line purpose");
  });

  it("mentions src/api.ts for a feature only", () => {
    expect(renderAgentsMd(input)).not.toContain("src/api.ts");
    expect(renderAgentsMd({ ...input, isFeature: true })).toContain(
      "`src/index.ts`, plus `src/api.ts` for other features;",
    );
  });

  it("rejects a placeholder it does not know", () => {
    expect(() => renderAgentsMd(input, "{{surprise}}")).toThrow("{{surprise}}");
  });

  it("is part of every generated package", () => {
    const files = packageFiles({
      directory: "packages/core/std",
      name: "@halonicjs/std",
      layer: "core",
      owner: "maya",
      isFeature: false,
      folder: "std",
      purpose: "Small utilities.",
    });
    expect(files["AGENTS.md"]).toContain("Small utilities.");
  });
});
