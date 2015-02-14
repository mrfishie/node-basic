var statements = require('../statements');

/**
 * Pushes data to the stack
 *
 * @param {String} args The arguments to the command
 */
function DataCommand(args) {
    this.items = new statements.ArgumentStatement(args).args;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
DataCommand.prototype.toString = function() {
    return this.items.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
DataCommand.prototype.toJSON = function() {
    return {
        items: this.items
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
DataCommand.prototype.execute = function(data, next) {
    for (var i = 0; i < this.items.length; i++) {
        data.private.data.push(this.items[i].execute(data));
    }
    next();
};

module.exports = DataCommand;