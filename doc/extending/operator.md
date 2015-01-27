# node-basic documentation
## Adding an operator

An operator is anything used in an expression in BASIC. Most operators have two 'operands', one on the left and one on the right. Each operator has a 'precedence', which is the order in which the operators are executed in. BASIC follows the normal order of BOMDAS.

Each of the operator files are located in the `lib/parser/statements/operators` folder. In this tutorial, you will learn how to create an operator that computes a number to a certain root.

Create a file called `RootOperator.js` in `lib/parser/statements/operators`. This will be the file we will do most of our work in.

The barebones template below contains a structure for creating any operator. Copy this into your file.

	/**
	 * Computes a number to a certain root
	 * 
	 * @param {ExpressionStatement} lexpr Left expression
	 * @param {ExpressionStatement} rexpr Right expression
	 */
	function RootOperator(lexpr, rexpr) {
		this.lexpr = lexpr;
		this.rexpr = rexpr;
	}
	
	/**
	 * Converts the operator to executable code
	 * 
	 * @returns {String}
	 */
	RootOperator.prototype.toString = function() {
	};
	
	/**
	 * Converts the operator to JSON
	 * 
	 * @returns {Object}
	 */
	RootOperator.prototype.toJSON = function() {
	};
	
	/**
	 * Executes the operator
	 * 
	 * @param {ExecutionContext} data
	 * @returns {Number} The resulting value
	 */
	RootOperator.prototype.execute = function(data) {
	};
	
	module.exports = RootOperator;

This format is very similar to the class format used for commands. The code in both the `toString` and `toJSON` methods is pretty self explanatory:

**RootOperator.prototype.toString**

	return this.lexpr.toString() + ' ~ ' + this.rexpr.toString();

Here we simply stringify the two expressions, and place them around our operator character, the tilda (~).

**RootOperator.prototype.toJSON**

	return {
		type: "~",
		lexpr: this.lexpr.toJSON(),
		rexpr: this.rexpr.toJSON()
	};

Here we return an object with three different properties. The first one, `type` is required and specifies the name as found in the `operators/index.js` file. In the future this will be used for operator deserialization.

Now lets get on to the actual computing, in the `execute` method. This method is passed the execution context, and should return a number or string corresponding to the computed value. In this case, we will always return a number.

	var lval = this.lexpr.execute(data);
	var rval = this.rexpr.execute(data);
	
	data.validate(lval, 'number');
	data.validate(rval, 'number');
	
	return Math.pow(lval, 1 / rval);

Here, we execute the two expressions, validate them, and then compute the results. Putting a number to the power of 1 divided by n is the same as computing the nth root of the number.

Now we just need to 'register' our operator. For this, open up the `index.js` file in the `lib/parser/statements/operators` folder.

This file contains each operator grouped in 'precedences'. Note that they are in reverse order. In this case, we want our operator to have the same precedence as the power operator, so we would change that object to look like:

	{
		'^': require('./PowerOperator'),
		'~': require('./RootOperator')
	}

Note that the key name for our operator (in this case '~') should be the same as the type in the `toJSON` method. Operator names should also all be in lowercase.

Great! Now, open up the node-basic REPL and try out your new operator!