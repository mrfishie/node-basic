var commands = require('../commands');
var SyntaxError = require('../SyntaxError');

/**
 * Represents a command call
 *
 * @param {String} name The name of the command
 * @param {String} args The arguments to the command
 * @param {BlockManager} manager The block manager
 * @param {Number} line The line number
 */
function CommandStatement(name, args, manager, line) {
    this.name = name;
    this.args = args;

    if (!commands[name]) throw new SyntaxError('Unknown command: ' + name);
    this.command = new commands[name](args, manager.create(line));
}

/**
 * Outputs executable cde that represents the command call
 *
 * @returns {string}
 */
CommandStatement.prototype.toString = function() {
    var stringArgs = this.command.toString();
    return this.name.toUpperCase() + (stringArgs === '[object Object]' ? '' : ' ' + stringArgs);
};

/**
 * Converts the assignment to serializable JSON
 *
 * @returns {Object}
 */
CommandStatement.prototype.toJSON = function() {
    return {
        type: "CommandStatement",
        name: this.name,
        command: this.command.toJSON ? this.command.toJSON() : {}
    };
};

/**
 * Executes the command call
 *
 * @param {ExecutionContext} data The execution data context
 */
CommandStatement.prototype.execute = function(data) {
    return data.callCommand(this.command);
};

module.exports = CommandStatement;