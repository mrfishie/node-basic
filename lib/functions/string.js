/**
 * Make string uppercase
 *
 * @param {String} s
 * @returns {String}
 */
exports['upper$'] = function(s) {
    this.validate(s, 'string');
    return s.toUpperCase();
};

/**
 * Make string lowercase
 *
 * @param {String} s
 * @returns {String}
 */
exports['lower$'] = function(s) {
    this.validate(s, 'string');
    return s.toLowerCase();
};

/**
 * Take n characters from string's left
 *
 * @param {String} s
 * @param {Number} n
 * @returns {String}
 */
exports['left$'] = function(s, n) {
    this.validate(s, 'string');
    this.validate(n, 'number');
    return s.substr(0, n);
};

/**
 * Take n characters from string starting with i'th character
 *
 * @param {String} s
 * @param {Number} i
 * @param {Number} n
 * @returns {String}
 */
exports['mid$'] = function(s, i, n) {
    this.validate(s, 'string');
    this.validate(i, 'number');
    this.validate(n, 'number');
    return s.substr(i, n);
};

/**
 * Take n characters from string's right
 *
 * @param {String} s
 * @param {Number} n
 * @returns {String}
 */
exports['right$'] = function(s, n) {
    this.validate(s, 'string');
    this.validate(n, 'number');
    return s.substr(-n);
};

/**
 * Return string length
 *
 * @param {String} s
 * @returns {Number}
 */
exports.len = function(s) {
    this.validate(s, 'string');
    return s.length;
};

/**
 * Convert string into a number
 *
 * @param {String} s
 * @returns {Number}
 */
exports.val = function(s) {
    this.validate(s, 'string');
    var num = parseFloat(s);
    if (isNaN(num)) throw new Error('String is not a number');
    return num;
};

/**
 * Convert number into a string
 *
 * @param {Number} n
 * @returns {String}
 */
exports['str$'] = function(n) {
    this.validate(n, 'number');
    return n.toString();
};

/**
 * Return ASCII code of strings first character
 *
 * @param {String} s
 * @returns {Number}
 */
exports.asc = function(s) {
    this.validate(s, 'string');
    return s.charCodeAt(0);
};

/**
 * Return string containing a single ASCII character
 *
 * @param {Number} n
 * @returns {String}
 */
exports['chr$'] = function(n) {
    this.validate(n, 'number');
    return String.fromCharCode(n);
};

/**
 * Return string containing n space characters
 *
 * @param {Number} n
 * @returns {String}
 */
exports['spc$'] = function(n) {
    this.validate(n, 'number');
    return (new Array(n + 1)).join(' ');
};