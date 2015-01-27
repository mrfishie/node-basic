# node-basic documentation
## Command Reference

A command is an instruction in BASIC that tells the computer to do something. Commands are passed a set of 'arguments', which are normally separated by a comma. Command names are case-insensitive.

**Reference Format**

The reference will show the names of each command, as well as information and usage examples. Command arguments are shown beside the name. An argument name surrounded by `<` and `>` is required, an argument surrounded with `[` and `]` is not required. If the name ends with a dollar sign, it must be a string. If it ends with a question mark, it can be a string or number. Otherwise, it must be a number. If the name ends with an ellipsis ('...'), there can be multiple of the argument provided, separated by a comma.

### IO Commands
**PRINT <value?...\>**

Writes a value to the `default` interface (normally the terminal).

Example:

	PRINT "Hello World!"
	PRINT "Age=", Age
	PRINT S$

**PRINT USING <format$\>; <number\>**

Outputs a formatted number to the `default` interface (normally the terminal). Use hashes to represent each digit. Other characters are allowed. The first full stop will be the position of the decimal point.

Example:

	PRINT USING "####"; 55.1234			--> Will print: "  55"
	PRINT USING "####.##"; 55.123		--> Will print: "  55.12"
	PRINT USING "####.#"; -55.123		--> Will print: " -55.1"

**INPUT [question$], <in var?\>**

Asks the question, waits for 'ENTER' to be pressed, and places the result in the variable. Uses the `default` interface (normally the terminal).

Example:

	INPUT "What's your name?", A$
	
	PRINT "What's your age"
	INPUT Age

**PAUSE [message$]**

Prints the pause message, then waits for 'ENTER' to be pressed before continuing execution.

Example:

	PRINT "Doing something"
	PAUSE "Tap to continue"
	PRINT "Doing something else"

**OPEN <filename$> FOR [INPUT, OUTPUT, APPEND] AS #<id\>**

Opens a file for reading (INPUT), writing (OUTPUT), or appending (APPEND) in the ID specified. Filename can optionally contain a drive ('A:' or 'B:'). The default drive is 'A:'.

Example:

	OPEN "Results" FOR OUTPUT AS #1
	OPEN "A:MyData" FOR INPUT AS #2

**PRINT #<id\> <value?...\>**

Writes a new line to the opened file, if the mode is OUTPUT or APPEND.

Example:

	PRINT #1, "Age=", Age
	PRINT #1, S$

**INPUT #<id\> <in var?\>**

Reads a line into a variable from the opened file, if the mode is INPUT.

Example:

	INPUT #1, Age
	INPUT #1, Line$

### Control Commands

**GOTO (label)**

Goes to the label position specified.

Example:

	10 PRINT "Endless Loop"
	GOTO 10

	loop:
	PRINT "Another Endless Loop"
	GOTO loop

**GOSUB (label)** - **RETURN**

Goes to the label position specified, then returns on `RETURN`.

	A = 3.14
	GOSUB SinPlusCos
	PRINT Result
	END
	SinPlusCos:
	Result = SIN(A) + COS(A)
	RETURN

**IF <expression?\> THEN** - **ELSE** - **ENDIF** (or **END IF**)

Executes the following lines if the expression evaluates to 1, otherwise skips to the matching `ELSE` or `ENDIF` command.

Example:

	IF Age < 20 THEN
		PRINT "Teenager"
	ELSE
		PRINT "Adult"
	ENDIF

**FOR <in var\> = <start\> TO <end\> STEP <add\>** - **NEXT**

Sets `in var` to `start` and iterates over the code between it and `NEXT`, adding `add` each time until `in var` reaches `end`.

Example:

	FOR i = 1 TO 100 STEP 10
		PRINT i
	NEXT

**WHILE <expr?\>** - **WEND**

Iterates over the code between it and `WEND` until `expr` evaluates to `0`.

Example:

	a = 10
	WHILE a > 0
		a = a - 1
		PRINT a
	WEND

**SLEEP <seconds\>**

Pauses execution for a certain amount of seconds.

Example:

	PRINT "Hello"
	SLEEP 1.5
	PRINT "World"

**END**

Terminates the program

### Graphics Commands

**COLOR <red\>, <green\>, <blue\>, [alpha]**

Sets the current color used by other graphics commands. Sets the `r`, `g`, `b`, and `a` properties on the `draw` interface.

The arguments are numbers in either the 0-1 or 0-255 range.

**BCOLOR <red\>, <green\>, <blue\>**

Sets the console background color. Calls the `bcolor` command with arguments `r`, `g` and `b` on the `draw` interface.

