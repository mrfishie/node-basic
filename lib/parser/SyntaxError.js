/**
 * An error caused by invalid syntax
 */
function SyntaxError(msg) {
    this.message = msg;
}

SyntaxError.prototype.toString = function() {
    return this.message;
};

module.exports = SyntaxError;