import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { isSourceFile, isTestFile, namesToolConfig } from "../lib/source-files.ts";
import { inPackagePath, owningPackage, type WorkspacePackage } from "../lib/workspace.ts";

const guide = "See docs/guides/checks.md (webview-apis).";

/** The workspace package that builds Studio's page. */
export const studioApp = "@halonicjs/app-studio";

/**
 * Web APIs that Studio's oldest webviews (WebKitGTK 2.44, which is Safari
 * 17.5, and Chromium 123; see packages/studio/kit/README.md) don't have, with
 * the versions that brought them and what to write instead. Each name must
 * belong to a class in `watchedBuiltIns` of `source-files.ts`.
 */
const tooNew: Readonly<Record<string, { since: string; instead: string }>> = {
  "URL.parse": {
    since: "Safari 18 and Chromium 126",
    instead: "new URL(…) in a try, or URL.canParse(…) first",
  },
};

/**
 * Code that Studio's page loads may not use a web API its oldest webviews
 * lack, such as `URL.parse`. That code is the Studio app and every workspace
 * package it depends on, directly or through others (`dependencies`,
 * `peerDependencies` and `optionalDependencies`; dev dependencies don't ship).
 * Tests and tool config files are exempt: they run in Node.
 */
export function checkWebviewApis(context: CheckContext): Report {
  const report = new Report("webview-apis");
  const loaded = packagesStudioLoads(context);
  for (const file of context.files) {
    if (!isSourceFile(file) || isTestFile(file)) {
      continue;
    }
    const pkg = owningPackage(file, context.packages);
    if (pkg === undefined || !loaded.has(pkg) || namesToolConfig(inPackagePath(file, pkg))) {
      continue;
    }
    for (const member of context.sourceFacts(file).builtInMembers) {
      const api = tooNew[member.name];
      if (api !== undefined) {
        report.error(
          file,
          `uses ${member.name}, which Studio's oldest webviews don't have (it came with ${api.since}), and ${pkg.manifest.name ?? pkg.directory} runs in Studio's page. Write ${api.instead}. ${guide}`,
          member.line,
        );
      }
    }
  }
  return report;
}

/** The Studio app and the workspace packages it depends on, directly or not. */
function packagesStudioLoads(context: CheckContext): Set<WorkspacePackage> {
  const loaded = new Set<WorkspacePackage>();
  const waiting = [studioApp];
  for (let name = waiting.pop(); name !== undefined; name = waiting.pop()) {
    const pkg = context.packagesByName.get(name);
    if (pkg === undefined || loaded.has(pkg)) {
      continue;
    }
    loaded.add(pkg);
    const { dependencies, peerDependencies, optionalDependencies } = pkg.manifest;
    for (const field of [dependencies, peerDependencies, optionalDependencies]) {
      waiting.push(...Object.keys(field ?? {}));
    }
  }
  return loaded;
}
