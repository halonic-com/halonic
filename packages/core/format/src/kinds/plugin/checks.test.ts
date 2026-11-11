import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { backendSheet, checkPlugin, pluginFromIntegrationSheet } from "../../index.ts";
import * as integrationEntry from "../../integration/index.ts";
import { parsedValue, problemsOf, yaml } from "../../test/parse.spec.ts";

const weather = readFileSync(join(import.meta.dirname, "fixtures", "weather.yaml"), "utf8");

const head = ["id: weather", "version: 1.0.0", "sdk: 1", "name: Weather"];

/** A backend with the secret `example-key`, the read tool `forecast` and the send tool `notify`. */
const backend = [
  "backend:",
  "  hosts: [api.example.com]",
  "  secrets: { example-key: { purpose: The key., hosts: [api.example.com], as: bearer } }",
  "  tools:",
  "    - { name: forecast, description: Forecast., risk: read, untrusted: true }",
  "    - { name: notify, description: Notify., risk: send, untrusted: false, noun: { one: message, many: messages } }",
];

/** A local tool with the given read tools; `more` adds lines to it. */
const localTool = (id: string, names: string[], ...more: string[]) => [
  `  - id: ${id}`,
  "    start: { script: { program: node, path: tools/server.js } }",
  `    tools: [${names.map((name) => `{ name: ${name}, description: A tool., risk: read, untrusted: false }`).join(", ")}]`,
  ...more,
];

/** The problems of a plugin that must fail, as "path code". */
function found(...lines: string[]): string[] {
  return problemsOf("plugin", yaml(...lines)).map(
    (problem) => `${problem.path.join(".")} ${problem.code}`,
  );
}

function sheetText(name: string): string {
  return readFileSync(
    join(import.meta.dirname, "..", "integration", "fixtures", `${name}.yaml`),
    "utf8",
  );
}

