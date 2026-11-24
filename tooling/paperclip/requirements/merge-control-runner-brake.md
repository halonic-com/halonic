# paperclip.merge-control-runner-brake

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-14785; the board, 21 Nov 22:15

When the longest merge-group runner wait passes 5 minutes, the plugin shall log "Runner wait N min on merge-group jobs: please hold pushes." once, and "Runner wait cleared." once it is under 2 minutes, shall restore a lowered fill target after 30 minutes under 2 minutes unless the board set it by hand, and shall log an unreadable wait.

## Examples

- Given waits of 6.4, 7 and 1 minutes on three passes,
  when they run,
  then the brake is logged on once and off once.
- Given a target of 8 and 31 minutes of low wait,
  when a pass runs,
  then the target is restored, unless the board set it by hand.
