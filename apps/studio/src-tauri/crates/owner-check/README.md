# halonic-owner-check

The phone's owner check before it answers an approval (HAL-15194, board decision 4b, D7 section 2 on HAL-15159). Plain Rust with no Tauri types and no dependencies; the shell's `owner_check` module puts Android's own `BiometricPrompt` behind it.

- `OwnerCheck`: the port. `availability` says whether the phone can ask for one `Decision` (an Inbox answer takes the phone's PIN too, an approval only a strong biometric); `confirm` shows one prompt for one `Decision` and waits; `times_away` counts how often the app left the screen.
  - **Android** (the shell's `owner_check` module and `OwnerCheckPlugin.kt`): the platform `BiometricPrompt` with `BIOMETRIC_STRONG` and confirmation required, Android 11 and later. An approval takes no PIN; an inbox answer (`Decision::Answer`) takes the phone's PIN, pattern or password too (`DEVICE_CREDENTIAL`, board option P3 on HAL-17509). Never weak (Class 2) biometrics, such as a face unlock from the front camera. Nothing from outside: no Tauri biometric plugin, no `androidx.biometric`.
  - **iOS** (later): `LAContext` with biometrics only.
- `Availability` and `Confirmation`: what the platform answered. Text the crate doesn't know reads as unavailable, so a surprise never passes.
- `PromptWords`: the prompt's title, description and cancel button, fixed per decision. No page or host text goes into the prompt.
- `FakeOwnerCheck`: for tests. It passes only when a test queued a pass.

The port remembers nothing between checks. `halonic-phone-tunnel` lets one pass for an inbox answer cover the next ones for 5 minutes while the app stays on the screen (requirement `phone-answer-confirm` there); an answer to an approval always gets its own prompt. The host can't verify any of this (`remote-gateway-protocol.ts` never treats an unlock as proof), so the shell is where board decision 4b is enforced on the phone: `halonic-phone-tunnel`'s `send` asks the check, through `TunnelHost::confirm_owner`, before it seals any `answer-approval`, takes the decision from the same strict reading it seals, and sends nothing without a pass or without a check.

**Known limit:** a pass proves that the owner is there and which decision they are making, not which approval they answer. The page still picks the `approvalId`, and the prompt deliberately carries no host or page text (D7 M3). Julian accepted this on HAL-15212.

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with `owner_check_`.
