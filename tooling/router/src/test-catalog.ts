import { readFileSync } from "node:fs";
import type { CatalogTexts } from "./catalog.ts";

/** The catalog's real files in `tooling/router/`, as the router reads them. */
export function repoCatalogTexts(): CatalogTexts {
  return {
    models: readFileSync(new URL("../providers.yaml", import.meta.url), "utf8"),
    router: readFileSync(new URL("../providers.router.yaml", import.meta.url), "utf8"),
  };
}

/** A small catalog for the tests: one Anthropic alias and one pinned open model. */
export const acmeModels = `
aliases:
  smart:
    provider: anthropic
    model: claude-opus-5-5
    price: { input: 4, output: 20 }
  cheap:
    provider: openrouter
    model: acme/open-flash
    price: { input: 0.1, output: 0.3 }
`;

/** The router's fields for {@link acmeModels}. */
export const acmeRouter = `
aliases:
  smart: { dataClass: anthropic, status: approved }
  cheap: { dataClass: open-pinned, status: approved, pinnedHost: acme-host/fp8 }
`;
