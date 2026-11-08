import { readFileSync } from "node:fs";
import { describeIntegrationConformance } from "./describe.ts";
import { weatherSubject } from "./fixtures/weather.ts";

// testing-integration.fake-integration-passes: the fake weather integration
// passes the whole suite, the way every real integration will.
describeIntegrationConformance({
  ...weatherSubject,
  sources: {
    "fixtures/weather.ts": readFileSync(new URL("./fixtures/weather.ts", import.meta.url), "utf8"),
  },
});
