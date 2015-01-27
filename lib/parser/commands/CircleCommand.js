var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a filled or stroked circle
 *
 * @param {String} args The arguments to the command
 */
function CircleCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('CIRCLE command requires 3 arguments');
    this.x = parsed.args[0];
    this.y = parsed.args[1];
    this.radius = parsed.args[2];
    this.stroke = parsed.args.length > 3 ? parsed.args[3] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
CircleCommand.prototype.toString = function() {
    var args = [this.x, this.y, this.radius];
    if (this.stroke) args.push(this.stroke);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
CircleCommand.prototype.toJSON = function() {
    return {
        x: this.x.toJSON(),
        y: this.y.toJSON(),
        radius: this.radius.toJSON(),
        stroke: this.stroke ? this.stroke.toJSON() : false
    };
};


/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
CircleCommand.prototype.execute = function(data, next) {
    var x = this.x.execute(data);
    var y = this.y.execute(data);
    var radius = this.radius.execute(data);
    var stroke = this.stroke ? this.stroke.execute(data) : 0;

    data.validate(x, 'number');
    data.validate(y, 'number');
    data.validate(radius, 'number');
    data.validate(stroke, 'number');

    ctx.write({
        command: "circle",
        args: {
            x: x,
            y: y,
            radius: radius,
            stroke: stroke
        }
    });

    next();
};

module.exports = CircleCommand;