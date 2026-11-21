# studio.first-run-saved-key

- Status: active
- Since: unreleased
- Source: HAL-13432; first-run-flow revision 7, section 3.3 ("A key is saved for Anthropic · Replace", the button reads Continue, nothing is used untested), approved by the board on HAL-7993

The Studio app shall tell the first run's model screen whether a key is saved on this computer for each provider, without reading it. When Test and continue names no pasted key for a provider, Studio shall test with the key saved for it, read as a run reads it and given to the test call only under that provider's secret name, and Continue shall leave the saved key as it is. With no key pasted and none saved, Studio shall call nothing. A pasted key shall be tested in place of a saved one.

## Examples

- Given a key saved for Anthropic,
  then the screen hears that Anthropic has a saved key and OpenAI doesn't.
- Given a key saved for Anthropic and nothing pasted,
  then the test call gets the saved key, and Continue points the alias at Anthropic and saves no key.
- Given nothing pasted and no key saved,
  then the test says there is no key, and nothing is called.
