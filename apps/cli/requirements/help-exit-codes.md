# cli.help-exit-codes

- Status: active
- Since: 0.1.0
- Source: HAL-1994, decided on HAL-1984; the wording follows the CLI output draft on HAL-1981 (section 1.9)

The help that `halonic --help` prints shall list every exit code with a few words for what it means, in code order: the CLI's own codes 0 to 3 on one line and the error kinds' codes 4 to 9 on the next. The CLI shall print an exit code nowhere else.

## Examples

- Given `halonic --help`,
  when it runs,
  then after the commands it prints "Exit codes: 0 worked · 1 failed or found errors · 2 wrong usage or input · 3 not trusted ·" and "4 not found · 5 conflict · 6 signed out · 7 not allowed · 8 limit reached · 9 unavailable".
