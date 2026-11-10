import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Integration } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describePluginConformance } from "./describe.ts";
import type { RecordingFile } from "./recording.ts";

// The sample plugin in examples/ passes the whole suite, as the author guide
// shows. Its backend is loaded from its `entry`, as Halonic will load it.
const folder = fileURLToPath(new URL("../examples/acme-orders-plugin", import.meta.url));
const entry = new URL("../examples/acme-orders-plugin/backend/index.js", import.meta.url).href;
const { acmeOrders } = (await import(entry)) as { acmeOrders: Integration };

function recording(scenario: string): RecordingFile {
  return JSON.parse(readFileSync(join(folder, "recordings", `${scenario}.json`), "utf8"));
}

verifies("integration.sample-plugin", () => {
  describePluginConformance({
    folder,
    backend: acmeOrders,
    recordings: [recording("find-order"), recording("open-orders")],
    cases: [
      {
        tool: "find-order",
        scenario: "find-order",
        args: { order: "A-1001" },
        check: (result) => {
          if (result !== "Order A-1001: shipped, 2 item(s), €24.50")
            throw new Error(`unexpected result ${result}`);
        },
      },
      {
        tool: "open-orders",
        scenario: "open-orders",
        args: {},
        check: (result) => {
          if (!result.includes("| A-1003 | paid | €61.25 |"))
            throw new Error(`unexpected result ${result}`);
        },
      },
    ],
  });
});
