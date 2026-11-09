# cli.help-exit-codes

- Status: active
- Since: 0.1.0
- Source: HAL-1994, decided on HAL-1984; the wording and the 80-column lines follow the approved CLI output on HAL-1981 (section 1.9), from HAL-2196

The help that `halonic --help` prints shall list every exit code with a few words for what it means, in code order, ending with "130 or 143 stopped" for a command stopped by Ctrl C or SIGTERM, on as many lines as keep each within 80 columns. The CLI shall print an exit code nowhere else.

## Examples

- Given `halonic --help`,
  when it runs,
  then after the commands it prints "Exit codes: 0 worked · 1 failed or found errors · 2 wrong usage or input ·", "3 not trusted · 4 not found · 5 conflict · 6 signed out · 7 not allowed ·", "8 limit reached · 9 didn't answer or the sandbox can't start ·" and "130 or 143 stopped".
