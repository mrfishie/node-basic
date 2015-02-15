/**
 * Parses BASIC code and creates an abstract syntax tree
 */

var AbstractSyntaxTree = require('./AbstractSyntaxTree');
var SyntaxError = require('./SyntaxError');
var BlockManager = require('./Block');
var util = require('../util');

var statements = require('./statements');
var AssignmentStatement = statements.AssignmentStatement;
var CommentStatement = statements.CommentStatement;
var CommandStatement = statements.CommandStatement;
var VariableStatement = statements.VariableStatement;
var ExpressionStatement = statements.ExpressionStatement;
var EmptyStatement = statements.EmptyStatement;
var FunctionStatement = statements.FunctionStatement;

exports.Block = BlockManager;
exports.commands = require('./commands');
exports.statements = statements;
exports.AbstractSyntaxTree = require('./AbstractSyntaxTree');
exports.SyntaxError = require('./SyntaxError');

function createLineError(error, line) {
    return new SyntaxError(error.message + ' on line ' + (line + 1));
}

/**
 * Parses BASIC code and returns an abstract syntax tree
 *
 * @param {String} code
 * @returns {AbstractSyntaxTree|{error: String}} The resulting AST
 */
function parse(code) {
    try {
        var labels = {};
        var root = [];
        var manager = new BlockManager();

        var lines = code.split('\n');
        for (var i = 0; i < lines.length; i++) {
            try {
                var line = parseLine(lines[i].trim(), i, labels, false, manager);
                if (line instanceof SyntaxError) throw createLineError(line, i);
                if (line.error instanceof SyntaxError) throw createLineError(line.error, i);
                root[i] = line;
            } catch (ex) {
                throw createLineError(ex, i);
            }
        }

        return new AbstractSyntaxTree(root, labels, manager);
    } catch (ex) {
        return { "error": ex };
    }
}
exports.parse = parse;

/**
 * Parses a line and returns the statement
 *
 * @param {String} line The line to parse
 * @param {Number} i The line index
 * @param {Object} labels The list of labels
 * @param {Boolean} notLineNumber If true, wont see if it starts with a line number
 * @param {BlockManager} manager The block manager
 * @returns {AssignmentStatement|CommentStatement|CommandStatement|EmptyStatement|FunctionStatement|SyntaxError}
 */
function parseLine(line, i, labels, notLineNumber, manager) {
    line = line.trim();

    // Is it an empty line?
    if (line === "") return new EmptyStatement('empty');

    if (line.indexOf("'") === 0 || line.toUpperCase() === "REM" || line.toUpperCase().indexOf("REM ") === 0) {
        return new CommentStatement(line.substring(line.indexOf(" ")).trim());
    }

    var bracketPositions;
    function getPositions(ln) {
        return util.findPositions(ln, [
            { start: '(', end: ')' },
            { start: '"', end: '"' }
        ]);
    }
    bracketPositions = getPositions(line);

    // See if there is a comment
    var startCommentIndex = util.indexOfOutside(line, "'", 0, bracketPositions);
    if (startCommentIndex !== -1) {
        line = line.substring(0, startCommentIndex).trim();
        bracketPositions = getPositions(line);
    }

    // Is it a label?
    if (line[line.length - 1] === ':') {
        var labelName = line.substring(0, line.length - 1).toLowerCase();
        labels[labelName] = i;
        return new EmptyStatement('label');
    }

    if (line.indexOf('END IF') === 0) line = 'ENDIF';

    // Find first space, but only outside of brackets
    var spaceIndex = util.indexOfOutside(line, ' ', 0, bracketPositions);

    // If the line is only a line number
    if (spaceIndex === -1) {
        var parsedLine = parseInt(line);
        if (!notLineNumber && !isNaN(parseInt(line))) {
            labels[line] = i;
            return new EmptyStatement('label');
        }
    }

    var commandSection, argumentSection;
    if (spaceIndex !== -1) {
        commandSection = line.substring(0, spaceIndex).trim();
        argumentSection = line.substring(spaceIndex).trim();

        // Is it a line number?
        if (!notLineNumber && !isNaN(parseInt(commandSection))) {
            labels[commandSection] = i;
            return parseLine(argumentSection, i, labels, true, manager);
        }

        // If it follows the pattern x = y or x =y, it must be an assignment
        if (argumentSection[0] === '=') {
            return new AssignmentStatement(new VariableStatement(commandSection), new ExpressionStatement(argumentSection.substring(1).trim()));
        }

        // If there is an equal sign in the command, it must be an assignment
        var cmdEqualIndex = commandSection.indexOf('=');
        if (cmdEqualIndex !== -1) {
            var equalLine = commandSection + ' ' + argumentSection;
            var varName = equalLine.substring(0, cmdEqualIndex).trim();
            var varExpr = equalLine.substring(cmdEqualIndex + 1).trim();
            return new AssignmentStatement(new VariableStatement(varName), new ExpressionStatement(varExpr));
        }
    } else {
        commandSection = line;
        argumentSection = '';

        // If there is an equal sign, it must be an assignment (with no space, e.g. x=y)
        var equalIndex = commandSection.indexOf('=');
        if (equalIndex !== -1) {
            var variableName = commandSection.substring(0, equalIndex);
            var variableExpr = commandSection.substring(equalIndex + 1);
            return new AssignmentStatement(new VariableStatement(variableName), new ExpressionStatement(variableExpr));
        }

        // Is it a root-level function call?
        var bracketIndex = commandSection.indexOf('(');
        if (bracketIndex !== -1) {
            var endBracketIndex = commandSection.indexOf(')');
            if (endBracketIndex === -1) return new SyntaxError('Unexpected open bracket');
            var functionName = commandSection.substring(0, bracketIndex);
            if (!isNaN(parseInt(functionName))) return new SyntaxError('Expected function name');
            var args = commandSection.substring(bracketIndex + 1, endBracketIndex);
            return new FunctionStatement(functionName, args);
        }
    }

    commandSection = commandSection.toUpperCase();
    return new CommandStatement(commandSection.toLowerCase(), argumentSection, manager, i);
}

exports.parseLine = parseLine;