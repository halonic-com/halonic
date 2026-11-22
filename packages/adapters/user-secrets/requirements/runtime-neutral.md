# user-secrets.runtime-neutral

- Status: active
- Since: unreleased
- Source: HAL-16242

The user secrets package shall use only Web Crypto and other Web-standard APIs outside its tests, so it runs in Node, a browser and workerd alike.

## Examples

- Given the package's source files other than tests,
  then none imports from `node:`, uses `Buffer` or reads `process`.
