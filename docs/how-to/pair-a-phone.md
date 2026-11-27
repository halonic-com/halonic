# Pair a phone

Pair your phone with this computer to see your agents, approve what a run
proposes and send prompts from the Halonic app on Android. Your code, files and
secrets stay on the computer, but a prompt you send from the phone steers a
live agent run, so the phone can make an agent do whatever that run's tools
allow (see Security notes).

Remote needs a tunnel to reach your computer when you are away from your Wi-Fi.
The desktop app offers Remote where `tailscale` is installed; otherwise
**Settings › Remote** stays hidden.

## Pair a phone

1. On the computer, open **Settings › Remote** and press **Pair a phone**. This
   turns remote on while the pairing is open, without asking. The dialog shows a
   QR code and the time left: a code works once and ends after 5 minutes.
2. On the phone, open the Halonic app and scan the QR code. If you can't scan,
   press **Can't scan? Type a code** on the computer, then on the phone tap
   **Type a code instead**, choose your computer from the list and enter the
   12-character code. Letters can be in any case; spaces and dashes are ignored.
3. Both screens now show a 6-character check code, such as `4F7 · 2KQ`. Compare
   them. If they differ, press **Don't allow** on the computer and start again.
4. If they match, press **Allow** on the computer. The desktop app asks once
   more, in a window of its own, "Pair this phone?"; confirm it. The dialog
   says your phone is paired and what it can do. Press **Done**.

Allow is the only step that pairs a phone. If you don't press it within 2
minutes, or you press **Don't allow**, nothing is shared.

### If pairing stops

- **The code ran out:** press **Make a new code**.
- **The code was typed wrong 5 times:** the code is used up. Press **Make a new
  code**.
- **Tailscale isn't installed or ready:** follow the actions the dialog shows,
  then press **Check again**.

Closing the dialog before a phone is paired ends the pairing. Remote turns off
again if the pairing turned it on.

## What the phone can do

A paired phone can view your agents, answer approvals, send prompts and use
Messenger. It also shows a read-only team status. It has no shell and can't read
your files or secrets directly.

For now every tool approval counts as **risky**, so with the default settings
the phone answers no approvals: they wait for the computer. To let phones answer
them, turn on **Let phones answer risky approvals** in **Settings › Remote**;
the desktop app asks "Let phones answer risky approvals?" in a window of its own.
The switch is off until you turn it on, and the phone asks its owner for a
strong biometric check (not only unlocking the phone) before it answers.
When the phone is offline, it shows what it last read and turns Approve, Reject
and the prompt box off until it reconnects.

## Unpair a phone

Under **Paired phones** in **Settings › Remote**, each row shows the phone's
name, when it paired and whether it is connected. Press **Revoke** and confirm.
The phone is cut off at once. Your agents keep running, and answers that wait
for approval wait on the computer. To use the phone again, pair it again.
**Revoke all** sits at the foot of the list when two or more phones are paired.

Revoke works even while remote is off. On the phone, **Forget this computer**
only removes the computer from the phone; the computer still lists the phone
until you revoke it there.

## Security notes

- **Check the check code every time.** It is what stops someone between your
  phone and your computer. Never press Allow for a phone you don't recognise.
- **A prompt from the phone needs no approval.** It steers a live run, which can
  do whatever that run's tools allow, as if you typed it on the computer. Pair
  only phones you trust.
- **Confirm "Pair this phone?" only right after you pressed Allow yourself.**
  If that question appears when you didn't, press Cancel.
- **Treat the pairing code like a password for 5 minutes.** Don't read it out or
  show it on a screen share. It is never sent over the network, and five wrong
  tries end it; a dropped connection mid-pairing counts as a wrong try too.
- **The connection is encrypted from phone to computer** by Halonic itself, even
  through a tunnel.
- **Phone names can mislead.** The dialog shows hidden characters in a name as
  markers such as `⟦U+202E⟧`; don't allow a phone whose name shows any.
- **Revoke a lost phone straight away.** The computer then refuses it.
- **Leave risky approvals off** unless you need them from the phone.
- **Android's scanner:** scanning a code uses Google's ML Kit through Google Play
  services. The camera image stays on the phone, but Google may receive usage
  statistics. See
  [Google's ML Kit data disclosure](https://developers.google.com/ml-kit/android-data-disclosure).

For how pairing is designed, see the
[pairing decision](../adr/2026-11-18-pairing-and-the-end-to-end-session.md) and
the [threat model](../security/threat-model.md).
