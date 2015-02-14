var basic = require('../');
var util = require('util');
var fs = require('fs');
var IOInterface = require('../lib/IOInterface');
var rl = IOInterface.getDefault();

/**
 * BASIC EXEC command - executes code
 *
 * @param {Array} args Command-line arguments
 */
module.exports = function(args) {
    console.log('Enter code, use EXIT command to finish');

    if (args.length) {
        var file = args[0];
        fs.readFile(file, {
            encoding: 'utf8'
        }, function(err, data) {
            if (err) throw err;
            run(data);
        });
    } else {
        getCode(function (code) {
            run(code);
        }, []);
    }

    function run(code) {
        console.time('parse');
        var ast = basic.parser.parse(code);
        if (ast.error) throw ast.error;

        console.log('');
        console.timeEnd('parse');
        //console.log("Interpreted as:");
        //console.log(ast.toString());

        console.log("\nExecuting...");
        console.time('exec');

        basic.executor.execute(ast, function(err) {
            if (err) {
                console.log(err instanceof basic.parser.SyntaxError ? "SYNTAX ERROR:" : "ERROR:", err.message);
            }
            console.log('');
            console.timeEnd('exec');
        });
    }
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