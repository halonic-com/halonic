// The checks inside one `plugin.yaml` (ADR section 1.4). They need only the
// file, so they run in `parseFile` and `halonic validate`. Whether the
// backend's code matches its sheet needs the code, so the integration kit
// checks that when the plugin loads.
import type { KindCheckProblem } from "../../kind.ts";
import { checkIntegrationSheet } from "../integration/kind.ts";
import { backendSheet } from "./backend.ts";
import { declaredSecrets, declaredTools, duplicates, inTwoParts, problem } from "./problems.ts";
import {
  MAX_PLUGIN_ID_LENGTH,
  MAX_PLUGIN_SECRET_NAME_LENGTH,
  type Plugin,
  type PluginLocalTool,
} from "./schema.ts";
import { uiProblems } from "./ui-checks.ts";

/**
 * The rules over several fields of a plugin: it has a backend or local
 * tools, its id and secret names aren't too long, its backend passes the
 * integration sheet's checks and starts no program, no id is used twice, no tool or secret name is in two parts, a
 * local tool's environment names its own secrets and the plugin's settings,
 * and its `ui` names what the plugin declares.
 *
 * @example
 * checkPlugin(plugin); // [] for the weather plugin in the ADR
 */
export function checkPlugin(plugin: Plugin): KindCheckProblem[] {
  return [
    ...partProblems(plugin),
    ...lengthProblems(plugin),
    ...backendProblems(plugin),
    ...localToolProblems(plugin),
    ...inTwoParts(plugin, declaredTools(plugin), "tool-twice", "tool"),
    ...inTwoParts(plugin, declaredSecrets(plugin), "secret-twice", "secret"),
    ...uiProblems(plugin),
  ];
}

/** A plugin with only `ui` has nothing for its forms and cards to call. */
function partProblems(plugin: Plugin): KindCheckProblem[] {
  if (plugin.backend !== undefined || plugin.localTools !== undefined) {
    return [];
  }
  const message = "a plugin needs a backend or localTools; ui alone has nothing to call";
  return [problem(plugin, "no-part", [], message)];
}

/**
 * Halonic keeps each secret under a name made of the plugin's id and the
 * secret's name, which must fit the `Secrets` port's 128 characters.
 */
function lengthProblems(plugin: Plugin): KindCheckProblem[] {
  const problems: KindCheckProblem[] = [];
  if (plugin.id.length > MAX_PLUGIN_ID_LENGTH) {
    const message = `the id is ${plugin.id.length} characters long; use at most ${MAX_PLUGIN_ID_LENGTH}`;
    problems.push(problem(plugin, "id-too-long", ["id"], message));
  }
  for (const secret of declaredSecrets(plugin)) {
    if (secret.name.length > MAX_PLUGIN_SECRET_NAME_LENGTH) {
      const message = `the secret name ${secret.name} is ${secret.name.length} characters long; use at most ${MAX_PLUGIN_SECRET_NAME_LENGTH}`;
      problems.push(problem(plugin, "secret-name-too-long", secret.path, message));
    }
  }
  return problems;
}

/**
 * The backend's own sheet checks, with their paths moved under `backend`.
 * A backend may not start a program: that is what local tools are for, and
 * only they run in the sandbox.
 */
function backendProblems(plugin: Plugin): KindCheckProblem[] {
  const sheet = backendSheet(plugin);
  if (sheet === undefined) {
    return [];
  }
  const problems: KindCheckProblem[] = checkIntegrationSheet(sheet).map((found) => ({
    ...found,
    path: ["backend", ...found.path],
  }));
  sheet.needs.forEach((need, index) => {
    if (need === "process") {
      const message = "a backend can't start a program; declare it under localTools instead";
      problems.push(problem(plugin, "needs-process", ["backend", "needs", index], message));
    }
  });
  return problems;
}

function localToolProblems(plugin: Plugin): KindCheckProblem[] {
  const localTools = plugin.localTools ?? [];
  const problems = duplicates(
    plugin,
    localTools.map((localTool) => localTool.id),
    (index) => ["localTools", index, "id"],
    "local tool",
  );
  localTools.forEach((localTool, index) => {
    problems.push(
      ...duplicates(
        plugin,
        localTool.tools.map((tool) => tool.name),
        (toolIndex) => ["localTools", index, "tools", toolIndex, "name"],
        "tool",
      ),
      ...envProblems(plugin, localTool, index),
      ...localSecretHostProblems(plugin, localTool, index),
    );
  });
  return problems;
}

/**
 * An `env` value names one of this local tool's own secrets, never another
 * part's, so a secret reaches only the program it was declared for. A
 * setting it names exists and isn't a `secret` field: secrets go by `secret`.
 */
function envProblems(
  plugin: Plugin,
  localTool: PluginLocalTool,
  index: number,
): KindCheckProblem[] {
  const settings = plugin.ui?.settings ?? {};
  const problems: KindCheckProblem[] = [];
  for (const [variable, value] of Object.entries(localTool.env)) {
    const path = ["localTools", index, "env", variable];
    if ("secret" in value) {
      if (!Object.hasOwn(localTool.secrets, value.secret)) {
        const message = `${variable} takes the secret ${value.secret}, which local tool "${localTool.id}" doesn't declare in its secrets`;
        problems.push(problem(plugin, "secret-not-declared", [...path, "secret"], message));
      }
      continue;
    }
    const field = Object.hasOwn(settings, value.setting) ? settings[value.setting] : undefined;
    if (field === undefined) {
      const message = `${variable} takes the setting ${value.setting}, which isn't in ui.settings`;
      problems.push(problem(plugin, "setting-not-found", [...path, "setting"], message));
    } else if (field.type === "secret") {
      const message = `${variable} takes the secret field ${value.setting} as a setting; use { secret: ${field.secret} }`;
      problems.push(problem(plugin, "secret-as-setting", [...path, "setting"], message));
    }
  }
  return problems;
}

/**
 * A local tool's secret goes only to hosts in its `network`. Unlike the
 * sheet, `network` has no hosts from settings, so neither have its secrets.
 */
function localSecretHostProblems(
  plugin: Plugin,
  localTool: PluginLocalTool,
  index: number,
): KindCheckProblem[] {
  const network = new Set(localTool.network);
  const problems: KindCheckProblem[] = [];
  for (const [name, secret] of Object.entries(localTool.secrets)) {
    secret.hosts.forEach((host, hostIndex) => {
      if (typeof host === "string" && network.has(host)) {
        return;
      }
      const shown =
        typeof host === "string" ? host : `the host from the setting ${host.fromSetting}`;
      const message = `the secret ${name} may go to ${shown}, which isn't in local tool "${localTool.id}"'s network`;
      const path = ["localTools", index, "secrets", name, "hosts", hostIndex];
      problems.push(problem(plugin, "secret-host-not-declared", path, message));
    });
  }
  return problems;
}
