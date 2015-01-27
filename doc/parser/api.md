# node-basic documentation
## Parser API Reference

This API reference contains a list of functions and classes available in the `basic.parser` object.

### Navigation

 - basic.parser
	 - Block
		 - Block
	 - AbstractSyntaxTree
	 - statements
		 - ExpressionStatement
		 - FunctionStatement
		 - NumberStatement
		 - PointerStatement
		 - StringStatement
		 - VariableStatement
	 - commands
 - IStatement
 - ICommand

### basic.parser

**parser.parse()**  
Arguments:

 - *String* code - The BASIC code to parser

Returns: *AbstractSyntaxTree|{error: SyntaxError}* - The resulting AST

Parses BASIC code and returns an abstract syntax tree.

**parser.parseLine()**  
Arguments:

 - *String* line - The line to parse
 - *Number* i - The line index
 - *Object* labels - The list of labels
 - *Boolean* notLineNumber - If true, won't see if it starts with a line number
 - *BlockManager* manager - The block manager

Returns: *IStatement*

Parses a line and returns the statement.

**parser.Block()**

Constructs: *BlockManager*

Creates block definition functions.

**parser.AbstractSyntaxTree()**  
Arguments:

 - *Array* root - The root-level nodes
 - *Object* labels - An object of label: line mappings
 - *BlockManager* manager The block manager

Constructs: *AbstractSyntaxTree*

Represents a tree that can be executed

**parser.SyntaxError()**  
Arguments:

 - *String* msg

Constructs: *SyntaxError*

An error caused by invalid syntax

**parser.statements**

Type: *Object*

'Statements' are the nodes in the abstract syntax tree. Each statement either holds other statements or a Javascript primitive, and has the ability to parse the input and execute it later.

**parser.commands**

Type: *Object*

Command List

### basic.parser.Block

**BlockManager#parse()**  
Arguments:

 - *AbstractSyntaxTree* ast

Parses the blocks

**BlockManager#create()**  
Arguments:

 - *Number* line - The line number for the block

Returns: *Function* - The function to create the block

Creates a function to create a block

**BlockManager#create()()**  
Arguments:

 - *Object* def - The block definition

Returns: *Block*

Creates a block with the specified definition

**BlockManager#create().references()**

Returns: *Array<Block\>*

Gets a list of block references

**BlockManager#create().line**

Type: *Number*

The current line

**BlockManager#create().toJSON()**

Returns: *Object*

Converts the block definition to JSON

**BlockManager.BlockManager**

Constructs: *BlockManager*

**BlockManager.Block**  
Arguments:

 - *Number* line - The current line number
 - *{start: Array, end: Array, then: Array}* def - Properties for block definition
 - *BlockManager* parent

Constructs: *Block*

A block parser

### basic.parser.Block.Block

**Block#parse()**  
Arguments:

 - *AbstractSyntaxTree* ast

Parses the block

**Block#has()**  
Arguments:

 - *String* name - The name of the command

Returns: *Boolean*

Finds if the block has the intermediate command specified

**Block#next()**
Arguments:

 - *String* name The name of the command

Returns: *Number*

Finds the next intermediate command with the name specified

**Block#references()**

Returns: *Array<Block\>*

Gets a list of references

**Block#toJSON()**

Returns: *Object*

Converts the command to JSON

### basic.parser.AbstractSyntaxTree

**AbstractSyntaxTree#toString()**

Returns: *String*

Converts the tree to an executable code string

**AbstractSyntaxTree#toJSON()**

Returns: *Object*

Converts the tree to serializable JSON

**AbstractSyntaxTree#execute()**  
Arguments:

 - *ExecutionContext* data - The execution context
 - *Function?* done - A function to call when the program terminates

### basic.parser.statements

**statements.ArgumentStatement()**  
Arguments:

 - *String* args - The arguments to parse
 - *Object* options - Command options
 - *Function?* define

Constructs: *ArgumentStatement*  
Implements: *IStatement*

Represents a set of arguments to a command call

**statements.AssignmentStatement()**  
Arguments:

 - *VariableStatement* variable - The variable to assign
 - *ExpressionStatement* expression - The expression to evaluate

Constructs: *AssignmentStatement*  
Implements: *IStatement*

Represents an assignment of a value to a variable

**statements.CommandStatement()**  
Arguments:

 - *String* name - The name of the command
 - *String* args - The arguments to the command
 - *BlockManager* manager -The block manager
 - *Number* line - The line number

Constructs: *CommandStatement*  
Implements: *IStatement*

Represents a command call

**statements.CommentStatement()**  
Arguments:

 - *String* text - The comment text

