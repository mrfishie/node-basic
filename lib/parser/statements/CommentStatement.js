/**
 * Represents a comment, which does nothing
 *
 * @param {String} text The comment text
 */
function CommentStatement(text) {
    this.text = text;
}

/**
 * Outputs executable code representing the statement
 *
 * @returns {string}
 */
CommentStatement.prototype.toString = function() {
    return "' " + this.text;
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
CommentStatement.prototype.toJSON = function() {
    return {
        type: 'CommentStatement',
        text: this.text
    };
};

/**
 * Executes the comment (i.e does nothing)
 */
CommentStatement.prototype.execute = function() { };

module.exports = CommentStatement;