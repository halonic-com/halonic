// The checks over a plugin's `ui`: what Studio draws names only what the
// plugin itself declares.
import type { Path } from "@halonicjs/schema-kit";
import type { KindCheckProblem } from "../../kind.ts";
import { declaredSecrets, declaredTools, duplicates, problem } from "./problems.ts";
import type { Plugin, PluginUi } from "./schema.ts";

/** How a message says what a tool does, by its risk. */
const riskVerbs: Readonly<Record<string, string>> = {
  write: "writes",
  send: "sends",
};

/**
 * The problems in a plugin's `ui`: an id twice, a secret field for a secret
 * no part declares, a choice default that isn't a choice, a command or card
 * whose tool isn't a declared `read` tool.
 */
export function uiProblems(plugin: Plugin): KindCheckProblem[] {
  const ui = plugin.ui;
  if (ui === undefined) {
    return [];
  }
  return [
    ...duplicates(
      plugin,
      ui.commands.map((command) => command.id),
      (index) => ["ui", "commands", index, "id"],
      "command",
    ),
    ...duplicates(
      plugin,
      ui.cards.map((card) => card.id),
      (index) => ["ui", "cards", index, "id"],
      "card",
    ),
    ...fieldProblems(plugin, ui),
    ...toolProblems(plugin, ui),
  ];
}

/** A secret field names a secret the backend or a local tool declares; a choice default is a choice. */
function fieldProblems(plugin: Plugin, ui: PluginUi): KindCheckProblem[] {
  const secrets = new Set(declaredSecrets(plugin).map((secret) => secret.name));
  const problems: KindCheckProblem[] = [];
  for (const [key, field] of Object.entries(ui.settings)) {
    const path = ["ui", "settings", key];
    if (field.type === "secret" && !secrets.has(field.secret)) {
      const message = `the secret field ${key} names the secret ${field.secret}, which neither the backend nor a local tool declares`;
      problems.push(problem(plugin, "secret-not-declared", [...path, "secret"], message));
    }
    if (field.type === "choice") {
      problems.push(...choiceProblems(plugin, key, field, path));
    }
  }
  ui.commands.forEach((command, index) => {
    for (const [key, field] of Object.entries(command.form)) {
      if (field.type === "choice") {
        problems.push(
          ...choiceProblems(plugin, key, field, ["ui", "commands", index, "form", key]),
        );
      }
    }
  });
  return problems;
}

function choiceProblems(
  plugin: Plugin,
  key: string,
  field: { readonly choices: readonly string[]; readonly default?: string | undefined },
  path: Path,
): KindCheckProblem[] {
  if (field.default === undefined || field.choices.includes(field.default)) {
    return [];
  }
  const message = `the default of ${key}, ${field.default}, is not one of its choices`;
  return [problem(plugin, "default-not-a-choice", [...path, "default"], message)];
}

/**
 * A command or card calls a tool the plugin declares, and in v0.1 one that
 * only reads. Both run outside a run, where `checkOutsideRunCall` refuses
 * every other tool and nothing can wait for approval; cards also refresh on
 * their own. The ADR says this for cards; HAL-1819 adds it for commands.
 */
function toolProblems(plugin: Plugin, ui: PluginUi): KindCheckProblem[] {
  const risks = new Map(declaredTools(plugin).map((tool) => [tool.name, tool.risk]));
  const callers = [
    ...ui.commands.map((command, index) => ({
      what: "command",
      ...command,
      index,
      list: "commands",
    })),
    ...ui.cards.map((card, index) => ({ what: "card", ...card, index, list: "cards" })),
  ];
  const problems: KindCheckProblem[] = [];
  for (const caller of callers) {
    const path = ["ui", caller.list, caller.index, "tool"];
    const risk = risks.get(caller.tool);
    if (risk === undefined) {
      const message = `${caller.what} ${caller.id} uses the tool ${caller.tool}, which neither the backend nor a local tool declares`;
      problems.push(problem(plugin, "tool-not-found", path, message));
    } else if (risk !== "read") {
      const message = `${caller.what} ${caller.id} uses the tool ${caller.tool}, which ${riskVerbs[risk] ?? risk}; commands and cards may only use tools that read`;
      problems.push(problem(plugin, "tool-not-read", path, message));
    }
  }
  return problems;
}
