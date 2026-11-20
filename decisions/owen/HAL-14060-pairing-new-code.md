# Decision: a pairing gives new codes itself, and a code that ends keeps remote on

- Approval: HAL-14060 (Liam asked for the change and reviews it there)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ampXseWMzoY4VviJ/SdRMDqu0Cw4VPCS4EHDT9PCoT9R5fTwWDnWNtsbhyJaUr7F4C60U9X7yWj5mhgjdHlCAw==

## What changes

`PairingSession` gets `newCode()`: it ends the current code and gives a new
`code` on the same session. A code that stops working (Don't allow, the wait
for Allow or the code's life ran out, too many wrong tries) no longer ends the
pairing. It gives a new event, `code-ended`, with its reason from the new list
`codeEndReasons`, and the pairing stays open until `newCode` or `close`. Only
`closed`, `remote-off`, `tunnel-down` and `busy` end a pairing now, so
`pairingEndReasons` lists those four.

The rule "a pairing that ends without a phone turns remote off again if it
turned it on" stays. Since a code ending no longer ends the pairing, remote
stays on until the dialog closes.

The three requirements say so. Three tests expected an ending code to end the
pairing and turn remote off; they now expect `code-ended` with remote on. One
test now lists the two reason lists.

## Why

Studio showed a new code by closing the session and starting another. When
remote was off before Pair a phone, every New code, "Code ran out" → New code
and Don't allow turned remote off and on again: the real host would stop and
restart the tunnel, and the status bar would show "Starting remote…" for a
moment. One session per dialog matches design decision 10 and needs no timing
rule, unlike a grace period after `close`.

The port stays at version 1. Nothing released implements or uses it: the
host's pairing service is tunnel phase B2, and Studio's Remote stays hidden
until then.

## Tests

No test was weakened. Every changed test checks as much as before, and the
new contract tests prove that a new code keeps remote on in every state in
between, that a new code after Don't allow pairs a phone, and that `newCode`
is refused once the pairing has ended.

## Covers

- ports.remote-control
- contracts.remote-control
- contracts.fake-remote-control
