var basic = require('../');

/**
 * BASIC REPL command - A BASIC REPL
 *
 * @param {Array} args Command-line arguments
 */
module.exports = function(args) {
    basic.repl.start();
};
