// @vitest-environment jsdom
// Every text a plugin's manifest gives (its name, description, titles, labels, help, choices and
// purposes) stays text on every plugin screen: whatever a label holds, the screen draws only the
// elements, attributes and links it draws for a plain label, and the label reads as its own
// characters.
import { type Plugin, parseFile } from "@halonicjs/format";
import { PresentationProvider } from "@halonicjs/studio-kit";
import {
  createShell,
  defineFeature,
  type ItemViewProps,
  loadView,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PluginCardStatus } from "./cards/plugin-card.tsx";
import { PluginCard } from "./cards/plugin-card.tsx";
import {
  type PluginCommand,
  PluginCommandDialog,
  type PluginToolCaller,
} from "./commands/plugin-command-dialog.tsx";
import { PluginCommandHost } from "./commands/plugin-command-host.tsx";
import { PluginCommandOpener } from "./commands/plugin-command-source.ts";
import { PluginsList } from "./list/plugins-list.tsx";
import { PluginPage } from "./page/plugin-page.tsx";
import type { InstalledPlugin } from "./page/plugin-pages.ts";
import { pluginPanelItem, pluginPanelKind } from "./panel/plugin-panels.ts";
import { fakeModal, restoreModal } from "./test-support/modal.ts";
import { feedOf, noActions, noSettings } from "./test-support/plugins.ts";
import { installFakePopover } from "./test-support/popover.ts";
import { render, unmountAll } from "./test-support/render.tsx";
import { PluginTrustDialog } from "./trust/plugin-trust-dialog.tsx";

let removePopover = () => {};
beforeEach(() => {
  fakeModal();
  removePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restoreModal();
  removePopover();
});

/** Pieces of HTML, Markdown, links and templates a hostile label is built from. */
const PIECES = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<a href='javascript:alert(1)'>x</a>",
  "<iframe src=//example.com>",
  '<b style="x">',
  "</div>",
  "<!--",
  "[x](javascript:alert(1))",
  "[x](https://example.com/)",
  "![x](https://example.com/x.png)",
  "javascript:alert(1)",
  "https://example.com/",
  "&lt;b&gt;",
  "&amp;",
  "{{x}}",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a template placeholder, written literally
  "${x}",
  "%s",
  "**",
  "_",
  "`",
  "# ",
  "\"'",
  "\\",
  "Weather",
];

/** The longest a label may be (`label` in the plugin schema). */
const LABEL_MAX = 80;

/**
 * The same labels on every run: a small seeded generator (mulberry32), as the studio layer has no
 * property-test library (docs/guides/dependencies.md). Each label is 1 to 80 characters.
 */
function labels(count: number, seed: number): string[] {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
  return Array.from({ length: count }, () => {
    let label = pick(PIECES);
    for (let more = Math.floor(next() * 6); more > 0; more -= 1) {
      const piece = pick(PIECES);
      if (label.length + piece.length > LABEL_MAX) break;
      label += piece;
    }
    return label;
  });
}

/** One plugin's texts. Each sample gives every field its own label. */
interface Texts {
  readonly name: string;
  readonly description: string;
  readonly tool: string;
  readonly purpose: string;
  readonly setting: string;
  readonly help: string;
  readonly command: string;
  readonly field: string;
  readonly choice: string;
  readonly card: string;
  readonly panel: string;
}

const FIELDS = [
  "name",
  "description",
  "tool",
  "purpose",
  "setting",
  "help",
  "command",
  "field",
  "choice",
  "card",
  "panel",
] as const satisfies readonly (keyof Texts)[];

