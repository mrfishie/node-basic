var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');

/**
 * Saves a sprite to a file
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function SavespriteCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 2) throw new SyntaxError('SAVESPRITE command requires 2 arguments');

    this.id = parsed.args[0];
    this.fileName = parsed.args[1];
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
SavespriteCommand.prototype.toString = function() {
    return this.id + ", " + this.fileName;
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
SavespriteCommand.prototype.toJSON = function() {
    return {
        id: this.id.toJSON(),
        fileName: this.fileName.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
SavespriteCommand.prototype.execute = function(data, next) {
    var id = this.id.execute(data);
    var filename = this.fileName.execute(data);

    data.validate(id, 'number');
    data.validate(filename, 'string');

    if (!data.private.sprites[id]) throw new Error('Invalid sprite ID');
    var img = data.private.sprites[id];
    var dataCode = img.toDataUrl();

    var driveIndex = filename.indexOf(':');
    var drive = 'A';
    if (driveIndex !== -1) {
        drive = filename.substring(0, driveIndex);
        filename = filename.substring(driveIndex + 1);
    }

    filesystem.drive(drive, function(fs) {
        var file = fs.open(filename);
        file.clear();
        file.write(dataCode);
        file.save();

        next();
    });
};

module.exports = SavespriteCommand;