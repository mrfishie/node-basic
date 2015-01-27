# node-basic documentation
## Parser Examples

### Parsing a file

	var fs = require('fs');
	var basic = require('basic');
	
	function readFile(file, done) {
		fs.readFile(file, { encoding: 'utf8' }, function(err, data) {
			if (err) return done(err);
			
			var ast = basic.parser.parse(data);
			done(false, ast);
		});
	}

### Generating code from an AST

	var fs = require('fs');
	
	function writeCode(ast, file, done) {
		fs.writeFile(file, ast.toString(), { encoding: 'utf8' }, done);
	}

### Generating JSON from an AST

	var fs = require('fs');
	
	function writeJSON(ast, file, done) {
		fs.writeFile(file, ast.toJSON(), { encoding: 'utf8' }, done);
	}

### A simple REPL (read-eval-print-loop)

	var basic = require('basic');
	var rl = basic.IOInterface.getDefault();
	
	var context = new ExecutionContext();
	var manager = new BlockManager();
	var ast = new AbstractSyntaxTree([], {}, manager);
	
	function run() {
		rl.readln(function(cmd) {
			var line = basic.parser.parseLine(cmd, ast.root.length, ast.labels, false, ast.manager);
			ast.root.push(line);
			ast.manager.parse(ast);
			context.options.cursorStart++;
			ast.execute(context, run);
		});
	}