var util = require('./util');
var stream = require('stream');

/**
 * An interface for custom input/output
 *
 * @param {Function?} output An output function
 * @param {Function?} input An input function
 * @param {Object?} data Data
 */
function IOInterface(output, input, data) {
    this._output = output || function() { };
    this._input = input || function(done) { done('\n'); };
    this._data = data || {};
}

IOInterface.IOInterface = IOInterface;

/**
 * Sets the output function
 *
 * @param {Function} output
 */
IOInterface.prototype.setOutput = function(output) {
    this._output = output;
};

/**
 * Sets the input function
 *
 * @param {Function} input
 */
IOInterface.prototype.setInput = function(input) {
    this._input = input;
};

/**
 * Writes something to the interface
 *
 * @param {*} text
 * @throws Error if output is not a function
 */
IOInterface.prototype.write = function(text) {
    if (typeof this._output !== "function") throw new Error('output is not a function');
    this._output.call(this._data, text);
};

/**
 * Writes a line to the interface
 *
 * @param {String} text
 * @throws Error if output is not a function
 */
IOInterface.prototype.writeln = function(text) {
    this.write(text + '\n');
};
IOInterface.prototype.log = IOInterface.prototype.writeln;

/**
 * Continues reading characters until the function calls the cancel argument
 *
 * @param {Function} callback Passed current character, total value, and cancel function
 * @throws Error if input is not a function
 */
IOInterface.prototype.read = function(callback) {
    if (typeof this._input !== "function") throw new Error('input is not a function');
    var value = '', self = this, running = true;

    function sendInput(chars, override) {
        if (!running) return;

        if (override) value = chars + ' ';

        for (var i = 0; i < chars.length; i++) {
            var args = [chars[i]];
            if (typeof chars[i] === 'string') {
                if (!override) value += chars[i];
                args.push(value);
            }
            args.push(function() {
                self._input.call(self._data, false);
                running = false;
            });

            callback.apply({}, args);
        }
    }
    sendInput.cancel = function() {
        self._input.call(self._data, false);
        running = false;
    };

    self._input.call(self._data, sendInput);
};

/**
 * Reads until a newline is detected
 *
 * @param {Function} callback Passed the final value
 * @throws Error if input is not a function
 */
IOInterface.prototype.readln = function(callback) {
    this.read(function(char, value, cancel) {
        if (char === "\n") {
            cancel();
            var result = value.substring(0, value.length - 1);
            callback(result);
        }
    });
};

/**
 * Writes the text and then reads until the new line
 *
 * @param {String} text
 * @param {Function} response Called with the response
 */
IOInterface.prototype.question = function(text, response) {
    this.write(text);
    this.readln(response);
};

var interfaces = {};
var addedHandlers = {};

/**
 * Sets an interface
 *
 * @param {String} name The name of the interface
 * @param {IOInterface} inf The interface
 * @throws Error if inf is not an instance of IOInterface
 */
IOInterface.set = function(name, inf) {
    if (!(inf instanceof IOInterface)) throw new Error("Interface is not an instance of IOInterface");
    name = name.toLowerCase();
    interfaces[name] = inf;
    if (addedHandlers[name] && addedHandlers[name].length) {
        for (var i = 0; i < addedHandlers[name].length; i++) {
            addedHandlers[name][i]();
        }
    }
};

/**
 * Gets an interface. If an interface doesn't exist the default will be returned.
 * If the interface is later changed (i.e a new interface replaces the current one),
 * the interface object will reflect to change that. Set the second parameter to
 * false to stop this
 *
 * @param {String} name The name of the interface
 * @param {Boolean=true} update Update the interface if a new one replaces it
 * @returns {IOInterface} The interface, or the default if the required one doesn't exist
 */
IOInterface.get = function(name, update) {
    name = name.toLowerCase();

    var result;
    if (!interfaces[name]) result = IOInterface.getDefault();
    else {
        var inf = interfaces[name];
        result = new IOInterface(inf._output, inf._input, util.shallowClone(inf._data));
    }

    if (update !== false) {
        if (!addedHandlers[name]) addedHandlers[name] = [];
        addedHandlers[name].push(function () {
            var item = IOInterface.get(name, false);
            result._output = item._output;
            result._input = item._input;
            result._data = item._data;
        });
    }
    return result;
};

/**
 * Sets an interface as the default
 *
 * @param {IOInterface} inf The interface
 */
IOInterface.setDefault = function(inf) {
    IOInterface.set("default", inf);
};

/**
 * Gets the default interface
 *
 * @returns {IOInterface}
 */
IOInterface.getDefault = function() {
    return this.get("default");
};

// Create the default interface
var defaultInterface = new IOInterface();

if (process.browser) {
    // If running in a browser (e.g. with Browserify) use console.log
    defaultInterface._data.accumulator = '';

    defaultInterface.setOutput(function(text) {
        this.accumulator += text;
        var splitLines = this.accumulator.split('\n');
        if (splitLines.length > 1) {
            if (splitLines[splitLines.length - 1] === '') {
                this.accumulator = this.accumulator.substring(0, this.accumulator.length - 1);
            }
            console.log(this.accumulator);
            this.accumulator = '';
        }
    });

    // Browser has no input method
} else {
    // If running in Node, use stdin and stdout
    process.stdin.setEncoding('utf8');

    defaultInterface.setOutput(function(text) {
        process.stdout.write(text);
    });

    defaultInterface.setInput(function(cb) {
        if (cb) {
            if (this.reader) process.stdin.removeListener('readable', this.reader);

            this.reader = function () {
                var chunk = process.stdin.read();
                if (chunk != null) cb(chunk);
            };
            process.stdin.on('readable', this.reader);
        } else process.stdin.removeListener('readable', this.reader);
    });
}

IOInterface.setDefault(defaultInterface);

module.exports = IOInterface;