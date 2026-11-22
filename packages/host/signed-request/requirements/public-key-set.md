# signed-request.public-key-set

- Status: active
- Since: unreleased
- Source: HAL-13534 (selling layer design, sections 3.1 and 12.1; threat model, section 6)

The published key set shall list each public key with its id and its one job (`session` or `command`); reading it shall refuse the whole set when any key is malformed or an id appears twice, and a key shall be found only for its own job, so a session key never verifies a command and a command key never verifies a session.

## Examples

- Given a set with a session key and a command key,
  when each is looked up for its own job,
  then it is found; looked up for the other job, it isn't.
- Given a set where one key's public half is 31 bytes,
  when the set is read,
  then the whole set is refused, naming that key's position.
- Given a set where two keys share an id,
  when the set is read,
  then the whole set is refused.
