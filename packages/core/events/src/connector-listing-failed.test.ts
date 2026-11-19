import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { ConnectorStartReason } from "./run-basics.ts";
import type { RunEventBody } from "./run-event.ts";

type ListingFailed = Extract<RunEventBody, { type: "connector.listing-failed" }>;

verifies("events.connector-listing-failed", () => {
  typeTest("names the agent, the connector and why it didn't start", () => {
    expectTypeOf<ListingFailed>().toEqualTypeOf<{
      type: "connector.listing-failed";
      agent: string;
      connector: string;
      cause: {
        readonly code: "connector-not-started";
        readonly why: ConnectorStartReason;
        readonly name?: string;
      };
    }>();
  });

  typeTest("doesn't accept another cause", () => {
    expectTypeOf<{
      type: "connector.listing-failed";
      agent: string;
      connector: string;
      cause: { readonly code: "time-limit"; readonly seconds: number };
    }>().not.toExtend<ListingFailed>();
  });
});
