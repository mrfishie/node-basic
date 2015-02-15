var functions = require('../functions');
var statements = require('../parser/statements');
var domain = require('domain');
var util = require('util');
var pUtil = require('../util');
var EventEmitter = require('events').EventEmitter;


/**
 * An object that provides modification and reading of the current execution
 * context, as well as the ability to execute an AST in the context
 *
 * @param {Object?} options Options for execution
 * @constructor
 */
function ExecutionContext(options) {
    EventEmitter.call(this);

    this.stringVars = {};
    this.numberVars = {};
    this.pointers = {};
    this.gosubs = [];
    this.private = {
        rnd_seed: Math.random(),
        sprites: [],
        data: []
    };
    this.constants = require('./constants');
    this.running = false;
    options = options || {};
    this.options = options;

    if (typeof options.delay === 'undefined') options.delay = false;

    // Copy all functions as constants
    for (var k in functions) {
        if (!functions.hasOwnProperty(k)) continue;
        this.constants[k] = functions[k];
    }

    // Stop multiple contexts conflicting with constants
    this.constants = pUtil.shallowClone(this.constants);
}

util.inherits(ExecutionContext, EventEmitter);


/**
 * Begins execution of the AST
 *
 * @param {Array} root The root nodes in the AST
 * @param {Object} labels A list of all labels and lines
 * @param {Function?} done A function to call when the execution is terminated
 */
ExecutionContext.prototype.execute = function(root, labels, done) {
    this.root = root;
    this.labels = labels;
    this.cursor = this.options.cursorStart || 0;
    this.running = true;
    this.domain = domain.create();

    var self = this;
    this.done = function(err) {
        console.log('done!');
        self.emit('terminated', err);
        if (done) done.apply(this, arguments);
    };

    this.error = false;

    this.domain.on('error', function(err) {
        self.error = err;
        self.emit('error', err);
        self.running = false;
        done(err);
    });

    this.domain.run(function() {
        process.nextTick(function() {
            self.nextLine();
        });
    });
};

/**
 * Executes the current cursor line and increments the cursor
 */
ExecutionContext.prototype.nextLine = function() {
    this.emit('beforeLine');
    this.cursor = this.cursor.valueOf();
    if (this.root.length <= this.cursor) this.terminate();
    if (!this.running) {
        this.done(this.error);
        return;
    }

    this.emit('line', this.root[this.cursor]);
    if (this.root.length <= this.cursor) {
        this.terminate();
        this.done();
        return;
    }

    var currentLine = this.root[this.cursor];
    var executionResult = currentLine.execute(this);

    var self = this;
    this.cursor++;

    if (typeof executionResult === 'function') {
        executionResult(function(err) {
            if (err) {
                self.error = new Error(err.message + " on line " + self.cursor);
                self.terminate();
            }
            self.nextLine();
        });
    } else this.nextLine();
};

/**
 * Validates a variable against a type
 *
 * @param {*} v The variable to validate
 * @param {String} type The type to validate
 * @throws Error if validation fails
 */
ExecutionContext.prototype.validate = function(v, type) {
    if (typeof v !== type) throw new Error('Types mismatch');
};

/**
 * Sets a variable
 *
 * @param {VariableStatement|FunctionStatement} variable The variable
 * @param {ExpressionStatement|Number|String} value The new value
 */
ExecutionContext.prototype.setVariable = function(variable, value) {
    var map = variable.type === 'string' ? this.stringVars : this.numberVars;

    if (value.error) throw value.error;

    var realValue = value;
    if (value instanceof statements.ExpressionStatement) realValue = value.execute(this);

    if (variable.type === 'string') realValue = String(realValue);
    else {
        realValue = parseFloat(realValue);
        if (isNaN(realValue)) throw new Error('Types mismatch');
    }

    var isArray, dimensions;

    // Handle an array passed as an argument to a command
    if (variable instanceof statements.FunctionStatement) {
        if (!Array.isArray(map[variable.name])) throw new Error('Invalid operation');
        isArray = true;
        dimensions = variable.args;
    } else {
        isArray = variable.isArray;
        dimensions = variable.dimensions;
    }

    if (isArray) setArrayIndexAt(map[variable.name], dimensions, realValue, this);
    else map[variable.name] = realValue;
};

