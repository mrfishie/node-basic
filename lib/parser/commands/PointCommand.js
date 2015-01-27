var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a point
 *
 * @param {String} args The arguments to the command
 */
function PointCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 2) throw new SyntaxError('POINT command requires 2 arguments');
    this.x = parsed.args[0];
    this.y = parsed.args[1];
    if (parsed.args.length > 2) this.size = parsed.args[2];
    else this.size = false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
PointCommand.prototype.toString = function() {
    var args = [this.x, this.y];
    if (this.size) args.push(this.size);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
PointCommand.prototype.toJSON = function() {
    return {
        x: this.x.toJSON(),
        y: this.y.toJSON(),
        size: this.size ? this.size.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
PointCommand.prototype.execute = function(data, next) {
    var x = this.x.execute(data);
    var y = this.y.execute(data);
    var size = this.size ? this.size.execute(data) : 1;

    data.validate(x, 'number');
    data.validate(y, 'number');
    data.validate(size, 'number');

    if (size < 1) throw new Error('Size out of bounds');
    ctx.write({
        command: "point",
        args: {
            "x": x,
            "y": y,
            "size": size
        }
    });

    next();
};

module.exports = PointCommand;