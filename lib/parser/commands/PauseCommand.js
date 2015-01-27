var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var rl = require('../../IOInterface').getDefault();

/**
 * Pauses execution until RETURN is pressed
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function PauseCommand(args, define) {
    if (args.length) {
        this.message = new statements.ExpressionStatement(args, define);
        if (this.message.error) throw this.message.error;
    } else this.message = new statements.StringStatement("[<< Paused, Press RETURN to Continue >>]");
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
PauseCommand.prototype.toString = function() {
    return this.message.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
PauseCommand.prototype.toJSON = function() {
    return {
        message: this.message.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
PauseCommand.prototype.execute = function(data, next) {
    var message = this.message.execute(data);
    data.validate(message, 'string');

    rl.question(message, function(answer) {
        next();
    });
};

module.exports = PauseCommand;