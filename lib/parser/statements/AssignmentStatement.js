/**
 * Represents an assignment of a value to a variable
 *
 * @param {VariableStatement} variable The variable to assign
 * @param {ExpressionStatement} expression The expression to evaluate
 */
function AssignmentStatement(variable, expression) {
    this.variable = variable;
    this.expression = expression;
}

/**
 * Outputs executable code that represents the assignment
 *
 * @returns {string}
 */
AssignmentStatement.prototype.toString = function() {
    return this.variable.toString() + " = " + this.expression.toString();
};

/**
 * Converts the assignment to serializable JSON
 *
 * @returns {Object}
 */
AssignmentStatement.prototype.toJSON = function() {
    return {
        type: "AssignmentStatement",
        variable: this.variable.toJSON(),
        expression: this.expression.toJSON()
    };
};

/**
 * Executes the assignment
 *
 * @param {ExecutionContext} data The execution data context
 */
AssignmentStatement.prototype.execute = function(data) {
    data.setVariable(this.variable, this.expression);
};

module.exports = AssignmentStatement;