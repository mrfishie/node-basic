# node-basic documentation
## Language Introduction

BASIC has a simple syntax that is easy for beginners to learn. In this document, we will go over the basics of BASIC.

In BASIC, you write one 'instruction' to the computer per line. There are two types of 'instructions': commands and assignments.

**Assignments**

BASIC has a concept of 'variables', which is like a named box for a piece of information, which can either be a number or 'string', which is a set of characters (a piece of text). In BASIC, to set a variable to have a value, you use the '=' (equals) symbol, just like you would in maths. Check out this example:

	x = 5
	y = 2
	a = x + y

This sets the `x` variable to '5', the `y` variable to '2', and then sets the `a` variable to 'x + y', or 5 + 2, which is 7. You can also do something like this:

	x = 1
	x = x + 1

This sets `x` to 1, and then sets `x` to 'x + 1', meaning `x` is being set to 1 + 1, or 2. You can also use `/` (division), `*` (multiplication), `-` (subtraction), and `^` (power).

In BASIC, most of the time spaces are optional. That means that `a = x + y` does the same as `a=x + y`, `a=x+y`, or even `a= x+ y`. It is important, however, to find a coding practice that suites you and stick to it.

BASIC also allows you to store text in a variable. This is called a 'string' (or a string of characters). In BASIC, the name of a string variable will always end with '$' (a dollar sign), and the actual text is surrounded in double-quotes (`"`). You can use the `+` operator to add two or more strings together.

	x$ = "Hello "
	y$ = "world"
	a$ = x$ + y$

This will add the `x$` and `y$` string variables together, resulting in `"Hello " + "world"` (note the space after `Hello`), which becomes `"Hello world"`.

**Commands**

Commands make up the bulk of BASIC code. A command is an instruction that tells the computer to actually do something. You can give a command information by passing it 'arguments'. The simplest command is the `PRINT` command, which 'prints' some text to the screen (not to a printer).

	PRINT "Wow!"

This will write `Wow!` on the screen. We can pass multiple arguments, separated by a comma, and `PRINT` will write each one followed by a space.

	PRINT "Hello", "world"

You can also write the value of a variable or expression.

	hello$ = "Hello, "
	world$ = "world"
	PRINT hello$ + world$

This will print `Hello, world` to the screen.

Of course, you can also print the value of a number variable.

	x = 5
	y = 2
	a = 5 + 2
	PRINT a

BASIC also provides the `INPUT` command, which allows you to receive some text from the user of your program.

	INPUT "What is your name?", name$
	PRINT "Your name is", name$

This will write 'What is your name?', and then wait for the user to write their name and press 'ENTER'. It will store their name in the `name$` variable, and then print it.

You don't have to 'ask' something in the `INPUT` command.

	INPUT something$
	PRINT "You wrote", something$

Lets say that you want to do something if the user says one thing, otherwise say something else. You can do this too, with the `IF` statement.

	INPUT "How old are you?", age
	IF age < 18 THEN
		PRINT "Not old enough to vote"
	ELSE
		PRINT "Old enough to vote"
	ENDIF

The `IF` statement here will output 'Not old enough to vote' if you enter a number less than 18, otherwise it will say 'Old enough to vote'. The `ENDIF` line says that everything after should be run regardless.

You don't have to have an `ELSE` in your statement.

	INPUT "What is your name?", name$
	IF name$ = "John" THEN
		PRINT "Hello John!"
	ENDIF

This will say 'Hello John' if you enter 'John' (case sensitive, we will learn about that later). Otherwise it will do nothing.

In an `IF` statements, there are various different 'comparators'. These are the characters between two different values like `=` and `<`. To see all of them, check out the comparator section of the operator reference document.

There are many other useful commands in BASIC, and to see those, check out the command reference document.

**Comments**

Comments are an easy way to mark your code with text that the computer will ignore. To write a comment, start the line with a single quote, or the `REM` command.

	' This is a comment and is not executed
	REM This is another comment!

**Labels**

Labels provide an easy way to 'navigate' around your BASIC code. A label marks a position in the code that can be moved to during execution. Heres an example that prints 'Loop!!' infinitely.

	loop:
	PRINT "Loop!!"
	GOTO loop

The `loop:` line is a label. The `GOTO` command finds the label passed to it and then goes to it. This means that the code will write 'Loop!!', then go to the `loop:` line, move down and print 'Loop!!' again, and continue forever.

You can also have a label that goes to a position, then returns after some code. This is called a `GOSUB`.

	PRINT "Lets do something"
	GOSUB dosomething
	PRINT "Done!"
	END
	
	dosomething:
	PRINT "Doing something..."
	RETURN

The `GOSUB` command goes to the label, and the `RETURN` command returns back to the `GOSUB` command. As a result, the code will write 'Lets do something', then 'Doing something...', and finally 'Done!'. Note that you need to use the `GOSUB` command if you want to `RETURN`.

You can also prepend a line with a number, and then use a `GOTO` or `GOSUB` to navigate to that.

	10 PRINT "Endless Loop"
	GOTO 10

**Functions**

A function is a type of variable that is passed some arguments, and then returns a processed value. One common example is the `UPPER$` function, which converts a string to uppercase. Here's an example:

	INPUT "What is your name?", name$
	IF UPPER$(name$) = "JOHN" THEN
		PRINT "Hello John!"
	ENDIF

This will say 'Hello John!' if you input 'John' in any case (e.g. 'John', 'john', 'jOhn' and 'JOHN' will all work). Another example is the `LEFT$` function, which gets a certain amount of characters from the left side of a string. Function calls can also be nested (one function in another). Here is an example:

	INPUT "Is the number bigger than 50?", big$

	IF UPPER$(LEFT$(big$, 1)) = "Y" THEN
		PRINT "Good!"
	ENDIF

This will get the first character in the `big$` variable, make it uppercase, and then compare it to 'Y'. That means that, as long as you respond with something starting with a 'Y' ('yes', 'yep', 'yahoo' and 'yolo' would all work), it will say 'Good!'.

If a function name ends with a '$', it will 'return' a string (just like a variable). For a full list of functions, take a look at the function reference document.