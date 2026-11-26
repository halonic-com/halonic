# publish.node-runtime

- Status: active
- Since: unreleased
- Source: HAL-20054 (fail the release when the bundled Node misses a security release)

The release check shall fail when Node has published a security release in the major line of the Node runtime the agent host bundles (`node@runtime` in pnpm-lock.yaml) that is newer than that runtime, and shall pass when the bundled runtime has every security release of its line. Newer releases without security fixes and newer major lines don't fail it. When Node's release list can't be read, it warns and passes.

## Examples

- Given the bundled runtime 26.13.0 and the security release 26.13.1,
  when the release check runs,
  then it fails and names 26.13.1.
- Given the bundled runtime 26.13.1, the newest security release of the 26 line,
  when the release check runs,
  then it passes.
- Given the bundled runtime 26.13.1 and only a non-security 26.14.0 and a security 27.0.1 newer than it,
  when the release check runs,
  then it passes.
