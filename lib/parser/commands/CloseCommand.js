var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');

/**
 * Closes a file in a pointer
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function CloseCommand(args, define) {
    var parsed = new statements.ExpressionStatement(args, define);
    if (!(parsed.child instanceof statements.PointerStatement)) throw new SyntaxError('Expected pointer');

    this.pointer = parsed;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
CloseCommand.prototype.toString = function() {
    return this.pointer.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
CloseCommand.prototype.toJSON = function() {
    return {
        pointer: this.pointer.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
CloseCommand.prototype.execute = function(data, next) {
    var file = this.pointer.execute(data);
    if (!(file instanceof filesystem.File)) throw new Error('Expected file');
    data.setPointer(this.pointer.child, false);

    next();
};

module.exports = CloseCommand;