var statements = require('../statements');
var SyntaxError = require('../SyntaxError');

/**
 * Shifts data from the stack
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function ReadCommand(args) {
    var parsed = new statements.ArgumentStatement(args);
    for (var i = 0; i < parsed.args.length; i++) {
        var placeVar = parsed.args[i];
        if (!(placeVar.child instanceof statements.VariableStatement || placeVar.child instanceof statements.FunctionStatement))
            throw new SyntaxError('Expected variable');
    }
    this.items = parsed.args;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ReadCommand.prototype.toString = function() {
    return this.items.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ReadCommand.prototype.toJSON = function() {
    return {
        items: this.items
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ReadCommand.prototype.execute = function(data, next) {
    for (var i = 0; i < this.items.length; i++) {
        if (!data.private.data.length) throw new Error('No more data');
        var placeVar = this.items[i].child;

        var poppedVal = data.private.data.shift();
        data.setVariable(placeVar, poppedVal);
    }
    next();
};

module.exports = ReadCommand;