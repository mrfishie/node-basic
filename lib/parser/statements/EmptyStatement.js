/**
 * An empty statement that does nothing
 *
 * @param {String} type The type of the statement
 * @constructor
 */
function EmptyStatement(type) {
    this.type = type;
}

/**
 * Outputs executable code representing the statement
 *
 * @returns {string}
 */
EmptyStatement.prototype.toString = function() {
    return "";
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
EmptyStatement.prototype.toJSON = function() {
    return {
        type: 'EmptyStatement',
        lineType: this.type
    };
};

/**
 * Executes the comment (i.e does nothing)
 */
EmptyStatement.prototype.execute = function() { };

module.exports = EmptyStatement;