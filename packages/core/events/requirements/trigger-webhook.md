# events.trigger-webhook

- Status: active
- Since: 0.1.0
- Source: HAL-195 (plan D22, webhook triggers for routines)

The events package shall let a run's trigger have the type `webhook` and carry `deliveryId`, the sender's id for the request that started the run. A webhook run shall keep the routine's key in `routineId` as the other routine runs do. When a run's events are summarized, the summary's trigger shall keep `type` and `deliveryId` as `run.started` gave them. Every trigger type that existed before reads as it did.

## Examples

- Given `run.started` with a trigger of type `webhook`, routine `acme/orders` and `deliveryId: "d-1"`,
  when the run is summarized,
  then the summary's trigger is exactly that trigger.
