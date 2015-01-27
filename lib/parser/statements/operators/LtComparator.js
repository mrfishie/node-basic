/**
 * Requires the left expression to be less than the right
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function LtComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
LtComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' < ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
LtComparator.prototype.toJSON = function() {
    return {
        type: "<",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 */
LtComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) < this.rexpr.execute(data) ? 1 : 0;
};

module.exports = LtComparator;