/**
 * Gets a variable, constant or function
 *
 * @param {VariableStatement} variable The variable to get
 * @returns {Number|String} The value of the variable or constant
 */
ExecutionContext.prototype.getVariable = function(variable) {
    var value;

    if (variable.type === 'string' && typeof this.constants[variable.name + '$'] !== 'undefined') {
        value = this.constants[variable.name + '$'];
    } else if (variable.type === 'number' && typeof this.constants[variable.name] !== 'undefined') {
        value = this.constants[variable.name];
    } else if (variable.type === 'string' && typeof this.constants[variable.name.toLowerCase() + '$'] === 'function') {
        value = this.constants[variable.name.toLowerCase() + '$'];
    } else if (variable.type === 'number' && typeof this.constants[variable.name.toLowerCase()] === 'function') {
        value = this.constants[variable.name.toLowerCase()];
    } else {
        var map = variable.type === 'string' ? this.stringVars : this.numberVars;

        // This really shouldn't happen (it should be detected as a function by the parser), but we'll check to
        // make sure anyway
        if (variable.isArray) {
            return getArrayIndexAt(map[variable.name], variable.dimensions, this);
        }
        if (typeof map[variable.name] === 'undefined') {
            if (variable.type === 'string') return '';
            else return 0;
        }
        value = map[variable.name];
    }

    if (typeof value === 'function') return value.call(this);
    else return value;
};

/**
 * Gets the value of a pointer
 *
 * @param {PointerStatement} pointer
 * @returns {*}
 */
ExecutionContext.prototype.getPointer = function(pointer) {
    var value = this.pointers[pointer.id];
    if (typeof value === 'undefined') throw new Error('Invalid pointer');
    return value;
};

/**
 * Sets the value of a pointer
 *
 * @param {PointerStatement} pointer
 * @param {*} value
 */
ExecutionContext.prototype.setPointer = function(pointer, value) {
    this.pointers[pointer.id] = value;
};

/**
 * Sets the value of a constant
 *
 * @param {String} name The name of the constant
 * @param {String|Number} value The value of the constant
 */
ExecutionContext.prototype.setConstant = function(name, value) {
    this.constants[name] = value;
};

/**
 * Gets a private variable
 *
 * @param {String} name The name of the private variable
 * @returns {*} The value of the variable
 */
ExecutionContext.prototype.getPrivate = function(name) {
    return this.private[name];
};

/**
 * Sets a private variable
 *
 * @param {String} name The name of the private variable
 * @param {*} value The value of the variable
 */
ExecutionContext.prototype.setPrivate = function(name, value) {
    this.private[name] = value;
};

/**
 * Defines an array
 *
 * @param {String} name The name of the array
 * @param {Array<Number>} lengths The lengths of each dimension
 */
ExecutionContext.prototype.defineArray = function(name, lengths) {
    var type = 'number';
    if (name[name.length - 1] === '$') {
        type = 'string';
        name = name.substring(0, name.length - 1);
    }
    var array = createArrayDepth(lengths, type === 'string' ? '' : 0);

    var map = type === 'string' ? this.stringVars : this.numberVars;
    map[name] = array;
};

/**
 * Calls a function
 *
 * @param {FunctionStatement} funcObj The function to call
 * @param {Array} args The arguments to provide
 */
ExecutionContext.prototype.callFunction = function(funcObj, args) {
    var funcName = funcObj.name + (funcObj.type === 'string' ? '$' : '');
    var func = this.constants[funcName.toLowerCase()];
    if (!func) {
        // It could be an array call
        var map = funcObj.type === 'string' ? this.stringVars : this.numberVars;
        var arr = map[funcObj.name];
        if (Array.isArray(arr)) return getArrayIndexAt(arr, args, this);
        throw new Error('Unknown function ' + funcName);
    }

    return func.apply(this, args);
};

