/**
 * Returns to a GOSUB
 *
 * @constructor
 */
function ReturnCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ReturnCommand.prototype.execute = function(data, next) {
    data.returnLabel();
    next();
};

module.exports = ReturnCommand;