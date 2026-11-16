# settings.not-carried-toast

- Status: active
- Since: 0.1.0
- Source: HAL-1845 (F5); microcopy 22 F5; failure-states (HAL-1712)

At the first start after an update that could not carry over some settings, the Studio shall show one info toast, however many settings there are: "Some settings couldn't be carried over from Halonic *0.1.0*, so they're back to their defaults. Halonic kept a copy of the old ones." It shall stay until it is closed, offer **Copy details** with the list of those settings, and show once. An update that carried everything over shall show no such toast.

## Examples

- Given an update from 0.1.0 to 0.1.1 left two settings behind,
  when the window opens,
  then one toast says so and stays until closed.
- Given an update carried every setting over,
  when the window opens,
  then no such toast shows.
