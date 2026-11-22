# paperclip.seats-history

- Status: active
- Since: unreleased
- Source: HAL-16008; the placement, token and activity history in the seat forecast on HAL-15997 (sections 4.1 and 5), as agreed with the forecast on HAL-16030

While the `seats` plugin runs, `seats.history` shall every 10 minutes, for the one company whose settings list the seats, record which seat each agent is on, sum the last hour of its cost rows into 10-minute token buckets on the seat it was on, and note what each agent on a seat has on, reading only the settings fields that choose an agent's sign-in and storing or logging neither a folder nor a connection id.

## Examples

- Given an agent whose connection is a seat's connection,
  when `seats.history` runs,
  then a placement on that seat starts.
- Given an agent with its own Claude folder that is another seat's folder,
  when `seats.history` runs,
  then it is placed on the seat of that folder, not of its connection.
- Given an agent that moved to another seat since the last run,
  when `seats.history` runs,
  then its old placement ends and the new one starts at the same time.
- Given cost rows from the last hour and a bucket stored by an earlier run,
  when `seats.history` runs,
  then each bucket is summed again and replaces the stored one.
- Given an agent on no seat,
  when `seats.history` runs,
  then it gets no placement and no activity row.
