var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Sets the color of the background
 *
 * @param {String} args The arguments to the command
 */
function BcolorCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('BCOLOR command requires 3 arguments');
    this.red = parsed.args[0];
    this.green = parsed.args[1];
    this.blue = parsed.args[2];
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
BcolorCommand.prototype.toString = function() {
    return [this.red, this.green, this.blue].join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
BcolorCommand.prototype.toJSON = function() {
    return {
        r: this.red.toJSON(),
        g: this.green.toJSON(),
        b: this.blue.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
BcolorCommand.prototype.execute = function(data, next) {
    var red = this.red.execute(data);
    var green = this.green.execute(data);
    var blue = this.blue.execute(data);

    data.validate(red, 'number');
    data.validate(green, 'number');
    data.validate(blue, 'number');

    var oldRed = red, oldGreen = green, oldBlue = blue;

    if (red > 1) red /= 255;
    if (green > 1) green /= 255;
    if (blue > 1) blue /= 255;

    red = Math.max(0, Math.min(red, 1));
    green = Math.max(0, Math.min(green, 1));
    blue = Math.max(0, Math.min(blue, 1));

    data.setConstant('BColorR', oldRed);
    data.setConstant('BColorG', oldGreen);
    data.setConstant('BColorB', oldBlue);

    ctx.write({
        "command": "bcolor",
        "args": {
            "r": red,
            "g": green,
            "b": blue
        }
    });
    next();
};

module.exports = BcolorCommand;