# node-basic documentation
## Executor API reference

This API reference contains a list of functions and classes available in the `basic.executor` object.

### basic.executor

**executor.execute()**  
Arguments:

 - *AbstractSyntaxTree* ast - The tree to execute
 - *ExecutionContext?* ctx - The context
 - *Function?* done - Called when execution is complete

Executes the abstract syntax tree

**executor.ExecutionContext()**  
Arguments:

 - *Object?* options - Options for execution

Constructs: *ExecutionContext*

An object that provides modification and reading of the current execution context, as well as the ability to execute an AST in the context

**executor.constants**

Type: *Object*

Constant list

### basic.executor.ExecutionContext

**ExecutionContext#execute()**  
Arguments:

 - *Array* root - The root nodes in the AST
 - *Object* labels - A list of all labels and lines
 - *Function?* done - A function to call when the execution is terminated

Begins execution of the AST

**ExecutionContext#nextLine()**

Executes the current cursor line and increments the cursor

**ExecutionContext#validate()**  
Arguments:

 - *\** v - The variable to validate
 - *String* type - The type to validate

Throws: *Error* if validation fails

Validates a variable against a type

**ExecutionContext#setVariable()**  
Arguments:

 - *VariableStatement* variable - The variable
 - *ExpressionStatement|Number|String* value - The new value

Sets a variable

**ExecutionContext#getVariable()**  
Arguments:

  - *VariableStatement* variable - The variable to get

Returns: *Number|String* - The value of the variable

Gets a variable, constant or function

**ExecutionContext#getPointer()**  
Arguments:

 - *PointerStatement* pointer

Returns: *\**

Gets the value of a pointer

**ExecutionContext#setPointer()**  
Arguments:

 - *PointerStatement* pointer
 - *\** value

Sets the value of a pointer

**ExecutionContext#setConstant()**  
Arguments:

 - *String* name - The name of the constant
 - *String|Number* value - The value of the constant

Sets the value of a constant

**ExecutionContext#getPrivate()**  
Arguments:

 - *String* name - The name of the private variable

Returns: *\** - The value of the variable

Gets a private variable

**ExecutionContext#setPrivate()**  
Arguments:

 - *String* name - The name of the private variable
 - *\** value - The value of the variable

Sets a private variable

**ExecutionContext#defineArray()**  
Arguments:

 - *String* name - The name of the array
 - *Array<Number\>* lengths - The lengths of each dimension

Defines an array

**ExecutionContext#callFunction()**  
Arguments:

 - *FunctionStatement* funcObj - The function to call
 - *Array* args - The arguments to provide

Calls a function

**ExecutionContext#callCommand()**  
Arguments:

 - *Object* cmd - The command to execute

Returns: *Function<Function\>* - provide a function to call when execution is complete

Executes the specified command

**ExecutionContext#gosubLabel()**  
Arguments:

 - *String* label - The name of the label to go to

Goes to a label, and returns on RETURN

**ExecutionContext#gotoLabel()**  
Arguments:

 - *String* label - The name of the label to go to

Goes to a label

**ExecutionContext#returnLabel()**

Returns to the last GOSUB position

**ExecutionContext#terminate()**

Ends the program