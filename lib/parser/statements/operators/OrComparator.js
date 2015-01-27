/**
 * Requires either value to be truthy
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function OrComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
OrComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' OR ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
OrComparator.prototype.toJSON = function() {
    return {
        type: " or ",
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
OrComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) || this.rexpr.execute(data) ? 1 : 0;
};

module.exports = OrComparator;