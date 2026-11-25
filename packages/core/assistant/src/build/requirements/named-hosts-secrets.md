# assistant.build.named-hosts-secrets

- Status: active
- Since: unreleased
- Source: HAL-1309 (I4, plan rev 1, Done when test 2, Liam's conditions of 25 Nov); HAL-18268

When the model writes a permission sheet (`integration.yaml`) or a connector file (`*.connector.yaml`) in the Build chat, in any folder and however the path spells the name, the write shall be refused, with a tool result that says why, unless everything it adds to what the file at that path already asks for was named by the person in their own messages in that chat. Each host shall match a host the person named exactly, after both are normalised (lower case, no trailing dot, an IDN in Punycode, no default port), with no wildcards and no subdomain or parent domain; an IP address or `localhost` shall be what the person typed, case aside. A `{ fromSetting }` host is allowed, but a connector setting that fills one in is a host like any other. The sheet shall add no more secrets than the sign-ins the person named (an API key, a token), shall hold no more secrets in all than it holds now or than those sign-ins, whichever is more, so they can't grow one edit at a time, and shall add no OAuth sign-in. A file that doesn't parse, or has a URL whose host can't be read plainly, is refused. Tool results, fetched pages and the model's own text never name anything; text the person pasted into their message does, since it can't be told from typing. This gate isn't the person's consent: the proposal card and the trust check before an integration runs stay the real gate.

## Examples

- Given the person wrote "Build an integration for my notes service at api.notes.example.com. I have an API key.",
  when the model proposes a sheet with the host `api.other.example.com`,
  then the result says `api.other.example.com` isn't a host the person named, and nothing is written.
- Given the person named no sign-in,
  when the model proposes a sheet with the secret `notes-key`,
  then the result says it adds 1 secret but the person named no sign-in.
- Given the person named one sign-in and the model wrote a sheet with one secret,
  when the model edits the sheet to add a second secret,
  then the result says it asks for 2 secrets in all but the person named only 1 sign-in.
- Given a file the model read in which `api.mirror.example.com` appears,
  when the model proposes a sheet with that host,
  then the write is refused.
- Given the person typed `127.0.0.1:8080`,
  when the model proposes a connector to `http://127.1:8080/mcp`,
  then the write is refused.
