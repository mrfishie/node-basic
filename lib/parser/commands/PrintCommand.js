var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');
var rl = require('../../IOInterface').getDefault();

/**
 * Outputs or formats and outputs a string
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function PrintCommand(args, define) {
    var parsed = new statements.ArgumentStatement(args, {
        flags: ['USING'],
        parseArgs: false
    });

    if (parsed.flags.USING) {
        if (parsed.args.length !== 1) throw new SyntaxError('PRINT USING command requires 1 argument');
        if (parsed.args.length > 1) throw new SyntaxError('Unexpected comma');

        var semicolonIndex = parsed.args[0].indexOf(';');
        if (semicolonIndex === -1) throw new SyntaxError('Expected semicolon');

        var formatExpression = new statements.ExpressionStatement(parsed.args[0].substring(0, semicolonIndex).trim(), define);
        var numberExpression = new statements.ExpressionStatement(parsed.args[0].substring(semicolonIndex + 1).trim(), define);
        if (formatExpression.error instanceof SyntaxError) throw formatExpression.error;
        if (numberExpression.error instanceof SyntaxError) throw numberExpression.error;

        this.formatExpr = formatExpression;
        this.numberExpr = numberExpression;
    } else {
        var items = [];
        for (var i = 0; i < parsed.args.length; i++) {
            var expr = new statements.ExpressionStatement(parsed.args[i], define);
            if (expr.error instanceof SyntaxError) throw expr.error;
            items.push(expr);
        }
        this.items = items;
    }
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
PrintCommand.prototype.toString = function() {
    if (this.formatExpr) {
        return 'USING ' + this.formatExpr.toString() + '; ' + this.numberExpr.toString();
    } else {
        return this.items.join(', ');
    }
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
PrintCommand.prototype.toJSON = function() {
    var items = [];
    if (this.items) {
        for (var i = 0; i < this.items.length; i++) {
            items.push(this.items[i].toJSON());
        }
    }

    return {
        format: this.formatExpr ? this.formatExpr.toJSON() : false,
        number: this.numberExpr ? this.numberExpr.toJSON() : false,
        items: items
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
PrintCommand.prototype.execute = function(data, next) {
    if (this.formatExpr) {
        var format = this.formatExpr.execute(data);
        var number = this.numberExpr.execute(data);

        data.validate(format, 'string');
        data.validate(number, 'number');

        var stringNumber = number.toString().split('.');
        var preDecimal = stringNumber[0];
        var postDecimal = stringNumber.length > 1 ? stringNumber[1] : '';

        var formatSplit = format.split('.');
        var preDecimalFormat = formatSplit[0];
        var postDecimalFormat = formatSplit.length > 1 ? formatSplit[1] : '';

        var preDecimalResult = '', postDecimalResult = '';

        var preDecimalStart = preDecimal.length - preDecimalFormat.length;
        var preDecimalText = preDecimal.substring(preDecimalStart < 0 ? 0 : preDecimalStart);
        if (preDecimalStart < 0) {
            var preDecimalDiff = preDecimalStart * -1;
            preDecimalText = (new Array(preDecimalDiff + 1)).join(" ") + preDecimalText;
        }
        for (var pre = 0; pre < preDecimalFormat.length; pre++) {
            var preChar = preDecimalFormat[pre];
            if (preChar !== '#') preDecimalResult += preChar;
            else preDecimalResult += preDecimalText[pre];
        }

        var postDecimalText = postDecimal.substring(0, postDecimalFormat.length);
        if (postDecimalText.length < postDecimalFormat.length) {
            var postDecimalDiff = postDecimalFormat.length - postDecimalText.length;
            postDecimalText += (new Array(postDecimalDiff + 1)).join(" ");
        }
        for (var post = 0; post < postDecimalFormat.length; post++) {
            var postChar = postDecimalFormat[post];
            if (postChar !== '#') postDecimalResult += postChar;
            else postDecimalResult += postDecimalText[post];
        }

        rl.write(preDecimalResult + (postDecimalResult.length ? '.' + postDecimalResult : '') + '\n');
    } else {
        var items = [];
        for (var i = 0; i < this.items.length; i++) {
            var result = this.items[i].execute(data);
            if (typeof result !== 'string' && typeof result !== 'number' && !(result instanceof filesystem.File && i === 0)) throw new Error('Types mismatch');
            items.push(result);
        }
        if (items[0] instanceof filesystem.File) {
            var file = items[0];
            if (file.mode !== 'output' && file.mode !== 'append') throw new Error('File not writable');
            file.write(items.slice(1).join(' '));
            file.save(function() {
                next();
            });
            return;
        } else rl.write(items.join(' ') + '\n');
    }

    next();
};

module.exports = PrintCommand;