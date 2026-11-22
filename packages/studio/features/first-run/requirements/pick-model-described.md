# first-run.pick-model-described

- Status: active
- Since: unreleased
- Source: HAL-15433; flow check C575 on HAL-15423, findings 5 and 6; wording decided by the team on HAL-15433

When the trust line shows, the Pick a model screen's one button shall be described by it, so a screen reader hears what the button allows before it is pressed. When the message in the key option says the pasted key isn't a key or wasn't accepted, the key field shall be described by that message and marked invalid. When the local option is ticked and no Ollama was found, it shall say "Don't have Ollama?" with a link "Get it from ollama.com" that opens Ollama's download page in the browser. The key option's link shall be followed by "You need an account there." as its own sentence.

## Examples

- Given a key saved for Anthropic,
  then the button Continue is described by "Will pass 1 secret to Anthropic. Turns off Local only."
- Given Sample answers ticked,
  then the button has no description.
- Given Anthropic refused the pasted key,
  then the key field is described by "Anthropic didn't accept this key. Check that you copied all of it." and is marked invalid.
- Given the local option ticked and no Ollama found,
  then it says "Start Ollama, then check again." and "Don't have Ollama? Get it from ollama.com ↗", and the link goes to https://ollama.com/download.
- Given the key option ticked with Anthropic,
  then it says "Don't have a key? Get one from Anthropic ↗. You need an account there."
