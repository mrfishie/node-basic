/**
 * Javascript BASIC parser and editor
 */

exports.executor = require('./lib/executor');
exports.filesystem = require('./lib/filesystem');
exports.functions = require('./lib/functions');
exports.parser = require('./lib/parser');
exports.IOInterface = require('./lib/IOInterface');
exports.repl = require('./lib/repl');
exports.util = require('./lib/util');

// Create dummy IO interface
var IOInterface = require('./lib/IOInterface');
var drawInterface = new IOInterface();
drawInterface.setOutput(function(obj) {
    throw new Error('No drawing interface');
});
drawInterface.setInput(function() {
    throw new Error('No drawing interface');
});
IOInterface.set("draw", drawInterface);

/**
 * Quick-runs code
 *
 * @param {String} code
 * @param {exports.ExecutionContext|Function?} ctx
 * @param {Function?} done
 * @returns {ExecutionContext}
 */
exports.run = function(code, ctx, done) {
    if (!done && !(ctx instanceof exports.executor.ExecutionContext)) {
        done = ctx;
        ctx = new exports.executor.ExecutionContext();
    }

    var ast = exports.parser.parse(code);
    if (ast.error) {
        if (done) {
            process.nextTick(function() {
                done(ast.error);
            });
        }
        return ctx;
    }
    try {
        exports.executor.execute(ast, ctx, done);
    } catch (err) {
        done(err);
        return ctx;
    }
    return ctx;
};