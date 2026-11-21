import {
  MemoryFolderReader,
  MemoryPluginFolder,
  MemoryRecordStore,
  MemoryTrustStore,
} from "@halonicjs/adapter-memory";
import { PluginService, TrustService } from "@halonicjs/app";
import type { Digest } from "@halonicjs/ports";

/** SHA-256 over Web Crypto. */
export const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** The manifest of `rain` or `weather`; `weather` keeps an API key in the keychain. */
const manifest = (id: string): string =>
  `id: ${id}
version: 1.0.0
sdk: 1
name: ${id === "rain" ? "Rain" : "Weather"}
backend:
  hosts: [api.acme.example]
  secrets:
    example-key:
      purpose: The forecast service's API key
      hosts: [api.acme.example]
      as: header
      header: x-api-key
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: true }
ui:
  commands:
    - { id: forecast, title: Show the forecast, tool: forecast }
  panel: { title: Weather }
  settings:
    key: { label: API key, type: secret, secret: example-key }`;

/** The plugins `rain` and `weather`, and `broken` whose manifest isn't one. */
export function acme() {
  const reader = new MemoryFolderReader("/profile/plugins");
  for (const id of ["rain", "weather"]) {
    reader.putFile(`${id}/plugin.yaml`, manifest(id));
    reader.putFile(`${id}/backend/index.js`, "export default {};\n");
  }
  reader.putFile("broken/plugin.yaml", "id: broken\n");
  const clock = { now: () => new Date("2026-11-14T09:00:00.000Z") };
  const trust = new TrustService({
    store: new MemoryTrustStore(),
    digest,
    clock,
    appVersion: "0.1.0",
  });
  const service = new PluginService({
    plugins: reader,
    writer: new MemoryPluginFolder(),
    digest,
    trust,
    records: new MemoryRecordStore(),
    clock,
    signOut: async () => undefined,
  });
  return { service, reader };
}
