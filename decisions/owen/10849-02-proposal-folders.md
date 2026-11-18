# Decision: a profile's temp folder is removed when its session never opens

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10849 (Liam, CTO; review nit on #3404)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:GBtlQWahV6jc58BTPrdXGvkYahx6NFI/SGbSJALYHzFybZiIhXjc9GgNm24KLE997eLQ9RlyQ7jJf/qwXuAfBw==
- Task: HAL-10849

The host builds a sandbox profile and its temp folder before the session opens. If the run is
cancelled in between, nothing closes the session, so the folder stayed until the host stopped.
The host now removes the temp folder of a profile whose session has not opened after ten minutes.
A session that opens clears the timer and removes its own folder when it closes, as before.

- The wait is an option (`unopenedAfterMs`), so the test does not need ten minutes.
- Only folders this host made are removed, as for a closed session.

## Covers

- agent-host.profile-route
