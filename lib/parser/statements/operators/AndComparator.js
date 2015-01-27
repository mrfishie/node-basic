/**
 * Requires both values to be truthy
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function AndComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
AndComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' AND ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
AndComparator.prototype.toJSON = function() {
    return {
        type: " and ",
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
AndComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) && this.rexpr.execute(data) ? 1 : 0;
};

module.exports = AndComparator;