var statements = require('../statements');
var util = require('../../util');
var SyntaxError = require('../SyntaxError');
var setImmediate = util.setImmediate;

var maxSingleIterations = 200;

/**
 * Iterates over the body a certain amount of times
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function ForCommand(args, define) {
    var lowerArgs = args.toLowerCase();
    var toIndex = lowerArgs.indexOf(' to ');
    if (toIndex === -1) throw new SyntaxError('FOR has no TO');
    var assignmentText = args.substring(0, toIndex).trim();

    var stepIndex = lowerArgs.indexOf(' step ');
    var upperLimitText, stepText;
    if (stepIndex === -1) {
        upperLimitText = args.substring(toIndex + 4).trim();
        stepText = '1';
    } else {
        upperLimitText = args.substring(toIndex + 4, stepIndex).trim();
        stepText = args.substring(stepIndex + 6).trim();
    }

    var assignmentEquals = assignmentText.indexOf('=');
    if (assignmentEquals === -1) throw new SyntaxError('Expected assignment');
    var variableName = assignmentText.substring(0, assignmentEquals).trim();
    var equalsExpression = assignmentText.substring(assignmentEquals + 1).trim();
    var assignmentExpr = new statements.AssignmentStatement(
            new statements.VariableStatement(variableName),
            new statements.ExpressionStatement(equalsExpression, define)
    );

    var upperLimitExpr = new statements.ExpressionStatement(upperLimitText, define);
    if (upperLimitExpr.error) throw upperLimitExpr.error;

    var stepExpr = new statements.ExpressionStatement(stepText, define);
    if (stepExpr.error) throw stepExpr.error;

    this.assignmentExpr = assignmentExpr;
    this.upperLimitExpr = upperLimitExpr;
    this.stepExpr = stepExpr;

    this.block = define({
        start: 'FOR',
        end: 'NEXT'
    });

    this.loopCount = 0;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ForCommand.prototype.toString = function() {
    return this.assignmentExpr.toString() + ' TO ' + this.upperLimitExpr.toString() + ' STEP ' + this.stepExpr.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ForCommand.prototype.toJSON = function() {
    return {
        assignment: this.assignmentExpr.toJSON(),
        upperLimit: this.upperLimitExpr.toJSON(),
        step: this.stepExpr.toJSON(),
        block: this.block.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ForCommand.prototype.execute = function(data, next) {
    var trackValue;

    if (!this.hasRun) {
        this.hasRun = true;
        this.assignmentExpr.execute(data);
        this.trackVar = this.assignmentExpr.variable;
        trackValue = data.getVariable(this.trackVar);
    } else {
        var increment = this.stepExpr.execute(data);
        data.validate(increment, 'number');
        trackValue = data.getVariable(this.trackVar);
        data.validate(trackValue, 'number');
        trackValue += increment;
        data.setVariable(this.trackVar, trackValue);
    }

    var maxValue = this.upperLimitExpr.execute(data);
    data.validate(maxValue, 'number');
    if ((maxValue > 0 && trackValue > maxValue) || (maxValue < 0 && trackValue < maxValue)) {
        this.hasRun = false;
        data.cursor = this.block.end + 1;
    }

    // To avoid a 'too much recursion' error
    this.loopCount++;
    if (this.loopCount > maxSingleIterations) {
        this.loopCount = 0;
        setImmediate(next);
    } else next();
};

module.exports = ForCommand;