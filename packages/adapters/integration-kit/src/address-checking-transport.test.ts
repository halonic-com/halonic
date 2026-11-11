import type { AddressCheckingHttpClient } from "@halonicjs/adapter-http-kit";
import type { HttpClient } from "@halonicjs/ports";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { LoadIntegrationOptions, PrepareIntegrationOptions } from "./loader.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

/** A plain `fetch` wrapper: it sends wherever a name resolves, this computer included. */
const rawFetch: HttpClient = { fetch: (url, init) => fetch(url, init) };

verifies("integration-kit.address-checking-transport", () => {
  typeTest("the loader takes only a transport that checks addresses", () => {
    expectTypeOf<LoadIntegrationOptions["transport"]>().toEqualTypeOf<AddressCheckingHttpClient>();
    expectTypeOf<
      PrepareIntegrationOptions["transport"]
    >().toEqualTypeOf<AddressCheckingHttpClient>();
  });

  typeTest("a plain fetch wrapper doesn't compile as the loader's transport", () => {
    // @ts-expect-error: a fetch wrapper doesn't check the addresses a name resolves to
    const loading: LoadIntegrationOptions["transport"] = rawFetch;
    // @ts-expect-error: nor does a bare object with a fetch
    const preparing: PrepareIntegrationOptions["transport"] = { fetch };
    expectTypeOf([loading, preparing]).toBeArray();
  });
});
