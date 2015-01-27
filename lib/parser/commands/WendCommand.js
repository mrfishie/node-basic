/**
 * Returns to the matching WHILE command
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function WendCommand(args, define) {
    this.block = define;
}

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
WendCommand.prototype.toJSON = function() {
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
WendCommand.prototype.execute = function(data, next) {
    var refs = this.block.references();
    if (!refs.length) throw new Error('WEND without WHILE');

    data.cursor = refs[0].start;
    next();
};

module.exports = WendCommand;