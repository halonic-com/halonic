# schema-kit.plain-words

- Status: active
- Since: unreleased
- Source: HAL-14277, from Nina's check C337 (HAL-14257, rows 17–20 and 24–26, code row C19): "Too small: expected array to have >=1 items" and "expected number, received string" don't say what to write

When `parse` finds one of these issues and the schema has no message of its own, the issue's message shall name the field (the path from its last key on) and say how to fix it:

- a number written as text: `<field> is a number: write <value> without quotes.`, and `<field> needs a number, not <kind>.` for any other value;
- `true` or `false` written as text: `<field> is true or false: write <value> without quotes.`;
- a list written as one value: `<field> is a list: write [<value>].`, and written as a map: `<field> is a list: start each item with "- <first key>:".`;
- a number or `true` where text goes: `<field> is text: write "<value>" in quotes.`;
- an empty list: `<field> needs at least one item.`; empty text: `<field> is empty: write a value.`;
- a number below its least: `<field> is too small: use <least> or more.`, or `<field> must be more than <least>.` when the least itself isn't allowed, and the same for too big;
- an address without a scheme: `<field> needs https://, such as https://<value>.`

A value is repeated only when it's one line of at most 40 characters; a longer one gets a general example. Any other issue, an issue at the top of the input and an issue whose schema has its own message keep their message. The code and the path stay Zod's.

## Examples

- Given `params.temperature: "0.2"` where a number goes,
  when it is parsed,
  then the message is `temperature is a number: write 0.2 without quotes.`.
- Given `gets: input.mail` where a list goes,
  when it is parsed,
  then the message is `gets is a list: write [input.mail].`.
- Given `on: { to: review }` where a list of transitions goes,
  when it is parsed,
  then the message is `on is a list: start each item with "- to:".`.
- Given `url: tracker.example.com/mcp` where Zod's URL check applies,
  when it is parsed,
  then the message is `url needs https://, such as https://tracker.example.com/mcp.`.
- Given a field whose schema says `own message`,
  when it fails,
  then the message is `own message`.
