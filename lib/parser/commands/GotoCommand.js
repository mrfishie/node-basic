var SyntaxError = require('../SyntaxError');
var util = require('../../util');
var setImmediate = util.setImmediate;

/**
 * Goes to a label
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function GotoCommand(args) {
    if (!args.length) throw new SyntaxError('Label required');
    this.label = args;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
GotoCommand.prototype.toString = function() {
    return this.label;
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
GotoCommand.prototype.toJSON = function() {
    return {
        label: this.label
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
GotoCommand.prototype.execute = function(data, next) {
    data.gotoLabel(this.label);
    setImmediate(next);
};

module.exports = GotoCommand;