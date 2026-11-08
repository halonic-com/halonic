import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createShell } from "../shell.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { loadView } from "../view.ts";
import { type AgentsApi, AgentsService } from "./agents/api.ts";
import { agentsFeature } from "./agents/feature.ts";
import { routinesFeature } from "./routines/feature.ts";

type TriggersSection = (agents: AgentsApi, agentId: string) => string;

const here = import.meta.dirname;

/** Every relative import in a stub feature's files, as paths from the acceptance folder. */
function importsOf(featureFolder: string): string[] {
  const imports: string[] = [];
  const folder = join(here, featureFolder);
  for (const file of readdirSync(folder, { recursive: true, encoding: "utf8" })) {
    if (!file.endsWith(".ts")) {
      continue;
    }
    const source = readFileSync(join(folder, file), "utf8");
    for (const match of source.matchAll(/(?:from|import\()\s*"(\.[^"]+)"/g)) {
      const specifier = match[1] ?? "";
      imports.push(relative(here, join(folder, file, "..", specifier)).replaceAll("\\", "/"));
    }
  }
  return imports;
}

describe("shell.feature-isolation", () => {
  it("shows the routines Triggers section on the agent page", async () => {
    const shell = createShell({ features: [routinesFeature, agentsFeature] });
    expect(shell.features.map((feature) => feature.id)).toEqual(["agents", "routines"]);

    const agentKind = shell.contributions.itemKinds.get("agent");
    expect(agentKind?.featureId).toBe("agents");
    const sections = shell.contributions.itemPage.sectionsFor("agent");
    expect(sections.map((section) => [section.id, section.featureId])).toEqual([
      ["triggers", "routines"],
    ]);

    const workspace = new MapTarget();
    shell.services.instantiate(workspace);
    const context = shell.services.contextFor("routines", workspace);
    const [triggers] = sections;
    if (triggers === undefined) {
      throw new Error("The Triggers section is missing.");
    }
    const view = await loadView<TriggersSection>(triggers);
    expect(view(context.services.get(AgentsService), "reviewer")).toBe(
      "triggers for reviewer (one of 2 agents)",
    );
  });

  it("keeps the two features apart: routines uses only the agents api, agents nothing of routines", () => {
    const fromRoutines = importsOf("routines").filter((path) => path.startsWith("agents/"));
    expect(fromRoutines.length).toBeGreaterThan(0);
    expect(new Set(fromRoutines)).toEqual(new Set(["agents/api.ts"]));
    expect(importsOf("agents").filter((path) => path.startsWith("routines/"))).toEqual([]);
  });

  it("binds the agents shortcut only while the workspace has focus", () => {
    const shell = createShell({ features: [agentsFeature, routinesFeature] });
    const { keybindings } = shell.contributions;
    expect(keybindings.resolve("Ctrl+Alt+A", new Set(["workspaceFocused"]))?.command).toBe(
      "agents.new",
    );
    expect(keybindings.resolve("Ctrl+Alt+A", new Set())).toBeUndefined();
  });
});
