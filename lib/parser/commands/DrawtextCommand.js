var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws text either at a point or inside a rectangle
 *
 * @param {String} args The arguments to the command
 */
function DrawtextCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('DRAWTEXT command requires 3 arguments');
    else if (parsed.args.length > 3 && parsed.args.length < 5) throw new SyntaxError('DRAWTEXT command requires 5 arguments');

    this.text = parsed.args[0];
    this.x1 = parsed.args[1];
    this.y1 = parsed.args[2];
    if (parsed.args.length > 3) {
        this.x2 = parsed.args[3];
        this.y2 = parsed.args[4];
    } else {
        this.x2 = false;
        this.y2 = false;
    }
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
DrawtextCommand.prototype.toString = function() {
    var args = [this.text, this.x1, this.y1];
    if (this.x2) args.push(this.x2, this.y2);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
DrawtextCommand.prototype.toJSON = function() {
    return {
        text: this.text.toJSON(),
        x1: this.x1.toJSON(),
        y1: this.y1.toJSON(),
        x2: this.x2 ? this.x2.toJSON() : false,
        y2: this.y2 ? this.y2.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
DrawtextCommand.prototype.execute = function(data, next) {
    var text = this.text.execute(data);
    var x1 = this.x1.execute(data);
    var y1 = this.y1.execute(data);
    data.validate(text, 'string');
    data.validate(x1, 'number');
    data.validate(y1, 'number');

    var x2, y2 = false;
    if (this.x2) {
        x2 = this.x2.execute(data);
        y2 = this.y2.execute(data);
        data.validate(x2, 'number');
        data.validate(y2, 'number');
    }

    ctx.write({
        command: "text",
        args: {
            text: text,
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2
        }
    });

    next();
};

module.exports = DrawtextCommand;