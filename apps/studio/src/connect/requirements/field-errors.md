# studio.connect.field-errors

- Status: active
- Since: 0.1.0
- Source: HAL-1140 (flow-install-update 5.3, microcopy 20.4)

If the shell answers that the address is not an address, is a public address over plain `http://`, isn't answering or isn't Halonic, then the connect page shall show that one field error between the field and the hint, in the words of microcopy 20.4, as an alert that screen readers read when it appears, and mark the field invalid. When the error brings the connect screen back from another screen, the focus shall go to the field; when the connect screen was already showing, the focus shall stay where it is. The error shall stay until the field changes or Connect is pressed again. If the call into the shell fails, then the page shall show "Can't reach" and no raw error text.

## Examples

- Given the shell answers "not an address",
  when the answer arrives,
  then the page shows "Enter an address like 192.168.1.20:4280." and the field is invalid.
- Given the shell answers "isn't answering" for `192.168.1.20:4280`,
  when the answer arrives,
  then the page shows "Can't reach Halonic at 192.168.1.20:4280. …" with `halonic serve --network` in the code font.
- Given a field error shows,
  when the user types in the field,
  then the error goes and the field is valid again.