verifies("format.plugin-checks", () => {
  it("passes the weather plugin from the ADR", () => {
    expect(checkPlugin(parsedValue("plugin", weather))).toEqual([]);
  });

  it("fails a plugin with neither a backend nor local tools, even with ui", () => {
    for (const text of [yaml(...head), yaml(...head, "ui:", "  panel: { title: P }")]) {
      const problems = problemsOf("plugin", text);
      expect(problems.map(({ path, code }) => ({ path, code }))).toEqual([
        { path: [], code: "no-part" },
      ]);
      expect(problems[0]?.message).toBe(
        'Plugin "weather": a plugin needs a backend or localTools; ui alone has nothing to call',
      );
    }
  });

  it("runs the integration sheet's checks on the backend, under backend", () => {
    expect(
      found(
        ...head,
        "backend:",
        "  provides: [connector, connector]",
        "  hosts: [api.example.com]",
        "  secrets: { example-key: { purpose: The key., hosts: [files.example.com], as: bearer } }",
      ),
    ).toEqual([
      "backend.provides.1 duplicate",
      "backend.secrets.example-key.hosts.0 secret-host-not-declared",
    ]);
  });

  it("refuses a backend that needs to start a program", () => {
    const problems = problemsOf(
      "plugin",
      yaml(...head, "backend:", "  hosts: []", "  needs: [process]"),
    );
    expect(problems.map(({ path, code }) => `${path.join(".")} ${code}`)).toEqual([
      "backend.needs.0 needs-process",
    ]);
    expect(problems[0]?.message).toContain("declare it under localTools instead");
  });

  it("fails an id listed twice, at the second one", () => {
    expect(
      found(
        ...head,
        "localTools:",
        ...localTool("radar", ["radar-image", "radar-image"]),
        ...localTool("radar", ["radar-loop"]),
        "ui:",
        "  commands:",
        "    - { id: show, title: S, tool: radar-image }",
        "    - { id: show, title: S, tool: radar-image }",
        "  cards:",
        "    - { id: now, title: N, tool: radar-image }",
        "    - { id: now, title: N, tool: radar-loop }",
        "  panel: { title: P }",
      ),
    ).toEqual([
      "localTools.1.id duplicate",
      "localTools.0.tools.1.name duplicate",
      "ui.commands.1.id duplicate",
      "ui.cards.1.id duplicate",
    ]);
  });

  it("fails a tool name in two parts, at each later part", () => {
    const problems = problemsOf(
      "plugin",
      yaml(
        ...head,
        ...backend,
        "localTools:",
        ...localTool("radar", ["forecast"]),
        ...localTool("maps", ["forecast"]),
      ),
    );
    expect(problems.map((problem) => `${problem.path.join(".")} ${problem.code}`)).toEqual([
      "localTools.0.tools.0.name tool-twice",
      "localTools.1.tools.0.name tool-twice",
    ]);
    expect(problems[0]?.message).toBe(
      'Plugin "weather": tool forecast is in the backend and in local tool "radar"; give each its own name',
    );
  });

  it("fails a secret name in two parts", () => {
    expect(
      found(
        ...head,
        ...backend,
        "localTools:",
        ...localTool(
          "radar",
          ["radar-image"],
          "    network: [api.example.com]",
          "    secrets: { example-key: { purpose: The key., hosts: [api.example.com] } }",
        ),
      ),
    ).toEqual(["localTools.0.secrets.example-key secret-twice"]);
  });

  it("fails an id or a secret name too long to name the stored secret", () => {
    const longId = `w${"x".repeat(48)}`;
    const longSecret = `k${"y".repeat(64)}`;
    expect(
      found(
        `id: ${longId}`,
        ...head.slice(1),
        ...backend.map((line) => line.replace("example-key", longSecret)),
      ),
    ).toEqual(["id id-too-long", `backend.secrets.${longSecret} secret-name-too-long`]);
    const longest = yaml(
      `id: ${"w".repeat(48)}`,
      ...head.slice(1),
      ...backend.map((line) => line.replace("example-key", "k".repeat(64))),
    );
    expect(checkPlugin(parsedValue("plugin", longest))).toEqual([]);
  });

  describe("gives a local tool only its own secrets and the plugin's settings", () => {
    const withEnv = (...lines: string[]) => [
      ...head,
      ...backend,
      "localTools:",
      ...localTool(
        "files",
        ["list-files"],
        "    network: [api.acme.com]",
        "    secrets: { acme-key: { purpose: The key., hosts: [api.acme.com, files.acme.com, { fromSetting: server }] } }",
        ...lines,
      ),
      "ui:",
      "  settings:",
      "    root: { label: Folder, type: text }",
      "    acme-key: { label: Key, type: secret, secret: acme-key }",
    ];

    it("fails an env secret the tool doesn't declare, even one the backend has", () => {
      expect(
        found(...withEnv("    env: { KEY: { secret: example-key }, ROOT: { setting: root } }")),
      ).toEqual([
        "localTools.0.env.KEY.secret secret-not-declared",
        "localTools.0.secrets.acme-key.hosts.1 secret-host-not-declared",
        "localTools.0.secrets.acme-key.hosts.2 secret-host-not-declared",
      ]);
    });

    it("fails an env setting that isn't there, or is a secret field", () => {
      expect(
        found(
          ...withEnv(
            "    env: { A: { setting: home }, B: { setting: acme-key }, C: { secret: acme-key } }",
          ),
        ),
      ).toEqual([
        "localTools.0.env.A.setting setting-not-found",
        "localTools.0.env.B.setting secret-as-setting",
        "localTools.0.secrets.acme-key.hosts.1 secret-host-not-declared",
        "localTools.0.secrets.acme-key.hosts.2 secret-host-not-declared",
      ]);
    });
  });

  it("fails a secret field for a secret no part declares", () => {
    expect(
      found(
        ...head,
        ...backend,
        "ui:",
        "  settings: { key: { label: Key, type: secret, secret: other-key } }",
      ),
    ).toEqual(["ui.settings.key.secret secret-not-declared"]);
  });

  it("fails a choice default that isn't one of its choices, in a setting and in a form", () => {
    expect(
      found(
        ...head,
        ...backend,
        "ui:",
        "  settings: { units: { label: U, type: choice, choices: [metric], default: kelvin } }",
        "  commands:",
        "    - { id: show, title: S, tool: forecast, form: { units: { label: U, type: choice, choices: [a], default: b } } }",
      ),
    ).toEqual([
      "ui.settings.units.default default-not-a-choice",
      "ui.commands.0.form.units.default default-not-a-choice",
    ]);
  });

  it("fails a command or card whose tool no part declares", () => {
    const problems = problemsOf(
      "plugin",
      yaml(
        ...head,
        ...backend,
        "ui:",
        "  commands: [{ id: show, title: S, tool: list-files }]",
        "  cards: [{ id: now, title: N, tool: radar }]",
        "  panel: { title: P }",
      ),
    );
    expect(problems.map((problem) => `${problem.path.join(".")} ${problem.code}`)).toEqual([
      "ui.commands.0.tool tool-not-found",
      "ui.cards.0.tool tool-not-found",
    ]);
    expect(problems[0]?.message).toBe(
      'Plugin "weather": command show uses the tool list-files, which neither the backend nor a local tool declares',
    );
  });

  it.each([
    ["cards", "  cards: [{ id: now, title: N, tool: forecast }]"],
    ["commands", "  commands: [{ id: show, title: S, tool: forecast }]"],
  ])("takes %s without a panel", (_part, line) => {
    const plugin = parsedValue("plugin", yaml(...head, ...backend, "ui:", line));
    expect(checkPlugin(plugin)).toEqual([]);
  });

  describe("reads an integration.yaml as a plugin with only a backend", () => {
    it.each(["knowledge-mcp", "model-gemini", "tool-google-drive", "tool-google-gmail"])(
      "%s converts both ways without losing anything",
      (name) => {
        const sheet = parsedValue("integration", sheetText(name));
        const plugin = pluginFromIntegrationSheet(sheet);
        expect(plugin).toMatchObject({
          id: sheet.id,
          name: sheet.id,
          description: "",
          sdk: sheet.kit,
          backend: { entry: "backend/index.js" },
        });
        expect(checkPlugin(plugin)).toEqual([]);
        expect(backendSheet(plugin)).toEqual(sheet);
      },
    );

    it("keeps the entry the loader gives", () => {
      const sheet = parsedValue("integration", sheetText("model-gemini"));
      expect(pluginFromIntegrationSheet(sheet, "dist/model-gemini.js").backend?.entry).toBe(
        "dist/model-gemini.js",
      );
    });

    it("gives no sheet for a plugin without a backend", () => {
      const plugin = parsedValue(
        "plugin",
        yaml(...head, "localTools:", ...localTool("radar", ["radar-image"])),
      );
      expect(backendSheet(plugin)).toBe(undefined);
    });

    it("leaves the backend's entry out of the sheet", () => {
      const sheet = backendSheet(parsedValue("plugin", weather));
      expect(sheet).toMatchObject({ id: "weather", version: "1.2.0", kit: 1 });
      expect(sheet).not.toHaveProperty("entry");
    });

    it("offers both from @halonicjs/format/integration too", () => {
      expect(integrationEntry.backendSheet).toBe(backendSheet);
      expect(integrationEntry.pluginFromIntegrationSheet).toBe(pluginFromIntegrationSheet);
    });
  });
});

