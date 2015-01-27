var ctx = require('../../IOInterface').get('draw');

/**
 * Locks the size of the canvas
 */
function LockorientationCommand() { }

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
LockorientationCommand.prototype.execute = function(data, next) {
    ctx.write({
        command: 'locksize'
    });
    next();
};

module.exports = LockorientationCommand;