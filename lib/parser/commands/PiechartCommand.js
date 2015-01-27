var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a piechart
 *
 * @param {String} args The arguments to the command
 */
function PiechartCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 8) throw new SyntaxError('PIECHART command requires 8 arguments');
    this.x = parsed.args[0];
    this.y = parsed.args[1];
    this.r = parsed.args[2];
    this.itemsLength = parsed.args[3];
    this.percentages = parsed.args[4];
    this.itemsRed = parsed.args[5];
    this.itemsGreen = parsed.args[6];
    this.itemsBlue = parsed.args[7];
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
PiechartCommand.prototype.toString = function() {
    var args = [this.x, this.y, this.r, this.itemsLength, this.percentages, this.itemsRed, this.itemsGreen, this.itemsBlue];
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
PiechartCommand.prototype.toJSON = function() {
    return {
        x: this.x.toJSON(),
        y: this.y.toJSON(),
        r: this.r.toJSON(),
        itemsLength: this.itemsLength.toJSON(),
        percentages: this.percentages.toJSON(),
        itemsRed: this.itemsRed.toJSON(),
        itemsGreen: this.itemsGreen.toJSON(),
        itemsBlue: this.itemsBlue.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
PiechartCommand.prototype.execute = function(data, next) {
    var x = this.x.execute(data);
    var y = this.y.execute(data);
    var r = this.r.execute(data);
    var itemsLength = this.itemsLength.execute(data);
    var percentages = this.percentages.execute(data);
    var itemsRed = this.itemsRed.execute(data);
    var itemsGreen = this.itemsGreen.execute(data);
    var itemsBlue = this.itemsBlue.execute(data);

    data.validate(x, 'number');
    data.validate(y, 'number');
    data.validate(r, 'number');
    data.validate(itemsLength, 'number');
    if (!Array.isArray(percentages)) throw new Error('Types mismatch');
    if (!Array.isArray(itemsRed)) throw new Error('Types mismatch');
    if (!Array.isArray(itemsGreen)) throw new Error('Types mismatch');
    if (!Array.isArray(itemsBlue)) throw new Error('Types mismatch');

    if (itemsLength > percentages.length ||
            itemsLength > itemsRed.length ||
            itemsLength > itemsGreen.length ||
            itemsLength > itemsBlue.length) {
        throw new Error('Invalid array bounds');
    }

    var items = [];
    for (var i = 0; i < itemsLength; i++) {
        var size = percentages[i];
        var red = itemsRed[i];
        var green = itemsGreen[i];
        var blue = itemsBlue[i];
        data.validate(size, 'number');
        data.validate(red, 'number');
        data.validate(green, 'number');
        data.validate(blue, 'number');
        items.push({
            size: size,
            r: red,
            g: green,
            b: blue
        });
    }

    ctx.write({
        command: "piechart",
        args: {
            items: items,
            x: x,
            y: y,
            r: r
        }
    });

    next();
};

module.exports = PiechartCommand;