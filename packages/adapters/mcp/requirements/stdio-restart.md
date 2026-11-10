# mcp.stdio-restart

- Status: active
- Since: 0.1.0
- Source: HAL-4564 (Tomas's decision, 10 Nov 2026, from HAL-2544 and Liam's review of halonic#1066 on HAL-3620)

When a stdio connector's program stops after it started, for any reason other than the connector being closed, the call waiting on it shall fail with an error that names the tool and says it wasn't tried again, and it shall not be sent again, because the tool may already have had an effect. The next call shall start the program again, once for calls that arrive together, through the same checks as the first start: the trust grant, `checkPackageRunnerLaunch`, the registry lookup and the runner lookup for a pin, and a new launch folder, after the stopped program's folder is deleted. A connector shall start its program again at most 3 times within any 10 minutes; a start that fails before the program runs doesn't count. Past that it shall report itself stopped, refuse every later call without starting anything, and stay stopped until it is created again. The report's message shall be ours, with the last lines the program wrote to its standard error kept apart, at most 10 lines of at most 300 characters, with every secret the connector gave it, any line holding text shaped like a key, e-mail addresses, the person's home folder and their user name removed.

## Examples

- Given a pinned connector whose program ends while `tools/call` for `read_note` waits,
  when the call fails,
  then its error names `read_note` and says it wasn't tried again, and the program received the call once.
- Given the same connector,
  when the next call arrives,
  then the registry is asked again, a new program starts in a new folder, the old folder is gone and the call is answered.
- Given a program that ends at every start, writing a secret it was given and an e-mail address to its standard error,
  when it has been started 4 times within 10 minutes and the next call arrives,
  then that call fails as stopped, nothing more starts, and the error output holds `[secret removed]` and `[e-mail removed]` instead.