verifies("format.plugin-ui-read-tools", () => {
  const withUi = (...lines: string[]) =>
    problemsOf(
      "plugin",
      yaml(
        ...head,
        ...backend,
        "localTools:",
        "  - id: radar",
        "    start: { script: { program: node, path: tools/server.js } }",
        "    tools: [{ name: save-image, description: Saves., risk: write, untrusted: false }]",
        "ui:",
        ...lines,
        "  panel: { title: P }",
      ),
    );

  it("takes a command and a card that use read tools", () => {
    const plugin = parsedValue(
      "plugin",
      yaml(
        ...head,
        ...backend,
        "ui:",
        "  commands: [{ id: show, title: S, tool: forecast }]",
        "  cards: [{ id: now, title: N, tool: forecast }]",
        "  panel: { title: P }",
      ),
    );
    expect(checkPlugin(plugin)).toEqual([]);
  });

  it("fails a command that uses a tool that sends, and names what it does", () => {
    const problems = withUi("  commands: [{ id: tell, title: T, tool: notify }]");
    expect(problems.map(({ path, code }) => `${path.join(".")} ${code}`)).toEqual([
      "ui.commands.0.tool tool-not-read",
    ]);
    expect(problems[0]?.message).toBe(
      'Plugin "weather": command tell uses the tool notify, which sends; commands and cards may only use tools that read',
    );
  });

  it("fails a card that uses a local tool that writes", () => {
    const problems = withUi("  cards: [{ id: now, title: N, tool: save-image }]");
    expect(problems.map(({ path, code }) => `${path.join(".")} ${code}`)).toEqual([
      "ui.cards.0.tool tool-not-read",
    ]);
    expect(problems[0]?.message).toContain("card now uses the tool save-image, which writes");
  });

  it("reports only that a missing tool is missing, nothing about its risk", () => {
    const problems = withUi("  commands: [{ id: tell, title: T, tool: shout }]");
    expect(problems.map(({ code }) => code)).toEqual(["tool-not-found"]);
  });

  it("reports every command and card that uses a tool that doesn't only read", () => {
    const problems = withUi(
      "  commands:",
      "    - { id: tell, title: T, tool: notify }",
      "    - { id: keep, title: K, tool: save-image }",
      "  cards: [{ id: now, title: N, tool: save-image }]",
    );
    expect(problems.map(({ path, code }) => `${path.join(".")} ${code}`)).toEqual([
      "ui.commands.0.tool tool-not-read",
      "ui.commands.1.tool tool-not-read",
      "ui.cards.0.tool tool-not-read",
    ]);
  });
});
