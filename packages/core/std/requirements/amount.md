# std.amount

- Status: active
- Since: 0.1.0
- Source: new in the core std package, for the price fields of the Models feature (HAL-1292)

The amount reader shall read text as a non-negative number written with digits and at most one `.` or `,` as the decimal separator, ignoring surrounding spaces, and shall give nothing for any other text.

## Examples

- Given `3.00` or `15,00`, when they are read, then the amounts are 3 and 15.
- Given `1.000,50`, a sign, an exponent, a word or empty text, when it is read, then there is no amount.
- Given `1,000`, when it is read, then the amount is 1, as a single separator is the decimal one.
