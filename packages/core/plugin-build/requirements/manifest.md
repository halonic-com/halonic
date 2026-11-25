# plugin-build.manifest

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985 and Ravi's runtime contract on HAL-17950; object and list parameters: HAL-18238

The plugin builder shall write `manifest.js` as one ES module whose default export is the manifest as canonical JSON, holding the plugin id, Paperclip's plugin API version 1, the plugin's version, the workspace's name as its display name and author, the capabilities it is given (sorted, each once), `worker.js` as the worker entry, one tool declaration per snapshot tool (its name, description and a JSON Schema of its parameters with the required ones listed and no others allowed, an object parameter as the same kind of object of its fields and a list parameter as an `array` of its items with its `maxItems`), and the settings it is given as `instanceConfigSchema` properties. It shall write `package.json` with the plugin id as its name, the version, `private`, `type: module` and the paths of `manifest.js` and `worker.js`. Both shall be written from checked data only, so the same inputs give the same bytes and no workspace text is written as code.

## Examples

- Given a tool with a required `pr` parameter and an optional `repo` one, when the manifest is written, then its parameters schema lists both, requires only `pr` and allows no others.
- Given a `monitor` parameter of `type: object` with a required `ref` field and a `blockedBy` parameter of `type: list` of strings, when the manifest is written, then `monitor` is an object schema that requires `ref` and allows no other fields, and `blockedBy` an `array` of strings.
- Given a workspace named `Acme "</script>`, when the manifest is written, then the name is inside a JSON string and the module still exports the same manifest.
- Given the capabilities `metrics.write`, `agents.read` and `metrics.write`, when the manifest is written, then it lists `agents.read` and `metrics.write` once each.
