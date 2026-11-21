# first-run.pick-model

- Status: active
- Since: unreleased
- Source: HAL-13432; first-run-flow revision 7, sections 3.3, 6 and 8e, approved by the board on HAL-7993; HAL-14799 (keys where there is no model service)

The Pick a model screen shall offer three options in this order: a key from a provider, a model on this computer, and Sample answers. The key option shall be ticked first, unless Ollama on this computer has a downloaded model and no key is saved for any provider, then the local option; where there is no model service, such as the browser demo, the key and local options shall be off, with "Keys need the desktop app." and "Local models need the desktop app.", and Sample answers ticked. Once the person has changed an option, a late answer about the saved keys or the downloaded models shall no longer move the tick. Among several downloaded models the local option shall start on `llama3.2` in any size or tag, otherwise on the first one Ollama lists. The one button shall read **Continue** for Sample answers and for a provider whose saved key is kept, **Check again** for the local option while Ollama has no model or wasn't found, and **Test and continue** otherwise; while it waits it shall read "Testing…" for a key, and "Loading the model…" for a local model, which adds "Still loading. Bigger models take longer the first time." after 30 seconds. The screen shall continue only after a passed test, and only with the trust it showed: when the passed test's trust line differs from the one shown, the screen shall show the new line and wait for Continue. The screen shall show only the answer to the newest test, line or check it asked for, so an older test's late answer, passed or failed, shall never replace what it shows. A key refused, no network or a provider error shall be red; no credit and a local model too small shall be amber, and the person doesn't continue.

## Examples

- Given a key saved for no provider and Ollama with `llama3.2:latest` downloaded,
  when the screen opens,
  then the local option is ticked, on `llama3.2:latest`, and the button reads Test and continue.
- Given a key saved for OpenAI,
  when the screen opens,
  then the key option is ticked with OpenAI, and the button reads Continue.
- Given no model service,
  when the screen opens,
  then only Sample answers can be ticked, and the button reads Continue.
- Given the local option ticked and Ollama with no model,
  then the button reads Check again, and pressing it asks Ollama again.
- Given a local test that hasn't answered for 30 seconds,
  then the screen adds "Still loading. Bigger models take longer the first time."
- Given a test for Anthropic that is still running,
  when the person switches to OpenAI and tests again, and the Anthropic test then fails,
  then the screen still shows the OpenAI test.
- Given a passed test whose trust line turns Local only off when the line shown didn't,
  then the screen shows the new line and saves nothing until Continue is pressed.
- Given a test that found no credit,
  then the message is amber and the screen stays.
