# Decision: an unsigned release build unsets an empty helper publisher

- Task: HAL-9057 (Release workflow failed on the HAL-9045 pull request)
- Approval: none needed, a fix to the pull request it stacks on; Liam reviews
- Kind: internal

## What changes

`build-installer.ps1` removes `HALONIC_SANDBOX_SIGNER` from its environment when it is empty.

## Why

The workflow sets that variable to an empty string for an unsigned run. Cargo's `option_env!` reads an empty string as a publisher with no name, so the helper checked its own copy against "" and refused it with exit 35. The dry run with `unsigned` on failed at "Install it, then check the helper inside". A real unsigned release would have shipped a helper that cannot set up the sandbox. With the variable unset the helper is built as dev builds are, with no check.
