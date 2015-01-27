/**
 * Inverts the right value
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function NotComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
NotComparator.prototype.toString = function() {
    return 'NOT ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
NotComparator.prototype.toJSON = function() {
    return {
        type: "not ",
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 */
NotComparator.prototype.execute = function(data) {
    return !this.rexpr.execute(data) ? 1 : 0;
};

module.exports = NotComparator;