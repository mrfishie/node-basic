/**
 * Sets a random seed
 *
 * @constructor
 */
function RandomizeCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
RandomizeCommand.prototype.execute = function(data, next) {
    data.setPrivate('rnd_seed', Math.random());
    next();
};

module.exports = RandomizeCommand;