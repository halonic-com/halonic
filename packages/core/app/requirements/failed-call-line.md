# app.failed-call-line

- Status: active
- Since: unreleased
- Source: HAL-15149, plan approved by Liam on HAL-15150: the words under a failed tool call move out of Studio, so Studio's step panel and `halonic runs show` say the same; a plugin whose sandbox can't start, C655 row 49 on HAL-15936; the lines for a `service-refused` cause (HAL-19185), HAL-19186; a refused call whose outcome is `unknown` named by its cause, Chief's decision on HAL-19373

The app shall give, for a tool call whose `tool.result` has the outcome `error` or `unknown`, which line of the failed-call words it gets and the names from the log that fill it: the line for the cause the engine logged (a time limit with its seconds, "1 second" for one, the engine stopping, each reason a call wasn't made, and a connector that didn't start, by the program, secret or plugin the cause names, or a sandbox its plugin runs in that can't start on this computer, else only that it didn't start); a service that refused a call whose outcome is `error`, by why: its token not accepted, its token not allowed, a request to slow down with how often Halonic tried again and "Nothing was sent twice." only when the cause has `sentOnce`, or a host the integration doesn't list, named by its main part; a service that refused a call whose outcome is `unknown`, because an earlier step may already have done its work, by the same why, saying so and to check before trying again, never with how often Halonic tried again or "Nothing was sent twice."; without a cause, the `unknown` outcome's line; else only "Didn't work.". The tool shall be named with its connector in brackets when the log names the connector, and a connector the log doesn't name shall read as the connector "of the tool" and its name. A tool, a program, a secret or a host shall be marked to look like code, and a connector or a plugin like a name. A connector that couldn't list its tools shall get its listing line the same way. The failed calls of a step shall be read from the run log alone, with every name escaped, in the order they were asked for, including a call a person approved whose connector then didn't start. Filling a line shall fail when it names a value that isn't given.

## Examples

- Given a call to `search_pages` from `notion` whose cause is a 60-second time limit,
  when its line is filled,
  then it reads "Didn't work: the tool search_pages (notion) didn't answer within 60 seconds, so it may or may not have done its work.", with `search_pages` as code and `notion` as a name.
- Given the same cause with 1 second,
  when its line is filled,
  then it says "within 1 second".
- Given a call to `create_note` whose connector didn't start for a plugin `acme-notes` that isn't trusted, without a connector in the log,
  when its line is filled,
  then it reads "Didn't work: the connector of the tool create_note didn't start: its plugin acme-notes isn't trusted yet.", with `acme-notes` as a name.
- Given a call from `orders` whose connector didn't start because the sandbox its plugin runs in can't start,
  when its line is filled,
  then it reads "Didn't work: the connector orders didn't start: the sandbox its plugin runs in can't start on this computer.", and its listing line reads "Couldn't list the tools from orders: the sandbox its plugin runs in can't start on this computer.".
- Given a call with the outcome `error` and no cause,
  when its line is filled,
  then it reads "Didn't work.".
- Given a call to `create_order` from `shop` that the service asked to slow down, after Halonic tried again twice, whose cause has `sentOnce`,
  when its line is filled,
  then it reads "Didn't work: the service asked Halonic to slow down when the tool create_order (shop) called it, and still did after Halonic tried again twice. Try again in a few minutes. Nothing was sent twice.".
- Given the same for a call to `list_orders`, whose cause has no `sentOnce` because it sent only `GET` requests,
  when its line is filled,
  then it reads "Didn't work: the service asked Halonic to slow down when the tool list_orders (shop) called it, and still did after Halonic tried again twice. Try again in a few minutes.".
- Given a call to `create_order` that Halonic stopped because its integration doesn't list the host `example.net`,
  when its line is filled,
  then it reads "Didn't work: the tool create_order tried to reach example.net, which its integration doesn't list. Halonic stopped it, so nothing reached example.net. Look at the integration's code.", with `example.net` as code.
- Given a call to `create_order` with the outcome `unknown` whose cause is a request to slow down, after an earlier `POST` got 201,
  when its line is filled,
  then it reads "Didn't work: the service asked Halonic to slow down when the tool create_order called it, after an earlier step may already have done its work. Check before you try again.".
- Given a call to `create_order` with the outcome `unknown` and no cause,
  when its line is filled,
  then it reads "Didn't work: the tool create_order broke off without an answer, so it may or may not have done its work.".
