# sandbox-mxc.check

- Status: active
- Since: 0.1.0
- Source: HAL-3305, ADR 2026-11-10-mxc-sandbox-backend ("Where MXC is offered")

The sandbox-mxc adapter shall say whether MXC can start on this computer. Where MXC isn't offered (another system, Windows 10, a Server edition, a tier other than BaseContainer, or no loopback proxy), the reason shall be `windows`, as on plain Windows today; when MXC's SDK can't be loaded or asked, the reason shall be `other`. Each refusal shall carry one sentence saying what is missing, it shall never throw, and it shall never open a session in that case.

## Examples

- Given Windows 11 Pro with the BaseContainer tier and the loopback proxy,
  when it is checked,
  then it can start, with no reason and nothing missing.
- Given Windows 11 where the SDK reports the DACL tier,
  when it is checked,
  then the reason is `windows`, and the sentence names the tier.
- Given Windows 11 where the SDK isn't installed,
  when it is checked,
  then the reason is `other`, and the sentence says the SDK can't be loaded.
- Given Windows 11 where the BaseContainer tier has no loopback proxy,
  when it is checked,
  then the reason is `windows`.
