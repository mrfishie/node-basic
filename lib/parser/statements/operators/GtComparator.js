/**
 * Requires the left expression to be greater than the right
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function GtComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
GtComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' > ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
GtComparator.prototype.toJSON = function() {
    return {
        type: ">",
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
GtComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) > this.rexpr.execute(data) ? 1 : 0;
};

module.exports = GtComparator;