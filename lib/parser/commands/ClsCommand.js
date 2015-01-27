var ctx = require('../../IOInterface').get('draw');

/**
 * Clears the screen
 *
 * @param {String} args The arguments to the command
 */
function ClsCommand(args) {
    var lowerArgs = args.toLowerCase();
    this.tty = lowerArgs !== 'gfx';
    this.gfx = lowerArgs !== 'tty';
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ClsCommand.prototype.toString = function() {
    if (this.tty && !this.gfx) return 'TTY';
    if (this.gfx && !this.tty) return 'GFX';
    return '';
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ClsCommand.prototype.toJSON = function() {
    return {
        tty: this.tty,
        gfx: this.gfx
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ClsCommand.prototype.execute = function(data, next) {
    if (this.tty) {
        if (process.browser) {
            ctx.write({
                command: "clear",
                args: {
                    type: "tty"
                }
            });
        } else console.log((new Array(process.stdout.rows + 1)).join("\n"));
    }
    if (this.gfx && process.browser) {
        ctx.write({
            command: "clear",
            args: {
                type: "gfx"
            }
        });
    }

    next();
};

module.exports = ClsCommand;