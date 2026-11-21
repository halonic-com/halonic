# halonic-owner-check

The phone's owner check before it answers an approval (HAL-15194, board decision 4b, D7 section 2 on HAL-15159). Plain Rust with no Tauri types and no dependencies; the shell's `owner_check` module puts Android's own `BiometricPrompt` behind it.

- `OwnerCheck`: the port. `availability` says whether the phone can ask; `confirm` shows one prompt for one `Decision` and waits.
  - **Android** (the shell's `owner_check` module and `OwnerCheckPlugin.kt`): the platform `BiometricPrompt` with `BIOMETRIC_STRONG` only and confirmation required, Android 11 and later. No PIN fallback and no weak (Class 2) biometrics, such as a face unlock from the front camera. Nothing from outside: no Tauri biometric plugin, no `androidx.biometric`.
  - **iOS** (later): `LAContext` with biometrics only.
- `Availability` and `Confirmation`: what the platform answered. Text the crate doesn't know reads as unavailable, so a surprise never passes.
- `PromptWords`: the prompt's title, description and cancel button, fixed per decision. No page or host text goes into the prompt.
- `FakeOwnerCheck`: for tests. It passes only when a test queued a pass.

Nothing is remembered between checks: each answer gets its own prompt. The host can't verify any of this (`remote-gateway-protocol.ts` never treats an unlock as proof), so the shell is where board decision 4b is enforced on the phone.

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with `owner_check_`.
