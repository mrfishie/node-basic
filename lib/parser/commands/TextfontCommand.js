var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

var styleNames = [
    "light",
    "bold",
    "italic"
];
var fontNames = [
    "American Typewriter",
    "AppleGothic",
    "Arial",
    "Arial Rounded",
    "Courier",
    "Courier New",
    "Georgia",
    "Helvetica",
    "Marker Felt",
    "Times",
    "Trebuchet",
    "Verdana",
    "Zapfino"
];

/**
 * Modifies the DRAWTEXT font
 *
 * @param {String} args The arguments to the command
 */
function TextfontCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length > 2) {
        this.family = parsed.args[0];
        this.style = parsed.args[1];
        this.size = parsed.args[2];
    } else if (parsed.args.length > 1) {
        this.familyOrStyle = parsed.args[0];
        this.size = parsed.args[1];
    } else if (parsed.args.length > 0) {
        var arg = parsed.args[0];
        if (arg.child.type === 'string' || arg.child instanceof statements.StringStatement) this.familyOrStyle = arg;
        else this.size = arg;
    } else {
        this.reset = true;
    }
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
TextfontCommand.prototype.toString = function() {
    var result = [];
    if (this.family) result.push(this.family, this.style);
    else if (this.familyOrStyle) result.push(this.familyOrStyle);
    if (this.size) result.push(this.size);

    return result.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
TextfontCommand.prototype.toJSON = function() {
    return {
        reset: this.reset,
        family: this.family ? this.family.toJSON() : false,
        style: this.style ? this.style.toJSON() : false,
        size: this.size ? this.size.toJSON() : false,
        familyOrStyle: this.familyOrStyle ? this.familyOrStyle.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
TextfontCommand.prototype.execute = function(data, next) {
    var family = false, style = false, height = false;

    if (this.reset) {
        family = "Zapfino";
        style = "";
        height = 14;
    } else if (this.family) {
        family = this.family.execute(data);
        style = this.style.execute(data).toLowerCase();
    } else if (this.familyOrStyle) {
        var familyOrStyle = this.familyOrStyle.execute(data);
        var lowerStyle = familyOrStyle.toLowerCase();
        var splitStyle = lowerStyle.split(" ");

        var isStyle = true;
        for (var i = 0; i < splitStyle.length; i++) {
            if (styleNames.indexOf(splitStyle[i]) === -1) {
                isStyle = false;
                break;
            }
        }

        if (isStyle) style = lowerStyle;
        else family = familyOrStyle;
    }
    if (this.size) {
        height = this.size.execute(data);
    }

    if (family !== false) {
        data.validate(family, 'string');
        if (fontNames.indexOf(family) === -1) throw new Error('Invalid font name');
    }
    if (style !== false) {
        data.validate(style, 'string');
        style = style.trim();
        var styles = style.split(" ");
        for (var x = 0; x < styles.length; x++) {
            var stl = styles[x].trim();
            if (stl.length && styleNames.indexOf(stl) === -1) throw new Error('Invalid font style');
        }
    }
    if (height !== false) {
        data.validate(height, 'number');
        if (height <= 0) throw new Error('Height out of bounds');
    }

    ctx.write({
        command: 'font',
        args: {
            family: family,
            style: style,
            height: height
        }
    });

    next();
};

module.exports = TextfontCommand;