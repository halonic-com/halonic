import { createHash } from "node:crypto";

/**
 * The Postgres schema Paperclip gives a plugin's tables. Paperclip runs
 * migration files unchanged and wants every object named in full, so the
 * migrations spell this name out; it is derived here the way Paperclip
 * derives it (plugin-database service, 2026.1117.0), so a test can check
 * that the two agree. At run time the worker uses `ctx.db.namespace`.
 */
export function pluginNamespace(pluginId: string, namespaceSlug: string): string {
  const hash = createHash("sha256").update(pluginId).digest("hex").slice(0, 10);
  const slug =
    namespaceSlug
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_")
      .slice(0, 36) || "plugin";
  return `plugin_${slug}_${hash}`.slice(0, 63);
}
