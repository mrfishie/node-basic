var ctx = require('../IOInterface').get('draw');

/**
 * Returns if the mouse is currently pressed
 *
 * @returns {number}
 */
exports.touch = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'mousedown') return;
        cancel();
        result = response.data;
    });
    ctx.write({ command: "mousedown" });
    return result;
};

/**
 * Returns the mouse X position
 *
 * @returns {number}
 */
exports.touchx = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'mousepos') return;
        cancel();
        result = response.data.x;
    });
    ctx.write({ command: 'mousepos' });
    return result;
};

/**
 * Returns the mouse Y position
 *
 * @returns {number}
 */
exports.touchy = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'mousepos') return;
        cancel();
        result = response.data.y;
    });
    ctx.write({ command: 'mousepos' });
    return result;
};

/**
 * Returns the canvas width
 *
 * @returns {number}
 */
exports.screenwidth = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'screensize') return;
        cancel();
        result = response.data.width;
    });
    ctx.write({ command: 'screensize' });
    return result;
};

/**
 * Returns the canvas height
 *
 * @returns {number}
 */
exports.screenheight = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'screensize') return;
        cancel();
        result = response.data.height;
    });
    ctx.write({ command: 'screensize' });
    return result;
};

/**
 * Returns if the canvas height is bigger than width
 *
 * @returns {number}
 */
exports.isportrait = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'screensize') return;
        cancel();
        result = response.data.height > response.data.width ? 1 : 0;
    });
    ctx.write({ command: 'screensize' });
    return result;
};

/**
 * Returns if the canvas width is bigger than height
 *
 * @returns {number}
 */
exports.islandscape = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'screensize') return;
        cancel();
        result = response.data.height <= response.data.width ? 1 : 0;
    });
    ctx.write({ command: 'screensize' });
    return result;
};

/**
 * Returns the X mouse offset from the center, between -1 and 1
 *
 * @returns {number}
 */
exports.accelx = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'accel') return;
        cancel();
        result = response.data.x;
    });
    ctx.write({ command: 'accel' });
    return result;
};

/**
 * Returns the Y mouse offset from the center, between -1 and 1
 *
 * @returns {number}
 */
exports.accely = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'accel') return;
        cancel();
        result = response.data.y;
    });
    ctx.write({ command: 'accel' });
    return result;
};

/**
 * Returns the mouse scroll offset from the center (default), between -1 and 1
 *
 * @returns {number}
 */
exports.accelz = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'accel') return;
        cancel();
        result = response.data.z;
    });
    ctx.write({ command: 'accel' });
    return result;
};

/**
 * Gets the width of the sprite
 *
 * @param {Number} id
 * @returns {Number}
 */
exports.spritewidth = function(id) {
    var sprite = this.private.sprites[id];
    if (!sprite) throw new Error('Invalid sprite ID');
    return sprite.width;
};

/**
 * Gets the height of the sprite
 *
 * @param {Number} id
 * @returns {Number}
 */
exports.spriteheight = function(id) {
    var sprite = this.private.sprites[id];
    if (!sprite) throw new Error('Invalid sprite ID');
    return sprite.height;
};