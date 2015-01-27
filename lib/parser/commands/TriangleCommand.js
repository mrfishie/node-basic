var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a filled or stroked triangle
 *
 * @param {String} args The arguments to the command
 */
function TriangleCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 6) throw new SyntaxError('TRIANGLE command requires 6 arguments');
    this.x1 = parsed.args[0];
    this.y1 = parsed.args[1];
    this.x2 = parsed.args[2];
    this.y2 = parsed.args[3];
    this.x3 = parsed.args[4];
    this.y3 = parsed.args[5];
    this.stroke = parsed.args.length > 6 ? parsed.args[6] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
TriangleCommand.prototype.toString = function() {
    var args = [this.x1, this.y1, this.x2, this.y2, this.x3, this.y3];
    if (this.stroke) args.push(this.stroke);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
TriangleCommand.prototype.toJSON = function() {
    return {
        x1: this.x1.toJSON(),
        y1: this.y1.toJSON(),
        x2: this.x2.toJSON(),
        y2: this.y2.toJSON(),
        x3: this.x3.toJSON(),
        y3: this.y3.toJSON(),
        stroke: this.stroke ? this.stroke.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
TriangleCommand.prototype.execute = function(data, next) {
    var x1 = this.x1.execute(data);
    var y1 = this.y1.execute(data);
    var x2 = this.x2.execute(data);
    var y2 = this.y2.execute(data);
    var x3 = this.x3.execute(data);
    var y3 = this.y3.execute(data);
    var stroke = this.stroke ? this.stroke.execute(data) : 0;

    data.validate(x1, 'number');
    data.validate(y1, 'number');
    data.validate(x2, 'number');
    data.validate(y2, 'number');
    data.validate(x3, 'number');
    data.validate(y3, 'number');
    data.validate(stroke, 'number');

    ctx.write({
        command: "triangle",
        args: {
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2,
            x3: x3,
            y3: y3,
            stroke: stroke
        }
    });

    next();
};

module.exports = TriangleCommand;