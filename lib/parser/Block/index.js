var Block = require('./Block');

/**
 * Creates block definition functions
 */
function BlockManager() {
    this.children = [];
    this.byLineRef = {};
}

BlockManager.Block = Block;
BlockManager.BlockManager = BlockManager;

/**
 * Parses the blocks
 *
 * @param {AbstractSyntaxTree} ast
 */
BlockManager.prototype.parse = function(ast) {
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i];
        child.parse(ast);

        if (child.start !== -1) addChildTo(this.byLineRef, child, child.start);
        if (child.end !== -1) addChildTo(this.byLineRef, child, child.end);
        for (var type in child.intermediateIndexes) {
            if (!child.intermediateIndexes.hasOwnProperty(type)) continue;
            var childIndexes = child.intermediateIndexes[type];
            for (var x = 0; x < childIndexes.length; x++) {
                addChildTo(this.byLineRef, child, childIndexes[x]);
            }
        }
    }
};

/**
 * Creates a function to create a block
 *
 * @param {Number} line The line number for the block
 * @returns {Function} The function to create the block
 */
BlockManager.prototype.create = function(line) {
    var self = this;

    /**
     * Creates a block with the specified definition
     *
     * @param {Object} def The block definition
     * @returns {Block}
     */
    var res = function(def) {
        var start = Array.isArray(def.start) ? def.start : [def.start];
        var end = Array.isArray(def.end) ? def.end : [def.end];
        var then = def.then ? (Array.isArray(def.then) ? def.then : [def.then]) : [];

        var child = new Block(line, {
            start: start,
            end: end,
            then: then
        }, self);
        self.children.push(child);
        return child;
    };

    /**
     * Gets a list of block references
     *
     * @returns {Array<Block>}
     */
    res.references = function() {
        return self.byLineRef[line];
    };

    /**
     * The current line
     *
     * @type {Number}
     */
    res.line = line;

    /**
     * Converts the block definition to JSON
     *
     * @returns {Object}
     */
    res.toJSON = function() {
        var lineRef = [], iLineRef = self.byLineRef[line];
        for (var i = 0; i < iLineRef.length; i++) {
            lineRef.push(iLineRef[i].toJSON());
        }

        return {
            line: line,
            lineRef: lineRef
        };
    };
    return res;
};

module.exports = BlockManager;

function addChildTo(byRef, child, childIndex) {
    if (!byRef[childIndex]) byRef[childIndex] = [];
    byRef[childIndex].push(child);
}