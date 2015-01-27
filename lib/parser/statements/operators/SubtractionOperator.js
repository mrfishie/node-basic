/**
 * Subtracts a number from another
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function SubtractionOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {String}
 */
SubtractionOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' - ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
SubtractionOperator.prototype.toJSON = function() {
    return {
        type: "-",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 * @throws Error if either expression does not evaluate to a number
 */
SubtractionOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);
    if (!lval && typeof rval === 'number') return rval * -1;

    if (typeof lval !== 'number' || typeof rval !== 'number') throw new Error('Types mismatch');
    return lval - rval;
};

module.exports = SubtractionOperator;