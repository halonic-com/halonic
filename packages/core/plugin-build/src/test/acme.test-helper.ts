import { encodeUtf8 } from "@halonicjs/std";
import type { PluginFiles } from "../plugin-archive.ts";
import type { PluginSnapshot } from "../snapshot.ts";

/** An invented workspace's snapshot: two tools, `acme`-style. */
export const acmeSnapshot: PluginSnapshot = {
  tools: [
    {
      name: "order_status",
      description: "Tells where an order is.",
      parameters: { type: "object", properties: { orderId: { type: "string" } } },
    },
    { name: "refund", description: "Refunds an order.", parameters: { type: "object" } },
  ],
};

/** The four parts of the `acme` plugin, fixed so their archive has a golden sha-256. */
export function acmeFiles(): PluginFiles {
  return {
    packageJson: '{"name":"halonic-ws.acme","version":"0.1.0"}\n',
    manifest: 'export default { id: "halonic-ws.acme" };\n',
    worker: encodeUtf8("export function start() {}\n"),
    snapshot: acmeSnapshot,
  };
}

/** A commit id in the form git gives it. */
export const acmeCommit = "0123456789abcdef0123456789abcdef01234567";
