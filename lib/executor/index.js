var ExecutionContext = require('./ExecutionContext');
var constants = require('./constants');

/**
 * Executes the abstract syntax tree
 *
 * @param {AbstractSyntaxTree} ast The tree to execute
 * @param {exports.ExecutionContext|ExecutionContext|Function?} ctx The context
 * @param {Function?} done Called when execution is complete
 */
function execute(ast, ctx, done) {
    if (!done && !(ctx instanceof ExecutionContext)) {
        done = ctx;
        ctx = new ExecutionContext();
    }

    ast.execute(ctx, done);
}

exports.execute = execute;

exports.ExecutionContext = ExecutionContext;
exports.constants = constants;