/**
 * TODO
 */
function VolumeCommand() {}

VolumeCommand.prototype.execute = function(data, next) { next(); };

module.exports = VolumeCommand;