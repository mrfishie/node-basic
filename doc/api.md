# node-basic documentation
## API Reference

This API reference contains a list of functions and classes available in the `basic` object.

### basic

**basic.run()**  
Arguments:

 - *String* code
 - *ExecutionContext?* ctx
 - *Function?* done

Returns: *ExecutionContext*

Quick-runs code

**basic.IOInterface()**  
Arguments:

 - *Function?* output - An output function
 - *Function?* input - An input function
 - *Object?* data - Data

Constructs: *IOInterface*

An interface for custom input/output

**basic.executor**

Type: *Object*

See executor API reference.

**basic.filesystem**

Type: *Object*

BASIC Filesystem

**basic.functions**

Type: *Object*

Function List

**basic.parser**

Type: *Object*

See parser API reference.

**basic.repl**

Type: *Object*

Basic REPL. Implements a similar interface to Node's REPL package

**basic.util**

Type: *Object*

### basic.IOInterface

**IOInterface.IOInterface()**  
Arguments:

 - *Function?* output - An output function
 - *Function?* input - An input function
 - *Object?* data - Data

Constructs: *IOInterface*

An interface for custom input/output

**IOInterface.set()**  
Arguments:

 - *String* name - The name of the interface
 - *IOInterface* inf - The interface

Throws: *Error* if inf is not an instance of IOInterface

Sets an interface

**IOInterface.get()**  
Arguments:

 - *String* name - The name of the interface
 - *Boolean=true* update - Update the interface if a new one replaces it

Returns: *IOInterface* - The interface, or the default if the required one doesn't exist

Gets an interface. If an interface doesn't exist the default will be returned. If the interface is changed later (i.e. a new interface replaces the current one), the interface object will reflect to change that. Set the second parameter to false to stop this

**IOInterface.setDefault()**  
Arguments:

 - *IOInterface* inf - The interface

Sets an interface as the default

**IOInterface.getDefault()**

Returns: *IOInterface*

Gets the default interface

**IOInterface#setOutput()**  
Arguments:

 - *Function* output

Sets the output function

**IOInterface#setInput()**  
Arguments:

 - *Function* input

Sets the input function

**IOInterface#write()**  
Arguments:

 - *\** text

Throws: *Error* if output is not a function

Writes something to the interface

**IOInterface#writeln()**  
Arguments:

 - *String* text

Throws: *Error* if output is not a function

Writes a line to the interface

**IOInterface#log()**

Duplicate of *IOInterface#writeln()*

**IOInterface#read()**  
Arguments:

 - *Function* callback - Passed current character, total value, and cancel function

Throws: *Error* if input is not a function

Continues reading characters until the function calls the cancel argument

**IOInterface#readln()**  
Arguments:

 - *Function* callback - Passed the final value

Throws: *Error* if input is not a function

Reads until a newline is detected

**IOInterface#question()**  
Arguments:

 - *String* text
 - *Function* response - Called with the response

Writes the text and then reads until the new line

**basic.filesystem**

**filesystem.initialize()**  
Arguments:

 - *Function?* done - A callback for when initialization is complete

Initializes the file system

**filesystem.initialized()**

Returns: *Boolean*

Returns whether the filesystem is initialized

**filesystem.drive()**  
Arguments:

 - *String* name - The name of the drive
 - *Function<Drive\>?* done - A callback to call when the drive is acquired

Returns: *Drive|undefined* - The drive, or undefined if not yet initialized

Gets a drive. Using the 'done' parameter is recommended (the filesystem will be initialized if it hasn't been)

**filesystem.save()**  
Arguments:

 - *Function?* done - A function to call when complete

Saves the filesystem

### basic.repl

**repl.start()**  
Arguments:

 - *Object* options - Options for the REPL

Starts the REPL. Options can be:

 - `prompt` - the prompt and `stream` for all I/O. Defaults to `> `.
 - `eval` - function that will be used to eval each given line. Defaults to an async wrapper for `executor.execute`.
 - `completer` - function that will be used for auto-completing


### basic.util

**util.findNext()**  
Arguments:

 - *String* data - The string to search
 - *Array<String\>* items - The items to find
 - *Number=0* index - The start index

Returns: *{index: Number, found: String}* - The found index and the found item

Finds the next one of the items

**util.findLast()**  
Arguments:

 - *String* data - The string to search
 - *Array<String\>* items - The items to find
 - *Number=0* index - The end index

Returns: *{index: Number, found: String}* - The  found index and the found item

Finds the last one of the items

**util.findNextOutside()**  
Arguments:

 - *String* data - The string to search
 - *Array<String\>* items - The items to find
 - *Number=0* index - The start index
 - *Array<{start: Number, end: Number}\>* exclude - The boundaries to exclude

Returns: *{index: Number, found: String}* - The found index and the found item

Finds the next one of the items outside of the given positions

**util.findlLastOutside()**  
Arguments:

 - *String* data - The string to search
 - *Array<String\>* items - The items to find
 - *Number=0* index - The end index
 - *Array<{start: Number, end: Number}\>* exclude - The boundaries to exclude

Returns: *{index: Number, found: String}* - The found index and the found item

Finds the last one of the items outside of the given positions

**util.indexOfOutside()**  
Arguments:

 - *String* data - The string to search
 - *String* item - The item to find
 - *Number=0* index - The start index
 - *Array<{start: Number, end: Number}\>* exclude - The boundaries to exclude

Returns: *Number* - The found index, or -1 if none found

Finds the next index of the item outside of the given positions

**util.splitOutside()**  
Arguments:

 - *String* data - The string to split
 - *String* separator - The separator
 - *Array<{start: Number, end: Number}\>* exclude - The boundaries to exclude

Returns: *Array<String\>* - The separated array

Spits data into an array by the separator, except if in the exclude regions

**util.findPositions()**  
Arguments:

 - *String* data - The string to search
 - *Array<{start: String, end: String}\>* items - The array of items to find

Returns: *Array<{startChar: String, endChar: String, start: Number, end: Number}\>* - The found items and locations

Finds the start/end position of each item

**util.inPosition()**  
Arguments:

 - *Number* index - The index to check
 - *Array<{start: Number, end: Number}\>* items - The items to search

Returns: *\** - The start/end position if index is inside an item, else false

Finds the index is inside one of the items.  Items should be in the same format as returned from util.findPositions.

**endsWith()**  
Arguments:

 - *String* data - The text to search
 - *String* str - The text to find

Returns: *Boolean* - Whether data ends with str

Finds if data ends with str

**pad()**  
Arguments:

 - *\** data - The text to pad
 - *Number* length - The padded length
 - *String?* pad - The text to pad with, default is space

Returns: *String*

Pads a string

**shallowClone()**  
Arguments:

 - *Object?* source - The source object
 - *Object* obj - The object to clone

Returns: *Object* - The source object

Shallowly clones the object into the source object

**setImmediate()**  
Arguments:

 - *Function* func

Uses setImmediate or setTimeout if unavailable

**now()**

Returns: *Number*

Gets the current high-resolution time in seconds, using process.hrtime or performance.now

**DeferredValue()**

Constructs: *DeferredValue*

A deferred value

### basic.util.DeferredValue

**valueOf()**

Returns: *\**

Gets the value

**value**

Type: *\**

The current value