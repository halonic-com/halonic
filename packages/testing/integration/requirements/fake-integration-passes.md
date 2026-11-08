# integration.fake-integration-passes

- Status: active
- Since: 0.1.0
- Source: HAL-135 ("a fake integration in the suite passes the conformance suite")

When a well-behaved integration runs the conformance suite, every check shall pass, so a failure always points at the integration and not at the suite.

## Examples

- Given the fake `weather` integration, its sheet, its recordings and its source,
  when `describeIntegrationConformance` runs,
  then every test passes.
