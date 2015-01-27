var statements = require('../statements');
var util = require('../../util');
var SyntaxError = require('../SyntaxError');
/**
 * Executes the body if the condition is true
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function IfCommand(args, define) {
    if (util.endsWith(args.toLowerCase(), ' then')) args = args.slice(0, args.length - 5).trim();
    else throw new SyntaxError('IF has no THEN');

    var parsed = new statements.ArgumentStatement(args, {
        separator: false
    }, define);

    this.condition = parsed.args[0];
    this.block = define({
        start: 'IF',
        then: 'ELSE',
        end: 'ENDIF'
    });
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
IfCommand.prototype.toString = function() {
    return this.condition.toString() + " THEN";
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
IfCommand.prototype.toJSON = function() {
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
IfCommand.prototype.execute = function(data, next) {
    var shouldRun = this.condition.execute(data);
    if (!shouldRun) {
        if (this.block.has('ELSE')) data.cursor = this.block.next('ELSE') + 1;
        else data.cursor = this.block.end;
    }
    next();
};

module.exports = IfCommand;