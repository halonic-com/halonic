# google-setup.service-changes

- Status: active
- Since: 0.1.0
- Source: HAL-707 (build plan B2; design 3.3 and 3.6)

The function `compareSetups` shall match the steps of two generated setups by id and mark each step of the new one `reopened` when it gained a row (an API, a scope, or a service's check after sign-in), when a value the user typed or chose changed, or when the step is new; `lost-only` when it only lost rows; and `unchanged` otherwise. A new project ID or a new step number alone shall change nothing. It shall name the services that were added and removed. `ticksToKeep` shall keep the ticks of steps that are still there and didn't reopen.

## Examples

- Given one service ticked and a second one added,
  then steps 2, 4 and 7 reopen with the new service's rows, and the ticks on steps 1, 3, 5 and 6 stay.
- Given a service unticked,
  then no step reopens and every tick stays.
- Given step 4 switched off and a service added that brings a new scope,
  then step 7 reopens.
