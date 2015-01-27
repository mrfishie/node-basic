var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a line
 *
 * @param {String} args The arguments to the command
 */
function LineCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 4) throw new SyntaxError('LINE command requires 4 arguments');
    this.x1 = parsed.args[0];
    this.y1 = parsed.args[1];
    this.x2 = parsed.args[2];
    this.y2 = parsed.args[3];
    this.width = parsed.args.length > 4 ? parsed.args[4] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
LineCommand.prototype.toString = function() {
    var args = [this.x1, this.y1, this.x2, this.y2];
    if (this.width) args.push(this.width);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
LineCommand.prototype.toJSON = function() {
    return {
        x1: this.x1.toJSON(),
        y1: this.y1.toJSON(),
        x2: this.x2.toJSON(),
        y2: this.y2.toJSON(),
        width: this.width ? this.width.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
LineCommand.prototype.execute = function(data, next) {
    var x1 = this.x1.execute(data);
    var y1 = this.y1.execute(data);
    var x2 = this.x2.execute(data);
    var y2 = this.y2.execute(data);
    var width = this.width ? this.width.execute(data) : 1;

    data.validate(x1, 'number');
    data.validate(y1, 'number');
    data.validate(x2, 'number');
    data.validate(y2, 'number');
    data.validate(width, 'number');

    if (width < 1) throw new Error('Width out of bounds');
    ctx.write({
        command: "line",
        args: {
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2,
            width: width
        }
    });

    next();
};

module.exports = LineCommand;