Arguments should be in the same ranges as with the `COLOR` command.

**TCOLOR <red\>, <green\>, <blue\>**

Sets the console text color. Calls the `tcolor` command with arguments `r`, `g` and `b` on the `draw` interface.

Arguments should be in the same ranges as with the `COLOR` command.

**CLS [GFX, TTY]**

Clears the screen. With the GFX argument, only clears the graphics screen. With the TTY argument, only clears the text console. Calls the `clear` command with the `type` argument on the `draw` interface.

**BEGINDRAW**

Starts caching graphics commands, meaning any graphical commands will only be displayed when `ENDDRAW` is called. Calls the `startCache` command on the `draw` interface.

**ENDDRAW**

Ends caching graphics commands, and updates the screen with all modifications done after `BEGINDRAW`. Calls the `flushCache` command on the `draw` interface.

**POINT <x\>, <y\>, [size = 1]**

Draws a point using the color specified with the `COLOR` command. Calls the `point` command with arguments `x` and `y` on the `draw` interface.

**LINE <x1\>, <y1\>, <x2\>, <y2\>, [width = 1]**

Draws a line from (`x1`, `y1`) to (`x2`, `y2`) with the color specified with the `COLOR` command. Calls the `line` command with arguments `x`, `y1`, `x2`, `y2` and `width` on the `draw` interface.

**RECT <x1\>, <y1\>, <x2\>, <y2\>, [stroke = 0]**

Strokes a rectangle if `stroke` is bigger than 0, otherwise fills it. Uses the color specified with the `COLOR` command. Calls the `rect` command with arguments `x1`, `y1`, `x2`, `y2` and `stroke` on the `draw` interface.

**RRECT <x1\>, <y1\>, <x2\>, <y2\>, <radius\>, [stroke = 0]**

Strokes a rounded rectangle if `stroke` is bigger than 0, otherwise fills it. Uses the color specified with the `COLOR` command. Calls the `rrect` command with arguments `x1`, `y1`, `x2`, `y2`, `radius` and `stroke` on the `draw` interface.

**CIRCLE <x\>, <y\>, <radius\>, [stroke = 0]**

Strokes a circle if `stroke` is bigger than 0, otherwise fills it. Uses the color specified with the `COLOR` command. Calls the `circle` command with arguments `x`, `y`, `radius` and `stroke` on the `draw` interface.

**ELLIPSE <x1\>, <y1\>, <x2\>, <y2\>, [stroke = 0]**

Strokes an ellipse of `stroke` is bigger than 0, otherwise fills it. Uses the color specified with the `COLOR` command. Calls the `ellipse` command with arguments `x1`, `y1`, `x2`, `y2` and `stroke` on the `draw` interface.

**SHAPE <num\_points\>, <points\_x[]\>, <points\_y[]\>, [stroke = 0]**

Draws a custom shape defined by points. The line start/end points are specified in the `points\_x` and `points\_y` arrays. Uses the color specified with the `COLOR` command. Calls the `shape` command with arguments `points` and `stroke` on the `draw` interface.

**TRIANGLE <x1\>, <y1\>, <x2\>, <y2\>, <x3\>, <y3\>, [stroke = 0]**

Strokes a triangle if `stroke` is bigger than 0, otherwise fills it. Uses the color specified with the `COLOR` command. Calls the `triangle` command with arguments `x1`, `y1`, `x2`, `y2`, `x3`, `y3` and `stroke` on the `draw` interface.

**PIECHART <x\>, <y\>, <r\>, <num\_items\>, <percentages[]\>, <reds[]\>, <greens[]\>, <blues[]\>**

Draws a pie chart. `percentages[]` is an array of each item, containing a number from 0 to 100 indicating the size of each segment. `reds[]`, `greens[]` and `blues[]` are arrays containing the color of each segment. Calls the `piechart` command with arguments `items`, `x`, `y` and `r` on the `draw` interface.

**DRAWTEXT <text$\>, <x1\>, <y1\>, [x2], [y2]**

Draws text at a given position or inside of a rectangle. Uses the color specified with the `COLOR` command and the font styles specified with the `TEXTFONT` command. Calls the `text` command with arguments `text`, `x1`, `y1`, `x2` and `y2` on the `draw` interface.

**TEXTFONT [font family$], [styles$], [size]**

Changes the current font family, styles, and/or size. If no arguments are provided, selects a default font. Calls the `font` command with arguments `family`, `style` and `height` on the `draw` interface.

