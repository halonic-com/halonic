# Decision: at a compatible provider, the bridge sends only what it checked

- Approval: Paperclip task HAL-13479 (Julian's security review of #3957 on HAL-13475); Liam signs this note in review
- Kind: internal

`harness-bridge.compatible-request` (new in #3957, not yet released) changes in three ways, all of which make it stricter:

- Messages' `fallbacks` is no longer a field the bridge sends to a compatible provider. Its model names never went through the host, and they could name a model that searches the web on the provider's side.
- A Messages client tool's type has to be `bash_`, `text_editor_`, `computer_` or `memory_` followed by an eight-digit date. Before, any type with those prefixes passed, such as a made-up `bash_web`.
- The provider gets the request written out again from what the bridge read, never the program's own bytes. JSON that repeats a key, such as `{"model":"a:online","model":"a"}`, could otherwise mean one thing to the bridge's check (the last value) and another to a provider that reads the first.

The requirement also says that an error cuts a field or tool name to 64 characters, which the code already did. Nothing the requirement refused before is allowed now; a call it allowed before may now be refused, or reach the provider with a repeated key reduced to one.

## Covers

- harness-bridge.compatible-request
