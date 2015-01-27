var statements = require('./statements');

/**
 * Represents a tree that can be executed
 *
 * @param {Array} root The root-level nodes
 * @param {Object} labels An object of label: line mappings
 * @param {BlockManager} manager The block manager
 */
function AbstractSyntaxTree(root, labels, manager) {
    this.root = root;
    this.labels = labels;
    this.manager = manager;

    manager.parse(this);
}

/**
 * Converts the tree to an executable code string
 *
 * @returns {string}
 */
AbstractSyntaxTree.prototype.toString = function() {
    var lines = [];
    for (var i = 0; i < this.root.length; i++) {
        lines.push(this.root[i].toString());
    }

    for (var name in this.labels) {
        if (!this.labels.hasOwnProperty(name)) continue;

        var lineNumber = this.labels[name];
        if (this.root[lineNumber] instanceof statements.EmptyStatement) lines[lineNumber] = name + ':';
        else lines[lineNumber] = name + ' ' + lines[lineNumber];
    }
    return lines.join('\n');
};

/**
 * Converts the tree to serializable JSON
 *
 * @returns {Object}
 */
AbstractSyntaxTree.prototype.toJSON = function() {
    var root = [];
    for (var i = 0; i < this.root.length; i++) root.push(this.root[i].toJSON());
    return {
        root: root,
        labels: this.labels
    };
};

/**
 * Executes items in the tree
 *
 * @param {ExecutionContext} data The execution context
 * @param {Function?} done A function to call when the program terminates
 */
AbstractSyntaxTree.prototype.execute = function(data, done) {
    data.execute(this.root, this.labels, done);
};

module.exports = AbstractSyntaxTree;