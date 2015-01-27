var ctx = require('../../IOInterface').get('draw');

/**
 * Sets the canvas to portrait and locks it
 */
function RequireportraitCommand() { }

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
RequireportraitCommand.prototype.execute = function(data, next) {
    var width = data.constants['ScreenWidth']();
    var height = data.constants['ScreenHeight']();

    if (width > height) {
        var swapped = width;
        width = height;
        height = swapped;
    }

    ctx.write({
        command: 'setsize',
        args: {
            width: width,
            height: height
        }
    });
    ctx.write({
        command: 'locksize'
    });
    next();
};

module.exports = RequireportraitCommand;