/**
 * Skips to the next matching ENDIF command
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function ElseCommand(args, define) {
    this.block = define;
}

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ElseCommand.prototype.toJSON = function() {
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
ElseCommand.prototype.execute = function(data, next) {
    var refs = this.block.references();
    if (!refs.length) throw new Error('ELSE without IF');

    data.cursor = refs[0].end;
    next();
};

module.exports = ElseCommand;