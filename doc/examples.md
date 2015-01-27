# node-basic documentation
## Examples

### Code Examples

These code examples are based on the ones from iBasic's examples, and can also be found in the `examples` folder.

#### Area of a Triangle

	' Area of a Triangle
	INPUT "Height =", H
	INPUT "Base =", B
	A = B * H / 2
	PRINT "The area is", A

#### File IO

	' Populate text file
    OPEN "text" FOR OUTPUT AS #1
    FOR i = 1 TO 10 STEP 1
        PRINT #1, "i = ", i
    NEXT
    CLOSE #1
    
    ' Read text file
    OPEN "text" FOR INPUT AS #1
        FOR i = 1 TO 10 STEP 1
        INPUT #1, a$
        PRINT a$
    NEXT
    CLOSE #1
    
    ' Populate numeric file
    OPEN "numbers" FOR OUTPUT AS #1
    FOR i = 1 TO 10 STEP 1
        PRINT #1, i
    NEXT
    CLOSE #1
    
    ' Read numeric file
    OPEN "numbers" FOR INPUT AS #1
    FOR i = 1 TO 10 STEP 1
        INPUT #1, a
        PRINT a
    NEXT
    PRINT 
    CLOSE #1

#### FOR Loop, Line Numbers

	10 INPUT "What's your name", name$
    20 IF LEN(name$) = 0 THEN
        30 GOTO 130
    40 ENDIF
    50 IF UPPER$(name$) = "JOHN" THEN
        60 FOR i = 0 TO 100 STEP 10
            70 PRINT "Hello John!"
        80 NEXT
    90 ELSE
        100 PRINT "ACCESS DENIED!"
        110 PRINT "Just Kidding"
    120 ENDIF
    130 PRINT "The End"

#### Guess a Number

	PRINT "Guess a number from 1 to 100"
    upper = 100
    lower = 1
    N = 50
    Guesses = 0
    
    Guesses = Guesses + 1
    IF Guesses > 20 THEN
        PRINT "Sorry, I give up, you win!"
        END
    ENDIF
    input1:
    Prompt$ = "Is it greater than " + STR$(N) + "?"
    INPUT Prompt$, a$
    IF UPPER$(LEFT$(a$, 1)) = "Y" THEN
        lower = N
        N = INT(N + (upper - N) / 2)
        GOTO input1
    ENDIF
    IF UPPER$(LEFT$(a$, 1)) = "N" THEN
        input2:
        Prompt$ = "Is it less than " + STR$(N) + "?"
        INPUT Prompt$, a$
        IF UPPER$(LEFT$(a$, 1)) = "Y" THEN
            upper = N
            N = INT(N - (N - lower) / 2)
            GOTO input1
        ENDIF
        IF UPPER$(LEFT$(a$, 1)) = "N" THEN
            PRINT "It is", N
            END
        ENDIF
        GOTO input2
    ENDIF
    GOTO input1

#### IF-THEN-ELSE-ENDIF

	' Sample Program for Beginners
    
    INPUT "Input Age: ", age
        IF age < 14 THEN
        PRINT "Junior Programmer"
    ELSE
        IF age < 18 THEN
            PRINT "Novice Programmer"
        ELSE
            PRINT "Expert Programmer"
        ENDIF
    ENDIF
    
    IF age >  = 18 THEN
        PRINT "Eligible to vote"
    ELSE
        PRINT "Not eligible to vote"
    ENDIF

### Parser Examples

#### Parsing a file

	var fs = require('fs');
	var basic = require('basic');
	
	function readFile(file, done) {
		fs.readFile(file, { encoding: 'utf8' }, function(err, data) {
			if (err) return done(err);
			
			var ast = basic.parser.parse(data);
			done(false, ast);
		});
	}

#### Generating code from an AST

	var fs = require('fs');
	
	function writeCode(ast, file, done) {
		fs.writeFile(file, ast.toString(), { encoding: 'utf8' }, done);
	}

#### Generating JSON from an AST

	var fs = require('fs');
	
	function writeJSON(ast, file, done) {
		fs.writeFile(file, ast.toJSON(), { encoding: 'utf8' }, done);
	}

### Executor Examples

#### Executing a file

	var fs = require('fs');
	var basic = require('basic');
	
	function runFile(file, done) {
		fs.readFile(file, { encoding: 'utf8' }, function(err, data) {
			if (err) return done(err);
	
			var ast = basic.parser.parse(data);
			basic.executor.execute(ast, done);
		});
	}

#### A simple REPL (read-eval-print-loop)

	var basic = require('basic');
	var rl = basic.IOInterface.getDefault();
	
	var context = new ExecutionContext();
	var manager = new BlockManager();
	var ast = new AbstractSyntaxTree([], {}, manager);
	
	function run() {
		rl.readln(function(cmd) {
			var line = basic.parser.parseLine(cmd, ast.root.length, ast.labels, false, ast.manager);
			ast.root.push(line);
			ast.manager.parse(ast);
			context.options.cursorStart++;
			ast.execute(context, run);
		});
	}