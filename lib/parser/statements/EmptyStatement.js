/**
 * An empty statement that does nothing
 *
 * @constructor
 */
function EmptyStatement() { }

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
    return { type: 'EmptyStatement' };
};

/**
 * Executes the comment (i.e does nothing)
 */
EmptyStatement.prototype.execute = function() { };

module.exports = EmptyStatement;