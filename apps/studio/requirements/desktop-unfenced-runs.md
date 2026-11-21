# studio.desktop-unfenced-runs

- Status: active
- Since: unreleased
- Source: HAL-3384; Julian's security review notes on HAL-13786; the "Runs" line design section 7 (HAL-1873)

The desktop app shall give the plugins' trust check the agent host's sandbox status and the yes to run plugin code without the sandbox, through one object per window that Take back uses too. While a Take back is under way, it shall send no yes and answer that nothing was saved, and shall read the status only once the Take back has ended, whether or not it succeeded. A Take back shall wait for a yes already sent, so it removes that yes too.

## Examples

- Given a Take back under way,
  when the trust check sends the yes for `windows`,
  then nothing is sent to the host and the check is told nothing was saved.
- Given a Take back under way,
  when the trust check reads the status,
  then the host is asked only after the Take back ended.
- Given a yes for `windows` on its way to the host,
  when the person presses Take back,
  then the Take back starts once the yes was saved, and removes it.
