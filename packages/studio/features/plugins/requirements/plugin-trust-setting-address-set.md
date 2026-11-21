# plugins.plugin-trust-setting-address-set

- Status: active
- Since: unreleased
- Source: HAL-3384; the "Runs" line design section 5 (HAL-1873); microcopy 24.1 R9 ("set"), approved on HAL-1949; extends plugins.plugin-trust-setting-address

When a plugin's backend reaches a host the person enters in one of its settings, and that setting has a value, the trust check's Addresses section shall show the value as the row's address, followed by "(from *plugin*'s settings: *setting label* · *where the host may be*)". The trust check shall read the plugin's saved settings when it opens. While they're read, when they can't be, and while the setting has no value, the row shall stay "The address you enter in *plugin*'s settings, under *setting label*". The row shall still count as one address in the summary.

## Examples

- Given Weather's backend reaches `{ fromSetting: station, class: private }`, the setting is labelled "Station address", and it's set to `192.168.1.20`,
  when the trust check opens from Review,
  then Addresses lists "192.168.1.20 (from Weather's settings: Station address · only on your home network)".
- Given the setting is empty,
  then Addresses lists "The address you enter in Weather's settings, under Station address · only on your home network".
- Given the settings can't be read,
  then Addresses keeps the row for a setting not yet entered.
