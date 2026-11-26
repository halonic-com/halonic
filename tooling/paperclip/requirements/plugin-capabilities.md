# paperclip.plugin-capabilities

- Status: active
- Since: unreleased
- Source: HAL-19468; `seats` 0.1.0 called `companies.list` without `companies.read`, so the host refused every job

When a Paperclip plugin's worker calls a host method that needs a capability, the plugin's manifest shall list that capability, so the host never refuses the call for a missing one.

## Examples

- Given the `seats` worker, whose jobs list the companies to find the seats' settings,
  when its manifest is checked,
  then it lists `companies.read`.
- Given a plugin's worker as its build bundles it,
  when each host call in this package's source files that end up in the bundle is looked up in the SDK's method-to-capability map,
  then the plugin's manifest lists every capability found, apart from a call named with the task that decides it.
