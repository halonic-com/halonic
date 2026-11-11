# workflow.to-number

- Status: active
- Since: 0.1.0
- Source: `toNumber` in the old workflow package (`packages/core/workflow/src/guards.ts`) at 784f78d

When a number is read from a value, the workflow rules shall return a finite number as it is, and read a text by dropping every character that is not a digit, a dot, a comma or a minus sign, treating the last dot or comma as the decimal separator when one or two digits, or four or more, follow it, or when exactly three follow it and the part before it is empty or only zeros, and dropping every other dot and comma.

## Examples

- Given `1.200,50` or `1,200.50`, when a number is read, then the result is 1200.5.
- Given `€ 18.400`, when a number is read, then the result is 18,400.
- Given `EUR 1.250,00`, when a number is read, then the result is 1250.
- Given `12`, when a number is read, then the result is 12.
- Given `1.234.567`, when a number is read, then the result is 1,234,567.
- Given `1,5`, when a number is read, then the result is 1.5.
- Given `0.125`, `.125` or `0,001`, when a number is read, then the result is 0.125, 0.125 and 0.001: no thousands group starts with zero.
- Given `3.14159` or `1.234,5678`, when a number is read, then the result is 3.14159 and 1,234.5678: a thousands group has exactly three digits.
- Given `1.234` or `1,234`, when a number is read, then the result is 1,234: with three digits after the only separator and a non-zero whole part, it stays a thousands separator. This is a known limit; a caller that may get such decimals must not read them with this rule.
- Given `€-12,50`, when a number is read, then the result is -12.5.
- Given any finite number, when a number is read from it, then the result is that number.
