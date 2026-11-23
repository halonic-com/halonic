# router.price-version

- Status: active
- Since: unreleased
- Source: HAL-16998; Q4 in architecture note section 9 on HAL-16984 (each cost row stores a `price_version`, a hash of the catalog's price table)

When the router loads its provider catalog, the catalog shall give a price version, `prices-` followed by 12 hex digits of a hash of each alias's name, provider, model and price, that changes when any of these changes and stays the same when only the order of aliases or keys, comments or descriptions change.

## Examples

- Given the same aliases written in another order, with other comments and descriptions,
  when the price version is worked out,
  then it is the same.
- Given `opus` with its output price changed from 20 to 21,
  when the price version is worked out,
  then it differs.
- Given `sonnet` pointing at another model at the same price,
  when the price version is worked out,
  then it differs.
