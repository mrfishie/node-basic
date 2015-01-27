var statements = require('../statements');
var SyntaxError = require('../SyntaxError');

/**
 * Declares one or more arrays
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function DimCommand(args) {
    var parsed = new statements.ArgumentStatement(args, {
        parseArgs: false
    });

    this.creates = [];

    for (var i = 0; i < parsed.args.length; i++) {
        var dimDef = parsed.args[i];
        var startBracket = dimDef.indexOf('(');
        var endBracket = dimDef.indexOf(')');

        if (startBracket === -1) throw new SyntaxError('Expected start bracket');
        if (endBracket === -1) throw new SyntaxError('Expected end bracket');

        var arrayName = dimDef.substring(0, startBracket).trim();
        var arrayLengthName = dimDef.substring(startBracket + 1, endBracket);
        var arrayLengthArg = new statements.ArgumentStatement(arrayLengthName);

        this.creates.push({
            name: arrayName,
            lengths: arrayLengthArg.args
        })
    }
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
DimCommand.prototype.toString = function() {
    var creates = [];
    for (var i = 0; i < this.creates.length; i++) {
        var create = this.creates[i];
        creates.push(create.name + '(' + create.lengths.join(', ') + ')');
    }
    return creates.join(', ');
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
DimCommand.prototype.toJSON = function() {
    var creates = [];
    for (var i = 0; i < this.creates.length; i++) {
        var lengths = [], create = this.creates[i];
        for (var x = 0; x < create.lengths.length; x++) {
            lengths.push(create.lengths[x].toJSON());
        }

        creates.push({
            name: create.name.toJSON(),
            lengths: lengths
        });
    }

    return {
        creates: creates
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
DimCommand.prototype.execute = function(data, next) {
    for (var i = 0; i < this.creates.length; i++) {
        var dimDef = this.creates[i];

        var lengths = [];
        for (var x = 0; x < dimDef.lengths.length; x++) {
            var length = dimDef.lengths[x].execute(data);
            data.validate(length, 'number');
            lengths.push(length);
        }

        data.defineArray(dimDef.name, lengths);
    }
    next();
};

module.exports = DimCommand;