/**
 * Does nothing, as Javascript doesnt allow disabling of antialiasing
 */
function AntialiasCommand() {}

AntialiasCommand.prototype.execute = function(data, next) { next(); };

module.exports = AntialiasCommand;