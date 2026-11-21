// A local integration's settings, such as the URL a `{ fromSetting }` host
// reads, come from the connector file that names its folder (HAL-14092).
// The trust check holds one set of settings for each folder, so connector
// files of the root or of any hub that name one folder must agree on them.

import type { WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";

const CODE = "integration-settings-differ";

/**
 * Each connector file that names a local integration's folder with
 * settings other than the first such file's, by path. Its integration then
 * gets no settings, so a `{ fromSetting }` host isn't set and its runner
 * doesn't start (`trustContentInputOf` in `core/app`).
 */
export function checkIntegrationSettings(context: CheckContext): WorkspaceIssue[] {
  const first = new Map<string, { path: string; settings: Readonly<Record<string, unknown>> }>();
  const issues: WorkspaceIssue[] = [];
  for (const file of context.filesOf("connector")) {
    const { transport } = file.value;
    if (!("integration" in transport)) continue;
    const { folder, settings = {} } = transport.integration;
    const earlier = first.get(folder);
    if (earlier === undefined) {
      first.set(folder, { path: file.path, settings });
    } else if (!sameSettings(earlier.settings, settings)) {
      const message = `This connector gives the integration in integrations/${folder} other settings than ${earlier.path} does. An integration has one set of settings: make them the same in both files.`;
      issues.push(
        context.error(file.path, ["transport", "integration", "settings"], CODE, message),
      );
    }
  }
  return issues;
}

/**
 * Whether two connector files give an integration the same settings, in
 * any key order.
 *
 * @example
 * sameSettings({ url: "http://a.test", port: 1 }, { port: 1, url: "http://a.test" }); // true
 * sameSettings({ url: "http://a.test" }, {}); // false
 */
export function sameSettings(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && Object.is(a[key], b[key]))
  );
}
