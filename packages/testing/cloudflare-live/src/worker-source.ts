import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The Worker the live fixture deploys: its entry file and the compatibility date its wrangler.toml pins. */
export interface WorkerSource {
  entry: string;
  compatibilityDate: string;
}

/**
 * Finds the Cloudflare runtime's entry file and reads its compatibility date. It resolves through Node,
 * not `import.meta.resolve`: Vitest's module runner, which loads the global setup, doesn't support that.
 */
export function workerSource(): WorkerSource {
  const runtime = pathToFileURL(
    createRequire(import.meta.url).resolve("@halonicjs/target-cloudflare-runtime"),
  );
  const wrangler = readFileSync(new URL("../wrangler.toml", runtime), "utf8");
  const compatibilityDate = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(wrangler)?.[1];
  if (compatibilityDate === undefined) throw new Error("wrangler.toml has no compatibility_date.");
  return { entry: fileURLToPath(runtime), compatibilityDate };
}
