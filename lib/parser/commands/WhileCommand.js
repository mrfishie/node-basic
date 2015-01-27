var statements = require('../statements');
var util = require('../../util');
var setImmediate = util.setImmediate;

/**
 * Iterates over the commands body until the condition is true
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function WhileCommand(args, define) {
    var parsed = new statements.ArgumentStatement(args, {
        separator: false
    });

    this.condition = parsed.args[0];
    this.block = define({
        start: 'WHILE',
        end: 'WEND'
    });
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
WhileCommand.prototype.toString = function() {
    return this.condition.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
WhileCommand.prototype.toJSON = function() {
    return {
        condition: this.condition.toJSON(),
        block: this.block.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
WhileCommand.prototype.execute = function(data, next) {
    var shouldRun = this.condition.execute(data);
    if (!shouldRun) {
        data.cursor = this.block.end + 1;
        next();
    } else setImmediate(next);
};

module.exports = WhileCommand;