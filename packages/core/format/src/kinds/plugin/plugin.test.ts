import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import { Plugin } from "./schema.ts";

/** The ADR's weather plugin, with every part. */
const weather = readFileSync(join(import.meta.dirname, "fixtures", "weather.yaml"), "utf8");

/** The smallest manifest the schema takes; each test adds the part it needs. */
const head = ["id: weather", "version: 1.0.0", "sdk: 1", "name: Weather"];

/** A plugin with one local tool started by `start`, on line 7. */
const localTool = (start: string, ...more: string[]) =>
  yaml(
    ...head,
    "localTools:",
    "  - id: radar",
    `    start: ${start}`,
    "    tools: [{ name: radar-image, description: A radar image., risk: read, untrusted: false }]",
    ...more,
  );

/** A plugin with a package start, on line 7. */
const packageStart = (fields: string) => localTool(`{ package: { ${fields} } }`);

/**
 * A plugin with one setting named `field`, on line 7, and a backend with the
 * secret `example-key` that a secret field names.
 */
const setting = (fields: string) =>
  yaml(
    ...head,
    "ui:",
    "  settings:",
    `    field: { ${fields} }`,
    "backend:",
    "  hosts: [api.example.com]",
    "  secrets: { example-key: { purpose: The key., hosts: [api.example.com], as: bearer } }",
  );

