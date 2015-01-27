/**
 * BASIC Filesystem
 */

var fs = require('fs');
var Drive = require('./Drive');

var allowedDrives = ["a", "b"];

var fileContents = process.browser ? {} : false;
var driveCache = {};

exports.Drive = Drive;
exports.File = require('./File');

/**
 * Initializes the file system
 *
 * @param {Function?} done A callback for when initialization is complete
 */
function initialize(done) {
    done = done || function() { };
    if (fileContents) done();

    fs.readFile(__dirname + '/../../data/filesystem.json', {
        encoding: 'utf8'
    }, function(err, data) {
        if (err) fileContents = {};
        else fileContents = JSON.parse(data);
        done();
    });
}
exports.initialize = initialize;

/**
 * Returns whether the filesystem is initialized
 *
 * @returns {boolean}
 */
function initialized() {
    return Boolean(fileContents);
}
exports.initialized = initialized;

/**
 * Gets a drive. Using the 'done' parameter is recommended (the filesystem will be initialized if it hasn't been)
 *
 * @param {String} name The name of the drive
 * @param {Function<Drive>?} done A callback to call when the drive is acquired
 * @returns {Drive|undefined} The drive, or undefined if not yet initialized
 */
function drive(name, done) {
    name = name.toLowerCase();
    done = done || function() { };

    if (allowedDrives.indexOf(name) === -1) return done(new Error("Unknown drive"));
    if (!fileContents) return initialize(function() { drive(name, done); });

    if (!fileContents[name]) fileContents[name] = {};
    if (!driveCache[name]) driveCache[name] = new Drive(name, fileContents[name]);

    done(driveCache[name]);
    return driveCache[name];
}
exports.drive = drive;

/**
 * Saves the filesystem
 *
 * @param {Function?} done A function to call when complete
 */
function save(done) {
    if (process.browser) return done();

    fs.writeFile(__dirname + '/../../data/filesystem.json', JSON.stringify(fileContents), function(err) {
        if (done) done(err);
    });
}
exports.save = save;