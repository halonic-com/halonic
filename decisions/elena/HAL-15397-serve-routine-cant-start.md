# Decision: serve's webhook lines promise no start they take back, and routines list marks the same routines

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15397 (team wording call on flow check C570 #1 to #4, HAL-15386; small wording on approved CLI output, HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:u99hRPn2eJ6e5t3uecfbFvUDevq7pnheVp0+OCaCyBGamvRjJPFpbszkY1kow/7t2sCbsFwNptYL3D3qsCLgBw==

Flow check C570 found four things about webhook routines in the CLI:

1. `halonic serve` printed "Agent on request starts on a web request at …" and right under it "✕ Agent on
   request won't start: …". When a ✕ line follows, the first line now gives only the address: "Agent on
   request has the web address …". Without a ✕ line it still says "starts on a web request at …".
2. The server's 501 for a routine that starts an agent said "Agent runs are not available yet in this
   version of Halonic.", while serve and the how-to said "Halonic can't run an agent on its own yet, only
   as a step in a workflow." The 501 body now says that sentence, and the how-to quotes it.
3. `halonic routines` showed "No set time" for a webhook routine serve says won't start (secret not set, a
   Halonic name for its secret, or a routine that starts an agent). It now asks serve's own check and
   shows "✕ Can't start" for those, counts them in a line above the list, "! 1 routine can't start on a
   web request · halonic serve", and exits 1, as it does for a routine whose file has errors. A routine
   with file errors stays counted once, under `halonic validate`.
4. A signed delivery that started a run printed nothing in serve's terminal, nor did a 501. Serve now
   prints "✓ Weekly report started on a web request · run 17c592", "Weekly report skipped a web request:
   its previous run is still going (overlap: skip)." for a skipped one, and the 501's reason as it
   does a 400's. A 401 stays silent: anyone who can reach the address can send one.

No test is weakened: the serve line tests now check the address line in full where they checked only the ✕
line, and the 202 that was in the "prints nothing" test has its own tests.

## Covers

- cli.commands.serve.serve
- cli.commands.serve.webhook-refusals
- cli.commands.routines.list
