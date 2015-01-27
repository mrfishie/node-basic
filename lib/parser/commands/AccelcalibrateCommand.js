var ctx = require('../../IOInterface').get('draw');

/**
 * Calibrates the accelerometer (mouse)
 */
function AccelcalibrateCommand() { }

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
AccelcalibrateCommand.prototype.execute = function(data, next) {
    ctx.write({
        command: 'accel',
        args: {
            calibrate: true
        }
    });
    next();
};

module.exports = AccelcalibrateCommand;