var ctx = require('../../IOInterface').get('draw');

/**
 * Sets the canvas to landscape and locks it
 */
function RequirelandscapeCommand() { }

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
RequirelandscapeCommand.prototype.execute = function(data, next) {
    var width = data.constants['ScreenWidth']();
    var height = data.constants['ScreenHeight']();

    if (height > width) {
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

module.exports = RequirelandscapeCommand;