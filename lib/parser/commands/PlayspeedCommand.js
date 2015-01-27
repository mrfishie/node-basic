/**
 * TODO
 */
function PlayspeedCommand() {}

PlayspeedCommand.prototype.execute = function(data, next) { next(); };

module.exports = PlayspeedCommand;