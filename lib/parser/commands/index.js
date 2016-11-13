/**
 * Command list
 */

// Misc commands
exports.dim                 = require('./DimCommand');
exports.end                 = require('./EndCommand');
exports.gosub               = require('./GosubCommand');
exports.goto                = require('./GotoCommand');
exports.input               = require('./InputCommand');
exports.print               = require('./PrintCommand');
exports.randomize           = require('./RandomizeCommand');
exports.return              = require('./ReturnCommand');
exports.pause               = require('./PauseCommand');
exports.sleep               = require('./SleepCommand');
exports.cls                 = require('./ClsCommand');
exports.play                = require('./PlayCommand');
exports.volume              = require('./VolumeCommand');
exports.playspeed           = require('./PlayspeedCommand');
exports.restore             = require('./RestoreCommand');
exports.data                = require('./DataCommand');
exports.read                = require('./ReadCommand');

// Added by Joe
exports.shell               = require('./ShellCommand');

// Graphic commands
exports.color               = require('./ColorCommand');
exports.tcolor              = require('./TcolorCommand');
exports.bcolor              = require('./BcolorCommand');
exports.begindraw           = require('./BegindrawCommand');
exports.enddraw             = require('./EnddrawCommand');
exports.point               = require('./PointCommand');
exports.line                = require('./LineCommand');
exports.rect                = require('./RectCommand');
exports.rrect               = require('./RrectCommand');
exports.circle              = require('./CircleCommand');
exports.ellipse             = require('./EllipseCommand');
exports.shape               = require('./ShapeCommand');
exports.triangle            = require('./TriangleCommand');
exports.piechart            = require('./PiechartCommand');
exports.drawtext            = require('./DrawtextCommand');
exports.textfont            = require('./TextfontCommand');
exports.loadsprite          = require('./LoadspriteCommand');
exports.drawsprite          = require('./DrawspriteCommand');
exports.savesprite          = require('./SavespriteCommand');
exports.retina              = require('./RetinaCommand');
exports.antialias           = require('./AntialiasCommand');

exports.lockorientation     = require('./LockorientationCommand');
exports.requireportrait     = require('./RequireportraitCommand');
exports.requirelandscape    = require('./RequirelandscapeCommand');
exports.accelcalibrate      = require('./AccelcalibrateCommand');

// File commands
exports.open                = require('./OpenCommand');
exports.close               = require('./CloseCommand');

// Control statements
exports.while               = require('./WhileCommand');
exports.wend                = require('./WendCommand');
exports.if                  = require('./IfCommand');
exports.else                = require('./ElseCommand');
exports.endif               = require('./EndifCommand');
exports.for                 = require('./ForCommand');
exports.next                = require('./NextCommand');