# studio.first-run-choice-order

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 and 10.2 R4, approved by the board on HAL-7993; the security rules are Liam's plan on HAL-13431

When Continue saves a tested choice, Studio shall save the key first, then the provider file, `models.yaml` and `workspace.yaml` as one undo step, then wait for them to be saved, then trust the folder. It shall say which step failed and whether the key was saved before it, and a failed step shall stop the ones after it. A local model's choice shall point the alias only at the model whose test passed.

## Examples

- Given the files fail to save after the key was saved,
  then Continue fails at `write`, says the key was saved, and trusts nothing.
- Given the key store fails,
  then Continue fails at `key`, and no file changes.
