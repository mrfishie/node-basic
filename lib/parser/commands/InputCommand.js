var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');
var rl = require('../../IOInterface').getDefault();

/**
 * Inputs a line from the user
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function InputCommand(args) {
    var parsed = new statements.ArgumentStatement(args);
    if (!parsed.args.length) throw new SyntaxError('INPUT requires at least one argument');

    var question = "", placeVar, file;
    if (parsed.args.length === 1) placeVar = parsed.args[0];
    else {
        if (parsed.args[0].child instanceof statements.PointerStatement) file = parsed.args[0];
        else question = parsed.args[0];

        placeVar = parsed.args[1];
    }

    if (!(placeVar.child instanceof statements.VariableStatement)) throw new SyntaxError('Expected variable');

    this.file = file;
    this.question = question;
    this.placeVar = placeVar;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
InputCommand.prototype.toString = function() {
    return  (this.file ? this.file.toString() + ', ' : '') +
            (this.question ? this.question.toString() + ', ' : '') +
            this.placeVar.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
InputCommand.prototype.toJSON = function() {
    return {
        file: this.file ? this.file.toJSON() : false,
        question: this.question ? this.question.toJSON() : false,
        variable: this.placeVar.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
InputCommand.prototype.execute = function(data, next) {
    var placeVar = this.placeVar;

    if (this.file) {
        var file = this.file.execute(data);
        if (!(file instanceof filesystem.File)) throw new Error('Expected file');

        if (file.mode !== 'input') throw new Error('File not readable');

        var value = file.nextLine();
        if (file.eof && placeVar.child.type === "number") value = 0;

        data.setVariable(placeVar.child, value);
        data.setConstant('EOF', file.eof ? 1 : 0);
        next();
    } else {
        var question = this.question ? this.question.execute(data) : '';

        rl.question(question + "> ", function (answer) {
            data.setVariable(placeVar.child, answer);
            next();
        });
    }
};

module.exports = InputCommand;