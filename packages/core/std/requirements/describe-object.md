# std.describe-object

- Status: active
- Since: 0.1.0
- Source: HAL-506, from the review of HAL-345, so `deepClone` and `format`'s `compact` say clearly what they refused

The describe-object function shall name the class whose prototype made an object, with "a" or "an" in front, and shall say "an instance of an unnamed class" when that class has no name, "an object with a custom prototype" when the prototype has no constructor of its own, and "a plain object" when the prototype is `Object.prototype` or `null`.

## Examples

- Given `new Map()`, when it is described, then the answer is "a Map".
- Given `new Int8Array(1)`, when it is described, then the answer is "an Int8Array".
- Given an instance of an anonymous class, when it is described, then the answer is "an instance of an unnamed class".
- Given `Object.create({})`, when it is described, then the answer is "an object with a custom prototype".
