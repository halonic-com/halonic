import { TauriRunStore, webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import {
  type MemoryDefinitionStore,
  MemoryFolderReader,
  MemoryTrustStore,
} from "@halonicjs/adapter-memory";
import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import { TrustService } from "@halonicjs/app";
import { fixedClock } from "@halonicjs/std";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { acmeFiles, fakeShell, location, serviceOn } from "../engine/engine-service.testing.ts";
import { engineTrustOptions } from "./folder-engine.ts";
import { WorkspaceTrust } from "./workspace-trust.ts";

/** Acme with a keyless Ollama as its model, so it needs trust. */
const acme = () =>
  acmeFiles(
    { writer: "model: ollama/qwen3\n" },
    {
      "providers/ollama.yaml": [
        "id: ollama",
        "type: openai-compatible",
        "baseUrl: http://localhost:11434/v1",
        "local: true",
        "",
      ].join("\n"),
    },
  );

const files = ["id: files", "name: Files", "transport:", "  stdio:", "    command: npx", ""];

/** Saves the connector "files" into the workspace, as the Library's editor does. */
async function addConnector(definitions: MemoryDefinitionStore): Promise<void> {
  await definitions.write("library/connectors/files.connector.yaml", files.join("\n"));
}

const setTimer: SetTimer = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
};

/**
 * Acme's folder trust and the engine options the folder's engine gets from it, with each
 * `mayStart` the engine asks counted, so a test can wait for its trust-change checks to end.
 */
function folderTrust(definitions: MemoryDefinitionStore) {
  const store = new MemoryTrustStore();
  const trust = new WorkspaceTrust({
    definitions,
    folder: new MemoryFolderReader(location),
    findCommand: async () => "/usr/bin/npx",
    digest: webCryptoDigest,
    trust: new TrustService({
      store,
      digest: webCryptoDigest,
      clock: fixedClock(),
      appVersion: "0.1.0",
    }),
  });
  const options = engineTrustOptions(trust);
  const checks = { asked: 0, ended: 0 };
  const mayStart: typeof options.mayStart = async (workspace) => {
    checks.asked += 1;
    try {
      return await options.mayStart(workspace);
    } finally {
      checks.ended += 1;
    }
  };
  /** Trusts the folder as a person does: with the fingerprint its check showed. */
  const trustAsPerson = async () => {
    await trust.refresh();
    const shown = trust.check;
    if (shown === undefined || shown.status === "refused") throw new Error("Nothing to trust.");
    expect(await trust.grant(shown.fingerprint)).toEqual({ ok: true });
  };
  /** Waits until every check the engine started has ended. */
  const settled = () =>
    waitUntil("the engine's trust checks", () => checks.asked > 0 && checks.ended === checks.asked);
  return { trust, store, options: { ...options, mayStart }, trustAsPerson, settled };
}

verifies("studio.engine-trust-read-only", () => {
  it("keeps the trust a person gave a connector added while the engine was open", async () => {
    const definitions = acme();
    const { trust, options, trustAsPerson, settled } = folderTrust(definitions);
    await trustAsPerson();
    const service = serviceOn(fakeShell(), definitions, options);
    const engine = await service.open();

    await addConnector(definitions);
    await trustAsPerson();
    await settled();

    await trust.refresh();
    expect(trust.check?.status).toBe("trusted");
    expect(await service.open()).toBe(engine);
    await service.dispose();
  });

  it("keeps it when the save and the trust land while a run is going", async () => {
    const definitions = acme();
    const { trust, options, trustAsPerson, settled } = folderTrust(definitions);
    await trustAsPerson();
    const calls: string[] = [];
    // The model holds the run in its call until the engine closes.
    const http = {
      fetch: (url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          calls.push(url);
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    };
    const shell = fakeShell();
    const service = serviceOn(shell, definitions, { ...options, http, setTimer });
    const { id } = await service.startRun({ hubId: "support", workflowId: "reply" }, {});
    await waitUntil("the model call", () => calls.length > 0);
    // The engine's copy: the files as saved at the run's start.
    const copy = await loadWorkspace(definitions);

    await addConnector(definitions);
    await trustAsPerson();
    await settled();
    // What a harness step, a key's check and the executor ask of the copy mid-run.
    expect(await options.isTrusted(copy)).toBe(true);

    await trust.refresh();
    expect(trust.check?.status).toBe("trusted");
    expect((await new TauriRunStore(shell.ipc, location).get(id))?.status).toBe("running");
    await service.dispose();
  });

  it("says not trusted for a copy with a connector the record lacks, and writes nothing", async () => {
    const definitions = acme();
    const { trust, options, trustAsPerson } = folderTrust(definitions);
    await trustAsPerson();
    await addConnector(definitions);
    const copy = await loadWorkspace(definitions);

    expect(await options.isTrusted(copy)).toBe(false);
    expect(await options.mayStart(copy)).toBe(false);

    await definitions.remove("library/connectors/files.connector.yaml");
    await trust.refresh();
    expect(trust.check?.status).toBe("trusted");
  });

  it("gives connectors the stored record's grant for a copy that lost a connector", async () => {
    const definitions = acme();
    await addConnector(definitions);
    const { trust, store, trustAsPerson } = folderTrust(definitions);
    await trustAsPerson();
    await definitions.remove("library/connectors/files.connector.yaml");
    const stored = await store.get(location);

    // What the run connectors and the Library's tool listing pass on to the agent host.
    const checked = await trust.checkLoaded(await loadWorkspace(definitions));

    expect(checked.status).toBe("trusted");
    if (checked.status !== "trusted") return;
    expect(checked.grant).toEqual({ location, fingerprint: stored?.fingerprint });
    expect(await store.get(location)).toEqual(stored);
  });
});
