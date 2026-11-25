# cli.commands.validate.routing-refused

- Status: active
- Since: unreleased
- Source: HAL-18263 (plan HAL-17450 rev 5, "Safety"): the routing file is a trust root and names agents only, by their url key

When `halonic validate` checks a workspace whose `routing.yaml` `workspace.routing-file` refuses, because it names another role, names an agent by an email or anything but its url key, or names an area like an account or credential field, it shall list an error on `routing.yaml` and exit 1. A `routing.yaml` that passes shall add no problem.

## Examples

- Given `routing.yaml` with the code reviewer `liam@example.com`, the role `approver` or the area `github-login`,
  when `halonic validate` is run,
  then it lists an error on `routing.yaml` and exits 1.
- Given `routing.yaml` with the code reviewer `liam` and `priya` for `engine-and-cli`,
  when `halonic validate` is run,
  then it exits 0.
