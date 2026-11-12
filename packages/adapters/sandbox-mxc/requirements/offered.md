# sandbox-mxc.offered

- Status: active
- Since: 0.1.0
- Source: HAL-3305, HAL-3292 (plan), HAL-2546 (board decision), HAL-3503 (grant rule 7), ADR 2026-11-10-mxc-sandbox-backend

The sandbox-mxc adapter shall say that MXC is offered only on a Windows 11 client edition (build 22000 or later, not a Server edition) where MXC's SDK reports the BaseContainer tier with the loopback proxy, and shall say it is not offered on every other computer, including Windows 10, Windows Server, the DACL tier and a computer that can't be examined. When the SDK can't be loaded on a Windows 11 client edition, it shall say MXC is offered, so that its check reports the broken install instead of hiding it.

## Examples

- Given Windows 11 Pro, build 26200, where the SDK reports the BaseContainer tier with the loopback proxy,
  when it is asked whether MXC is offered,
  then it is.
- Given Windows 10, build 19045,
  when it is asked,
  then MXC isn't offered, and the SDK is never loaded.
- Given Windows Server 2025, build 26100,
  when it is asked,
  then MXC isn't offered.
- Given Windows 11 where the SDK reports the DACL tier,
  when it is asked,
  then MXC isn't offered, because that tier leaked denied paths.
- Given Linux or macOS,
  when it is asked,
  then MXC isn't offered.
