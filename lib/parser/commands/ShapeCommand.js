var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a custom shape
 *
 * @param {String} args The arguments to the command
 */
function ShapeCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('SHAPE command requires 3 arguments');
    this.pointsLength = parsed.args[0];
    this.pointsX = parsed.args[1];
    this.pointsY = parsed.args[2];
    this.stroke = parsed.args.length > 3 ? parsed.args[3] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ShapeCommand.prototype.toString = function() {
    var args = [this.pointsLength, this.pointsX, this.pointsY];
    if (this.stroke) args.push(this.stroke);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ShapeCommand.prototype.toJSON = function() {
    return {
        pointsLength: this.pointsLength.toJSON(),
        pointsX: this.pointsX.toJSON(),
        pointsY: this.pointsY.toJSON(),
        stroke: this.stroke ? this.stroke.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ShapeCommand.prototype.execute = function(data, next) {
    var pointsLength = this.pointsLength.execute(data);
    var pointsX = this.pointsX.execute(data);
    var pointsY = this.pointsY.execute(data);
    var stroke = this.stroke ? this.stroke.execute(data) : 0;

    data.validate(pointsLength, 'number');
    if (!Array.isArray(pointsX)) throw new Error('Types mismatch');
    if (!Array.isArray(pointsY)) throw new Error('Types mismatch');

    if (pointsLength > pointsX.length || pointsLength > pointsY.length) throw new Error('Invalid array bounds');

    var points = [];
    for (var i = 0; i < pointsLength; i++) {
        var x = pointsX[i];
        var y = pointsY[i];
        data.validate(x, 'number');
        data.validate(y, 'number');
        points.push({ x: x, y: y });
    }

    ctx.write({
        command: "shape",
        args: {
            points: points,
            stroke: stroke
        }
    });

    next();
};

module.exports = ShapeCommand;