import { type Plugin, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { trustCheckContent } from "./trust-check.ts";
import {
  inStudioRow,
  secretHow,
  TRUST_CHECK_LAST_LINE,
  trustButton,
  trustSummary,
  trustTitle,
} from "./trust-text.ts";

function plugin(yaml: string): Plugin {
  const parsed = parseFile("plugin", yaml);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

/** Weather with a backend, a program and a secret: every section of the trust check. */
const weather = plugin(`id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.example.com]
  secrets:
    api-key: { purpose: Reads the forecast., hosts: [api.example.com], as: bearer }
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: true }
    - { name: set_alert, description: Sets an alert., risk: write, untrusted: false }
localTools:
  - id: radar
    start: { package: { runner: npx, name: weather-mcp, version: 1.2.3 } }
    args: [--units, metric]
    network: [radar.example.com, api.example.com]
    tools:
      - { name: radar, description: The radar., risk: read, untrusted: false }
ui:
  settings:
    key: { label: API key, type: secret, secret: api-key }
  commands:
    - { id: forecast, title: Show the forecast, tool: forecast }
  cards:
    - { id: today, title: Today's weather, tool: forecast }
  panel: { title: Weather }`);

verifies("plugins.trust-check", () => {
  it("titles the check after Add and from Review", () => {
    expect(trustTitle("add", "Weather")).toBe("Trust Weather and turn it on?");
    expect(trustTitle("review", "Weather")).toBe("Trust Weather?");
    expect(trustButton("add")).toBe("Trust and turn on");
    expect(trustButton("review")).toBe("Trust");
  });

  it("pins the v0.1 last line, so changing it is deliberate (HAL-3384)", () => {
    expect(TRUST_CHECK_LAST_LINE).toBe(
      "Plugin code runs apart from Studio. Halonic doesn't check what the plugin does with what it's given.",
    );
  });

  it("sums up a plugin in risk order", () => {
    const content = trustCheckContent(weather);

    expect(trustSummary(content.counts)).toBe(
      "Adds 3 tools for agents, 1 of which changes things. Starts 1 program on this computer, sends 1 secret to api.example.com and reaches 2 addresses.",
    );
  });

  it("lists each section's things, the program's address marked", () => {
    const content = trustCheckContent(weather);

    expect(content.tools.map((tool) => [tool.name, tool.risk, tool.untrusted])).toEqual([
      ["forecast", "read", true],
      ["set_alert", "write", false],
      ["radar", "read", false],
    ]);
    expect(content.programs).toEqual([
      {
        id: "radar",
        command: "npx weather-mcp@1.2.3 --units metric",
        version: "1.2.3",
        canReach: ["radar.example.com", "api.example.com"],
      },
    ]);
    expect(content.secrets).toEqual([
      { name: "api-key", goesTo: ["api.example.com"], how: "Authorization header" },
    ]);
    expect(content.addresses).toEqual([
      { address: "api.example.com", program: false },
      { address: "radar.example.com", program: true },
    ]);
    expect(inStudioRow({ ...content.inStudio, commands: 1, cards: 1, panel: true })).toBe(
      "Settings, 1 command, 1 card and a panel",
    );
  });

  it("says a lone risky tool with which", () => {
    const counts = { tools: 1, writes: 0, sends: 1, programs: 0, secrets: 0, addresses: 0 };

    expect(trustSummary({ ...counts, secretsTo: undefined })).toBe(
      "Adds 1 tool for agents, which sends.",
    );
    expect(trustSummary({ ...counts, tools: 2, writes: 1, secretsTo: undefined })).toBe(
      "Adds 2 tools for agents, all of which change things or send.",
    );
  });

  it("gives no summary when there's nothing to sum up, and names only what Studio draws", () => {
    const none = { tools: 0, writes: 0, sends: 0, programs: 0, secrets: 0, addresses: 0 };

    expect(trustSummary({ ...none, secretsTo: undefined })).toBe("");
    expect(inStudioRow({ settings: false, commands: 1, cards: 1, panel: false })).toBe(
      "1 command and 1 card",
    );
  });

  describe("secrets", () => {
    it("says how a backend secret goes in a request", () => {
      expect(secretHow({ as: "bearer" })).toBe("Authorization header");
      expect(secretHow({ as: "header", header: "X-Api-Key" })).toBe("the X-Api-Key header");
      expect(secretHow({ as: "form", field: "token" })).toBe("the token form field");
      expect(secretHow(undefined)).toBeUndefined();
    });

    it("names the setting whose address a secret goes to, and sends to several", () => {
      const content = trustCheckContent(
        plugin(`id: files
version: 1.0.0
sdk: 1
name: Files
backend:
  hosts: [api.example.com, { fromSetting: server, class: loopback }]
  secrets:
    token: { purpose: Signs in., hosts: [api.example.com, { fromSetting: server }], as: bearer }
  tools:
    - { name: list, description: Lists files., risk: read, untrusted: false }
ui:
  settings:
    server: { label: Server, type: text }`),
      );

      expect(content.secrets[0]?.goesTo).toEqual([
        "api.example.com",
        "the address you enter under Server",
      ]);
      expect(trustSummary(content.counts)).toBe(
        "Adds 1 tool for agents. Sends 1 secret and reaches 2 addresses.",
      );
    });
  });
});
