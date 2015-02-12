var statements = require('./');
var SyntaxError = require('../SyntaxError');
var operators = require('./operators');
var util = require('../../util');

var allOperators = [];
for (var i = 0; i < operators.length; i++) allOperators = allOperators.concat(Object.keys(operators[i]));

/**
 * Represents some form of expression to find a value
 *
 * @param {String} data The code to parse
 * @param {Function} define
 */
function ExpressionStatement(data, define) {
    this.child = parseExpression(data, define ? define.line : 'unknown');

    if (this.child instanceof SyntaxError) throw this.child;
    else if (this.child.error) throw this.child.error;
}

/**
 * Outputs executable code that represents the expression
 *
 * @returns {string}
 */
ExpressionStatement.prototype.toString = function() {
    return this.child.toString();
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
ExpressionStatement.prototype.toJSON = function() {
    return {
        type: "ExpressionStatement",
        child: this.child.toJSON()
    };
};

/**
 * Executes the expression
 *
 * @param {ExecutionContext} data The execution data context
 * @returns {String|Number} The value of the expression
 */
ExpressionStatement.prototype.execute = function(data) {
    if (this.error) throw this.error;

    return this.child.execute(data);
};

/**
 * Parses a given expression, following BOCMDAS
 * (Brackets, Comparators, Multiplication/Division, Addition/Subtraction/binary operators)
 * To configure the order @see operators/index.js
 *
 * Two operators of the same precedence will execute left to right, just as expected
 *
 * @param data
 * @param line
 */
function parseExpression(data, line) {
    data = data.trim();

    var lowerData = data.toLowerCase();
    var positions = util.findPositions(lowerData, [
        { 'start': '"', 'end': '"' },
        { 'start': '(', 'end': ')' }
    ]);

    // Try to find an operator in the root of the data
    for (var i = 0; i < operators.length; i++) {
        var operatorList = operators[i];
        var operatorNames = Object.keys(operatorList);

        // We go backwards so that the resulting object nesting goes from left to right
        // in the case of two operators with the same precedence are beside each other.
        // For example, with the expression '1 * 2 / 3' you would expect it to do the
        // '1 * 2' part first, so we have to go this way so that it parses as
        // DivisionOperator('1 * 2', '3') instead of MultiplicationOperator('1', '2 / 3')
        var found = util.findLastOutside(lowerData, operatorNames, lowerData.length, positions);

        // If there is an operator, parse the two sides and then return the operator
        if (found.index !== -1) {
            // If there is no number before and the character is '-' or '+', ignore
            var beforeText = data.substring(0, found.index).trim();
            if ((found.found === '-' || found.found === '+')) {
                var previousOperator = util.findLast(beforeText, allOperators);
                if (previousOperator.index !== -1) {
                    var middleContent = beforeText.substring(previousOperator.index + previousOperator.found.length).trim();
                    if (!middleContent.length) continue;
                }
            }

            var before = parseExpression(beforeText);
            var after = parseExpression(data.substring(found.index + found.found.length));

            var operatorConstructor = operatorList[found.found];
            if (!operatorConstructor) throw new SyntaxError('Unknown operator');
            return new operatorConstructor(before, after);
        }
    }

    // If none are found, its either a syntax error, function call, bracket, or singular expression
    var startBracketIndex = data.indexOf('(');
    if (startBracketIndex !== -1) {
        var endBracketIndex = data.lastIndexOf(')');
        if (endBracketIndex === -1) throw new SyntaxError('Expected end bracket in ' + data);
        var bracketContent = data.substring(startBracketIndex + 1, endBracketIndex).trim();

        // If there is something before the bracket, its a function call
        var beforeBracket = data.substring(0, startBracketIndex).trim();
        if (beforeBracket.length) return new statements.FunctionStatement(beforeBracket, bracketContent);

        // If there is something after the bracket, its a syntax error
        var afterBracket = data.substring(endBracketIndex + 1).trim();
        if (afterBracket.length) throw new SyntaxError("Unexpected expression");

        // If we've gotten to here, its just an expression in brackets
        return parseExpression(bracketContent);
    }

    // It must be a singular expression
    return parseSingularExpression(data);
}

/**
 * Parses a single expression (one without any operators) and returns a variable, string, or number
 *
 * @param {String} data The expression data
 * @returns {SyntaxError|exports.StringStatement|exports.NumberStatement|exports.VariableStatement|exports.PointerStatement}
 * @private
 */
function parseSingularExpression(data) {
    // A hash signifies a pointer
    if (data[0] === '#') {
        var pointerId = data.substring(1);
        if (isNaN(parseInt(pointerId))) return new SyntaxError('Unexpected hash');
        return new statements.PointerStatement(pointerId);
    }

    var isString = data.indexOf('"') !== -1;

    // If there is any quote, its either a string or syntax error
    if (isString) {
        if (data[0] !== '"' || data[data.length - 1] !== '"') return new SyntaxError('Unexpected quote');
        var stringContent = data.slice(1, data.length - 1);
        return new statements.StringStatement(stringContent);
    }

    // If it is not not a number, it must be a number (see my logic?)
    var numberValue = parseFloat(data);
    if (!isNaN(numberValue)) {
        return new statements.NumberStatement(numberValue);
    }

    // Otherwise, it must be a variable
    // TODO: validate variable name (this should actually go in the variable constructor..)
    return new statements.VariableStatement(data);
}

module.exports = ExpressionStatement;