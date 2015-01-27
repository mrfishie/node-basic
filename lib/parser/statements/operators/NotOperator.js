/**
 * Bitwise NOT operator
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function NotOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
NotOperator.prototype.toString = function() {
    return 'BNOT ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
NotOperator.prototype.toJSON = function() {
    return {
        type: "bnot ",
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 * @throws Error if either value is not a number
 */
NotOperator.prototype.execute = function(data) {
    var rval = this.rexpr.execute(data);
    data.validate(rval, 'number');
    return ~rval;
};

module.exports = NotOperator;