# plugins.plugin-page-needs-yes

- Status: active
- Since: unreleased
- Source: HAL-3384; microcopy 24.1 R13 (HAL-751, approved on HAL-1949); the "Runs" line design section 7 (HAL-1873); the view-only line names the desktop app (check C540, HAL-15080)

While a plugin with a backend is on and the host says plugin code doesn't run in the sandbox on this computer and no yes is saved for the reason that holds now, the Plugins feature shall show on the plugin's page, in place of the status box, a `warning` Callout "*Plugin* is off on this computer until you allow plugins and integrations to run without the sandbox." with the reason and the fix in the words of `runnerUnfencedWords`, then the reason's docs link and **Review**, in that order. When **Review** is pressed, the Plugins feature shall open the plugin's trust check with the checkbox, and when the trust check closes it shall read the host's status again. Where the page is view only, the Callout shall end with "Allow this in the Halonic desktop app.", which names where, since a served browser may be on the same computer, and have no **Review**. The Plugins feature shall not ask the host about a plugin that isn't on or has no backend, and shall keep the status box while a yes for the current reason is saved, while plugin code runs in the sandbox, or when the host can't say.

## Examples

- Given Weather is on and the host says a yes is needed for `windows`,
  when the page opens,
  then it reads "Weather is off on this computer until you allow plugins and integrations to run without the sandbox." with **How to run Halonic in WSL 2** and then **Review**.
- Given the person ticks the box in the trust check and presses **Trust**,
  when the trust check closes,
  then the Callout is gone.
- Given the host says a yes for `windows` is saved,
  when the page opens,
  then the status box shows.
