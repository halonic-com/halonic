# plugins.plugin-trust-setting-address

- Status: active
- Since: unreleased
- Source: HAL-3384; the "Runs" line design section 5 (HAL-1873); microcopy 24.1 R9, approved on HAL-1949; extends plugins.plugin-trust-check

When a plugin's backend reaches a host the person enters in one of its settings (`{ fromSetting }`), the trust check's Addresses section shall list it as its own row, "The address you enter in *plugin*'s settings, under *setting label*" (the setting's name when it has no label), followed by where the host may be, as the plugin declares it: "· only on your home network" (`private`), "· only on this computer" (`loopback`) or "· any public address" (`public`). The row shall count as one address in the summary, once however many times the backend names it.

## Examples

- Given Weather's backend reaches `{ fromSetting: station, class: private }`, and the setting is labelled "Station address",
  then Addresses lists "The address you enter in Weather's settings, under Station address · only on your home network".
- Given the class is `loopback`,
  then the row ends "· only on this computer".
- Given the backend also reaches api.example.com,
  then the summary says it reaches 2 addresses.
