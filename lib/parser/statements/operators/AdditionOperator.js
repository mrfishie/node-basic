/**
 * Adds two numbers or strings together
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function AdditionOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
AdditionOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' + ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
AdditionOperator.prototype.toJSON = function() {
    return {
        type: "+",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number|String} The resulting value
 */
AdditionOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);
    if (!lval) return rval;
    return lval + rval;
};

module.exports = AdditionOperator;