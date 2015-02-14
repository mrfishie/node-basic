var basic = require('../');
var util = require('util');
var IOInterface = require('../lib/IOInterface');
var rl = IOInterface.getDefault();

/**
 * BASIC AST command - outputs the abstract syntax tree from parsing
 *
 * @param {Array} args Command-line arguments
 */
module.exports = function(args) {
    console.log('Enter code, use EXIT command to finish');

    getCode(function(code) {
        var parsed = basic.parser.parse(code);
        if (parsed.error) throw parsed.error;

        console.log(util.inspect({
            root: parsed.root,
            labels: parsed.labels
        }, {
            depth: 20,
            colors: true
        }));
    }, []);

};

/**
 * Gets code from the CLI, use 'EXIT' to finish
 *
 * @param {Function} done A function to call when complete
 * @param {Array} previous The previously entered code
 */
function getCode(done, previous) {
    rl.question("", function(cmd) {
        var splitCmd = cmd.split(' ');
        if (splitCmd.length && splitCmd[0].toLowerCase() === 'exit') done(previous.join('\n'));
        else {
            previous.push(cmd);
            getCode(done, previous);
        }
    });
}