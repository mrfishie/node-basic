var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Reads a pixel at a certain location
 *
 * @param {String} args The arguments to the command
 */
function ReadpixelCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 2) throw new SyntaxError('READPIXEL command requires 2 arguments');
    this.x = parsed.args[0];
    this.y = parsed.args[1];
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ReadpixelCommand.prototype.toString = function() {
    return this.x.toString() + ", " + this.y.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ReadpixelCommand.prototype.toJSON = function() {
    return {
        x: this.x.toJSON(),
        y: this.y.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ReadpixelCommand.prototype.execute = function(data, next) {
    var x = this.x.execute(data);
    var y = this.y.execute(data);

    data.validate(x, 'number');
    data.validate(y, 'number');

    ctx.read(function(response, cancel) {
        if (response.command !== "readpixel") return;
        cancel();

        var r = response.data.r;
        var g = response.data.g;
        var b = response.data.b;

        data.setConstant('ReadPixelR', r);
        data.setConstant('ReadPixelG', g);
        data.setConstant('ReadPixelB', b);
        next();
    });
    ctx.write({
        command: "readpixel",
        args: {
            x: x,
            y: y
        }
    });
};