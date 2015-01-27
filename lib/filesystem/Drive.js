var File = require('./File');
var filesystem = require('./');

/**
 * A filesystem drive
 *
 * @param {String} name The name of the drive
 * @param {Object} root The drive contents
 */
function Drive(name, root) {
    this.name = name;
    this.root = root;
}

/**
 * Opens a file
 *
 * @param {String} file The name of the file
 */
Drive.prototype.open = function(file) {
    if (!this.root[file]) this.root[file] = [];
    return new File(file, this.root[file], this);
};

/**
 * Saves the drive
 *
 * @param {Function?} done A function to call when complete
 */
Drive.prototype.save = function(done) {
    filesystem.save(done);
};

module.exports = Drive;