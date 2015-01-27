/**
 * Bitwise XOR operator
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function XorOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
XorOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' BXOR ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
XorOperator.prototype.toJSON = function() {
    return {
        type: " bxor ",
        lexpr: this.lexpr.toJSON(),
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
XorOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);

    data.validate(lval, 'number');
    data.validate(rval, 'number');
    return lval ^ rval;
};

module.exports = XorOperator;