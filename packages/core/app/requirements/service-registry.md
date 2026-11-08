# app.service-registry

- Status: active
- Since: 0.1.0
- Source: HAL-116

The service registry shall return the service provided for a key. If a key is provided twice, a missing key is asked for, or a service is provided after the registry was disposed, then it shall throw a `ServiceError`. When the registry is disposed, it shall call `dispose` on each service that has one, newest first, and a failing `dispose` shall not stop the others.

## Examples

- Given a service provided for `clock`,
  when `clock` is asked for,
  then that same service is returned.
- Given no service for `clock`,
  when `clock` is asked for,
  then a `ServiceError` is thrown.
- Given services A then B, both disposable, and A's `dispose` throws,
  when the registry is disposed,
  then B is disposed before A, A's error is thrown, and the registry is empty.
- Given a disposed registry,
  when a service is provided,
  then a `ServiceError` is thrown.
