import {
  loadModelsSettingsSection,
  ModelKeysService,
  ModelsFilesService,
} from "@halonicjs/studio-feature-models/api";
import {
  loadPluginsSettingsSection,
  PluginsService,
  type StudioPlugins,
} from "@halonicjs/studio-feature-plugins/api";
import {
  AgentSandboxService,
  BrowserDisplayPrefs,
  DisplaySettings,
  DisplaySettingsService,
  loadAgentSandboxSection,
  loadFormatsSection,
} from "@halonicjs/studio-feature-settings/api";
import {
  loadTrustedSourcesSection,
  type TrustedSource,
  TrustedSourcesService,
} from "@halonicjs/studio-feature-workspace/api";
import {
  createAnnouncer,
  type Registered,
  type ServiceKey,
  SettingsDialog,
  type SettingsSectionContribution,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/**
 * Settings with one section open, drawn by the shell's real Settings dialog from made-up data
 * (HAL-11861). The section comes from the page's `section` query parameter. The names and the
 * order are the app's; the lines under the names are copied here.
 */
const workspaceName = "Acme";

const sections: Registered<SettingsSectionContribution>[] = [
  {
    id: "models",
    title: "Models",
    icon: "models",
    scope: "workspace",
    order: 10,
    description: "3 model names, 2 providers",
    view: "ModelsSettingsSection",
    load: loadModelsSettingsSection,
    featureId: "models",
  },
  {
    id: "formats",
    title: "Formats",
    icon: "formats",
    scope: "display",
    order: 20,
    view: "FormatsSection",
    load: loadFormatsSection,
    featureId: "settings",
  },
  {
    id: "agent-sandbox",
    title: "Agent sandbox",
    icon: "agent-sandbox",
    scope: "host",
    order: 30,
    description: "Agents run inside a sandbox, so a mistake can't reach the rest of your computer.",
    view: "AgentSandboxSection",
    load: loadAgentSandboxSection,
    featureId: "settings",
  },
  {
    id: "trusted-sources",
    title: "Trusted sources",
    icon: "trusted-sources",
    scope: "host",
    order: 40,
    description: "Workspaces and plugins you've trusted on this computer.",
    view: "TrustedSourcesSection",
    load: loadTrustedSourcesSection,
    featureId: "workspace",
  },
  {
    id: "plugins",
    title: "Plugins",
    icon: "plugins",
    scope: "host",
    order: 60,
    description:
      "Plugins add services, tools and cards to Halonic. They're installed on this computer, for every workspace.",
    view: "PluginsSettingsSection",
    load: loadPluginsSettingsSection,
    featureId: "plugins",
  },
];

const sources: TrustedSource[] = [
  { location: "/work/acme", name: "acme", trustedAt: "2026-11-03T12:00:00.000Z", found: true },
  {
    location: "/skills/pdf-tools",
    name: "pdf-tools",
    trustedAt: "2026-11-05T12:00:00.000Z",
    found: true,
  },
  {
    location: "/work/old-hub",
    name: "old-hub",
    trustedAt: "2026-10-12T12:00:00.000Z",
    found: false,
  },
];

const providerFiles = [
  {
    path: "providers/anthropic.yaml",
    text: "type: anthropic\nsecret: anthropic-key\nname: Anthropic\n",
  },
  { path: "providers/ollama.yaml", text: "type: ollama\nlocal: true\nname: Ollama\n" },
];

const modelsText = `version: 1
aliases:
  smart: { provider: anthropic, model: claude-sonnet-5-5 }
  default: { provider: ollama, model: llama3.2 }
  fast: { provider: anthropic, model: claude-haiku-4-5-20251001 }
`;

type Plugins = StudioPlugins;
const plugin = (id: string, name: string, status: "on" | "not-trusted") =>
  ({ plugin: id, name, status, commands: [], cards: [], problems: [] }) satisfies ReturnType<
    Plugins["feed"]["current"]
  >[number];
const installed = [plugin("weather", "Weather", "on"), plugin("notes", "Notes", "not-trusted")];

const services = new Map<string, unknown>([
  [
    ModelsFilesService.name,
    {
      readModels: async () => modelsText,
      readProviders: async () => providerFiles,
      readProvider: async (path: string) =>
        providerFiles.find((file) => file.path === path)?.text ?? null,
      readWorkspace: async () => "name: Acme\n",
      changeModels: () => undefined,
      changeWorkspace: () => undefined,
      changeProvider: () => undefined,
      subscribe: () => () => undefined,
    },
  ],
  [
    ModelKeysService.name,
    {
      entry: { kind: "field", keptOn: "this-computer", offHostHttps: false },
      stored: async () => false,
      save: async () => undefined,
      remove: async () => undefined,
    },
  ],
  [TrustedSourcesService.name, { list: async () => sources, remove: async () => undefined }],
  [
    AgentSandboxService.name,
    {
      available: true,
      check: async () => ({ state: "ready", checkedAt: "2026-11-17T08:00:00.000Z" }),
      running: async () => null,
      setUp: async () => null,
      remove: async () => null,
      follow: async () => null,
    },
  ],
  [
    DisplaySettingsService.name,
    new DisplaySettings(new BrowserDisplayPrefs(window.localStorage, window)),
  ],
  [
    PluginsService.name,
    {
      feed: { current: () => installed, subscribe: () => () => undefined },
      builtIn: [{ id: "gmail", name: "Gmail" }],
      actions: {},
    },
  ],
]);

const context = (): WorkspaceContext => ({
  services: {
    get: <Service,>(key: ServiceKey<Service>) => services.get(key.name) as Service,
    find: <Service,>(key: ServiceKey<Service>) => services.get(key.name) as Service | undefined,
  },
  announcer: createAnnouncer(),
});

const requested = new URLSearchParams(location.search).get("section") ?? "models";
if (!sections.some((section) => section.id === requested)) {
  throw new Error(`The settings page has no section "${requested}".`);
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The settings page needs its #root element (settings.html).");
}
createRoot(root).render(
  <StrictMode>
    <SettingsDialog
      sections={sections}
      workspaceName={workspaceName}
      place="app"
      requested={requested}
      regionFormat="en-GB"
      contextFor={context}
      announcer={createAnnouncer()}
      onClose={() => undefined}
    />
  </StrictMode>,
);
