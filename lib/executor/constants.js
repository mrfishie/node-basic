/**
 * Default constants
 */
var util = require('../util');

var months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];
var days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
];

module.exports = {
    'PI': Math.PI,
    'TWO_PI': Math.PI * 2,
    'HALF_PI': Math.PI / 2,

    'EOF': 0,

    'BColorR': 0,
    'BColorG': 0,
    'BColorB': 0,
    'TColorR': 0,
    'TColorG': 1,
    'TColorB': 0,

    'ColorR': 0,
    'ColorG': 1,
    'ColorB': 0,
    'ColorA': 1,

    'IsRetina': 0,
    'IsPhone': 0,
    'IsPad': 0,

    'TickCount': function() {
        return util.now();
    },
    'DATE$': function() {
        var date = new Date();
        return date.getDate() + ' ' + months[date.getMonth()].substring(0, 3) + ' ' + date.getFullYear();
    },
    'TIME$': function() {
        var date = new Date();
        var am = true, hours = date.getHours();
        if (hours > 12) {
            hours -= 12;
            am = false;
        }

        return util.pad(hours, 2, '0') + ':' +
                util.pad(date.getMinutes(), 2, '0') + ':' +
                util.pad(date.getSeconds(), 2, '0') +
                (am ? ' am' : ' pm');
    },
    'DateYear': function() {
        return (new Date()).getFullYear();
    },
    'DateMonth': function() {
        return (new Date()).getMonth() + 1;
    },
    'DateMonth$': function() {
        return months[(new Date()).getMonth()];
    },
    'DateDay': function() {
        return (new Date()).getDate();
    },
    'DateWeekDay$': function() {
        return days[(new Date()).getDay()];
    },
    'TimeHours': function() {
        var hours = (new Date()).getHours();
        if (hours === 0) hours = 24;
        return hours;
    },
    'TimeMinutes': function() {
        return (new Date()).getMinutes();
    },
    'TimeSeconds': function() {
        return (new Date()).getSeconds();
    }
};