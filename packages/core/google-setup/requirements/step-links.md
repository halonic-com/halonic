# google-setup.step-links

- Status: active
- Since: 0.1.0
- Source: HAL-707 (build plan B2; design 3.1 and 3.2)

The links in each step shall point to a page on `https://console.cloud.google.com`, with `?project=<id>` when a valid project ID is given (6 to 30 lower-case letters, digits and `-`, starting with a letter and not ending in `-`). Step 2 shall give every API its own Enable link and, for two APIs or more, one **Switch on all** link that lists every API joined by `,`. A project ID that isn't valid shall stay out of every link, and the result shall say it was ignored. An API that isn't a `<name>.googleapis.com` host shall make `setupSteps` throw a `RangeError`.

## Examples

- Given the project ID `halonic-x1`,
  then the audience link is `https://console.cloud.google.com/auth/audience?project=halonic-x1`
  and the switch-on-all link ends in `?apiid=<a>,<b>&project=halonic-x1`.
- Given the project ID `Halonic X`,
  then no link holds a project and `projectIdIgnored` is true.
- Given the API `example.com/x`, then it throws a `RangeError`.
