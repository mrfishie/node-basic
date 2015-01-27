/**
 * End of a FOR block
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function NextCommand(args, define) {
    this.block = define;
}

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
NextCommand.prototype.toJSON = function() {
    return {
        block: this.block.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
NextCommand.prototype.execute = function(data, next) {
    var refs = this.block.references();
    if (!refs.length) throw new Error('NEXT without FOR');

    data.cursor = refs[0].start;
    next();
};

module.exports = NextCommand;