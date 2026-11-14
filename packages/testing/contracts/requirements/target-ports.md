# contracts.target-ports

- Status: active
- Since: 0.1.0
- Source: HAL-6803; multi-cloud ADR 5.9, group "Port contracts"

Where a deployment target wires its adapters, it shall pass the contract suite of every port it hands out, built the way the target builds them, and a target shall not be able to leave a port out of the suite: the suite takes one maker for each of the clock, blobs, records, secrets, tokens, definitions, coordination, scheduler and password hasher.

## Examples

- Given a target that has a maker for each port, then every port's contract suite runs against the adapter the target wired.
- Given a target without a maker for the scheduler, then it doesn't type-check.
