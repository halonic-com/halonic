# inbox.request-run-end

- Status: active
- Since: unreleased
- Source: HAL-13723 (RS1 from HAL-13691, decided by the team under HAL-2282); first-run 7.2

While a phone's request sheet waits for the card of the request it sent (`inbox.request`), the wait shall end when the card arrives or when the run ends, whichever comes first. When the run fails before its card arrives, **Send** shall stop saying "Working…", the sheet's alert slot shall show the run page's own failure line for that run, read once, followed by **Open run** (where the window can open a run), and the sent message shall stay and be editable, so **Send** can try again. When the run finishes without a card, the sheet shall close as it does when a card arrives, with the message cleared, and focus shall go to **New request**.

## Examples

- Given a phone, Ollama not running and a sent request,
  when the run fails before any card arrives,
  then **Send** reads "Send", the alert slot reads the run page's line ("Halonic couldn't reach Ollama on your computer (localhost:11434) for … Start Ollama there, then run again.") with **Open run**, and the message is still there and can be changed.
- Given a phone and a sent request whose workflow asks nothing,
  when the run finishes,
  then the sheet closes, the next request starts empty and **New request** has focus.
