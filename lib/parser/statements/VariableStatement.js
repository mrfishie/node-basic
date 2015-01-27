var SyntaxError = require('../SyntaxError');
var statements = require('./');

/**
 * Represents a variable
 *
 * @param {String} name The name of the variable
 */
function VariableStatement(name) {
    var bracketIndex = name.indexOf('(');
    if (bracketIndex !== -1) {
        var endBracketIndex = name.indexOf(')');
        if (endBracketIndex === -1) throw new SyntaxError('Expected end bracket');

        var arrayName = name.substring(0, bracketIndex);
        var arrayDimensionsText = name.substring(bracketIndex + 1, endBracketIndex).trim();
        var arrayDimensions = new statements.ArgumentStatement(arrayDimensionsText);

        name = arrayName;
        this.isArray = true;
        this.dimensions = arrayDimensions.args;
    } else this.isArray = false;

    if (name[name.length - 1] === '$') {
        this.type = 'string';
        this.name = name.substring(0, name.length - 1);
    } else {
        this.type = 'number';
        this.name = name;
    }
}

/**
 * Outputs executable code that represents the variable
 *
 * @returns {string}
 */
VariableStatement.prototype.toString = function() {
    var name = this.name + (this.type === 'string' ? '$' : '');
    if (this.isArray) name += '(' + this.dimensions.join(', ') + ')';
    return name;
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
VariableStatement.prototype.toJSON = function() {
    return {
        type: "VariableStatement",
        name: this.name,
        varType: this.type,
        dimensions: this.dimensions
    };
};

/**
 * Gets the value of the variable
 * Since the parser is going to think that getting the value of an array is a function call,
 * we don't need to implement getting of the value here
 *
 * @param {ExecutionContext} data The execution data context
 * @returns {String|Number} The value of the variable
 */
VariableStatement.prototype.execute = function(data) {
    return data.getVariable(this);
};



module.exports = VariableStatement;