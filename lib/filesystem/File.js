/**
 * Represents a file
 *
 * @param {String} name The name of the file
 * @param {Array} file The file contents
 * @param {Drive} parent The parent drive
 */
function File(name, file, parent) {
    this.name = name;
    this.file = file;
    this.parent = parent;
    this.readCursor = 0;
    this.eof = false;
}

/**
 * Sets the content of the file
 *
 * @param {String} contents
 */
File.prototype.set = function(contents) {
    this.parent.root[this.name] = this.file = String(contents).split('\n');
};

/**
 * Clears the contents of the file
 */
File.prototype.clear = function() {
    this.parent.root[this.name] = this.file = [];
};

/**
 * Reads the next line from the file
 *
 * @returns {String}
 */
File.prototype.nextLine = function() {
    if (this.eof || this.readCursor >= this.file.length) {
        this.eof = true;
        return '';
    }
    var value = this.file[this.readCursor];
    this.readCursor++;
    return value;
};

/**
 * Moves the cursor to a certain position
 *
 * @param {Number} pos New cursor position
 */
File.prototype.moveTo = function(pos) {
    this.readCursor = pos;
    this.eof = this.readCursor >= this.file.length;
};

/**
 * Appends the text to the end of the file
 *
 * @param {String} text
 */
File.prototype.write = function(text) {
    var split = String(text).split('\n');
    for (var i = 0; i < split.length; i++) this.file.push(split[i]);
};

/**
 * Saves the file
 *
 * @param {Function?} done A function to call when complete
 */
File.prototype.save = function(done) {
    this.parent.save(done);
};

module.exports = File;