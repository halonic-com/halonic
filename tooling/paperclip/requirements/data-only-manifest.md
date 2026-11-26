# paperclip.data-only-manifest

- Status: active
- Since: unreleased
- Source: HAL-19231, the security review of halonic-com/server#80 (the server's plugin deployer must read a plugin manifest without running code)

When a plugin build (`build:plugin` for Agent tools, `build:seats-plugin` for seats) writes the plugin's `manifest.js`, it shall write the manifest as one JSON literal exported as `manifest` and as the default export, with no other code, and the build shall fail when the manifest is not plain JSON data or holds a `__proto__` key at any depth.

## Examples

- Given the Agent tools manifest,
  when `build:plugin` runs,
  then `dist/manifest.js` holds `export const manifest = { … };` and `export default manifest;` and nothing else but a comment.
- Given a manifest object that holds a function,
  when the build writes the manifest,
  then the build fails with "not plain JSON data".
- Given a manifest with a `__proto__` key under `instanceConfigSchema.properties`,
  when the build writes the manifest,
  then the build fails and names where the key is.
