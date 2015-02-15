/**
 * Returns the sine of an angle
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.sin = function(a) {
    this.validate(a, 'number');
    return Math.sin(a);
};

/**
 * Returns the cosine of an angle
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.cos = function(a) {
    this.validate(a, 'number');
    return Math.cos(a);
};

/**
 * Returns the tangent of an angle
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.tan = function(a) {
    this.validate(a, 'number');
    return Math.tan(a);
};

/**
 * Returns the arc sine
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.asin = function(a) {
    this.validate(a, 'number');
    return Math.asin(a);
};

/**
 * Returns the arc cosine
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.acos = function(a) {
    this.validate(a, 'number');
    return Math.acos(a);
};

/**
 * Returns the arc tangent
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.atn = function(a) {
    this.validate(a, 'number');
    return Math.atan(a);
};

/**
 * Converts an angle from degrees to radians
 *
 * @param {Number} a Degrees
 * @returns {Number} Radians
 */
exports.rad = function(a) {
    this.validate(a, 'number');
    return Math.rad(a);
};

/**
 * Converts an angle from radians to degrees
 *
 * @param {Number} a Radians
 * @returns {Number} Degrees
 */
exports.deg = function(a) {
    this.validate(a, 'number');
    return Math.deg(a);
};

/**
 * Returns the square root of a number
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.sqr = function(n) {
    this.validate(n, 'number');
    return Math.sqrt(n);
};

/**
 * Returns the absolute value of a number
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.abs = function(n) {
    this.validate(n, 'number');
    return Math.abs(n);
};

/**
 * Returns the integer part of a floating-point number
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.int = function(n) {
    this.validate(n, 'number');
    return Math.floor(n);
};

/**
 * Returns the natural logarithm
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.log = function(n) {
    this.validate(n, 'number');
    return Math.log(n);
};

/**
 * Returns the common (base-10) logarithm
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.log10 = function(n) {
    this.validate(n, 'number');
    return Math.log10(n);
};

/**
 * Returns the base-e exponential function
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.exp = function(n) {
    this.validate(n, 'number');
    return Math.exp(n);
};

/**
 * Returns the floating-point remainder of a / b.
 *
 * @param {Number} a
 * @param {Number} b
 * @returns {Number}
 */
exports.mod = function(a, b) {
    this.validate(a, 'number');
    this.validate(b, 'number');
    return a % b;
};

/**
 * Gets a random number using a seed
 *
 * @returns {number}
 */
function getRandom(data) {
    var x = Math.sin(data.getPrivate('rnd_seed')) * 10000;
    data.setPrivate('rnd_seed', data.getPrivate('rnd_seed') + 1);
    return x - Math.floor(x);
}

/**
 * Generates and returns a random number from 0 to 1
 *
 * @param {Number?} min
 * @param {Number?} max
 * @returns {Number}
 */
exports.rnd = function(min, max) {
    if (typeof min !== 'undefined' && typeof max !== 'undefined') {
        this.validate(min, 'number');
        this.validate(max, 'number');
        return Math.floor(getRandom(this) * (max - min + 1)) + min;
    }
    return getRandom(this);
};

/**
 * Set random number generator seed
 *
 * @param {Number} seed
 */
exports.randomize = function(seed) {
    this.setPrivate('rnd_seed', seed);
};