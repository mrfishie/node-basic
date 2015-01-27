/**
 * TODO
 */
function PlayCommand() {}

PlayCommand.prototype.execute = function(data, next) { next(); };

module.exports = PlayCommand;