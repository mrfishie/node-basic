/**
 * Function List
 */

intoExport(require('./number'));
intoExport(require('./string'));
intoExport(require('./graphics'));

/**
 * Copies the properties of an object to the exports
 *
 * @param {Object} obj The object to copy
 */
function intoExport(obj) {
    for (var k in obj) {
        if (!obj.hasOwnProperty(k)) continue;
        exports[k] = obj[k];
    }
}