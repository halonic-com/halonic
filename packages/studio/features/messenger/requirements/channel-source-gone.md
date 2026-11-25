# messenger.channel-source-gone

- Status: active
- Since: unreleased
- Source: Liam's review of #5954 (HAL-18171); Noah's wording on HAL-18224; HAL-18223.

Where a channel's source is gone, a line saying why a channel change failed shall never leave the source's label blank: it shall say "the channel's connection is gone" instead, as in "Couldn't leave Engineering: the channel's connection is gone.".

## Examples

- Given the channel "Engineering" whose connection was removed,
  when the person tries to leave it and the call fails,
  then the Messenger says "Couldn't leave Engineering: the channel's connection is gone.".
