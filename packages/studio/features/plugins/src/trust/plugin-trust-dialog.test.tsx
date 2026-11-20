// @vitest-environment jsdom

import {
  type PluginTrustFiles,
  pluginTrustContent,
  pluginTrustSectionHeadings,
  pluginTrustSectionOrder,
  pluginTrustSections,
} from "@halonicjs/app";
import { type Plugin, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { PluginOrigin } from "../page/page-text.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PluginTrustDialog } from "./plugin-trust-dialog.tsx";
import { type ProgramsRun, TRUST_CHECK_LAST_LINE, type TrustCheckReason } from "./trust-text.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

function plugin(yaml: string): Plugin {
  const parsed = parseFile("plugin", yaml);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

const weather = plugin(`id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.example.com]
  secrets:
    api-key: { purpose: Reads the forecast., hosts: [api.example.com], as: bearer }
  tools:
    - { name: forecast, description: "<b>The</b> [forecast](javascript:alert(1)).", risk: read, untrusted: true }
    - { name: set_alert, description: Sets an alert., risk: write, untrusted: false }
localTools:
  - id: radar
    start: { package: { runner: npx, name: weather-mcp, version: 1.2.3 } }
    network: [radar.example.com]
    tools:
      - { name: radar, description: The radar., risk: read, untrusted: false }
ui:
  settings:
    key: { label: API key, type: secret, secret: api-key }
  commands:
    - { id: forecast, title: Show the forecast, tool: forecast }
  panel: { title: Weather }`);

const withProgramSecret = plugin(`id: acme
version: 0.1.0
sdk: 1
name: Acme
localTools:
  - id: acme
    start: { package: { runner: npx, name: acme-mcp, version: 2.0.0 } }
    env:
      ACME_KEY: { secret: acme-key }
    secrets:
      acme-key: { purpose: Reads your Acme account, hosts: [api.acme.com] }
    network: [api.acme.com]
    tools:
      - { name: accounts, description: The accounts., risk: read, untrusted: false }`);

const readOnly = plugin(`id: notes
version: 0.1.0
sdk: 1
name: Notes
backend:
  hosts: []
  tools:
    - { name: list, description: Lists notes., risk: read, untrusted: false }`);

const fromGit: PluginOrigin = {
  kind: "git",
  address: "https://github.com/example/halonic-weather.git",
  commit: "3f9c2a1",
};

function open(
  manifest: Plugin,
  options: {
    readonly reason?: TrustCheckReason;
    readonly origin?: PluginOrigin;
    readonly failure?: string;
    readonly programsRun?: ProgramsRun;
    readonly folder?: string;
    readonly files?: PluginTrustFiles;
  } = {},
) {
  const pressed: string[] = [];
  render(
    <PluginTrustDialog
      manifest={manifest}
      origin={options.origin}
      reason={options.reason ?? "add"}
      folder={options.folder}
      files={options.files}
      failure={options.failure}
      programsRun={options.programsRun}
      onTrust={() => pressed.push("trust")}
      onNotNow={() => pressed.push("not now")}
    />,
  );
  return pressed;
}

function dialog(): HTMLDialogElement {
  const found = document.querySelector("dialog");
  if (found === null) throw new Error("No dialog");
  return found;
}

function button(name: string): HTMLButtonElement {
  const found = [...dialog().querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.startsWith(name),
  );
  if (found === undefined) throw new Error(`No button ${name}`);
  return found;
}

/** Each section's row, and whether it's open. */
function sections(): [string, boolean][] {
  return [...dialog().querySelectorAll("details")].map((details) => [
    details.querySelector("summary")?.textContent ?? "",
    details.open,
  ]);
}

/**
 * Each section's heading as the dialog shows it: the row without its count, "Tools for agents",
 * or the caption above a row that is only a value, "In Studio".
 */
function headings(): string[] {
  return [...dialog().querySelectorAll("details")].map((details) => {
    const caption = details.previousElementSibling;
    if (caption?.tagName === "P") return caption.textContent ?? "";
    return (details.querySelector("summary")?.textContent ?? "").replace(/ \(\d+\)$/, "");
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

verifies("plugins.plugin-trust-check", () => {
  it("shows the title, source line and summary, with Not now focused and no ✕", () => {
    open(weather, { origin: fromGit });

    expect(dialog().querySelector("h2")?.textContent).toBe("Trust Weather and turn it on?");
    expect(dialog().textContent).toContain(
      "Plugin · version 1.2.0 · from github.com/example/halonic-weather at 3f9c2a1",
    );
    expect(dialog().querySelector("p code")?.textContent).toBe("3f9c2a1");
    expect(dialog().textContent).toContain(
      "Adds 3 tools for agents, 1 of which changes things. Starts 1 program in a sandbox on this computer, sends 1 secret to api.example.com and reaches 2 addresses.",
    );
    expect(document.activeElement).toBe(button("Not now"));
    expect(dialog().querySelector('button[aria-label^="Close"]')).toBeNull();
  });

  it.each([
    ["ready", "Runs In the agent sandbox, in its own empty folder"],
    [
      "needs-desktop-app",
      "Runs Doesn't run here. Programs run only in the Halonic desktop app, in a sandbox",
    ],
    ["sandbox-unavailable", "Runs Doesn't run now. The sandbox can't start on this computer"],
  ] as const)("says what is true about the Runs line when programs are %s", (programsRun, line) => {
    open(weather, { programsRun });

    expect(dialog().textContent).toContain(line);
  });

  it.each([
    ["ready", "Starts 1 program in a sandbox on this computer"],
    ["needs-desktop-app", "Has 1 program that doesn't run here"],
    ["sandbox-unavailable", "Has 1 program that doesn't run now"],
  ] as const)(
    "keeps the summary true to the Runs line when programs are %s",
    (programsRun, line) => {
      open(weather, { programsRun });

      expect(dialog().textContent).toContain(line);
      expect(dialog().textContent?.includes("Starts 1 program")).toBe(programsRun === "ready");
    },
  );

  it("lists the sections in order, Tools open when one changes things", () => {
    open(weather);

    const rows = sections();

    expect(rows.slice(0, 4)).toEqual([
      ["Tools for agents (3)", true],
      ["Programs (1)", false],
      ["Secrets (1)", false],
      ["Addresses (2)", false],
    ]);
    // The kit reads the caption inside the row: "In Studio, Settings, 1 command and a panel".
    expect(rows[4]?.[0]).toContain("In Studio, Settings, 1 command and a panel");
    expect(rows[4]?.[1]).toBe(false);
  });

  it("says a program gets its secret when it starts, and a backend never shows it", () => {
    open(withProgramSecret);
    const text = dialog().textContent ?? "";

    expect(text).toContain(
      "You enter its value in this plugin's settings. Halonic gives it to the program when it starts.",
    );
    expect(text).not.toContain("never sees it");
  });

  it("keeps Tools closed when every tool reads, and leaves out empty sections", () => {
    open(readOnly, { reason: "review" });

    expect(dialog().querySelector("h2")?.textContent).toBe("Trust Notes?");
    expect(button("Trust")).toBeDefined();
    expect(sections()).toEqual([["Tools for agents (1)", false]]);
  });

  it("shows each section's content, and the program's address marked", () => {
    open(weather);
    const text = dialog().textContent ?? "";

    expect(text).toContain(
      "Agents can use these through a connector. Each one asks a person first unless you change that.",
    );
    expect(text).toContain("its answers aren't trusted as instructions");
    expect(text).toContain("npx weather-mcp@1.2.3");
    expect(text).toContain(
      "Runs In a sandbox, in its own empty folder. Without a working sandbox it doesn't run",
    );
    expect(text).toContain("Version 1.2.3");
    expect(text).toContain("Goes only to api.example.com");
    expect(text).toContain("How Authorization header");
    expect(text).toContain(
      "You enter its value in this plugin's settings. The plugin's code never sees it.",
    );
    expect(text).toContain("radar.example.com (the program)");
    expect(text).toContain(
      "Halonic draws these itself. A plugin's text can show basic formatting (bold, lists, quotes, code) and links with their addresses, and nothing else.",
    );
  });

  it("ends with the last line, outside the body and read with the description", () => {
    open(weather);
    const last =
      "Plugin code runs apart from Studio. Halonic doesn't check what the plugin does with what it's given.";
    const lines = [...dialog().querySelectorAll("p")];
    const line = lines.at(-1);
    const described = (dialog().getAttribute("aria-describedby") ?? "").split(" ");

    expect(line?.textContent).toBe(last);
    expect(lines.filter((each) => each.textContent === last)).toHaveLength(1);
    expect(described).toContain(line?.id);
    expect(document.getElementById(described[0] ?? "")?.contains(line ?? null)).toBe(false);
  });

  it("shows the plugin's text as plain text", () => {
    open(weather);

    expect(dialog().textContent).toContain("“<b>The</b> [forecast](javascript:alert(1)).”");
    expect(dialog().querySelector("b")).toBeNull();
    expect(dialog().querySelector("a")).toBeNull();
  });

  it("trusts from the primary, and Escape is Not now", () => {
    const pressed = open(weather);

    act(() => button("Trust and turn on").click());
    act(() => {
      dialog().dispatchEvent(new Event("cancel", { cancelable: true }));
    });

    expect(pressed).toEqual(["trust", "not now"]);
  });

  it("keeps the first letter of the reason as the host sent it", async () => {
    open(weather, { failure: "Windows denied access." });
    await settle();

    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't save trust: Windows denied access. Nothing was started.",
    );
  });

  it("puts the last line in the footnote, outside the body, and describes the dialog with it", async () => {
    open(weather);
    await settle();

    const line = [...dialog().querySelectorAll("p")].find(
      (paragraph) => paragraph.textContent === TRUST_CHECK_LAST_LINE,
    );
    expect(line).toBeDefined();
    expect(line?.previousElementSibling?.tagName).not.toBe("P");
    expect(line?.parentElement?.nextElementSibling?.tagName).toBe("FOOTER");
    expect(
      dialog()
        .querySelector("div.flex.flex-col.gap-3")
        ?.contains(line ?? null),
    ).toBe(false);
    const described = (dialog().getAttribute("aria-describedby") ?? "").split(" ");
    expect(described).toContain(line?.id);
  });

  it("says why trust wasn't saved, and that nothing was started", async () => {
    open(weather, { failure: "The disk is full." });
    await settle();

    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't save trust: The disk is full. Nothing was started.",
    );
  });
});

// The Studio half of the P8 parity check (HAL-1741, HAL-7564): `halonic plugin add` runs the same
// check against its words in apps/cli/src/output/plugin-trust-check.test.ts.
verifies("app.plugin-trust-sections", () => {
  it("shows the shared model's sections, in its order, each under its heading word for word", () => {
    const content = pluginTrustContent({ plugin: weather, files: [] });
    open(weather);

    // Every section but Sign-ins, which plugin-trust-sign-ins.test.tsx checks with a plugin that signs in.
    expect(pluginTrustSections(content)).toEqual(
      pluginTrustSectionOrder.filter((section) => section !== "sign-ins"),
    );
    expect(headings()).toEqual(
      pluginTrustSections(content).map((section) => pluginTrustSectionHeadings[section]),
    );
  });

  it("leaves out the sections the shared model leaves out", () => {
    const content = pluginTrustContent({ plugin: readOnly, files: [] });
    open(readOnly);

    expect(headings()).toEqual(
      pluginTrustSections(content).map((section) => pluginTrustSectionHeadings[section]),
    );
    expect(headings()).toEqual(["Tools for agents"]);
  });

  it("shows the folder in full and the first files, then how many more, as plain text", () => {
    const folder = "/plugins/weather";
    const files = { shown: ["backend/index.js", "backend/<b>x</b>.js"], more: 4 };
    open(weather, { folder, files });

    const text = dialog().textContent ?? "";
    expect(text).toContain(`Folder${folder}`);
    expect(text).toContain("Files");
    expect(text).toContain("backend/index.js");
    expect(text).toContain("backend/<b>x</b>.js");
    expect(dialog().querySelector("b")).toBeNull();
    expect(text).toContain("and 4 more");
  });

  it("writes hidden characters in the folder and the file names out as markers", () => {
    const folder = "/plugins/we\u202Eather";
    const files = { shown: ["backend/x\u202Esj.exe", "backend/y\u001b[31m.js"], more: 0 };
    open(weather, { folder, files });

    const text = dialog().textContent ?? "";
    expect(text).toContain("/plugins/we⟦U+202E⟧ather");
    expect(text).toContain("backend/x⟦U+202E⟧sj.exe");
    expect(text).toContain("backend/y⟦U+001B⟧[31m.js");
    expect(text).not.toContain("\u202E");
    expect(text).not.toContain("\u001b");
  });

  it("leaves out the folder and the files when the host gives none", () => {
    open(weather);

    const text = dialog().textContent ?? "";
    expect(text).not.toContain("Folder");
    expect(text).not.toContain("Files");
  });

  it("leaves out Files for a plugin with only its manifest, and 'and N more' when nothing is hidden", () => {
    open(weather, { folder: "/plugins/weather", files: { shown: [], more: 0 } });
    expect(dialog().textContent).toContain("Folder");
    expect(dialog().textContent).not.toContain("Files");

    unmountAll();
    open(weather, { folder: "/plugins/weather", files: { shown: ["a.js"], more: 0 } });
    expect(dialog().textContent).not.toContain("more");
  });
});

verifies("app.plugin-program-secret-text", () => {
  it("says which program gets a secret, as which variable, and where it can connect, as the CLI does", () => {
    open(withProgramSecret);
    const text = dialog().textContent ?? "";

    expect(text).toContain("Given to acme as ACME_KEY; acme can reach api.acme.com");
    expect(text).not.toContain("Goes only to");
  });
});
