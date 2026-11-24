# integration.source-scan-imports

- Status: active
- Since: unreleased
- Source: HAL-17787 (the scan checks imports the way the fenced runner's module hook does)

The source scan shall report each static `import`, `export … from` or side-effect import whose specifier is not a relative path that stays inside the scanned folder, `zod`, `@halonicjs/adapters/integration-kit` or a package the subject names as bundled, except a type-only import, and shall report every mention of `eval`, so indirect `eval` is caught too. The conformance suite shall always scan: with no `sources`, `describeIntegrationConformance` shall scan the code files in its test file's folder and below, other than tests and `node_modules`, and every file the test imports by a relative path, and shall fail when the test imports code outside its package, and `checkSources` shall fail and say to pass `sources`. For a plugin, the suite shall also scan every file in the plugin folder that the backend's `entry` imports, directly or through other files, written with or without a file ending.

## Examples

- Given a line `import { readFileSync } from "fs";`,
  when it is scanned,
  then the scan reports it with the import rule.
- Given `import { z } from "zod";`, `import { a } from "./a.ts";` or `import type { Integration } from "@halonicjs/ports";`,
  when it is scanned,
  then the scan reports nothing.
- Given `(0, eval)("1")`,
  when it is scanned,
  then the scan reports `eval or new Function`.
- Given a conformance test that passes no `sources`,
  when the suite runs,
  then the code beside the test file is scanned and a finding fails the test.
- Given a plugin whose `backend/index.js` imports `../lib/send.js`,
  when the suite runs,
  then `lib/send.js` is scanned too.
