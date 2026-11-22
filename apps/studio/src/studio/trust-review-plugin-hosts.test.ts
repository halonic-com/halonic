import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFolderReader, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { TrustService } from "@halonicjs/app";
import { parseFile } from "@halonicjs/format";
import { fixedClock } from "@halonicjs/std";
import type { InstalledPlugin } from "@halonicjs/studio-feature-plugins";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { WorkspaceTrust } from "./workspace-trust.ts";
import { WorkspaceTrustView } from "./workspace-trust-control.ts";

const ordersConnector = "id: orders\ntransport:\n  plugin: { id: acme-orders }\n";

const ordersManifest = [
  "id: acme-orders",
  "version: 1.0.0",
  "sdk: 1",
  "name: Acme orders",
  "backend:",
  "  entry: backend/index.js",
  "  hosts: [api.acme.example, { fromSetting: region-url, class: public }]",
  "  tools:",
  "    - { name: find-order, description: Finds an order., risk: read, untrusted: true }",
  "ui:",
  "  settings:",
  "    region-url: { label: Region, type: text }",
  "",
].join("\n");

let folder: string;

beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), "halonic-trust-plugin-hosts-")));
  await mkdir(join(folder, "library/connectors"), { recursive: true });
  await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(join(folder, "library/connectors/orders.connector.yaml"), ordersConnector);
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** The installed plugin `acme-orders`, as the plugins feed gives it. */
function ordersPlugin(): InstalledPlugin {
  const parsed = parseFile("plugin", ordersManifest);
  if (!parsed.ok)
    throw new Error(
      parsed.error.map((problem) => `${problem.path.join(".")} ${problem.message}`).join("; "),
    );
  return {
    plugin: "acme-orders",
    name: "Acme orders",
    status: "on",
    cards: [],
    commands: [],
    manifest: parsed.value.value,
    problems: [],
  };
}

/** A plugins feed whose plugins the test sets, telling its listeners. */
class TestPluginFeed {
  #plugins: readonly InstalledPlugin[] = [];
  readonly #listeners = new Set<() => void>();

  readonly current = (): readonly InstalledPlugin[] => this.#plugins;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  set(plugins: readonly InstalledPlugin[]): void {
    this.#plugins = plugins;
    for (const listener of this.#listeners) listener();
  }
}

async function viewWith(feed: TestPluginFeed): Promise<WorkspaceTrustView> {
  const trust = new WorkspaceTrust({
    definitions: new FolderDefinitionStore(folder, folder),
    folder: new FileSystemFolderReader(folder, folder),
    findCommand: async () => undefined,
    digest: webCryptoDigest,
    trust: new TrustService({
      store: new MemoryTrustStore(),
      digest: webCryptoDigest,
      clock: fixedClock(),
      appVersion: "0.1.0",
    }),
  });
  await trust.refresh();
  return new WorkspaceTrustView(trust, "/work/acme", undefined, () => feed);
}

/** The row of the connector `orders` in the check's Addresses. */
function ordersRow(view: WorkspaceTrustView) {
  const addresses = view
    .review()
    ?.sections.find((section) => section.heading.startsWith("Address"));
  return addresses?.rows.find((row) => row.id === "orders");
}

verifies("studio.trust-review-plugin-hosts", () => {
  it("names the plugin and the hosts its installed backend reaches, as halonic trust does", async () => {
    const feed = new TestPluginFeed();
    feed.set([ordersPlugin()]);

    const view = await viewWith(feed);

    expect(ordersRow(view)).toMatchObject({
      detail: "plugin acme-orders",
      lines: [["Reaches", "api.acme.example and the address in the setting region-url"]],
    });
  });

  it("names the plugin with no Reaches line while it isn't installed", async () => {
    const view = await viewWith(new TestPluginFeed());

    expect(ordersRow(view)).toMatchObject({ detail: "plugin acme-orders", lines: [] });
  });

  it("builds the check again and tells the window when the plugins are read", async () => {
    const feed = new TestPluginFeed();
    const view = await viewWith(feed);
    let told = 0;
    view.subscribe(() => {
      told += 1;
    });

    feed.set([ordersPlugin()]);

    expect(told).toBe(1);
    expect(ordersRow(view)?.lines).toEqual([
      ["Reaches", "api.acme.example and the address in the setting region-url"],
    ]);
  });
});