List of available fonts (if the computer does not have the font selected, a similar font will be used).

 - American Typewriter
 - AppleGothic
 - Arial
 - Arial Rounded
 - Courier
 - Courier New
 - Georgia
 - Helvetica
 - Marker Felt
 - Times
 - Trebuchet
 - Verdana
 - Zapfino

Example:

	TEXTFONT "Zapfino", "Bold", 44
	TEXTFONT "Times", 24
	TEXTFONT "Bold Italic"
	TEXTFONT 16
	TEXTFONT

**LOADSPRITE <id\>, <file$>**

Loads a sprite from a file in the BASIC filesystem.

**DRAWSPRITE <id\>, <x\>, <y\>, [scale = 1], [angle = 0]**

Draws a sprite on the screen at a given position. Calls the `sprite` command with arguments `x`, `y`, `scale`, `rotation` and `sprite` on the `draw` interface.

**LOADSPRITE <id\>, <x1\>, <y1\>, <x2\>, <y2\>**

Creates a sprite using the specified portion of the screen. Calls the `capture` command with arguments `x1`, `y1`, `x2` and `y2`, and accepts a result as an image on the `draw` interface.

**SAVESPRITE <id\>, <file$>**

Saves a sprite to the BASIC filesystem.

**READPIXEL <x\>, <y\>**

Reads the color of the pixel at the specified location, and puts the values into the `ReadPixelR`, `ReadPixelG` and `ReadPixelB` variables. Calls the `readpixel` command with arguments `x` and `y`, and accepts result with arguments `r`, `g` and `b` on the `draw` interface.

**LOCKORIENTATION**

Locks the current screen size. Calls the `locksize` command on the `draw` interface.

**REQUIREPORTAIT** and **REQUIRELANDSCAPE**

Sets the size of the screen to portrait or landscape and locks it. Calls the `setsize` and `locksize` commands on the `draw` interface.

**ACCELCALIBRATE**

Calibrates the 'accelerometer' (which is in this case normally the distance between the center of the screen and the mouse). Changes the reference point to be the current position. Calls the `accel` command with argument `calibrate` on the `draw` interface.

**RETINA [ON, OFF]**

Turns the terminals retina mode on or off. This command does not actually do anything on the desktop.

**ANTIALIAS [ON, OFF]**

Turns antialiasing on or off. This command does not actually do anything on the desktop.

### Miscellaneous Commands

**PLAY <channel\>, [notes$]**

Plays a set of notes. If `notes$` is not provided, any sound playing on the specified channel will be stopped.

The format of the notes is `note name,note duration,...` Note name is anything from C1,C1#,D1,D1#,...C5, or a space character, which means silence. Note duration is a number which, when divided by the value of `PLAYSPEED`, gives the length of the note. The usual values are 1, 2, 4, 8 and 16.

***Warning! This feature is currently not implemented in node-basic.***

Example:

	PLAY 1, "C3,1, ,1,A3#,2"
	
	REM Stop the sound on channel 1
	PLAY 1
	
	A$ = "C3,2,C3,2,F3,2,F3,2,G3,2,G3,2,F3,1"
	PLAY 1, A$

**VOLUME <n\>**

Changes the volume of the `PLAY` command. `n` should be between 0 (muted) to 1 (maximum volume). The default volume is 0.1.

***Warning! This feature is currently not implemented in node-basic.***

**PLAYSPEED <n\>**

Changes the speed of the `PLAY` command. `n` should be between 0 to 8. The default speed is 1. The lower the speed, the slower the playing.

***Warning! This feature is currently not implemented in node-basic.***

Example:

	PLAYSPEED 0.5
	REM Now sound will play twice as slow
	
	PLAYSPEED 2
	REM Now sound will play twice as fast

**DIM (names...)**

Declares one or more multidimensional arrays.

Array bounds start at 1. node-basic has no limit for the size of an array, however the operating system and/or browser may enforce a limit.

Examples:

	NumBalls = 10
	DIM BallX(NumBalls), Bally(NumBalls)
	
	FOR i = 1 TO NumBalls - 1
		BallX(i) = BallX(i + 1)
		BallY(i) = BallY(i + 1)
	NEXT

Multidimensional array:

	DIM Matrix(3,3)
	Matrix(1,1) = 1
	Matrix(2,2) = 1
	Matrix(3,3) = 1

**DATA <items?...\>** - **READ <in vars?...\>** - **RESTORE (label)**

Reads data encoded in a program to arrays.

***Warning! This feature is currently not implemented in node-basic.***

Example:

	DIM S$(3), N(3)
	RESTORE MyData
	FOR i = 1 TO 3
		READ S$(i), N(i)
	NEXT
	
	MyData:
	DATA "one", 1, "two", 2, "three", 3