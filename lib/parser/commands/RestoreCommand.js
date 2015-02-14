var SyntaxError = require('../SyntaxError');
var statements = require('../statements');
var util = require('../../util');
var setImmediate = util.setImmediate;

/**
 * Goes to a label, then returns when a non-DATA command is encountered
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function RestoreCommand(args) {
    if (!args.length) throw new SyntaxError('Label required');
    this.label = args;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
RestoreCommand.prototype.toString = function() {
    return this.label;
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
RestoreCommand.prototype.toJSON = function() {
    return {
        label: this.label
    }
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
RestoreCommand.prototype.execute = function(data, next) {
    data.private.data = [];
    data.gosubLabel(this.label);

    var isFirstLine = true;

    function lineEncounter(statement) {
        if (isFirstLine) {
            isFirstLine = false;
            return;
        }

        var isRestoreLine = ((statement instanceof statements.EmptyStatement && statement.type !== 'label') ||
            (statement instanceof statements.CommandStatement && statement.name === 'data'));

        if (!isRestoreLine) {
            data.removeListener('line', lineEncounter);
            data.returnLabel();
            return;
        }

        if (data.root.length <= data.cursor + 1) {
            data.once('beforeLine', function() {
                data.removeListener('line', lineEncounter);
                data.returnLabel();
            });
        }
    }
    data.on('line', lineEncounter);
    next();
};

module.exports = RestoreCommand;