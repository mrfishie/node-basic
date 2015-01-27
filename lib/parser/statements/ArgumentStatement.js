var statements = require('./');
var util = require('../../util');

/**
 * Represents a set of arguments to a command call
 *
 * @param {String} args The arguments to parse
 * @param {Object} options Command options
 * @param {Function?} define
 */
function ArgumentStatement(args, options, define) {
    options = options || {};
    this.value = args;
    this.flags = {};
    this.args = [];
    this.options = options;

    if (typeof options.parse === 'undefined') options.parse = true;
    if (typeof options.separator === 'undefined') options.separator = ',';
    if (typeof options.parseArgs === 'undefined') options.parseArgs = true;

    if (options.parse) {
        if (options.flags) {
            var isFlag = true;

            // Find all matching flags  until no flag is found
            while(isFlag) {
                var firstFlagEnd = args.indexOf(' ');
                if (firstFlagEnd === -1) firstFlagEnd = args.length;
                var firstFlag = args.substring(0, firstFlagEnd).trim().toUpperCase();

                if (options.flags.indexOf(firstFlag) !== -1) {
                    this.flags[firstFlag] = true;
                    args = args.substring(firstFlagEnd).trim();
                }
                else isFlag = false;
            }
        }

        this.rawArgs = args;

        args = args.trim();
        var argList = [args];
        if (options.separator) {
            if (!args.length) argList = [];
            else {
                var positions = util.findPositions(args, [
                    {'start': '"', 'end': '"'},
                    {'start': '(', 'end': ')'}
                ]);
                argList = util.splitOutside(args, options.separator, positions);
            }
        }
        for (var i = 0; i < argList.length; i++) {
            var arg = argList[i].trim();
            if (options.parseArgs) arg = new statements.ExpressionStatement(arg, define);
            this.args.push(arg);
        }
    }
}

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
ArgumentStatement.prototype.toJSON = function() {
    return {
        type: 'ArgumentStatement',
        value: this.value,
        flags: this.flags,
        args: this.args,
        options: this.options
    };
};

module.exports = ArgumentStatement;