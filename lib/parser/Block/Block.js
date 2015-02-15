var statements = require('../statements');
var SyntaxError = require('../SyntaxError');

/**
 * A block parser
 *
 * @param {Number} line The current line number
 * @param {{start: Array, end: Array, then: Array}} def Properties for block definition
 * @param {BlockManager} parent
 */
function Block(line, def, parent) {
    this.startNames = [];
    this.thenNames = [];
    this.endNames = [];
    for (var i = 0; i < def.start.length; i++) this.startNames.push(def.start[i].toLowerCase());
    for (var x = 0; x < def.end.length; x++) this.endNames.push(def.end[x].toLowerCase());
    for (var y = 0; y < def.then.length; y++) this.thenNames.push(def.then[y].toLowerCase());

    this.line = line;
    this.parent = parent;
    this.searchIndex = line;
    this.start = -1;
    this.intermediateIndexes = {};
    this.intermediateCursors = {};
    this.end = -1;
}

/**
 * Parses the block
 *
 * @param {AbstractSyntaxTree} ast
 */
Block.prototype.parse = function(ast) {
    var root = ast.root, depth = 0;
    var intermediateFinds = this.intermediateIndexes = {};

    for (var ln = this.searchIndex; ln < root.length; ln++) {
        var line = root[ln];
        if (!(line instanceof statements.CommandStatement)) continue;
        var lineName = line.name;

        if (this.startNames.indexOf(lineName) !== -1) {
            if (depth === 0) this.start = ln;
            depth++;
        } else if (this.thenNames.indexOf(lineName) !== -1 && depth === 1) {
            if (!intermediateFinds[lineName]) intermediateFinds[lineName] = [];
            intermediateFinds[lineName].push(ln);
        } else if (this.endNames.indexOf(lineName) !== -1) {
            depth--;
            if (depth < 0) throw new SyntaxError("Unexpected " + lineName.toUpperCase());
            else if (depth === 0) {
                this.end = ln;
                return;
            }
        }
    }

    if (depth !== 0) {
        throw new SyntaxError(this.startNames[0].toUpperCase() + " without " + this.endNames[0].toUpperCase() + " on line " + (this.start + 1));
    }
};

/**
 * Finds if the block has the intermediate command specified
 *
 * @param {String} name The name of the command
 * @returns {Boolean}
 */
Block.prototype.has = function(name) {
    name = name.toLowerCase();
    if (this.thenNames.indexOf(name) === -1) return false;
    if (!this.intermediateIndexes[name]) return false;
    return Boolean(this.intermediateIndexes[name].length);
};

/**
 * Finds the next intermediate command with the name specified
 *
 * @param {String} name The name of the command
 * @returns {Number} The line or -1 if none found
 */
Block.prototype.next = function(name) {
    name = name.toLowerCase();
    if (!this.has(name)) return -1;

    if (!this.intermediateCursors[name]) this.intermediateCursors[name] = 0;
    var cursor = this.intermediateCursors[name];
    if (cursor >= this.intermediateIndexes[name].length) cursor = this.intermediateCursors[name] = 0;

    var value = this.intermediateIndexes[name][cursor];
    this.intermediateCursors[name]++;
    return value;
};

/**
 * Gets a list of references
 *
 * @returns {Array<Block>}
 */
Block.prototype.references = function() {
    return this.parent.byLineRef[this.line];
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
Block.prototype.toJSON = function() {
    return {
        line: this.line,
        searchIndex: this.searchIndex,
        start: this.start,
        intermediateIndexes: this.intermediateIndexes,
        intermediateCursors: this.intermediateCursors,
        end: this.end
    };
};

module.exports = Block;