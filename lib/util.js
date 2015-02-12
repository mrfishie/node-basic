/**
 * Finds the next one of the items
 *
 * @param {String} data The string to search
 * @param {Array<String>} items The items to find
 * @param {Number=0} index The start index
 * @returns {{index: Number, found: String}} The found index and the found item
 */
function findNext(data, items, index) {
    var currentIndex = data.length + 1, found = '';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var location = data.indexOf(item, index);
        if (location !== -1 && location < currentIndex) {
            currentIndex = location;
            found = item;
        }
    }
    if (currentIndex === data.length + 1) return { index: -1, found: '' };
    return {
        index: currentIndex,
        found: found
    };
}

exports.findNext = findNext;

/**
 * Finds the last one of the items
 *
 * @param {String} data The string to search
 * @param {Array<String>} items The items to find
 * @param {Number=0} index The end index
 * @returns {{index: number, found: string}} The found index and the found item
 */
function findLast(data, items, index) {
    var currentIndex = -1, found = '';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var location = data.lastIndexOf(item, index);
        if (location > currentIndex) {
            currentIndex = location;
            found = item;
        }
    }
    return {
        index: currentIndex,
        found: found
    };
}

exports.findLast = findLast;

/**
 * Finds the next one of the items outside of the given positions
 *
 * @param {String} data The string to search
 * @param {Array<String>} items The items to find
 * @param {Number=0} index The start index
 * @param {Array<{start: Number, end: Number}>} exclude The boundaries to exclude
 * @returns {{index: Number, found: String}} The found index and the found item
 */
function findNextOutside(data, items, index, exclude) {
    var result, positionResult = {start: 0, end: index ? index - 1 : -1};

    do {
        result = findNext(data, items, positionResult.end + 1);
    } while (result.index !== -1 && (positionResult = inPosition(result.index, exclude)));
    return result;
}

exports.findNextOutside = findNextOutside;

/**
 * Finds the last one of the items outside of the given positions
 *
 * @param {String} data The string to search
 * @param {Array<String>} items The items to find
 * @param {Number?} index The end index
 * @param {Array<{start: Number, end: Number}>} exclude The boundaries to exclude
 * @returns {{index: Number, found: String}} The found index and the found item
 */
function findLastOutside(data, items, index, exclude) {
    var result, positionResult = {start: index ? index + 1 : data.length + 1, end: 0};

    do {
        result = findLast(data, items, positionResult.start - 1);
    } while (result.index !== -1 && (positionResult = inPosition(result.index, exclude)));
    return result;
}

exports.findLastOutside = findLastOutside;

/**
 * Finds the next index of the item outside of the given positions
 *
 * @param {String} data The string to search
 * @param {String} item The item to find
 * @param {Number=0} index The start index
 * @param {Array<{start: Number, end: Number}>} exclude The boundaries to exclude
 * @returns {Number} The found index, or -1 if none found
 */
function indexOfOutside(data, item, index, exclude) {
    var result, positionResult = {start: 0, end: index ? index - 1 : -1};

    do {
        result = data.indexOf(item, positionResult.end + 1);
    } while (result !== -1 && (positionResult = inPosition(result, exclude)));
    return result;
}

exports.indexOfOutside = indexOfOutside;

/**
 * Finds the last index of the item outside of the given positions
 *
 * @param {String} data The string to search
 * @param {String} item The item to find
 * @param {Number=data.length} index The end index
 * @param {Array<{start: Number, end: Number}>} exclude The boundaries to exclude
 * @returns {Number} The found index, or -1 if none found
 */
function lastIndexOfOutside(data, item, index, exclude) {
    var result, positionResult = {start: index ? index + 1 : data.length + 1, end: 0};

    do {
        result = data.lastIndexOf(item, positionResult.start - 1);
    } while (result.index !== -1 && (positionResult = inPosition(result.index, exclude)));
    return result;
}

exports.lastIndexOfOutside = lastIndexOfOutside;

/**
 * Splits data into an array by the separator, except if in the exclude regions
 *
 * @param {String} data The string to split
 * @param {String} separator The separator
 * @param {Array<{start: Number, end: Number}>} exclude The boundaries to exclude
 * @returns {Array<String>} The separated array
 */
