# integration-kit.integration-entry

- Status: active
- Since: 0.1.0
- Source: HAL-1216 (integrations carry only our code and Zod into the cloud; the kit is split so the published part has no host side)

The kit shall offer integration code a separate entry, `@halonicjs/adapter-integration-kit/integration`, published as `@halonicjs/integration-kit`. It shall hold only what integration code imports: the port types, `maxIntegrationWaitMs`, `ToolImplementation` and `runTool`, and the error classes `IntegrationRefusedError` and `IntegrationTimeoutError`. It shall import no outside code and nothing of the host side; besides its own files, it imports only `@halonicjs/ports` and the one-file entry `@halonicjs/std/error-kind`. The host side shall take the error classes from this entry, so there is one copy of each.

## Examples

- Given the integration entry's source files,
  when their imports are listed,
  then each is one of its own files, `@halonicjs/ports` or `@halonicjs/std/error-kind`.
- Given the integration entry,
  when its runtime exports are listed,
  then they are the two error classes, `maxIntegrationWaitMs` and `runTool`.
- Given a request the host side refuses,
  when an integration checks the error with `instanceof IntegrationRefusedError` from the integration entry,
  then the check holds.
