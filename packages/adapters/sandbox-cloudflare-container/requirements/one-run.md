# sandbox-cloudflare-container.one-run

- Status: active
- Since: unreleased
- Source: HAL-17232; plan approval on HAL-13211 (Liam, point 4)

The run's container object shall answer only to the run id it is named after, and shall refuse to start a second time, even for the same run id, rather than reattach to the container or to what its first start left.

## Examples

- Given the container object named `run-a`,
  when a start, a program start or an end names `run-b`,
  then it is refused and the container is not touched.
- Given the container object of `run-a` that has started once,
  when `run-a` starts it again, before or after its end,
  then the second start is refused and the container is started only once.
