var statements = require('./');
var util = require('../../util');

/**
 * Represents a function call
 *
 * @param {String} name The name of the function
 * @param {String} args The arguments to the function
 */
function FunctionStatement(name, args) {
    if (name[name.length - 1] === '$') {
        this.type = 'string';
        this.name = name.substring(0, name.length - 1);
    } else {
        this.type = 'number';
        this.name = name;
    }

    var positions = util.findPositions(args, [
        { 'start': '"', 'end': '"' },
        { 'start': '(', 'end': ')' }
    ]);
    var argList = util.splitOutside(args, ",", positions);

    this.args = [];
    for (var i = 0; i < argList.length; i++) {
        this.args.push(new statements.ExpressionStatement(argList[i].trim()));
    }
}

/**
 * Outputs executable code that represents the function call
 *
 * @returns {string}
 */
FunctionStatement.prototype.toString = function() {
    var args = [];
    for (var i = 0; i < this.args.length; i++) {
        args.push(this.args[i].toString());
    }

    return this.name + (this.type === 'string' ? '$' : '') + '(' + args.join(', ') + ')';
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
FunctionStatement.prototype.toJSON = function() {
    return {
        type: "FunctionStatement",
        name: this.name,
        varType: this.type,
        args: this.args
    };
};

/**
 * Gets the value of the function
 *
 * @param {ExecutionContext} data The execution data context
 * @returns {String|Number} The value of the function
 */
FunctionStatement.prototype.execute = function(data) {
    var args = [];
    for (var i = 0; i < this.args.length; i++) {
        var arg = this.args[i];
        if (arg.error) throw arg.error;

        args.push(arg.execute(data));
    }
    return data.callFunction(this, args);
};

module.exports = FunctionStatement;