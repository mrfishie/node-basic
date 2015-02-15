/**
 * Requires the first value to not equal the second
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function NotEqualComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
NotEqualComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' <> ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
NotEqualComparator.prototype.toJSON = function() {
    return {
        type: "<>",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {number} The resulting value
 */
NotEqualComparator.prototype.execute = function(data) {
    console.log('not equal comparator');
    return this.lexpr.execute(data) != this.rexpr.execute(data) ? 1 : 0;
}

module.exports = NotEqualComparator;