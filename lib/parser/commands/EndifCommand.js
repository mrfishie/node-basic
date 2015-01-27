/**
 * End of an IF block
 *
 * @constructor
 */
function EndifCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
EndifCommand.prototype.execute = function(data, next) {
    next();
};

module.exports = EndifCommand;