/** The Weather plugin with `texts` in every place a manifest has text, parsed by the real kind. */
function manifestWith(texts: Texts): Plugin {
  const q = (key: keyof Texts) => JSON.stringify(texts[key]);
  const parsed = parseFile(
    "plugin",
    `id: weather
version: 1.2.0
sdk: 1
name: ${q("name")}
description: ${q("description")}
backend:
  hosts: [api.example.com]
  secrets:
    api-key: { purpose: ${q("purpose")}, hosts: [api.example.com], as: bearer }
  tools:
    - { name: forecast, description: ${q("tool")}, risk: read, untrusted: true }
ui:
  settings:
    key: { label: ${q("setting")}, help: ${q("help")}, type: secret, secret: api-key }
    city: { label: ${q("setting")}, type: choice, choices: [${q("choice")}, Ghent] }
  commands:
    - id: forecast
      title: ${q("command")}
      tool: forecast
      form:
        place: { label: ${q("field")}, help: ${q("help")}, type: text, required: true }
        units: { label: ${q("field")}, type: choice, choices: [${q("choice")}, metric] }
  cards:
    - { id: today, title: ${q("card")}, tool: forecast, args: { place: Ghent } }
  panel: { title: ${q("panel")} }`,
  );
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

function installed(manifest: Plugin, status: PluginCardStatus): InstalledPlugin {
  return {
    plugin: manifest.id,
    name: manifest.name,
    status,
    commands: manifest.ui?.commands ?? [],
    cards: manifest.ui?.cards ?? [],
    panel: manifest.ui?.panel,
    manifest,
    trustedAt: status === "not-trusted" ? undefined : new Date(2026, 10, 3, 9).toISOString(),
    origin: {
      kind: "git",
      address: "https://github.com/example/halonic-weather.git",
      commit: "3f9c2a1",
    },
    problems: [],
  };
}

const caller: PluginToolCaller = { call: async () => "Sunny" };
const now = () => new Date(2026, 10, 12);

/** Lets effects, calls and a frame pass, as the dialogs' alert slots wait for one. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

/** Draws the plugin's panel the way the shell draws an item's tab. */
async function panel(plugin: InstalledPlugin) {
  const { feed } = feedOf([plugin]);
  const opener = new PluginCommandOpener();
  const options = { feed, caller, opener, review: () => {}, details: () => {} };
  const shell = createShell({
    features: [
      defineFeature({
        id: "plugins",
        title: "Plugins",
        register: (studio) => studio.itemKinds.add(pluginPanelKind(() => options)),
      }),
    ],
  });
  const kind = shell.contributions.itemKinds.get("plugin-panel");
  if (kind === undefined) throw new Error("No plugin-panel kind");
  const View = await loadView<ComponentType<ItemViewProps>>(kind.open);
  render(
    <>
      <View
        item={pluginPanelItem("weather")}
        context={{} as WorkspaceContext}
        Sections={() => null}
      />
      <PluginCommandHost opener={opener} caller={caller} />
    </>,
  );
}

interface Screen {
  /** The texts the screen shows in full, so each must read as its own characters. */
  readonly shows: readonly (keyof Texts)[];
  readonly draw: (plugin: InstalledPlugin) => Promise<void>;
}

const SCREENS: Record<string, Screen> = {
  list: {
    shows: ["name", "description"],
    draw: async (plugin) => {
      render(
        <PresentationProvider presentation="desktop">
          <PluginsList
            place="app"
            load={{ kind: "ready" }}
            plugins={[plugin]}
            builtIn={[]}
            actions={noActions().actions}
            onOpen={() => {}}
            onOpenInNewTab={() => {}}
            onAdd={() => {}}
            onRetry={() => {}}
            now={now}
          />
        </PresentationProvider>,
      );
    },
  },
  page: {
    shows: ["name", "description", "tool", "setting", "command", "card"],
    draw: async (plugin) => {
      render(
        <PresentationProvider presentation="desktop">
          <PluginPage
            plugin={plugin}
            {...noSettings()}
            {...noActions()}
            onOpenPanel={() => {}}
            now={now}
          />
        </PresentationProvider>,
      );
    },
  },
  "trust check": {
    shows: ["name", "tool"],
    draw: async (plugin) => {
      if (plugin.manifest === undefined) throw new Error("No manifest");
      render(
        <PluginTrustDialog
          manifest={plugin.manifest}
          origin={plugin.origin}
          reason="add"
          onTrust={() => {}}
          onNotNow={() => {}}
        />,
      );
    },
  },
  card: {
    shows: ["name", "card"],
    draw: async (plugin) => {
      const card = plugin.cards[0];
      if (card === undefined) throw new Error("No card");
      render(
        <PluginCard
          plugin={{ id: plugin.plugin, name: plugin.name }}
          status={plugin.status}
          card={card}
          caller={caller}
          onReview={() => {}}
          onDetails={() => {}}
        />,
      );
    },
  },
  "command dialog": {
    shows: ["name", "command", "field", "help"],
    draw: async (plugin) => {
      const command = plugin.commands[0] as PluginCommand | undefined;
      if (command === undefined) throw new Error("No command");
      render(
        <PluginCommandDialog
          plugin={{ id: plugin.plugin, name: plugin.name }}
          command={command}
          caller={caller}
          onClose={() => {}}
        />,
      );
    },
  },
  panel: {
    shows: ["name", "panel", "command", "card"],
    draw: panel,
  },
};

/** What a screen draws: its elements, attributes and link addresses. */
interface Drawn {
  readonly elements: Set<string>;
  readonly attributes: Set<string>;
  readonly links: Set<string>;
}

function drawn(): Drawn {
  const found: Drawn = { elements: new Set(), attributes: new Set(), links: new Set() };
  for (const element of document.body.querySelectorAll("*")) {
    const tag = element.tagName.toLowerCase();
    found.elements.add(tag);
    for (const { name, value } of element.attributes) {
      found.attributes.add(`${tag}[${name}]`);
      if (name === "href" || name === "src" || name === "action") found.links.add(value);
    }
  }
  return found;
}

function merged(...all: Drawn[]): Drawn {
  return {
    elements: new Set(all.flatMap((each) => [...each.elements])),
    attributes: new Set(all.flatMap((each) => [...each.attributes])),
    links: new Set(all.flatMap((each) => [...each.links])),
  };
}

function textsOf(label: (field: keyof Texts) => string): Texts {
  return Object.fromEntries(FIELDS.map((field) => [field, label(field)])) as unknown as Texts;
}

/** What `screen` draws for a plugin whose texts are plain: short ones and ones at the limit. */
async function plainDrawing(screen: Screen, status: PluginCardStatus): Promise<Drawn> {
  const drawings: Drawn[] = [];
  for (const plain of [
    textsOf((field) => `Plain ${field}`),
    textsOf((field) => `${field} `.repeat(LABEL_MAX).slice(0, LABEL_MAX).trim()),
  ]) {
    await screen.draw(installed(manifestWith(plain), status));
    await settle();
    drawings.push(drawn());
    unmountAll();
  }
  return merged(...drawings);
}

/** What a hostile drawing has that the plain one doesn't. */
function problems(plain: Drawn, hostile: Drawn): string[] {
  return [
    ...[...hostile.elements].filter((tag) => !plain.elements.has(tag)).map((tag) => `<${tag}>`),
    ...[...hostile.attributes].filter((name) => !plain.attributes.has(name)),
    ...[...hostile.links].filter((link) => !plain.links.has(link)).map((link) => `link ${link}`),
  ];
}

const SAMPLES = labels(30 * FIELDS.length, 1743);
const STATUSES: readonly PluginCardStatus[] = ["on", "not-trusted", "changed"];
/** Ten plugins per test, so each stays well inside the time limit on a busy runner. */
const BATCHES = Array.from({ length: 3 }, (_, batch) => ({
  batch,
  plugins: Array.from({ length: 10 }, (_, index) => {
    const sample = batch * 10 + index;
    return {
      status: STATUSES[sample % STATUSES.length] as PluginCardStatus,
      texts: textsOf((field) => SAMPLES[sample * FIELDS.length + FIELDS.indexOf(field)] as string),
    };
  }),
}));

/** Draws `screen` for one plugin and checks it against the plain drawing for its status. */
async function check(screen: Screen, plain: Drawn, status: PluginCardStatus, texts: Texts) {
  await screen.draw(installed(manifestWith(texts), status));
  await settle();
  const seen = document.body.textContent ?? "";
  expect(problems(plain, drawn()), JSON.stringify(texts)).toEqual([]);
  // A plugin that isn't on shows its commands and cards only as unavailable or empty.
  const shown = screen.shows.filter(
    (field) => status === "on" || (field !== "command" && field !== "card"),
  );
  for (const field of shown) expect(seen, `${field}: ${texts[field]}`).toContain(texts[field]);
  unmountAll();
}

function describeScreen(title: string): void {
  const screen = SCREENS[title] as Screen;
  describe(`the ${title} shows a plugin's texts as plain text`, () => {
    it.each(BATCHES)(
      "draws nothing a plain label doesn't, batch $batch",
      async ({ plugins }) => {
        const plain = new Map<PluginCardStatus, Drawn>();
        for (const status of STATUSES) plain.set(status, await plainDrawing(screen, status));
        for (const { status, texts } of plugins) {
          await check(screen, plain.get(status) as Drawn, status, texts);
        }
      },
      20_000,
    );
  });
}

// The trace check reads each requirement ID as a plain string, so each screen gets its own call.
verifies("plugins.plugin-list", () => describeScreen("list"));
verifies("plugins.plugin-page", () => describeScreen("page"));
verifies("plugins.plugin-trust-check", () => describeScreen("trust check"));
verifies("plugins.plugin-cards", () => describeScreen("card"));
verifies("plugins.plugin-commands", () => describeScreen("command dialog"));
verifies("plugins.plugin-panel", () => describeScreen("panel"));
