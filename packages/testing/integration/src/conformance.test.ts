import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describeIntegrationConformance } from "./describe.ts";
import { weatherSubject } from "./fixtures/weather.ts";

// The fake weather integration passes the whole suite, the way every real
// integration will.
verifies("integration.fake-integration-passes", () => {
  describeIntegrationConformance({
    ...weatherSubject,
    sources: {
      "fixtures/weather.ts": readFileSync(
        new URL("./fixtures/weather.ts", import.meta.url),
        "utf8",
      ),
    },
  });
});
