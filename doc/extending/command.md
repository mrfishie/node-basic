# node-basic documentation
## Adding a command

Each of the command files are located in the `lib/parser/commands` folder. For this tutorial, we will create a command that resizes the rendering canvas.

Create a file called `ResizeCommand.js` in `lib/parser/commands`. This will be the file we will do most of our work in.

The barebones template below contains a structure for creating any command. Copy this into your file.

	var statements = require('../statements');
	var SyntaxError = require('../SyntaxError');
	var ctx = require('../../IOInterface').get('draw');
	
	/**
	 * Resizes the canvas
	 * 
	 * @param {String} args The arguments to the command
	 * @constructor	 
	 */
	function ResizeCommand(args) {
	}
	
	/**
	 * Converts the command arguments to a string
	 * 
	 * @returns {string}
	 */
	ResizeCommand.prototype.toString = function() {
	};
	
	/**
	 * Converts the command to JSON
	 * 
	 * @returns {Object}
	 */
	ResizeCommand.prototype.toJSON = function() {
	};
	
	/**
	 * Executes the command
	 * 
	 * @param {ExecutionContext} data
	 * @param {Function} next
	 */
	ResizeCommand.prototype.execute = function(data, next) {
	};
	
	module.exports = ResizeCommand;
	
Here, we import the statements and SyntaxError files, then create a command class that implements the `ICommand` interface (see the parser API reference). We also import a variable called `ctx`, which will be explained later.

Our commands arguments will follow a normal comma-separated format, so we can use the provided ArgumentStatement class. Put this in the `ResizeCommand` constructor:

	var parsed = new statements.ArgumentStatement(args);

Great! Now we want to make sure that we have the right number of arguments, and if not, show a syntax error. We need two arguments: width and height. The ArgumentStatement class constructor actually parses the arguments, and then provides an array of ExpressionStatements in its `args` property.

	if (parsed.args.length < 2) throw new SyntaxError('RESIZE command requires 2 arguments');

Now we can set the properties of the class instance.

	this.width = parsed.args[0];
	this.height = parsed.args[1];

node-basic requires two methods in each command for serialization into different formats: `toString` and `toJSON`. `toString` generates a string version of the parsed commands, and `toJSON` generates a JSON-stringify-able object containing all parsing information. If `toString` is not included, it will use an empty string as the arguments instead. If `toJSON` is omitted, it will use an empty object.

Since our command has arguments and does some parsing (the ArgumentStatement), we need to code both of these methods.

In the `toString` method, write the following code:

	return this.width.toString() + ", " + this.height.toString();

Both the width and height properties are not Javascript primitives (like a number or string). They are actually instances of ExpressionStatement, which represents any expression. ExpressionStatement has a `toString` method which we can call to get a string version of the expression, so here we simply add them back together.

`toJSON` is pretty similar:

	return {
		width: this.width.toJSON(),
		height: this.height.toJSON()
	};

Future versions of node-basic will have a system that converts the JSON object back to an AST, and each statement will be passed the function they return from here. This currently is unimplemented however, so this is all the work we have to do for that.

Next is the `execute` method. This is where the `ctx` variable comes in. Since node-basic is designed to be flexible and be able to run in different environments with different graphics capabilities and libraries, graphic operations cannot be done by simply calling the Javascript APIs. Instead, the IOInterface class provides the ability to add an interface, and then use it somewhere else in the code. In this case, we are using the `draw` interface (hence the `.get('draw')`), which is being defined somewhere else, in the platform-dependent code. We will show how to do this soon, but first we need to perform some validation. Add the following to your `execute` method:

	var width = this.width.execute(data);
	var height = this.height.execute(data);
	
	data.validate(width, 'number');
	data.validate(height, 'number');

node-basic uses what's called an execution context. This contains information and functions to do with the current execution, which can be used to create, change, or get variables, or move the execution cursor around the AST. In this case, we first pass it to the ExpressionStatement's `execute` method, and then use it to perform some validion. The ExecutionContext class contains a handy `validate` method, which simply validates a variable against a type, and if they don't match, throws an error. Any errors thrown during parsing or executing will be caught and displayed, so we don't need to worry about catching anything here. Now, lets do the resizing.

	ctx.write({
		command: 'setsize',
		args: {
			width: width,
			height: height
		}
	});
	next();

`ctx.write` 'writes' a message to the corresponding interface. In this case, we pass an object containing the command name and arguments. This command is then handled by the platform drawing code. There's nothing else we have to do, so we call the `next` function (passed as an argument) to continue to the next command. It's important that we include this, because otherwise node-basic will hang on the command and stop executing. The `next` function is there to allow for asynchronous commands, like file or timing commands.

To finally 'register' the command, open the `lib/parser/commands/index.js` file. Here, we just need to add the line:

	exports.resize = require('./ResizeCommand');

This tells node-basic about our command. Now, open up node-basic in a graphical environment, and try out your new command!