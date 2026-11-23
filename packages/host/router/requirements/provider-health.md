# router.provider-health

- Status: active
- Since: unreleased
- Source: HAL-17000; Q3 in architecture note section 10 on HAL-16984 (Liam's answers on HAL-16992)

When a model call on an alias ends, the health check shall record whether the provider failed, and shall take the alias out for 15 minutes once 5 calls in a row have failed, or once more than half of at least 10 calls in the last 10 minutes have failed; calls recorded while the alias is out shall not extend that time, and the alias shall come back after it with no failures counted.

## Examples

- Given `deepseek-flash` with 4 failed calls in a row,
  when a fifth call fails,
  then `deepseek-flash` is out for the next 15 minutes and healthy again after them.
- Given `deepseek-flash` with 4 failed calls and then one that worked,
  when the next call fails,
  then it is still healthy, because the run of failures started again.
- Given 6 failed and 4 working calls on `deepseek-flash` within 10 minutes, in turns so no 5 fail in a row,
  when the tenth call is recorded,
  then `deepseek-flash` is out.
- Given 3 failed and 2 working calls on `deepseek-flash` within 10 minutes,
  when the health check is asked,
  then it is healthy, because 5 calls are too few for the share to count.
- Given an alias with no calls yet,
  when the health check is asked,
  then it is healthy.
