var statements = require('../statements');
var SyntaxError = require('../SyntaxError');

/**
 * Terminates the program
 *
 * @constructor
 */
function EndCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
EndCommand.prototype.execute = function(data, next) {
    data.terminate();
    next();
};

module.exports = EndCommand;