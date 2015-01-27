/**
 * Does nothing, as retina is not possible on desktop
 */
function RetinaCommand() {}

RetinaCommand.prototype.execute = function(data, next) { next(); };

module.exports = RetinaCommand;