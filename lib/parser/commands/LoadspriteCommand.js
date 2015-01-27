var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');
var ctx = require('../../IOInterface').get('draw');

/**
 * Loads a sprite from a file
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function LoadspriteCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 2) throw new SyntaxError('LOADSPRITE command requires 2 arguments');
    else if (parsed.args.length > 2 && parsed.args.length < 5) throw new SyntaxError('LOADSPRITE command requires 5 arguments');

    this.id = parsed.args[0];

    if (parsed.args.length > 2) {
        this.x1 = parsed.args[1];
        this.y1 = parsed.args[2];
        this.x2 = parsed.args[3];
        this.y2 = parsed.args[4];
    } else {
        this.fileName = parsed.args[1];
    }
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
LoadspriteCommand.prototype.toString = function() {
    if (this.x1) {
        var args = [this.id, this.x1, this.y1, this.x2, this.y2];
        return args.join(", ");
    }
    return this.id + ", " + this.fileName;
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
LoadspriteCommand.prototype.toJSON = function() {
    return {
        id: this.id.toJSON(),
        x1: this.x1 ? this.x1.toJSON() : false,
        y1: this.y1 ? this.y1.toJSON() : false,
        x2: this.x2 ? this.x2.toJSON() : false,
        y2: this.y2 ? this.y2.toJSON() : false,
        fileName: this.fileName ? this.fileName.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
LoadspriteCommand.prototype.execute = function(data, next) {
    var id = this.id.execute(data);
    data.validate(id, 'number');

    if (this.x1) {
        var x1 = this.x1.execute(data);
        var y1 = this.y1.execute(data);
        var x2 = this.x2.execute(data);
        var y2 = this.y2.execute(data);

        data.validate(x1, 'number');
        data.validate(y1, 'number');
        data.validate(x2, 'number');
        data.validate(y2, 'number');

        ctx.read(function(response, cancel) {
            if (response.command !== 'capture') return;
            cancel();

            data.private.sprites[id] = response.data;
            next();
        });
        ctx.write({
            command: 'capture',
            args: {
                x1: x1,
                y1: y1,
                x2: x2,
                y2: y2
            }
        });
    } else {
        var filename = this.fileName.execute(data);
        data.validate(filename, 'string');

        var driveIndex = filename.indexOf(':');
        var drive = 'A';
        if (driveIndex !== -1) {
            drive = filename.substring(0, driveIndex);
            filename = filename.substring(driveIndex + 1);
        }

        filesystem.drive(drive, function (fs) {
            var file = fs.open(filename);
            var imageLine = file.nextLine();
            if (file.eof || !imageLine.length) throw new Error('Invalid image file');

            var img = new Image();
            img.src = imageLine;

            data.private.sprites[id] = img;
            next();
        });
    }
};

module.exports = LoadspriteCommand;