# remote.phone-tunnel-status

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decision 16; port shape agreed with D6 on HAL-15166; flow check C672 on HAL-16097)

When the phone's tunnel reports a computer's status, the header label shall show: Connected for `connected`; Reconnecting for `connecting` and for `reconnecting` with no failed try yet; "Your phone is offline" for `reconnecting` only when the last try failed because the phone's own network is down; "{computer} isn't answering" for `reconnecting` after a try that timed out, was refused or found nothing; Removed for `removed`; and "Can't confirm your computer" for `cant-confirm`. A `paused` status shall leave the label as it is, and `closed` shall show no label.

## Examples

- Given the phone is reconnecting to Tim's laptop,
  when the last try timed out,
  then the label shows "Tim's laptop isn't answering", never "Your phone is offline".
- Given the phone is reconnecting,
  when the last try failed because the phone's network is down,
  then the label shows "Your phone is offline".
- Given the label shows a state,
  when the app is paused,
  then the label stays as it is.
