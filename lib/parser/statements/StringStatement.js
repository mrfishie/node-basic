/**
 * Represents a string value
 *
 * @param {String} value The value to assign
 */
function StringStatement(value) {
    this.value = value;
}

/**
 * Outputs executable code that represents the string
 *
 * @returns {string}
 */
StringStatement.prototype.toString = function() {
    return '"' + this.value + '"';
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
StringStatement.prototype.toJSON = function() {
    return {
        type: "StringStatement",
        value: this.value
    };
};

/**
 * Gets the string
 *
 * @returns {String} The string
 */
StringStatement.prototype.execute = function() {
    return this.value;
};

module.exports = StringStatement;