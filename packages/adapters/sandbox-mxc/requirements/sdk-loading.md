# sandbox-mxc.sdk-loading

- Status: active
- Since: 0.1.0
- Source: HAL-7607, HAL-7603 (decision: an optional SDK, loaded only on Windows), ADR 2026-11-10-mxc-sandbox-backend

The sandbox-mxc adapter shall load MXC's SDK (`@microsoft/mxc-sdk/v1`) only on Windows, only when it is first asked whether MXC is offered or can start, and at most once per process. It shall never load the SDK at module top level. When it isn't Windows, or the SDK can't be imported, or the module lacks the calls the adapter reads, MXC shall not start: the check's reason shall be `other` on Windows 11 (`windows` on other systems, which never reach the SDK), and no session shall open. The adapter shall read only the SDK's platform support and available backends: it shall never pass `telemetry` to the SDK and never call `requestTelemetryConsent`.

## Examples

- Given Linux,
  when the SDK loader is asked for the SDK,
  then it refuses without importing anything, and MXC can't start.
- Given Windows 11 where the SDK isn't installed,
  when MXC is checked,
  then the reason is `other`, the sentence says the SDK can't be loaded, and no session opens.
- Given Windows 11 where the SDK is installed,
  when MXC is asked whether it is offered and then checked,
  then the SDK is imported once, and its telemetry consent is never asked.
- Given a module that lacks `getPlatformSupport`,
  when it is loaded,
  then MXC can't start, with the reason `other`.
