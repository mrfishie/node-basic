var ctx = require('../../IOInterface').get('draw');

/**
 * Begins canvas caching
 *
 * @constructor
 */
function BegindrawCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
BegindrawCommand.prototype.execute = function(data, next) {
    ctx.write({
        command: "startCache"
    });
    next();
};

module.exports = BegindrawCommand;