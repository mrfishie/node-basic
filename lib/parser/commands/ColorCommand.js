var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Sets the draw color of the canvas
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function ColorCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('COLOR command requires 3 arguments');
    this.red = parsed.args[0];
    this.green = parsed.args[1];
    this.blue = parsed.args[2];
    this.alpha = parsed.args.length > 3 ? parsed.args[3] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ColorCommand.prototype.toString = function() {
    var args = [this.red, this.green, this.blue];
    if (this.alpha) args.push(this.alpha);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ColorCommand.prototype.toJSON = function() {
    return {
        r: this.red.toJSON(),
        g: this.green.toJSON(),
        b: this.blue.toJSON(),
        a: this.alpha ? this.alpha.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ColorCommand.prototype.execute = function(data, next) {
    var red = this.red.execute(data);
    var green = this.green.execute(data);
    var blue = this.blue.execute(data);
    var alpha = this.alpha ? this.alpha.execute(data) : false;

    data.validate(red, 'number');
    data.validate(green, 'number');
    data.validate(blue, 'number');
    if (alpha !== false) data.validate(alpha, 'number');
    else alpha = data.constants['ColorA'];

    var oldRed = red, oldGreen = green, oldBlue = blue, oldAlpha = alpha;

    if (red > 1) red /= 255;
    if (green > 1) green /= 255;
    if (blue > 1) blue /= 255;
    if (alpha > 1) alpha /= 255;

    red = Math.max(0, Math.min(red, 1));
    green = Math.max(0, Math.min(green, 1));
    blue = Math.max(0, Math.min(blue, 1));
    alpha = Math.max(0, Math.min(alpha, 1));

    data.setConstant('ColorR', oldRed);
    data.setConstant('ColorG', oldGreen);
    data.setConstant('ColorB', oldBlue);
    data.setConstant('ColorA', oldAlpha);

    ctx.write({
        "properties": {
            "r": red,
            "g": green,
            "b": blue,
            "a": alpha
        }
    });
    next();
};

module.exports = ColorCommand;