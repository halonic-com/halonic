# sandbox-cloudflare-container.torn-down

- Status: active
- Since: unreleased
- Source: HAL-17232; plan approval on HAL-13211 (Liam, points 4 and 6)

When a run ends, or passes its time limit, its container shall be destroyed, and no program shall start in it afterwards. The container object's own alarm shall destroy it at the deadline, so a run object that died or was evicted can't leave it running.

## Examples

- Given a running container,
  when its run's session closes,
  then the container is destroyed and a later program start is refused.
- Given a running container whose run object is gone,
  when the deadline's alarm fires,
  then the container is destroyed.
- Given a container past its deadline whose alarm hasn't fired yet,
  when a program start comes,
  then it is refused and the container is destroyed.
