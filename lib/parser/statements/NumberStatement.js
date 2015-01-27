/**
 * Represents a number value
 *
 * @param {Number} number The number to assign
 */
function NumberStatement(number) {
    this.value = number;
}

/**
 * Outputs executable code that represents the number
 *
 * @returns {string}
 */
NumberStatement.prototype.toString = function() {
    return this.value.toString();
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
NumberStatement.prototype.toJSON = function() {
    return {
        type: "NumberStatement",
        value: this.value
    };
};

/**
 * Gets the number
 *
 * @returns {Number} The number
 */
NumberStatement.prototype.execute = function() {
    return this.value;
};

module.exports = NumberStatement;