function splitOutside(data, separator, exclude) {
    var result = [];

    var accumulator = "";
    for (var i = 0; i < data.length; i++) {
        accumulator += data[i];

        var isInExclusion = inPosition(i, exclude);
        if (!isInExclusion && endsWith(accumulator, separator)) {
            result.push(accumulator.substring(0, accumulator.length - separator.length));
            accumulator = '';
        }
    }
    result.push(accumulator);
    return result;
}

exports.splitOutside = splitOutside;

/**
 * Finds the start/end position of each item
 *
 * @param {String} data The string to search
 * @param {Array<{start: String, end: String}>} items The array of items to find
 * @returns {Array<{startChar: String, endChar: String, start: Number, end: Number}>} The found items and locations
 */
function findPositions(data, items) {
    var depth = 0;
    var rootId = -1;
    var result = [];
    var currentItem = {};

    var accumulator = '';
    for (var ci = 0; ci < data.length; ci++) {
        accumulator += data[ci];

        var matchedItem = false;
        for (var x = 0; x < items.length; x++) {
            var item = items[x];

            if (depth > 0 && endsWith(accumulator, item.end)) {
                depth--;
                if (depth === 0 && rootId === x) {
                    currentItem.end = ci - item.end.length + 1;
                    rootId = -1;
                    accumulator = '';
                    result.push(currentItem);
                    currentItem = {};
                }
            } else if (endsWith(accumulator, item.start)) {
                depth++;
                if (depth === 1 && rootId === -1) {
                    currentItem = {
                        startChar: item.start,
                        endChar: item.end,
                        start: ci
                    };
                    rootId = x;
                    accumulator = '';
                }
            }
        }
    }
    return result;
}

exports.findPositions = findPositions;

/**
 * Finds if the index is inside one of the items
 * Items should be in the same format as returned from util.findPositions
 *
 * @param {Number} index The index to check
 * @param {Array<{start: Number, end: Number}>} items The items to search
 * @returns {*} The start/end position if index is inside an item, else false
 */
function inPosition(index, items) {
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (index >= item.start && index <= item.end) return item;
    }
    return false;
}

exports.inPosition = inPosition;

/**
 * Finds if data ends with str
 *
 * @param {String} data The text to search
 * @param {String} str The text to find
 * @returns {Boolean} whether data ends with str
 */
function endsWith(data, str) {
    if (data.length < str.length) return false;
    if (data === str) return true;
    return data.lastIndexOf(str) === data.length - str.length;
}

exports.endsWith = endsWith;

/**
 * Pads a string
 *
 * @param {*} data The text to pad
 * @param {Number} length The padded length
 * @param {String?} pad The text to pad with, default is space
 * @returns {String}
 */
function pad(data, length, pad) {
    data = String(data);
    pad = pad || ' ';
    while (data.length < length) data += pad;
    return data;
}

exports.pad = pad;

/**
 * Shallowly clones the object into the source object
 *
 * @param {Object?} source The source object
 * @param {Object} obj The object to clone
 * @returns {Object} The source object
 */
function shallowClone(source, obj) {
    if (arguments.length < 2) {
        obj = source;
        source = {};
    }

    for (var key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        source[key] = obj[key];
    }
    return source;
}

exports.shallowClone = shallowClone;

/**
 * Uses setImmediate or setTimeout if unavailable
 */
exports.setImmediate = (function() {
    if (typeof setImmediate !== 'undefined') return setImmediate;
    return function(func) {
        setTimeout(func, 0);
    };
}());

/**
 * Gets the current high-resolution time in seconds, using process.hrtime or performance.now
 */
exports.now = (function() {
    if (process.hrtime) {
        return function() {
            var time = process.hrtime();
            return time[0] + (time[1] / 1e9);
        };
    } else {
        return function() {
            var now = window.performance.now();
            return now / 1000;
        };
    }
}());

/**
 * A deferred value
 *
 * @constructor
 */
function DeferredValue() {}

/**
 * Gets the value
 *
 * @returns {*}
 */
DeferredValue.prototype.valueOf = function() {
    return this.value;
};

exports.DeferredValue = DeferredValue;