verifies("format.plugin-file", () => {
  it("reads the weather plugin from the ADR and fills in the defaults", () => {
    const plugin = parsedValue("plugin", weather);
    expect(plugin.backend).toMatchObject({
      entry: "backend/index.js",
      provides: ["connector"],
      tokens: [],
      needs: [],
    });
    expect(plugin.localTools?.[0]).toMatchObject({
      start: { package: { runner: "npx", name: "@acme/files-mcp", version: "3.1.4" } },
      args: ["--read-only"],
      env: { ACME_ROOT: { setting: "root" }, ACME_KEY: { secret: "acme-key" } },
      callTimeoutMs: 60_000,
    });
    expect(plugin.localTools?.[0]?.secrets["acme-key"]?.optional).toBe(false);
    expect(plugin.ui?.settings["root"]).toEqual({ label: "Folder", type: "text", required: true });
    expect(plugin.ui?.settings["units"]?.required).toBe(false);
    expect(plugin.ui?.commands[0]?.form).toEqual({
      place: { label: "Place", type: "text", required: true },
    });
    expect(plugin.ui?.cards[0]).toMatchObject({ args: { place: "home" }, show: "markdown" });
    expect(plugin.ui?.panel).toEqual({ title: "Weather" });
  });

  it("fills in a local tool's lists and limit, a command's form and show, and the ui lists", () => {
    const plugin = parsedValue(
      "plugin",
      yaml(
        ...head,
        "localTools:",
        "  - id: radar",
        "    start: { script: { program: node, path: tools/radar.js } }",
        "    tools: [{ name: radar-image, description: A radar image., risk: read, untrusted: false }]",
        "ui:",
        "  commands: [{ id: radar, title: Radar, tool: radar-image }]",
      ),
    );
    expect(plugin.localTools?.[0]).toMatchObject({
      args: [],
      env: {},
      secrets: {},
      network: [],
      callTimeoutMs: 60_000,
    });
    expect(plugin.ui).toEqual({
      settings: {},
      commands: [{ id: "radar", title: "Radar", tool: "radar-image", form: {}, show: "text" }],
      cards: [],
    });
  });

  it("reads a manifest with no part and an empty description; requiring a part is a check", () => {
    const parsed = parse(Plugin, { id: "weather", version: "1.0.0", sdk: 1, name: "Weather" });
    expect(parsed.ok && parsed.value).toEqual({
      id: "weather",
      version: "1.0.0",
      sdk: 1,
      name: "Weather",
      description: "",
    });
  });

  it("takes the id and version by the integration sheet's rules and a short name", () => {
    const problems = problemsOf(
      "plugin",
      yaml("id: Weather", "version: '1.0'", "sdk: 0", `name: ${"x".repeat(81)}`),
    );
    expect(summary(problems)).toEqual([
      "id invalid_format 1",
      "version invalid_format 2",
      "sdk too_small 3",
      "name too_big 4",
    ]);
  });

  describe("refuses an unknown key at every depth", () => {
    it.each([
      ["the top", yaml(...head, "author: someone"), "", 1],
      ["the backend", yaml(...head, "backend: { hosts: [], extra: 1 }"), "backend", 5],
      [
        "a local tool",
        localTool("{ script: { program: node, path: a.js } }", "    cwd: /"),
        "localTools.0",
        6,
      ],
      [
        "a script start",
        localTool("{ script: { program: node, path: a.js, shell: true } }"),
        "localTools.0.start.script",
        7,
      ],
      [
        "a package start",
        packageStart("runner: npx, name: radar, version: 1.0.0, args: [-y]"),
        "localTools.0.start.package",
        7,
      ],
      ["a setting", setting("label: Units, type: text, hint: x"), "ui.settings.field", 7],
      [
        "a command",
        yaml(...head, "ui:", "  commands: [{ id: a, title: A, tool: t, icon: x }]"),
        "ui.commands.0",
        6,
      ],
      [
        "a card",
        yaml(...head, "ui:", "  cards: [{ id: a, title: A, tool: t, html: x }]"),
        "ui.cards.0",
        6,
      ],
      ["the panel", yaml(...head, "ui:", "  panel: { title: P, url: x }"), "ui.panel", 6],
    ])("in %s", (_where, text, path, line) => {
      expect(summary(problemsOf("plugin", text))).toEqual([`${path} unrecognized_keys ${line}`]);
    });

    it("including id, version and kit in the backend, which the plugin's own fields give", () => {
      const text = yaml(
        ...head,
        "backend:",
        "  id: weather",
        "  version: 1.0.0",
        "  kit: 1",
        "  hosts: []",
      );
      expect(summary(problemsOf("plugin", text))).toEqual(["backend unrecognized_keys 6"]);
    });

    it("including a card's `for`: selection cards aren't offered in v0.1", () => {
      const text = yaml(...head, "ui:", "  cards: [{ id: a, for: hub, title: A, tool: t }]");
      expect(summary(problemsOf("plugin", text))).toEqual(["ui.cards.0 unrecognized_keys 6"]);
    });
  });

  describe("takes only an exact package version", () => {
    it.each(["^1.2.3", "~1.2.3", ">=1.0.0", "1.x", "1.2", "*", "latest", "01.2.3"])(
      "refuses %s for npx",
      (version) => {
        const problems = problemsOf(
          "plugin",
          packageStart(`runner: npx, name: radar, version: '${version}'`),
        );
        expect(summary(problems)).toEqual(["localTools.0.start.package.version invalid_format 7"]);
      },
    );

    it.each(["==0.4.1", "~=0.4", ">=0.4", "0.4.*", "latest", "0.4.1, <1"])(
      "refuses %s for uvx",
      (version) => {
        const problems = problemsOf(
          "plugin",
          packageStart(`runner: uvx, name: radar, version: '${version}'`),
        );
        expect(summary(problems)).toEqual(["localTools.0.start.package.version invalid_format 7"]);
      },
    );

    it.each([
      ["npx", "1.2.3"],
      ["npx", "1.2.3-beta.1"],
      ["uvx", "0.4.1"],
      ["uvx", "2.0rc1"],
      ["uvx", "1.0.post2"],
    ])("takes %s %s", (runner, version) => {
      const plugin = parsedValue(
        "plugin",
        packageStart(`runner: ${runner}, name: radar, version: '${version}'`),
      );
      expect(plugin.localTools?.[0]?.start).toEqual({
        package: { runner, name: "radar", version },
      });
    });

    it.each(["npx", "uvx"])("refuses a %s package that would read as an option", (runner) => {
      const problems = problemsOf(
        "plugin",
        packageStart(`runner: ${runner}, name: '--yes', version: 1.0.0`),
      );
      expect(summary(problems)).toEqual(["localTools.0.start.package.name invalid_format 7"]);
    });

    it("takes an https registry and refuses any other", () => {
      const fields = "runner: npx, name: radar, version: 1.0.0, registry:";
      const plugin = parsedValue("plugin", packageStart(`${fields} 'https://npm.example.com/'`));
      expect(plugin.localTools?.[0]?.start).toMatchObject({
        package: { registry: "https://npm.example.com/" },
      });
      const problems = problemsOf("plugin", packageStart(`${fields} 'http://npm.example.com/'`));
      expect(summary(problems)).toEqual(["localTools.0.start.package.registry invalid_format 7"]);
    });
  });

  describe("starts exactly one of a package and a script", () => {
    it.each([
      [
        "both",
        "{ package: { runner: npx, name: radar, version: 1.0.0 }, script: { program: node, path: a.js } }",
      ],
      ["neither", "{}"],
    ])("refuses %s", (_which, start) => {
      expect(summary(problemsOf("plugin", localTool(start)))).toEqual([
        "localTools.0.start custom 7",
      ]);
    });
  });

  describe("runs a script only from inside the plugin folder, without a shell", () => {
    it.each([
      "/bin/sh",
      "C:/run.js",
      String.raw`tools\run.js`,
      "../run.js",
      "tools/../../run.js",
      "./run.js",
      "tools//run.js",
      "",
      "run.js.",
      "tools /run.js",
      "RUN~1.JS",
      "run.js:stream",
    ])("refuses the script path '%s'", (path) => {
      const problems = problemsOf(
        "plugin",
        localTool(`{ script: { program: node, path: '${path}' } }`),
      );
      expect(summary(problems)).toEqual(["localTools.0.start.script.path custom 7"]);
    });

    it("refuses a shell as the program", () => {
      const problems = problemsOf(
        "plugin",
        localTool("{ script: { program: bash, path: run.sh } }"),
      );
      expect(summary(problems)).toEqual(["localTools.0.start.script.program invalid_value 7"]);
    });
  });

  describe("gives a local tool's environment only settings and secrets", () => {
    it("refuses a literal value and a lower-case name", () => {
      const problems = problemsOf(
        "plugin",
        localTool(
          "{ script: { program: node, path: a.js } }",
          "    env: { ACME_ROOT: /home, acme: { setting: root } }",
        ),
      );
      expect(summary(problems).map((line) => line.split(" ").slice(0, 2).join(" "))).toEqual([
        "localTools.0.env.ACME_ROOT invalid_union",
        "localTools.0.env.acme invalid_key",
      ]);
    });

    it("bounds one call by an hour", () => {
      const problems = problemsOf(
        "plugin",
        localTool("{ script: { program: node, path: a.js } }", "    callTimeoutMs: 3600001"),
      );
      expect(summary(problems)).toEqual(["localTools.0.callTimeoutMs too_big 9"]);
    });
  });

  describe("reads each type of setting and refuses a secret with a value", () => {
    it.each([
      ["label: Units, type: choice, choices: [metric, imperial], default: metric"],
      ["label: Compact, type: boolean, default: true"],
      ["label: Days, type: number, default: 3, help: How many days to show."],
      ["label: Server, type: url, default: 'https://weather.example.com'"],
      ["label: Home, type: text, default: Ghent, required: true"],
      ["label: API key, type: secret, secret: example-key"],
    ])("takes { %s }", (fields) => {
      expect(Object.keys(parsedValue("plugin", setting(fields)).ui?.settings ?? {})).toEqual([
        "field",
      ]);
    });

    it("refuses a default on a secret setting, and a secret setting that names no secret", () => {
      expect(
        summary(problemsOf("plugin", setting("label: Key, type: secret, secret: k, default: abc"))),
      ).toEqual(["ui.settings.field unrecognized_keys 7"]);
      expect(summary(problemsOf("plugin", setting("label: Key, type: secret")))).toEqual([
        "ui.settings.field.secret invalid_type 7",
      ]);
    });

    it("refuses a default of the wrong type and a choice without choices", () => {
      expect(
        summary(problemsOf("plugin", setting("label: Days, type: number, default: three"))),
      ).toEqual(["ui.settings.field.default invalid_type 7"]);
      expect(
        summary(problemsOf("plugin", setting("label: Server, type: url, default: 'file:///etc'"))),
      ).toEqual(["ui.settings.field.default invalid_format 7"]);
      expect(
        summary(problemsOf("plugin", setting("label: Units, type: choice, choices: []"))),
      ).toEqual(["ui.settings.field.choices too_small 7"]);
    });

    it("refuses a secret field in a command's form", () => {
      const text = yaml(
        ...head,
        "ui:",
        "  commands: [{ id: a, title: A, tool: t, form: { k: { label: K, type: secret, secret: k } } }]",
      );
      expect(summary(problemsOf("plugin", text))).toEqual([
        "ui.commands.0.form.k.type invalid_union 6",
      ]);
    });
  });

  describe("reads cards and the one panel", () => {
    it("refuses a card argument taken from elsewhere, and an unknown way to show it", () => {
      const text = yaml(
        ...head,
        "ui:",
        "  cards: [{ id: a, title: A, tool: t, args: { place: { setting: home } }, show: html }]",
      );
      expect(summary(problemsOf("plugin", text))).toEqual([
        "ui.cards.0.args.place invalid_union 6",
        "ui.cards.0.show invalid_value 6",
      ]);
    });

    it("refuses a list of panels", () => {
      const text = yaml(...head, "ui:", "  panel: [{ title: A }, { title: B }]");
      expect(summary(problemsOf("plugin", text))).toEqual(["ui.panel invalid_type 6"]);
    });
  });
});