Constructs: *CommentStatement*  
Implements: *IStatement*

Represents a comment, which does nothing

**statements.EmptyStatement()**  

Constructs: *EmptyStatement*  
Implements: *IStatement*

An empty statement that does nithing

**statements.ExpressionStatement()**  
Arguments:

 - *String* data - The code to parse
 - *Function?* define

Constructs: *ExpressionStatement*  
Implements: *IStatement*

Represents some form of expression to find a value

**statements.FunctionStatement()**  
Arguments:

 - *String* name - The name of the function
 - *String* args - The arguments to the function

Constructs: *FunctionStatement*  
Implements: *IStatement*

Represents a function call

**statements.NumberStatement()**  
Arguments:

 - *Number* number - The number to assign

Constructs: *NumberStatement*  
Implements: *IStatement*

Represents a number value

**statements.PointerStatement()**  
Arguments:

 - *String* id - The id of the pointer

Constructs: *PointerStatement*  
Implements: *IStatement*

Represents a pointer

**statements.StringStatement()**  
Arguments:

 - *String* value - The value to assign

Constructs: *StringStatement*  
Implements: *IStatement*

Represents a string value

**statements.VariableStatement()**  
Arguments:

 - *String* name - The name of the variable

Constructs: *VariableStatement*
Implements: *IStatement*

**statements.operators**

Type: *Array*

Provides the order of operations, and the mapping of operator to class. NOTE: This *should* be in the reverse order of operations

### IStatement

**IStatement#toString()**

Returns: *String*

Outputs executable code that represents the statement

**IStatement#toJSON()**

Returns: *Object*

Converts the statement to JSON

**IStatement#execute()**  
Arguments:

 - *ExecutionContext* data - The execution data context

Returns: *\** - The value of the statement

Executes the statement

### basic.parser.statements.ExpressionStatement

**ExpressionStatement#execute()**  
Arguments:

 - *ExecutionContext* data - The execution data context

Returns: *String|Number* - The value of the expression

Executes the expression

### basic.parser.statements.FunctionStatement

**FunctionStatement#execute()**  
Arguments:

 - *ExecutionContext* data - The execution data context

Returns: *String|Number* - The value of the function

Gets the value of the function

### basic.parser.statements.NumberStatement

**NumberStatement#execute()**  
Arguments:

 - *ExecutionContext* data - The execution data context

Returns: *Number* - The number

Gets the number

### basic.parser.statements.PointerStatement

**PointerStatement#execute()**  
Arguments:

 - *ExecutionContext* data - The execution data context

Returns: *\** - The value of the pointer

Gets the pointer value

### basic.parser.statements.StringStatement

**StringStatement#execute()**  
Arguments:

 - *ExecutionContext* data - The execution data context

Returns: *String* - The string

Gets the string

### basic.parser.statements.VariableStatement

**VariableStatement#execute()**  
Arguments:

 - *ExecutionContext* data - The execution data context

Returns: *String|Number* - The value of the variable

Gets the value of the variable. Since the parser is going to think that getting the value of an array is a function call, we don't need to implement getting of the value here.

### basic.parser.commands

**commands.accelcalibrate()**

Constructs: *AccelcalibrateCommand*  
Implements: *ICommand*

Calibrates the accelerometer (mouse)

**commands.antialias()**

Constructs: *AntialiasCommand*  
Implements: *ICommand*

Does nothing, as Javascript doesn't allow disabling of antialiasing

**commands.bcolor()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *BcolorCommand*  
Implements: *ICommand*

Sets the color of the background

**commands.begindraw()**

Constructs: *BegindrawCommand*  
Implements: *ICommand*

Begins canvas caching

**commands.circle()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *CircleCommand*  
Implements: *ICommand*

Draws a filled or stroked circle

**commands.close()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function?* define

Constructs: *CloseCommand*  
Implements: *ICommand*

Closes a file in a pointer

**commands.cls()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *ClsCommand*  
Implements: *ICommand*

Clears the screen

**commands.color()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *ColorCommand*  
Implements: *ICommand*

Sets the draw color of the canvas

**commands.dim()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *DimCommand*  
Implements: *ICommand*

Declares one or more arrays

**commands.drawsprite()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *DrawspriteCommand*  
Implements: *ICommand*

Draws a sprite

**commands.drawtext()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *DrawtextCommand*  
Implements: *ICommand*

Draws text either at a point or inside a rectangle

**commands.ellipse()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *EllipseCommand*  
Implements: *ICommand*

Draws a filled or stroked ellipse

**commands.else()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function* define

Constructs: *ElseCommand*  
Implements: *ICommand*

