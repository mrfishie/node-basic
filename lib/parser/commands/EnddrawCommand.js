var ctx = require('../../IOInterface').get('draw');

/**
 * Begins canvas caching
 *
 * @constructor
 */
function EnddrawCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
EnddrawCommand.prototype.execute = function(data, next) {
    ctx.write({
        command: "flushCache"
    });
    next();
};

module.exports = EnddrawCommand;