# studio.first-run-choice-trust

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 and 10.2 R4, approved by the board on HAL-7993; the security rules are Liam's plan on HAL-13431

When Continue saves a tested choice, Studio shall trust the folder only for the trust content the trust line was worked out from: the line's facts shall come from the difference between the folder's trust content before and after the change, worked out without writing, and the fingerprint shown with it shall be the after content's. Continue shall write the files, read them again and trust the folder only when they lead to the shown fingerprint, through the usual grant. Studio shall show no fingerprint, and so trust nothing, unless the folder before the change was trusted at its current content or reached only the test model, and the change adds exactly the one provider. Without a trust, the next Run shall ask as usual. Before a test, Studio shall give the line's facts for a choice, with nothing written and no fingerprint, so the line shows under the button before it is pressed.

## Examples

- Given Acme, which reaches only the test model, and a passed key test for Anthropic,
  then the line's facts are 1 secret to Anthropic and Local only off, and after Continue the folder is trusted at the fingerprint of the files as written.
- Given Acme and a passed local test of `llama3.2`,
  then the line's facts are Ollama at `localhost:11434` and no secret.
- Given a folder that has another provider and isn't trusted,
  then no fingerprint is shown, and Continue saves the files but trusts nothing.
- Given a connector added between the preview and Continue,
  then Continue saves the files but trusts nothing.
