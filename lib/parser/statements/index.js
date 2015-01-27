/**
 * 'Statements' are the nodes in the abstract syntax tree.
 * Each statement either holds other statements or a Javascript primitive, and has
 * the ability to parse the input and execute it later.
 */

exports.operators = require('./operators');
exports.ArgumentStatement = require('./ArgumentStatement');
exports.AssignmentStatement = require('./AssignmentStatement');
exports.CommandStatement = require('./CommandStatement');
exports.CommentStatement = require('./CommentStatement');
exports.EmptyStatement = require('./EmptyStatement');
exports.ExpressionStatement = require('./ExpressionStatement');
exports.FunctionStatement = require('./FunctionStatement');
exports.NumberStatement = require('./NumberStatement');
exports.PointerStatement = require('./PointerStatement');
exports.StringStatement = require('./StringStatement');
exports.VariableStatement = require('./VariableStatement');