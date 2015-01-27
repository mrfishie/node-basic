#!/usr/bin/env node

/**
 * BASIC command-line interface
 */

var commands = ['ast', 'exec', 'repl'];

if (process.argv.length > 2 && commands.indexOf(process.argv[2]) !== -1) {
    var cmd = require('./' + process.argv[2]);

    var args = process.argv.slice(3);
    cmd(args);
} else {
    console.log('Invalid command. Valid commands are:');
    console.log(commands.join());
}