/**
 * Executes the specified command
 *
 * @param {Object} cmd The command to execute
 * @returns {Function<Function>} provide a function to call when execution is complete
 */
ExecutionContext.prototype.callCommand = function(cmd) {
    var self = this;

    function callFunc(newDone) {
        try {
            cmd.execute(self, newDone);
        } catch (ex) {
            newDone(ex);
        }
    }
    var cmdDelay = self.options.delay;
    if (cmdDelay !== false) {
        var oldCallFunc = callFunc;
        callFunc = function(newDone) {
            setTimeout(function() {
                oldCallFunc(newDone);
            }, cmdDelay);
        }
    }

    return callFunc;
};

/**
 * Goes to a label, and returns on RETURN
 *
 * @param {String} label The name of the label to go to
 */
ExecutionContext.prototype.gosubLabel = function(label) {
    label = label.toLowerCase();
    if (typeof this.labels[label] === 'undefined') throw new Error('Undefined label "' + label + '"');
    this.gosubs.push(this.cursor);
    this.cursor = this.labels[label];
};

/**
 * Goes to a label
 *
 * @param {String} label The name of the label to go to
 */
ExecutionContext.prototype.gotoLabel = function(label) {
    label = label.toLowerCase();
    if (typeof this.labels[label] === 'undefined') throw new Error('Undefined label "' + label + '"');
    this.cursor = this.labels[label];
};

/**
 * Returns to the last GOSUB position
 */
ExecutionContext.prototype.returnLabel = function() {
    if (!this.gosubs.length) throw new Error('RETURN without GOSUB');
    this.cursor = this.gosubs.pop();
};

/**
 * Ends the program
 */
ExecutionContext.prototype.terminate = function() {
    this.running = false;
};

/**
 * Sets the array item at a certain index, including multiple dimensions
 *
 * @param {Array} arr The array to search
 * @param {Array<ExpressionStatement>} dimensions An array of indexes
 * @param {String|Number} val The value to put in the array
 * @param {ExecutionContext} data The execution data context
 * @private
 */
function setArrayIndexAt(arr, dimensions, val, data) {
    var currentDimension = dimensions[0].execute(data);
    data.validate(currentDimension, 'number');
    currentDimension -= 1;
    if (currentDimension < 0) currentDimension = 0;

    if (arr.length <= currentDimension) throw new Error('Invalid array bounds');
    var item = arr[currentDimension];
    if (dimensions.length > 1) {
        if (!Array.isArray(item)) throw new Error('Invalid array dimensions');
        return setArrayIndexAt(arr[currentDimension], dimensions.slice(1), val,  data);
    } else arr[currentDimension] = val;
}

/**
 * Gets the array item at a certain index, including multiple dimensions
 *
 * @param {Array} arr The array to search
 * @param {Array<ExpressionStatement>} dimensions An array of indexes
 * @param {ExecutionContext} data The execution data context
 * @returns {Number|String}
 * @private
 */
function getArrayIndexAt(arr, dimensions, data) {
    var currentDimension = dimensions[0];
    data.validate(currentDimension, 'number');
    currentDimension = Math.max(0, Math.floor(currentDimension - 1));

    if (arr.length <= currentDimension) throw new Error('Invalid array bounds');
    var item = arr[currentDimension];
    if (dimensions.length > 1) {
        if (!Array.isArray(item)) throw new Error('Invalid array dimensions');
        return getArrayIndexAt(arr[currentDimension], dimensions.slice(1), data);
    } else return item;
}

/**
 * Creates an array with the specified lengths of dimensions
 *
 * @param {Array<Number>} dimensions The array dimensions
 * @param {*} endpoint The value for the array endpoint
 * @private
 */
function createArrayDepth(dimensions, endpoint) {
    var currentDimension = dimensions[0];

    var newArr = new Array(currentDimension);
    for (var i = 0; i < currentDimension; i++) {
        var value = endpoint;
        if (dimensions.length > 1) value = createArrayDepth(dimensions.slice(1), endpoint);
        newArr[i] = value;
    }
    return newArr;
}

module.exports = ExecutionContext;