# node-basic documentation
## Function Reference

A function is a type of variable that can be passed arguments and return a processed value. Arguments are separated by a comma, and surrounded in brackets, however if no arguments are provided brackets do not need to be written. For example, `DOSOMETHING()` is the same as `DOSOMETHING`.

**Reference Format**

The reference will show the names of each function, as well as information and usage examples. Command arguments are shown in brackets beside the name. An argument name surrounded with `[` and `]` is not required. If an argument name ends with a dollar sign, it must be a string. If it ends with a question mark, it can be a string or number. Otherwise, it must be a number. If the name ends with an ellipsis ('...'), there can be multiple of the argument provided.

### Number Functions

**SIN(a)**

Returns the sine of an angle in radians.

**COS(a)**

Returns the cosine of an angle in radians.

**TAN(a)**

Returns the tangent of an angle in radians.

**ASIN(a)**

Returns the arc sine of an angle in radians.

**ACOS(a)**

Returns the arc cosine of an angle in radians.

**ATN(a)**

Returns the arc tangent of an angle in radians.

**RAD(a)**

Converts an angle from degrees to radians.

**DEG(a)**

Converts an angle from radians to degrees.

**SQR(n)**

Returns the square root of a number.

**ABS(n)**

Returns the absolute value of a number.

**INT(n)**

Returns the integer part of a floating-point number.

**LOG(n)**

Returns the natural logarithm of a number.

**LOG10(n)**

Returns the common (base-10) logarithm of a number.

**EXP(n)**

Returns the base-e exponential function of a number.

**MOD(a, b)**

Returns the floating-point remainder of a / b.

**RND([min = 0], [max = 1])**

Generates and returns a random number from min to max.

**RANDOMIZE([seed])**

Set the random number generator seed. If seed is not provided it will be a random number.

### String Functions

**UPPER$(s$)**

Makes a string uppercase.

**LOWER$(s$)**

Makes a string lowercase.

**LEFT$(s$, n)**

Takes n characters from strings left.

**MID$(s$, i, n)**

Takes n characters from string starting with i'th character.

**RIGHT$(s$, n)**

Takes n characters from strings right.

**LEN(s$)**

Returns the strings length.

**VAL(s$)**

Converts a string into a number.

**STR$(n)**

Converts a number into a string.

**ASC(s$)**

Returns the ASCII code of the strings first character.

**CHR$(n)**

Returns a string containing a single ASCII character.

**SPC$(n)**

Returns a string containing n space characters.

### Graphics Functions

**Touch**

Returns if the mouse is currently pressed. Calls the `mousedown` command, and accepts a boolean on the `draw` interface.

**TouchX**

Returns the X coordinate of the mouse. Calls the `mousepos` command, and accepts the `x` argument on the `draw` interface.

**TouchY**

Returns the Y coordinate of the mouse. Calls the `mousepos` command, and accepts the `y` argument on the `draw` interface.

**ScreenWidth**

Returns the width of the graphics screen. Calls the `screensize` command, and accepts the `width` argument on the `draw` interface.

**ScreenHeight**

Returns the height of the graphics screen. Calls the `screensize` command, and accepts the `height` argument on the `draw` interface.

**IsPortrait**

Returns if the canvas height is bigger than width. Calls the `screensize` command, and accepts the arguments `width` and `height` on the `draw` interface.

**IsLandscape**

Returns if the canvas width is bigger than the height. Calls the `screensize` command, and accepts the arguments `width` and `height` on the `draw` interface.

**AccelX**

Returns the X accelerometer reading between -1 and 1. Calls the `accel` command, and accepts the `x` argument on the `draw` interface.

**AccelY**

Returns the Y accelerometer reading between -1 and 1. Calls the `accel` command, and accepts the `y` argument on the `draw` interface.

**AccelZ**

Returns the Z accelerometer reading between -1 and 1. Calls the `accel` command, and accepts the `z` argument on the `draw` interface.

**SpriteWidth(id)**

Gets the width of the sprite.

**SpriteHeight(id)**

Gets the height of the sprite.

### Miscellaneous Functions

**TickCount**

Gets a certain amount of seconds since an arbitary date. Useful for timing.

Example:

	t1 = TickCount
	GOSUB subroutine
	t2 = TickCount
	PRINT "Subroutine took", t2 - t1, "seconds to execute"

**DATE$**

Gets the current date, formatted as `1 Jan 1970`.

**TIME$**

Gets the current time, formatted as `03:34:58 pm`.

**DateYear**

Gets the current year.

**DateMonth**

Gets the current month number (e.g 1 for January, etc).

**DateMonth$**

Gets the current month name.

**DateDay**

Gets the current date.

**DateWeekDay$**

Gets the current day name.

**TimeHours**

Gets the current hour, from 1-24.

**TimeMinutes**

Gets the current minute.

**TimeSeconds**

Gets the current second.