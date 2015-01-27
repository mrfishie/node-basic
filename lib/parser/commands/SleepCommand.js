var statements = require('../statements');
var SyntaxError = require('../SyntaxError');

/**
 * Sleeps for a certain amount of seconds
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function SleepCommand(args, define) {
    this.duration = new statements.ExpressionStatement(args, define);
    if (this.duration.error) throw this.duration.error;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
SleepCommand.prototype.toString = function() {
    return this.duration.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
SleepCommand.prototype.toJSON = function() {
    return {
        duration: this.duration.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
SleepCommand.prototype.execute = function(data, next) {
    var duration = this.duration.execute(data);
    data.validate(duration, 'number');

    setTimeout(function() {
        next();
    }, duration * 1000);
};

module.exports = SleepCommand;