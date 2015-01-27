/**
 * An error caused by invalid syntax
 */
function SyntaxError(msg) {
    this.message = 'Syntax Error: ' + msg;
}

SyntaxError.prototype.execute = function() {
    console.log("ERROR: " + this.message);
};

SyntaxError.prototype.toString = function() {
    return this.message;
};

module.exports = SyntaxError;