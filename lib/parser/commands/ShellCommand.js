/* **************************************************************************
   Additional Command to Execute Shell Command from BASIC
   Joe Nicholson Rufilla Ltd.
   **************************************************************************
*/

var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var rl = require('../../IOInterface').getDefault();

var exec = require('child_process').exec;

/**
 * Shells execution
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function ShellCommand(args, define) {
    if (args.length) {
        this.message = new statements.ExpressionStatement(args, define);
        if (this.message.error) throw this.message.error;
    } else this.message = new statements.StringStatement("[<< Shelld, Press RETURN to Continue >>]");
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ShellCommand.prototype.toString = function() {
    return this.message.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ShellCommand.prototype.toJSON = function() {
    return {
        message: this.message.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ShellCommand.prototype.execute = function(data, next) {
    var message = this.message.execute(data);
    data.validate(message, 'string');

    // Executre the shell command
    exec(message, function (error, stdout, stderr) { 
        console.log(stdout);
        next();        
    });
};

module.exports = ShellCommand;