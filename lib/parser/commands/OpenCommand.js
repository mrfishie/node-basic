var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');

/**
 * Opens a file in a pointer
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function OpenCommand(args, define) {
    var lowerArgs = args.toLowerCase();
    var forIndex = lowerArgs.indexOf(' for ');
    if (forIndex === -1) throw new SyntaxError('OPEN without FOR');
    var filename = new statements.ExpressionStatement(args.substring(0, forIndex).trim(), define);

    var asIndex = lowerArgs.indexOf(' as ');
    if (asIndex === -1) throw new SyntaxError('OPEN without AS');
    var type = args.substring(forIndex + 5, asIndex).trim().toLowerCase();
    if (type !== 'input' && type !== 'output' && type !== 'append') throw new SyntaxError('Invalid mode');

    var pointer = new statements.ExpressionStatement(args.substring(asIndex + 4).trim(), define);
    if (!(pointer.child instanceof statements.PointerStatement)) throw new SyntaxError('Expected pointer');

    this.filename = filename;
    this.type = type;
    this.pointer = pointer;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
OpenCommand.prototype.toString = function() {
    return this.filename.toString() + " FOR " + this.type.toUpperCase() + " AS " + this.pointer.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
OpenCommand.prototype.toJSON = function() {
    return {
        filename: this.filename.toJSON(),
        type: this.type,
        pointer: this.pointer.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
OpenCommand.prototype.execute = function(data, next) {
    var filename = this.filename.execute(data);
    data.validate(filename, 'string');

    var driveIndex = filename.indexOf(':');
    var drive = 'A';
    if (driveIndex !== -1) {
        drive = filename.substring(0, driveIndex);
        filename = filename.substring(driveIndex + 1);
    }

    var pointer = this.pointer.child, mode = this.type;
    filesystem.drive(drive, function(fs) {
        var file = fs.open(filename);
        file.mode = mode;
        if (mode === 'output') file.clear();
        data.setPointer(pointer, file);
        next();
    });
};

module.exports = OpenCommand;