Skips to the next matching ENDIF command

**commands.end()**

Constructs: *EndCommand*  
Implements: *ICommand*

Terminates the program

**commands.enddraw()**

Constructs: *EnddrawCommand*  
Implements: *ICommand*

Begins canvas caching

**commands.endif()**

Constructs: *EndifCommand*  
Implements: *ICommand*

End of an IF block

**commands.for()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function* define

Constructs: *ForCommand*  
Implements: *ICommand*

Iterates over the body a certain amount of times

**commands.gosub()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *GosubCommand*  
Implements: *ICommand*

Goes to a label and returns on RETURN

**commands.goto()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *GotoCommand*  
Implements: *ICommand*

Goes to a label

**commands.if()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function* define

Constructs: *IfCommand*  
Implements: *ICommand*

Executes the body if the condition is true

**commands.input()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *InputCommand*  
Implements: *ICommand*

Inputs a line from the user

**commands.line()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *LineCommand*  
Implements: *ICommand*

Draws a line

**commands.loadsprite()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *LoadspriteCommand*  
Implements: *ICommand*

Loads a sprite from a file

**commands.lockorientation()**  

Constructs: *LockorientationCommand*  
Implements: *ICommand*

Locks the size of the canvas

**commands.next()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function* define

Constructs: *NextCommand*  
Implements: *ICommand*

End of a FOR block

**commands.open()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function* define

Constructs: *OpenCommand*  
Implements: *ICommand*

Opens a file in a pointer

**commands.pause()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function* define

Constructs: *PauseCommand*  
Implements: *ICommand*

Pauses execution until RETURN is pressed

**commands.piechart()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *PiechartCommand*  
Implements: *ICommand*

Draws a piechart

**commands.play()**  

Constructs: *PlayCommand*  
Implements: *ICommand*

TODO

**commands.playspeed()**

Constructs: *PlayspeedCommand*  
Implements: *ICommand*

TODO

**commands.point()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *PointCommand*  
Implements: *ICommand*

Draws a point

**commands.print()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function* define

Constructs: *PrintCommand*  
Implements: *ICommand*

Outputs or formats and outputs a string

**commands.randomize()**  

Constructs: *RandomizeCommand*  
Implements: *ICommand*

Sets a random seed

**commands.readpixel()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *ReadpixelCommand*  
Implements: *ICommand*

Reads a pixel at a certain location

**commands.rect()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *RectCommand*  
Implements: *ICommand*

Draws a filled or stroked rectangle

**commands.requirelandscape()**

Constructs: *RequirelandscapeCommand*  
Implements: *ICommand*

Sets the canvas to landscape and locks it

**commands.requireportrait()**

Constructs: *RequireportraitCommand*  
Implements: *ICommand*

Sets the canvas to portrait and locks it

**commands.retina()**

Constructs: *RetinaCommand*  
Implements: *ICommand*

Does nothing, as retina is not possible on desktop

**commands.return()**

Constructs: *ReturnCommand*  
Implements: *ICommand*

Returns to a GOSUB

**commands.rrect()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *RrectCommand*  
Implements: *ICommand*

Draws a filled or stroked rounded rectangle

**commands.savesprite()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *SavespriteCommand*  
Implements: *ICommand*

Saves a sprite to a file

**commands.shape()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *ShapeCommand*  
Implements: *ICommand*

Draws a custom shape

**commands.sleep()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function* define

Constructs: *SleepCommand*  
Implements: *ICommand*

Sleeps for a certain amount of seconds

**commands.tcolor()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *TcolorCommand*  
Implements: *ICommand*

Sets the color of the text

**commands.textfont()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *TextfontCommand*  
Implements: *ICommand*

Modifies the DRAWTEXT font

**commands.triangle()**  
Arguments:

 - *String* args - The arguments to the command

Constructs: *TriangleCommand*  
Implements: *ICommand*

Draws a filled or stroked triangle

**commands.volume()**

Constructs: *VolumeCommand*  
Implements: *ICommand*

TODO

**commands.wend()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function* define

Constructs: *WendCommand*  
Implements: *ICommand*

Returns to the matching WHILE command

**commands.while()**  
Arguments:

 - *String* args - The arguments to the command
 - *Function* define

Constructs: *WileCommand*  
Implements: *ICommand*

Iterates over the commands body until the condition is true

### ICommand

**ICommand#toString()**

Returns: *String*

Converts the command arguments to a string

**ICommand#toJSON()**

Returns *Object*

Converts the command to JSON

**ICommand#execute()**  
Arguments:

 - *ExecutionContext* data
 - *Function* next

Executes the command