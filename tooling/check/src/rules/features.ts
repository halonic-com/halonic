import type { CheckContext } from "../lib/context.ts";
import { featureNamePrefix, featuresDirectory, studioAppDirectory } from "../lib/layout.ts";
import { Report } from "../lib/problems.ts";

/**
 * The feature packages and the feature dependencies the Studio app lists.
 * Shared with tooling/discover, which writes the list.
 */
export function readFeatureList(context: CheckContext): { folders: string[]; listed: string[] } {
  const folders = context.packages
    .filter((pkg) => pkg.directory.startsWith(`${featuresDirectory}/`))
    .map((pkg) => `${featureNamePrefix}${pkg.directory.slice(featuresDirectory.length + 1)}`)
    .sort();
  const app = context.packages.find((pkg) => pkg.directory === studioAppDirectory);
  const listed = Object.keys(app?.manifest.dependencies ?? {})
    .filter((name) => name.startsWith(featureNamePrefix))
    .sort();
  return { folders, listed };
}

/**
 * The Studio app's `package.json` must list exactly the feature folders, so
 * pnpm, Turbo and the editor all see the same graph.
 */
export function checkFeatures(context: CheckContext): Report {
  const report = new Report("features");
  const { folders, listed } = readFeatureList(context);
  const manifest = `${studioAppDirectory}/package.json`;
  const app = context.packages.find((pkg) => pkg.directory === studioAppDirectory);
  if (app === undefined) {
    if (folders.length > 0) {
      report.error(manifest, "Features exist but the Studio app package is missing.");
    }
    return report;
  }
  for (const name of folders.filter((folder) => !listed.includes(folder))) {
    report.error(
      manifest,
      `Feature ${name} is missing from the Studio's dependencies. Run "pnpm discover --fix && pnpm install".`,
    );
  }
  for (const name of listed.filter((entry) => !folders.includes(entry))) {
    report.error(
      manifest,
      `${name} is listed but has no folder in ${featuresDirectory}. Run "pnpm discover --fix && pnpm install".`,
    );
  }
  for (const name of listed) {
    if (app.manifest.dependencies?.[name] !== "workspace:*") {
      report.error(manifest, `${name} must be "workspace:*". Run "pnpm discover --fix".`);
    }
  }
  return report;
}
