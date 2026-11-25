import { type BlobRef, type BlobStore, checkBlobMediaType, isBlobHash } from "@halonicjs/ports";
import type { ScopeKey } from "@paperclipai/plugin-sdk";
import type { RunStateClient } from "./plugin-run-store.ts";

/**
 * Blobs in plugin state (HAL-17774). The engine keeps each run's
 * definitions here, so a waiting run resumes on the workflow it started
 * with. One entry per hash, its bytes in base64.
 */
export class PluginStateBlobStore implements BlobStore {
  readonly #state: RunStateClient;
  readonly #companyId: string;

  constructor(state: RunStateClient, companyId: string) {
    this.#state = state;
    this.#companyId = companyId;
  }

  #key(hash: string): ScopeKey {
    return {
      scopeKind: "company",
      scopeId: this.#companyId,
      namespace: "workflow-blobs",
      stateKey: hash,
    };
  }

  async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    checkBlobMediaType(mediaType);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
    const hash = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    await this.#state.set(this.#key(hash), Buffer.from(data).toString("base64"));
    return { hash, size: data.byteLength, mediaType };
  }

  async get(hash: string): Promise<Uint8Array | null> {
    if (!isBlobHash(hash)) {
      return null;
    }
    const stored = await this.#state.get(this.#key(hash));
    return typeof stored === "string" ? new Uint8Array(Buffer.from(stored, "base64")) : null;
  }
}
