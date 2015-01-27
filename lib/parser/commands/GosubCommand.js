var SyntaxError = require('../SyntaxError');
var util = require('../../util');
var setImmediate = util.setImmediate;

/**
 * Goes to a label and returns on RETURN
 *
 * @param {String} args the arguments to the command
 * @constructor
 */
function GosubCommand(args) {
    if (!args.length) throw new SyntaxError('Label required');
    this.label = args;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
GosubCommand.prototype.toString = function() {
    return this.label;
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
GosubCommand.prototype.toJSON = function() {
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
GosubCommand.prototype.execute = function(data, next) {
    data.gosubLabel(this.label);
    setImmediate(next);
};

module.exports = GosubCommand;