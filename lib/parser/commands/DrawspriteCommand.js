var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a sprite
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function DrawspriteCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('DRAWSPRITE command requires 3 arguments');
    this.id = parsed.args[0];
    this.x = parsed.args[1];
    this.y = parsed.args[2];
    this.scale = parsed.args.length === 4 ? parsed.args[3] : false;
    this.rotation = parsed.args.length === 5 ? parsed.args[4] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
DrawspriteCommand.prototype.toString = function() {
    var args = [this.id, this.x, this.y];
    if (this.scale) args.push(this.scale);
    if (this.rotation) args.push(this.rotation);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
DrawspriteCommand.prototype.toJSON = function() {
    return {
        id: this.id.toJSON(),
        x: this.x.toJSON(),
        y: this.y.toJSON(),
        scale: this.scale ? this.scale.toJSON() : false,
        rotation: this.rotation ? this.rotation.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
DrawspriteCommand.prototype.execute = function(data, next) {
    var id = this.id.execute(data);
    var x = this.x.execute(data);
    var y = this.y.execute(data);
    var scale = this.scale ? this.scale.execute(data) : 1;
    var rotation = this.rotation ? this.rotation.execute(data) : 0;

    data.validate(id, 'number');
    data.validate(x, 'number');
    data.validate(y, 'number');
    data.validate(scale, 'number');
    data.validate(rotation, 'number');

    if (!data.private.sprites[id]) throw new Error('Invalid sprite ID');
    var img = data.private.sprites[id];

    ctx.print({
        command: 'sprite',
        args: {
            x: x,
            y: y,
            scale: scale,
            rotation: rotation,
            sprite: img
        }
    });

    next();
};

module.exports = DrawspriteCommand;