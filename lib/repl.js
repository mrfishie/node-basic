/**
 * BASIC REPL
 *
 * Implements a similar interface to Node's REPL package
 */
var IOInterface = require('./IOInterface');
var rl = IOInterface.getDefault();
var fs = require('fs');
var ExecutionContext = require('./executor/ExecutionContext');
var AbstractSyntaxTree = require('./parser/AbstractSyntaxTree');
var BlockManager = require('./parser/Block/index');
var parser = require('./parser/index');
var statements = require('./parser/statements/index');
var SyntaxError = require('./parser/SyntaxError');
var commands = require('./parser/commands/index');
var commandNames = Object.keys(commands);
var upperCommandNames = [];
for (var i = 0; i < commandNames.length; i++) upperCommandNames.push(commandNames[i].toUpperCase());

/**
 * Starts the REPL. Options can be:
 *
 *  - `prompt` - the prompt and `stream` for all I/O. Defaults to `> `.
 *  - `eval` - function that will be used to eval each given line. Defaults to an async wrapper for `executor.execute`.
 *  - `completer` - function that will be used for auto-completing.
 *
 * @param {Object} options Options for the REPL
 */
function start(options) {
    options = options || {};

    var prompt = options.prompt || '> ';

    var eval = options.eval || run;

    var context = new ExecutionContext();
    var manager = new BlockManager();
    var ast = new AbstractSyntaxTree([], {}, manager);
    nextLine(context, ast, prompt, prompt, -1, eval);
}

exports.start = start;

/**
 * The default eval function
 *
 * @param {String} cmd The command to be executed
 * @param {ExecutionContext} context The current execution context
 * @param {AbstractSyntaxTree} ast The current abstract syntax tree
 * @param {Number} cursor The position for the cursor
 * @param {Function} next A function to call when complete
 * @private
 */
function run(cmd, context, ast, cursor, next) {
    try {
        // Must be a command
        if (cmd[0] === ".") {
            var command = cmd.substring(1);
            var spaceIndex = command.indexOf(" ");

            var args = "";
            if (spaceIndex !== -1) {
                args = command.substring(spaceIndex + 1).trim();
                command = command.substring(0, spaceIndex).trim();
            }

            switch (command) {
                case "break":
                    ast.root.splice(context._blockStart);
                    context._blockStart = false;
                    next();
                break;
                case "clear":
                    context._blockStart = false;
                    context.root = ast.root = [];
                    context.labels = ast.labels = {};
                    context.options.cursorStart = 0;
                    context.gosubs = [];
                    context.stringVars = {};
                    context.numberVars = {};
                    context.pointers = {};
                    next();
                break;
                case "exit":
                    // TODO
                break;
                case "help":
                    rl.write(".break       - Clear the current multi-line expression\n");
                    rl.write(".clear       - Reset the current context and clear the current multi-line expression\n");
                    rl.write(".exit        - Close the I/O stream, causing the REPL to exit\n");
                    rl.write(".help        - Show this list of special commands\n");
                    rl.write(".load <file> - Load a file into the session\n");
                    rl.write(".save <file> - Save the current session\n");
                    next();
                break;
                case "load":
                    fs.readFile(args, {
                        encoding: 'utf8'
                    }, function(err, data) {
                        try {
                            if (err) throw err;

                            var lines = data.split("\n");
                            for (var i = 0; i < lines.length; i++) {
                                var line = lines[i];
                                var parsedLine = parser.parseLine(line, ast.root.length, ast.labels, false, ast.manager);
                                if (parsedLine instanceof SyntaxError) throw parsedLine;
                                if (parsedLine.error) throw parsedLine.error;
                                ast.root.push(parsedLine);
                            }
                            ast.manager.parse(ast);
                            ast.execute(context, next);
                        } catch (err) {
                            rl.write(err + "\n");
                            next();
                        }
                    });
                break;
                case "save":
                    var code = ast.toString();
                    fs.writeFile(args, code, function(err) {
                        if (err) {
                            rl.write(err + "\n");
                        }
                        next();
                    });
                break;
                default:
                    throw new Error('Unknown REPL command');
            }
            return;
        }

        var line = parser.parseLine(cmd, ast.root.length, ast.labels, false, ast.manager);
        if (line instanceof SyntaxError) throw line;
        if (line.error) throw line.error;

        ast.root.push(line);
        ast.manager.parse(ast);
        if (typeof context._blockStart === 'number') {
            context.options.cursorStart = context._blockStart;
            context._blockStart = false;
        } else context.options.cursorStart = cursor;
        ast.execute(context, next);
    } catch (err) {
        var message = err.message;

        // Detect x without y and add a layer
        if (err instanceof SyntaxError && message.indexOf('without') !== -1) {
            if (typeof context._blockStart !== 'number') context._blockStart = ast.root.length - 1;
            next('... ');
        } else {
            rl.write(err + "\n");
            ast.root.pop();
            ast.root.push(new statements.EmptyStatement());
            next();
        }
    }
}

/**
 * Inputs and executes the next line
 *
 * @param {ExecutionContext} context The current execution context
 * @param {AbstractSyntaxTree} ast The current abstract syntax tree
 * @param {String} prompt
 * @param {String} oldPrompt
 * @param {Number} forceCursor
 * @param {Function} eval The function to evaluate
 * @private
 */
function nextLine(context, ast, prompt, oldPrompt, forceCursor, eval) {
    rl.question(prompt, function(answer) {
        eval(answer, context, ast, forceCursor === -1 ? ast.root.length : forceCursor, function(newPrompt, newCursor) {
            nextLine(context, ast, newPrompt || oldPrompt, oldPrompt, typeof newCursor === 'undefined' ? -1 : newCursor, eval);
        });
    });
}