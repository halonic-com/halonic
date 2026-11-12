# check.live-sweep

- Status: active
- Since: 0.1.0
- Source: HAL-6701

If a resource on the live test account is named `hlt-<run>-<attempt>-<what>` and is older than 2 hours, then the sweeper shall delete it through its target's own `destroy`; it shall never touch a resource with any other name. With `--fail-on-delete` (the nightly run), it shall fail when it deleted anything, and it shall always fail when a delete failed (ADR 5.9).

## Examples

- Given `hlt-123-1-worker` created 3 hours ago, then the sweeper deletes it.
- Given `hlt-123-1-worker` created 1 hour ago, or `acme-halonic` created a year ago, then the sweeper leaves it.
- Given one deleted resource and `--fail-on-delete`, then the sweep fails and says a live job or `destroy` leaks.
- Given no target with a sweeper, then the sweep passes and says there is nothing to sweep.
