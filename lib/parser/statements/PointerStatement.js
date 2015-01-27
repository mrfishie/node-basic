/**
 * Represents a pointer
 *
 * @param {String} id The id of the pointer
 */
function PointerStatement(id) {
    this.id = id;
}

/**
 * Outputs executable code that represents the pointer
 *
 * @returns {string}
 */
PointerStatement.prototype.toString = function() {
    return '#' + this.id;
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
PointerStatement.prototype.toJSON = function() {
    return {
        type: "PointerStatement",
        id: this.id
    };
};

/**
 * Gets the pointer value
 *
 * @returns {*} The value of the pointer
 */
PointerStatement.prototype.execute = function(data) {
    return data.getPointer(this);
};

module.exports = PointerStatement;