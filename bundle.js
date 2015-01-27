!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.basic=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Find the length
  var length
  if (type === 'number')
    length = subject > 0 ? subject >>> 0 : 0
  else if (type === 'string') {
    if (encoding === 'base64')
      subject = base64clean(subject)
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data))
      subject = subject.data
    length = +subject.length > 0 ? Math.floor(+subject.length) : 0
  } else
    throw new TypeError('must start with number, buffer, array or string')

  if (this.length > kMaxLength)
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
      'size: 0x' + kMaxLength.toString(16) + ' bytes')

  var buf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer.TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer.TYPED_ARRAY_SUPPORT && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

Buffer.isBuffer = function (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b))
    throw new TypeError('Arguments must be Buffers')

  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) throw new TypeError('Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    case 'hex':
      ret = str.length >>> 1
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    default:
      ret = str.length
  }
  return ret
}

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function (encoding, start, end) {
  var loweredCase = false

  start = start >>> 0
  end = end === undefined || end === Infinity ? this.length : end >>> 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase)
          throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function (b) {
  if(!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max)
      str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b)
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(byte)) throw new Error('Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length, 2)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new TypeError('Unknown encoding: ' + encoding)
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len;
    if (start < 0)
      start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0)
      end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start)
    end = start

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0)
    throw new RangeError('offset is not uint')
  if (offset + ext > length)
    throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80))
    return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new TypeError('value is out of bounds')
  if (offset + ext > buf.length) throw new TypeError('index out of range')
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new TypeError('value is out of bounds')
  if (offset + ext > buf.length) throw new TypeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  if (end < start) throw new TypeError('sourceEnd < sourceStart')
  if (target_start < 0 || target_start >= target.length)
    throw new TypeError('targetStart out of bounds')
  if (start < 0 || start >= source.length) throw new TypeError('sourceStart out of bounds')
  if (end < 0 || end > source.length) throw new TypeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new TypeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new TypeError('start out of bounds')
  if (end < 0 || end > this.length) throw new TypeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length, unitSize) {
  if (unitSize) length -= length % unitSize;
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

},{"base64-js":3,"ieee754":4,"is-array":5}],3:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],4:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],5:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],6:[function(require,module,exports){
/*global define:false require:false */
module.exports = (function(){
	// Import Events
	var events = require('events');

	// Export Domain
	var domain = {};
	domain.createDomain = domain.create = function(){
		var d = new events.EventEmitter();

		function emitError(e) {
			d.emit('error', e)
		}

		d.add = function(emitter){
			emitter.on('error', emitError);
		}
		d.remove = function(emitter){
			emitter.removeListener('error', emitError);
		}
		d.run = function(fn){
			try {
				fn();
			}
			catch (err) {
				this.emit('error', err);
			}
			return this;
		};
		d.dispose = function(){
			this.removeAllListeners();
			return this;
		};
		return d;
	};
	return domain;
}).call(this);
},{"events":7}],7:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],8:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],9:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],10:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canMutationObserver = typeof window !== 'undefined'
    && window.MutationObserver;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    var queue = [];

    if (canMutationObserver) {
        var hiddenDiv = document.createElement("div");
        var observer = new MutationObserver(function () {
            var queueList = queue.slice();
            queue.length = 0;
            queueList.forEach(function (fn) {
                fn();
            });
        });

        observer.observe(hiddenDiv, { attributes: true });

        return function nextTick(fn) {
            if (!queue.length) {
                hiddenDiv.setAttribute('yes', 'no');
            }
            queue.push(fn);
        };
    }

    if (canPost) {
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],11:[function(require,module,exports){
module.exports = require("./lib/_stream_duplex.js")

},{"./lib/_stream_duplex.js":12}],12:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}
/*</replacement>*/


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

forEach(objectKeys(Writable.prototype), function(method) {
  if (!Duplex.prototype[method])
    Duplex.prototype[method] = Writable.prototype[method];
});

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  process.nextTick(this.end.bind(this));
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

}).call(this,require('_process'))

},{"./_stream_readable":14,"./_stream_writable":16,"_process":10,"core-util-is":17,"inherits":8}],13:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = require('./_stream_transform');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./_stream_transform":15,"core-util-is":17,"inherits":8}],14:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/


/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;

/*<replacement>*/
if (!EE.listenerCount) EE.listenerCount = function(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

var Stream = require('stream');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var StringDecoder;

util.inherits(Readable, Stream);

function ReadableState(options, stream) {
  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = false;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // In streams that never have any data, and do push(null) right away,
  // the consumer can miss the 'end' event if they do some I/O before
  // consuming the stream.  So, we don't emit('end') until some reading
  // happens.
  this.calledRead = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (typeof chunk === 'string' && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null || chunk === undefined) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      // update the buffer info.
      state.length += state.objectMode ? 1 : chunk.length;
      if (addToFront) {
        state.buffer.unshift(chunk);
      } else {
        state.reading = false;
        state.buffer.push(chunk);
      }

      if (state.needReadable)
        emitReadable(stream);

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (n === null || isNaN(n)) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  var state = this._readableState;
  state.calledRead = true;
  var nOrig = n;
  var ret;

  if (typeof n !== 'number' || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    ret = null;

    // In cases where the decoder did not receive enough data
    // to produce a full chunk, then immediately received an
    // EOF, state.buffer will contain [<Buffer >, <Buffer 00 ...>].
    // howMuchToRead will see this and coerce the amount to
    // read to zero (because it's looking at the length of the
    // first <Buffer > in state.buffer), and we'll end up here.
    //
    // This can only happen via state.decoder -- no other venue
    // exists for pushing a zero-length chunk into state.buffer
    // and triggering this behavior. In this case, we return our
    // remaining data and end the stream, if appropriate.
    if (state.length > 0 && state.decoder) {
      ret = fromList(n, state);
      state.length -= ret.length;
    }

    if (state.length === 0)
      endReadable(this);

    return ret;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;

  // if we currently have less than the highWaterMark, then also read some
  if (state.length - n <= state.highWaterMark)
    doRead = true;

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading)
    doRead = false;

  if (doRead) {
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read called its callback synchronously, then `reading`
  // will be false, and we need to re-evaluate how much data we
  // can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we happened to read() exactly the remaining amount in the
  // buffer, and the EOF has been seen at this point, then make sure
  // that we emit 'end' on the very next tick.
  if (state.ended && !state.endEmitted && state.length === 0)
    endReadable(this);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // if we've ended and we have some data left, then emit
  // 'readable' now to make sure it gets picked up.
  if (state.length > 0)
    emitReadable(stream);
  else
    endReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (state.emittedReadable)
    return;

  state.emittedReadable = true;
  if (state.sync)
    process.nextTick(function() {
      emitReadable_(stream);
    });
  else
    emitReadable_(stream);
}

function emitReadable_(stream) {
  stream.emit('readable');
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    process.nextTick(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    if (readable !== src) return;
    cleanup();
  }

  function onend() {
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (!dest._writableState || dest._writableState.needDrain)
      ondrain();
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    unpipe();
    dest.removeListener('error', onerror);
    if (EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  // This is a brutally ugly hack to make sure that our error handler
  // is attached before any userland ones.  NEVER DO THIS.
  if (!dest._events || !dest._events.error)
    dest.on('error', onerror);
  else if (isArray(dest._events.error))
    dest._events.error.unshift(onerror);
  else
    dest._events.error = [onerror, dest._events.error];



  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    // the handler that waits for readable events after all
    // the data gets sucked out in flow.
    // This would be easier to follow with a .once() handler
    // in flow(), but that is too slow.
    this.on('readable', pipeOnReadable);

    state.flowing = true;
    process.nextTick(function() {
      flow(src);
    });
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var dest = this;
    var state = src._readableState;
    state.awaitDrain--;
    if (state.awaitDrain === 0)
      flow(src);
  };
}

function flow(src) {
  var state = src._readableState;
  var chunk;
  state.awaitDrain = 0;

  function write(dest, i, list) {
    var written = dest.write(chunk);
    if (false === written) {
      state.awaitDrain++;
    }
  }

  while (state.pipesCount && null !== (chunk = src.read())) {

    if (state.pipesCount === 1)
      write(state.pipes, 0, null);
    else
      forEach(state.pipes, write);

    src.emit('data', chunk);

    // if anyone needs a drain, then we have to wait for that.
    if (state.awaitDrain > 0)
      return;
  }

  // if every destination was unpiped, either before entering this
  // function, or in the while loop, then stop flowing.
  //
  // NB: This is a pretty rare edge case.
  if (state.pipesCount === 0) {
    state.flowing = false;

    // if there were data event listeners added, then switch to old mode.
    if (EE.listenerCount(src, 'data') > 0)
      emitDataEvents(src);
    return;
  }

  // at this point, no one needed a drain, so we just ran out of data
  // on the next readable event, start it over again.
  state.ranOut = true;
}

function pipeOnReadable() {
  if (this._readableState.ranOut) {
    this._readableState.ranOut = false;
    flow(this);
  }
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data' && !this._readableState.flowing)
    emitDataEvents(this);

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        this.read(0);
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  emitDataEvents(this);
  this.read(0);
  this.emit('resume');
};

Readable.prototype.pause = function() {
  emitDataEvents(this, true);
  this.emit('pause');
};

function emitDataEvents(stream, startPaused) {
  var state = stream._readableState;

  if (state.flowing) {
    // https://github.com/isaacs/readable-stream/issues/16
    throw new Error('Cannot switch to old mode now.');
  }

  var paused = startPaused || false;
  var readable = false;

  // convert to an old-style stream.
  stream.readable = true;
  stream.pipe = Stream.prototype.pipe;
  stream.on = stream.addListener = Stream.prototype.on;

  stream.on('readable', function() {
    readable = true;

    var c;
    while (!paused && (null !== (c = stream.read())))
      stream.emit('data', c);

    if (c === null) {
      readable = false;
      stream._readableState.needReadable = true;
    }
  });

  stream.pause = function() {
    paused = true;
    this.emit('pause');
  };

  stream.resume = function() {
    paused = false;
    if (readable)
      process.nextTick(function() {
        stream.emit('readable');
      });
    else
      this.read(0);
    this.emit('resume');
  };

  // now make it start, just in case it hadn't already.
  stream.emit('readable');
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    if (state.decoder)
      chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    //if (state.objectMode && util.isNullOrUndefined(chunk))
    if (state.objectMode && (chunk === null || chunk === undefined))
      return;
    else if (!state.objectMode && (!chunk || !chunk.length))
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (typeof stream[i] === 'function' &&
        typeof this[i] === 'undefined') {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted && state.calledRead) {
    state.ended = true;
    process.nextTick(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

}).call(this,require('_process'))

},{"_process":10,"buffer":2,"core-util-is":17,"events":7,"inherits":8,"isarray":9,"stream":22,"string_decoder/":23}],15:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.


// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = require('./_stream_duplex');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined)
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  var ts = this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('finish', function() {
    if ('function' === typeof this._flush)
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var rs = stream._readableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./_stream_duplex":12,"core-util-is":17,"inherits":8}],16:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;

/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Writable.WritableState = WritableState;


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Stream = require('stream');

util.inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;
}

function Writable(options) {
  var Duplex = require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  process.nextTick(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    process.nextTick(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (typeof cb !== 'function')
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb))
    ret = writeOrBuffer(this, state, chunk, encoding, cb);

  return ret;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      typeof chunk === 'string') {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret)
    state.needDrain = true;

  if (state.writing)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    process.nextTick(function() {
      cb(er);
    });
  else
    cb(er);

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished && !state.bufferProcessing && state.buffer.length)
      clearBuffer(stream, state);

    if (sync) {
      process.nextTick(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  cb();
  if (finished)
    finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  for (var c = 0; c < state.buffer.length; c++) {
    var entry = state.buffer[c];
    var chunk = entry.chunk;
    var encoding = entry.encoding;
    var cb = entry.callback;
    var len = state.objectMode ? 1 : chunk.length;

    doWrite(stream, state, len, chunk, encoding, cb);

    // if we didn't call the onwrite immediately, then
    // it means that we need to wait until it does.
    // also, that means that the chunk and cb are currently
    // being processed, so move the buffer counter past them.
    if (state.writing) {
      c++;
      break;
    }
  }

  state.bufferProcessing = false;
  if (c < state.buffer.length)
    state.buffer = state.buffer.slice(c);
  else
    state.buffer.length = 0;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (typeof chunk !== 'undefined' && chunk !== null)
    this.write(chunk, encoding);

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    state.finished = true;
    stream.emit('finish');
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      process.nextTick(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

}).call(this,require('_process'))

},{"./_stream_duplex":12,"_process":10,"buffer":2,"core-util-is":17,"inherits":8,"stream":22}],17:[function(require,module,exports){
(function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

function isBuffer(arg) {
  return Buffer.isBuffer(arg);
}
exports.isBuffer = isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}
}).call(this,require("buffer").Buffer)

},{"buffer":2}],18:[function(require,module,exports){
module.exports = require("./lib/_stream_passthrough.js")

},{"./lib/_stream_passthrough.js":13}],19:[function(require,module,exports){
var Stream = require('stream'); // hack to fix a circular dependency issue when used with browserify
exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = Stream;
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":12,"./lib/_stream_passthrough.js":13,"./lib/_stream_readable.js":14,"./lib/_stream_transform.js":15,"./lib/_stream_writable.js":16,"stream":22}],20:[function(require,module,exports){
module.exports = require("./lib/_stream_transform.js")

},{"./lib/_stream_transform.js":15}],21:[function(require,module,exports){
module.exports = require("./lib/_stream_writable.js")

},{"./lib/_stream_writable.js":16}],22:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/readable.js');
Stream.Writable = require('readable-stream/writable.js');
Stream.Duplex = require('readable-stream/duplex.js');
Stream.Transform = require('readable-stream/transform.js');
Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":7,"inherits":8,"readable-stream/duplex.js":11,"readable-stream/passthrough.js":18,"readable-stream/readable.js":19,"readable-stream/transform.js":20,"readable-stream/writable.js":21}],23:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

var isBufferEncoding = Buffer.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     }


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters. CESU-8 is handled as part of the UTF-8 encoding.
//
// @TODO Handling all encodings inside a single object makes it very difficult
// to reason about this code, so it should be split up in the future.
// @TODO There should be a utf8-strict encoding that rejects invalid UTF-8 code
// points as used by CESU-8.
var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  // Enough space to store all bytes of a single character. UTF-8 needs 4
  // bytes, but CESU-8 may require up to 6 (3 bytes per surrogate).
  this.charBuffer = new Buffer(6);
  // Number of bytes received for the current incomplete multi-byte character.
  this.charReceived = 0;
  // Number of bytes expected for the current incomplete multi-byte character.
  this.charLength = 0;
};


// write decodes the given buffer and returns it as JS string that is
// guaranteed to not contain any partial multi-byte characters. Any partial
// character found at the end of the buffer is buffered up, and will be
// returned when calling write again with the remaining bytes.
//
// Note: Converting a Buffer containing an orphan surrogate to a String
// currently works, but converting a String to a Buffer (via `new Buffer`, or
// Buffer#write) will replace incomplete surrogates with the unicode
// replacement character. See https://codereview.chromium.org/121173009/ .
StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var available = (buffer.length >= this.charLength - this.charReceived) ?
        this.charLength - this.charReceived :
        buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, 0, available);
    this.charReceived += available;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // remove bytes belonging to the current character from the buffer
    buffer = buffer.slice(available, buffer.length);

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (buffer.length === 0) {
      return charStr;
    }
    break;
  }

  // determine and set charLength / charReceived
  this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - this.charReceived, end);
    end -= this.charReceived;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    buffer.copy(this.charBuffer, 0, 0, size);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

// detectIncompleteChar determines if there is an incomplete UTF-8 character at
// the end of the given buffer. If so, it sets this.charLength to the byte
// length that character, and sets this.charReceived to the number of bytes
// that are available for this character.
StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }
  this.charReceived = i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 2;
  this.charLength = this.charReceived ? 2 : 0;
}

function base64DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 3;
  this.charLength = this.charReceived ? 3 : 0;
}

},{"buffer":2}],24:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],25:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./support/isBuffer":24,"_process":10,"inherits":8}],26:[function(require,module,exports){
/**
 * Javascript BASIC parser and editor
 */

exports.executor = require('./lib/executor');
exports.filesystem = require('./lib/filesystem');
exports.functions = require('./lib/functions');
exports.parser = require('./lib/parser');
exports.IOInterface = require('./lib/IOInterface');
exports.repl = require('./lib/repl');
exports.util = require('./lib/util');

// Create dummy IO interface
var IOInterface = require('./lib/IOInterface');
var drawInterface = new IOInterface();
drawInterface.setOutput(function(obj) {
    throw new Error('No drawing interface');
});
drawInterface.setInput(function() {
    throw new Error('No drawing interface');
});
IOInterface.set("draw", drawInterface);

/**
 * Quick-runs code
 *
 * @param {String} code
 * @param {exports.ExecutionContext|Function?} ctx
 * @param {Function?} done
 * @returns {ExecutionContext}
 */
exports.run = function(code, ctx, done) {
    if (!done && !(ctx instanceof exports.executor.ExecutionContext)) {
        done = ctx;
        ctx = new exports.executor.ExecutionContext();
    }

    var ast = exports.parser.parse(code);
    exports.executor.execute(ast, ctx, done);
    return ctx;
};
},{"./lib/IOInterface":27,"./lib/executor":30,"./lib/filesystem":33,"./lib/functions":35,"./lib/parser":91,"./lib/repl":122,"./lib/util":123}],27:[function(require,module,exports){
(function (process){
var util = require('./util');
var stream = require('stream');

/**
 * An interface for custom input/output
 *
 * @param {Function?} output An output function
 * @param {Function?} input An input function
 * @param {Object?} data Data
 */
function IOInterface(output, input, data) {
    this._output = output || function() { };
    this._input = input || function(done) { done('\n'); };
    this._data = data || {};
}

IOInterface.IOInterface = IOInterface;

/**
 * Sets the output function
 *
 * @param {Function} output
 */
IOInterface.prototype.setOutput = function(output) {
    this._output = output;
};

/**
 * Sets the input function
 *
 * @param {Function} input
 */
IOInterface.prototype.setInput = function(input) {
    this._input = input;
};

/**
 * Writes something to the interface
 *
 * @param {*} text
 * @throws Error if output is not a function
 */
IOInterface.prototype.write = function(text) {
    if (typeof this._output !== "function") throw new Error('output is not a function');
    this._output.call(this._data, text);
};

/**
 * Writes a line to the interface
 *
 * @param {String} text
 * @throws Error if output is not a function
 */
IOInterface.prototype.writeln = function(text) {
    this.write(text + '\n');
};
IOInterface.prototype.log = IOInterface.prototype.writeln;

/**
 * Continues reading characters until the function calls the cancel argument
 *
 * @param {Function} callback Passed current character, total value, and cancel function
 * @throws Error if input is not a function
 */
IOInterface.prototype.read = function(callback) {
    if (typeof this._input !== "function") throw new Error('input is not a function');
    var value = '', self = this, running = true;

    self._input.call(self._data, function(chars) {
        for (var i = 0; i < chars.length; i++) {
            if (!running) return;
            value += chars[i];

            var args = [chars[i]];
            if (typeof chars[i] === 'string') args.push(value);
            args.push(function() {
                self._input.call(self._data, false);
                running = false;
            });

            callback.apply({}, args);
        }
    });
};

/**
 * Reads until a newline is detected
 *
 * @param {Function} callback Passed the final value
 * @throws Error if input is not a function
 */
IOInterface.prototype.readln = function(callback) {
    this.read(function(char, value, cancel) {
        if (char === "\n") {
            cancel();
            var result = value.substring(0, value.length - 2);
            callback(result);
        }
    });
};

/**
 * Writes the text and then reads until the new line
 *
 * @param {String} text
 * @param {Function} response Called with the response
 */
IOInterface.prototype.question = function(text, response) {
    this.write(text);
    this.readln(response);
};

var interfaces = {};
var addedHandlers = {};

/**
 * Sets an interface
 *
 * @param {String} name The name of the interface
 * @param {IOInterface} inf The interface
 * @throws Error if inf is not an instance of IOInterface
 */
IOInterface.set = function(name, inf) {
    if (!(inf instanceof IOInterface)) throw new Error("Interface is not an instance of IOInterface");
    name = name.toLowerCase();
    interfaces[name] = inf;
    if (addedHandlers[name] && addedHandlers[name].length) {
        for (var i = 0; i < addedHandlers[name].length; i++) {
            addedHandlers[name][i]();
        }
    }
};

/**
 * Gets an interface. If an interface doesn't exist the default will be returned.
 * If the interface is later changed (i.e a new interface replaces the current one),
 * the interface object will reflect to change that. Set the second parameter to
 * false to stop this
 *
 * @param {String} name The name of the interface
 * @param {Boolean=true} update Update the interface if a new one replaces it
 * @returns {IOInterface} The interface, or the default if the required one doesn't exist
 */
IOInterface.get = function(name, update) {
    name = name.toLowerCase();

    var result;
    if (!interfaces[name]) result = IOInterface.getDefault();
    else {
        var inf = interfaces[name];
        result = new IOInterface(inf._output, inf._input, util.shallowClone(inf._data));
    }

    if (update !== false) {
        if (!addedHandlers[name]) addedHandlers[name] = [];
        addedHandlers[name].push(function () {
            var item = IOInterface.get(name, false);
            result._output = item._output;
            result._input = item._input;
            result._data = item._data;
        });
    }
    return result;
};

/**
 * Sets an interface as the default
 *
 * @param {IOInterface} inf The interface
 */
IOInterface.setDefault = function(inf) {
    IOInterface.set("default", inf);
};

/**
 * Gets the default interface
 *
 * @returns {IOInterface}
 */
IOInterface.getDefault = function() {
    return this.get("default");
};

// Create the default interface
var defaultInterface = new IOInterface();

if (process.browser) {
    // If running in a browser (e.g. with Browserify) use console.log
    defaultInterface._data.accumulator = '';

    defaultInterface.setOutput(function(text) {
        this.accumulator += text;
        var splitLines = this.accumulator.split('\n');
        if (splitLines.length > 1) {
            if (splitLines[splitLines.length - 1] === '') {
                this.accumulator = this.accumulator.substring(0, this.accumulator.length - 1);
            }
            console.log(this.accumulator);
            this.accumulator = '';
        }
    });

    // Browser has no input method
} else {
    // If running in Node, use stdin and stdout
    process.stdin.setEncoding('utf8');

    defaultInterface.setOutput(function(text) {
        process.stdout.write(text);
    });

    defaultInterface.setInput(function(cb) {
        if (cb) {
            if (this.reader) process.stdin.removeListener('readable', this.reader);

            this.reader = function () {
                var chunk = process.stdin.read();
                if (chunk != null) cb(chunk);
            };
            process.stdin.on('readable', this.reader);
        } else process.stdin.removeListener('readable', this.reader);
    });
}

IOInterface.setDefault(defaultInterface);

module.exports = IOInterface;
}).call(this,require('_process'))

},{"./util":123,"_process":10,"stream":22}],28:[function(require,module,exports){
var functions = require('../functions');
var statements = require('../parser/statements');
var domain = require('domain');
var util = require('util');
var pUtil = require('../util');

/**
 * An object that provides modification and reading of the current execution
 * context, as well as the ability to execute an AST in the context
 *
 * @param {Object?} options Options for execution
 * @constructor
 */
function ExecutionContext(options) {
    this.stringVars = {};
    this.numberVars = {};
    this.pointers = {};
    this.gosubs = [];
    this.private = {
        rnd_seed: Math.random(),
        sprites: []
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
    this.done = function() {
        if (done) done.apply(this, arguments);
    };

    this.error = false;

    this.domain.on('error', function(err) {
        throw err;
        //console.log('ERROR: ' + err.message);
        //self.error = err;
        //self.running = false;
    });

    this.domain.run(function() {
        self.nextLine();
    });
};

/**
 * Executes the current cursor line and increments the cursor
 */
ExecutionContext.prototype.nextLine = function() {
    this.cursor = this.cursor.valueOf();
    if (this.root.length <= this.cursor) {
        this.terminate();
    }
    if (!this.running) {
        this.done(this.error);
        return;
    }

    var currentLine = this.root[this.cursor];
    var executionResult = currentLine.execute(this);

    var self = this;
    this.cursor++;

    if (typeof executionResult === 'function') {
        executionResult(function() {
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
 * @param {VariableStatement} variable The variable
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

    if (variable.isArray) setArrayIndexAt(map[variable.name], variable.dimensions, realValue, this);
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
        if (variable.isArray) return getArrayIndexAt(map[variable.name], variable.dimensions, this);
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
        throw new Error('Unknown function');
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
        cmd.execute(self, newDone);
    }
    var cmdDelay = self.options.delay;
    if (cmdDelay !== false) {
        callFunc = function(newDone) {
            setTimeout(function() {
                cmd.execute(self, newDone);
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
    if (typeof this.labels[label] === 'undefined') throw new Error('Undefined label');
    this.gosubs.push(this.cursor);
    this.cursor = this.labels[label];
};

/**
 * Goes to a label
 *
 * @param {String} label The name of the label to go to
 */
ExecutionContext.prototype.gotoLabel = function(label) {
    if (typeof this.labels[label] === 'undefined') throw new Error('Undefined label');
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

    if (arr.length <= currentDimension || currentDimension < 0) throw new Error('Invalid array bounds');
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
    currentDimension = Math.floor(currentDimension - 1);

    if (arr.length <= currentDimension || currentDimension < 0) throw new Error('Invalid array bounds');
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
},{"../functions":35,"../parser/statements":103,"../util":123,"./constants":29,"domain":6,"util":25}],29:[function(require,module,exports){
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
},{"../util":123}],30:[function(require,module,exports){
var ExecutionContext = require('./ExecutionContext');
var constants = require('./constants');

/**
 * Executes the abstract syntax tree
 *
 * @param {AbstractSyntaxTree} ast The tree to execute
 * @param {exports.ExecutionContext|ExecutionContext|Function?} ctx The context
 * @param {Function?} done Called when execution is complete
 */
function execute(ast, ctx, done) {
    if (!done && !(ctx instanceof ExecutionContext)) {
        done = ctx;
        ctx = new ExecutionContext();
    }

    ast.execute(ctx, done);
}

exports.execute = execute;

exports.ExecutionContext = ExecutionContext;
exports.constants = constants;
},{"./ExecutionContext":28,"./constants":29}],31:[function(require,module,exports){
var File = require('./File');
var filesystem = require('./');

/**
 * A filesystem drive
 *
 * @param {String} name The name of the drive
 * @param {Object} root The drive contents
 */
function Drive(name, root) {
    this.name = name;
    this.root = root;
}

/**
 * Opens a file
 *
 * @param {String} file The name of the file
 */
Drive.prototype.open = function(file) {
    if (!this.root[file]) this.root[file] = [];
    return new File(file, this.root[file], this);
};

/**
 * Saves the drive
 *
 * @param {Function?} done A function to call when complete
 */
Drive.prototype.save = function(done) {
    filesystem.save(done);
};

module.exports = Drive;
},{"./":33,"./File":32}],32:[function(require,module,exports){
/**
 * Represents a file
 *
 * @param {String} name The name of the file
 * @param {Array} file The file contents
 * @param {Drive} parent The parent drive
 */
function File(name, file, parent) {
    this.name = name;
    this.file = file;
    this.parent = parent;
    this.readCursor = 0;
    this.eof = false;
}

/**
 * Sets the content of the file
 *
 * @param {String} contents
 */
File.prototype.set = function(contents) {
    this.parent.root[this.name] = this.file = String(contents).split('\n');
};

/**
 * Clears the contents of the file
 */
File.prototype.clear = function() {
    this.parent.root[this.name] = this.file = [];
};

/**
 * Reads the next line from the file
 *
 * @returns {String}
 */
File.prototype.nextLine = function() {
    if (this.eof || this.readCursor >= this.file.length) {
        this.eof = true;
        return '';
    }
    var value = this.file[this.readCursor];
    this.readCursor++;
    return value;
};

/**
 * Moves the cursor to a certain position
 *
 * @param {Number} pos New cursor position
 */
File.prototype.moveTo = function(pos) {
    this.readCursor = pos;
    this.eof = this.readCursor >= this.file.length;
};

/**
 * Appends the text to the end of the file
 *
 * @param {String} text
 */
File.prototype.write = function(text) {
    var split = String(text).split('\n');
    for (var i = 0; i < split.length; i++) this.file.push(split[i]);
};

/**
 * Saves the file
 *
 * @param {Function?} done A function to call when complete
 */
File.prototype.save = function(done) {
    this.parent.save(done);
};

module.exports = File;
},{}],33:[function(require,module,exports){
(function (process,__dirname){
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
}).call(this,require('_process'),"/lib\\filesystem")

},{"./Drive":31,"./File":32,"_process":10,"fs":1}],34:[function(require,module,exports){
var ctx = require('../IOInterface').get('draw');

/**
 * Returns if the mouse is currently pressed
 *
 * @returns {number}
 */
exports.touch = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'mousedown') return;
        cancel();
        result = response.data;
    });
    ctx.write({ command: "mousedown" });
    return result;
};

/**
 * Returns the mouse X position
 *
 * @returns {number}
 */
exports.touchx = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'mousepos') return;
        cancel();
        result = response.data.x;
    });
    ctx.write({ command: 'mousepos' });
    return result;
};

/**
 * Returns the mouse Y position
 *
 * @returns {number}
 */
exports.touchy = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'mousepos') return;
        cancel();
        result = response.data.y;
    });
    ctx.write({ command: 'mousepos' });
    return result;
};

/**
 * Returns the canvas width
 *
 * @returns {number}
 */
exports.screenwidth = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'screensize') return;
        cancel();
        result = response.data.width;
    });
    ctx.write({ command: 'screensize' });
    return result;
};

/**
 * Returns the canvas height
 *
 * @returns {number}
 */
exports.screenheight = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'screensize') return;
        cancel();
        result = response.data.height;
    });
    ctx.write({ command: 'screensize' });
    return result;
};

/**
 * Returns if the canvas height is bigger than width
 *
 * @returns {number}
 */
exports.isportrait = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'screensize') return;
        cancel();
        result = response.data.height > response.data.width ? 1 : 0;
    });
    ctx.write({ command: 'screensize' });
    return result;
};

/**
 * Returns if the canvas width is bigger than height
 *
 * @returns {number}
 */
exports.islandscape = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'screensize') return;
        cancel();
        result = response.data.height <= response.data.width ? 1 : 0;
    });
    ctx.write({ command: 'screensize' });
    return result;
};

/**
 * Returns the X mouse offset from the center, between -1 and 1
 *
 * @returns {number}
 */
exports.accelx = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'accel') return;
        cancel();
        result = response.data.x;
    });
    ctx.write({ command: 'accel' });
    return result;
};

/**
 * Returns the Y mouse offset from the center, between -1 and 1
 *
 * @returns {number}
 */
exports.accely = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'accel') return;
        cancel();
        result = response.data.y;
    });
    ctx.write({ command: 'accel' });
    return result;
};

/**
 * Returns the mouse scroll offset from the center (default), between -1 and 1
 *
 * @returns {number}
 */
exports.accelz = function() {
    var result = 0;
    ctx.read(function(response, cancel) {
        if (response.command !== 'accel') return;
        cancel();
        result = response.data.z;
    });
    ctx.write({ command: 'accel' });
    return result;
};

/**
 * Gets the width of the sprite
 *
 * @param {Number} id
 * @returns {Number}
 */
exports.spritewidth = function(id) {
    var sprite = this.private.sprites[id];
    if (!sprite) throw new Error('Invalid sprite ID');
    return sprite.width;
};

/**
 * Gets the height of the sprite
 *
 * @param {Number} id
 * @returns {Number}
 */
exports.spriteheight = function(id) {
    var sprite = this.private.sprites[id];
    if (!sprite) throw new Error('Invalid sprite ID');
    return sprite.height;
};
},{"../IOInterface":27}],35:[function(require,module,exports){
/**
 * Function List
 */

intoExport(require('./number'));
intoExport(require('./string'));
intoExport(require('./graphics'));

/**
 * Copies the properties of an object to the exports
 *
 * @param {Object} obj The object to copy
 */
function intoExport(obj) {
    for (var k in obj) {
        if (!obj.hasOwnProperty(k)) continue;
        exports[k] = obj[k];
    }
}
},{"./graphics":34,"./number":36,"./string":37}],36:[function(require,module,exports){
/**
 * Returns the sine of an angle
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.sin = function(a) {
    this.validate(a, 'number');
    return Math.sin(a);
};

/**
 * Returns the cosine of an angle
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.cos = function(a) {
    this.validate(a, 'number');
    return Math.cos(a);
};

/**
 * Returns the tangent of an angle
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.tan = function(a) {
    this.validate(a, 'number');
    return Math.tan(a);
};

/**
 * Returns the arc sine
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.asin = function(a) {
    this.validate(a, 'number');
    return Math.asin(a);
};

/**
 * Returns the arc cosine
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.acos = function(a) {
    this.validate(a, 'number');
    return Math.acos(a);
};

/**
 * Returns the arc tangent
 *
 * @param {Number} a Radians
 * @returns {Number}
 */
exports.atn = function(a) {
    this.validate(a, 'number');
    return Math.atn(a);
};

/**
 * Converts an angle from degrees to radians
 *
 * @param {Number} a Degrees
 * @returns {Number} Radians
 */
exports.rad = function(a) {
    this.validate(a, 'number');
    return Math.rad(a);
};

/**
 * Converts an angle from radians to degrees
 *
 * @param {Number} a Radians
 * @returns {Number} Degrees
 */
exports.deg = function(a) {
    this.validate(a, 'number');
    return Math.deg(a);
};

/**
 * Returns the square root of a number
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.sqr = function(n) {
    this.validate(n, 'number');
    return Math.sqrt(n);
};

/**
 * Returns the absolute value of a number
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.abs = function(n) {
    this.validate(n, 'number');
    return Math.abs(n);
};

/**
 * Returns the integer part of a floating-point number
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.int = function(n) {
    this.validate(n, 'number');
    return Math.floor(n);
};

/**
 * Returns the natural logarithm
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.log = function(n) {
    this.validate(n, 'number');
    return Math.log(n);
};

/**
 * Returns the common (base-10) logarithm
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.log10 = function(n) {
    this.validate(n, 'number');
    return Math.log10(n);
};

/**
 * Returns the base-e exponential function
 *
 * @param {Number} n
 * @returns {Number}
 */
exports.exp = function(n) {
    this.validate(n, 'number');
    return Math.exp(n);
};

/**
 * Returns the floating-point remainder of a / b.
 *
 * @param {Number} a
 * @param {Number} b
 * @returns {Number}
 */
exports.mod = function(a, b) {
    this.validate(a, 'number');
    this.validate(b, 'number');
    return a % b;
};

/**
 * Gets a random number using a seed
 *
 * @returns {number}
 */
function getRandom(data) {
    var x = Math.sin(data.getPrivate('rnd_seed')) * 10000;
    data.setPrivate('rnd_seed', data.getPrivate('rnd_seed') + 1);
    return x - Math.floor(x);
}

/**
 * Generates and returns a random number from 0 to 1
 *
 * @param {Number?} min
 * @param {Number?} max
 * @returns {Number}
 */
exports.rnd = function(min, max) {
    if (typeof min !== 'undefined' && typeof max !== 'undefined') {
        this.validate(min, 'number');
        this.validate(max, 'number');
        return Math.floor(getRandom(this) * (max - min + 1)) + min;
    }
    return getRandom(this);
};

/**
 * Set random number generator seed
 *
 * @param {Number} seed
 */
exports.randomize = function(seed) {
    this.setPrivate('rnd_seed', seed);
};
},{}],37:[function(require,module,exports){
/**
 * Make string uppercase
 *
 * @param {String} s
 * @returns {String}
 */
exports['upper$'] = function(s) {
    this.validate(s, 'string');
    return s.toUpperCase();
};

/**
 * Make string lowercase
 *
 * @param {String} s
 * @returns {String}
 */
exports['lower$'] = function(s) {
    this.validate(s, 'string');
    return s.toLowerCase();
};

/**
 * Take n characters from string's left
 *
 * @param {String} s
 * @param {Number} n
 * @returns {String}
 */
exports['left$'] = function(s, n) {
    this.validate(s, 'string');
    this.validate(n, 'number');
    return s.substr(0, n);
};

/**
 * Take n characters from string starting with i'th character
 *
 * @param {String} s
 * @param {Number} i
 * @param {Number} n
 * @returns {String}
 */
exports['mid$'] = function(s, i, n) {
    this.validate(s, 'string');
    this.validate(i, 'number');
    this.validate(n, 'number');
    return s.substr(i, n);
};

/**
 * Take n characters from string's right
 *
 * @param {String} s
 * @param {Number} n
 * @returns {String}
 */
exports['right$'] = function(s, n) {
    this.validate(s, 'string');
    this.validate(n, 'number');
    return s.substr(-n);
};

/**
 * Return string length
 *
 * @param {String} s
 * @returns {Number}
 */
exports.len = function(s) {
    this.validate(s, 'string');
    return s.length;
};

/**
 * Convert string into a number
 *
 * @param {String} s
 * @returns {Number}
 */
exports.val = function(s) {
    this.validate(s, 'string');
    var num = parseFloat(s);
    if (isNaN(num)) throw new Error('String is not a number');
    return num;
};

/**
 * Convert number into a string
 *
 * @param {Number} n
 * @returns {String}
 */
exports['str$'] = function(n) {
    this.validate(n, 'number');
    return n.toString();
};

/**
 * Return ASCII code of strings first character
 *
 * @param {String} s
 * @returns {Number}
 */
exports.asc = function(s) {
    this.validate(s, 'string');
    return s.charCodeAt(0);
};

/**
 * Return string containing a single ASCII character
 *
 * @param {Number} n
 * @returns {String}
 */
exports['chr$'] = function(n) {
    this.validate(n, 'number');
    return String.fromCharCode(n);
};

/**
 * Return string containing n space characters
 *
 * @param {Number} n
 * @returns {String}
 */
exports['spc$'] = function(n) {
    this.validate(n, 'number');
    return (new Array(n + 1)).join(' ');
};
},{}],38:[function(require,module,exports){
var statements = require('./statements');

/**
 * Represents a tree that can be executed
 *
 * @param {Array} root The root-level nodes
 * @param {Object} labels An object of label: line mappings
 * @param {BlockManager} manager The block manager
 */
function AbstractSyntaxTree(root, labels, manager) {
    this.root = root;
    this.labels = labels;
    this.manager = manager;

    manager.parse(this);
}

/**
 * Converts the tree to an executable code string
 *
 * @returns {string}
 */
AbstractSyntaxTree.prototype.toString = function() {
    var lines = [];
    for (var i = 0; i < this.root.length; i++) {
        lines.push(this.root[i].toString());
    }

    for (var name in this.labels) {
        if (!this.labels.hasOwnProperty(name)) continue;

        var lineNumber = this.labels[name];
        if (this.root[lineNumber] instanceof statements.EmptyStatement) lines[lineNumber] = name + ':';
        else lines[lineNumber] = name + ' ' + lines[lineNumber];
    }
    return lines.join('\n');
};

/**
 * Converts the tree to serializable JSON
 *
 * @returns {Object}
 */
AbstractSyntaxTree.prototype.toJSON = function() {
    var root = [];
    for (var i = 0; i < this.root.length; i++) root.push(this.root[i].toJSON());
    return {
        root: root,
        labels: this.labels
    };
};

/**
 * Executes items in the tree
 *
 * @param {ExecutionContext} data The execution context
 * @param {Function?} done A function to call when the program terminates
 */
AbstractSyntaxTree.prototype.execute = function(data, done) {
    data.execute(this.root, this.labels, done);
};

module.exports = AbstractSyntaxTree;
},{"./statements":103}],39:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');

/**
 * A block parser
 *
 * @param {Number} line The current line number
 * @param {{start: Array, end: Array, then: Array}} def Properties for block definition
 * @param {BlockManager} parent
 */
function Block(line, def, parent) {
    this.startNames = [];
    this.thenNames = [];
    this.endNames = [];
    for (var i = 0; i < def.start.length; i++) this.startNames.push(def.start[i].toLowerCase());
    for (var x = 0; x < def.end.length; x++) this.endNames.push(def.end[x].toLowerCase());
    for (var y = 0; y < def.then.length; y++) this.thenNames.push(def.then[y].toLowerCase());

    this.line = line;
    this.parent = parent;
    this.searchIndex = line;
    this.start = -1;
    this.intermediateIndexes = {};
    this.intermediateCursors = {};
    this.end = -1;
}

/**
 * Parses the block
 *
 * @param {AbstractSyntaxTree} ast
 */
Block.prototype.parse = function(ast) {
    var root = ast.root, depth = 0;
    var intermediateFinds = this.intermediateIndexes = {};

    for (var ln = this.searchIndex; ln < root.length; ln++) {
        var line = root[ln];
        if (!(line instanceof statements.CommandStatement)) continue;
        var lineName = line.name;

        if (this.startNames.indexOf(lineName) !== -1) {
            if (depth === 0) this.start = ln;
            depth++;
        } else if (this.thenNames.indexOf(lineName) !== -1 && depth === 1) {
            if (!intermediateFinds[lineName]) intermediateFinds[lineName] = [];
            intermediateFinds[lineName].push(ln);
        } else if (this.endNames.indexOf(lineName) !== -1) {
            depth--;
            if (depth < 0) throw new SyntaxError("Unexpected " + lineName.toUpperCase());
            else if (depth === 0) {
                this.end = ln;
                return;
            }
        }
    }

    if (depth !== 0) throw new SyntaxError(this.startNames[0].toUpperCase() + " without " + this.endNames[0].toUpperCase());
};

/**
 * Finds if the block has the intermediate command specified
 *
 * @param {String} name The name of the command
 * @returns {Boolean}
 */
Block.prototype.has = function(name) {
    name = name.toLowerCase();
    if (this.thenNames.indexOf(name) === -1) return false;
    if (!this.intermediateIndexes[name]) return false;
    return Boolean(this.intermediateIndexes[name].length);
};

/**
 * Finds the next intermediate command with the name specified
 *
 * @param {String} name The name of the command
 * @returns {Number} The line or -1 if none found
 */
Block.prototype.next = function(name) {
    name = name.toLowerCase();
    if (!this.has(name)) return -1;

    if (!this.intermediateCursors[name]) this.intermediateCursors[name] = 0;
    var cursor = this.intermediateCursors[name];
    if (cursor >= this.intermediateIndexes[name].length) cursor = this.intermediateCursors[name] = 0;

    var value = this.intermediateIndexes[name][cursor];
    this.intermediateCursors[name]++;
    return value;
};

/**
 * Gets a list of references
 *
 * @returns {Array<Block>}
 */
Block.prototype.references = function() {
    return this.parent.byLineRef[this.line];
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
Block.prototype.toJSON = function() {
    return {
        line: this.line,
        searchIndex: this.searchIndex,
        start: this.start,
        intermediateIndexes: this.intermediateIndexes,
        intermediateCursors: this.intermediateCursors,
        end: this.end
    };
};

module.exports = Block;
},{"../SyntaxError":41,"../statements":103}],40:[function(require,module,exports){
var Block = require('./Block');

/**
 * Creates block definition functions
 */
function BlockManager() {
    this.children = [];
    this.byLineRef = {};
}

BlockManager.Block = Block;
BlockManager.BlockManager = BlockManager;

/**
 * Parses the blocks
 *
 * @param {AbstractSyntaxTree} ast
 */
BlockManager.prototype.parse = function(ast) {
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i];
        child.parse(ast);

        if (child.start !== -1) addChildTo(this.byLineRef, child, child.start);
        if (child.end !== -1) addChildTo(this.byLineRef, child, child.end);
        for (var type in child.intermediateIndexes) {
            if (!child.intermediateIndexes.hasOwnProperty(type)) continue;
            var childIndexes = child.intermediateIndexes[type];
            for (var x = 0; x < childIndexes.length; x++) {
                addChildTo(this.byLineRef, child, childIndexes[x]);
            }
        }
    }
};

/**
 * Creates a function to create a block
 *
 * @param {Number} line The line number for the block
 * @returns {Function} The function to create the block
 */
BlockManager.prototype.create = function(line) {
    var self = this;

    /**
     * Creates a block with the specified definition
     *
     * @param {Object} def The block definition
     * @returns {Block}
     */
    var res = function(def) {
        var start = Array.isArray(def.start) ? def.start : [def.start];
        var end = Array.isArray(def.end) ? def.end : [def.end];
        var then = def.then ? (Array.isArray(def.then) ? def.then : [def.then]) : [];

        var child = new Block(line, {
            start: start,
            end: end,
            then: then
        }, self);
        self.children.push(child);
        return child;
    };

    /**
     * Gets a list of block references
     *
     * @returns {Array<Block>}
     */
    res.references = function() {
        return self.byLineRef[line];
    };

    /**
     * The current line
     *
     * @type {Number}
     */
    res.line = line;

    /**
     * Converts the block definition to JSON
     *
     * @returns {Object}
     */
    res.toJSON = function() {
        var lineRef = [], iLineRef = self.byLineRef[line];
        for (var i = 0; i < iLineRef.length; i++) {
            lineRef.push(iLineRef[i].toJSON());
        }

        return {
            line: line,
            lineRef: lineRef
        };
    };
    return res;
};

module.exports = BlockManager;

function addChildTo(byRef, child, childIndex) {
    if (!byRef[childIndex]) byRef[childIndex] = [];
    byRef[childIndex].push(child);
}
},{"./Block":39}],41:[function(require,module,exports){
/**
 * An error caused by invalid syntax
 */
function SyntaxError(msg) {
    this.message = 'Syntax Error: ' + msg;
}

SyntaxError.prototype.execute = function() {
    console.log("ERROR: " + this.message);
};

SyntaxError.prototype.toString = function() {
    return this.message;
};

module.exports = SyntaxError;
},{}],42:[function(require,module,exports){
var ctx = require('../../IOInterface').get('draw');

/**
 * Calibrates the accelerometer (mouse)
 */
function AccelcalibrateCommand() { }

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
AccelcalibrateCommand.prototype.execute = function(data, next) {
    ctx.write({
        command: 'accel',
        args: {
            calibrate: true
        }
    });
    next();
};

module.exports = AccelcalibrateCommand;
},{"../../IOInterface":27}],43:[function(require,module,exports){
/**
 * Does nothing, as Javascript doesnt allow disabling of antialiasing
 */
function AntialiasCommand() {}

AntialiasCommand.prototype.execute = function(data, next) { next(); };

module.exports = AntialiasCommand;
},{}],44:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Sets the color of the background
 *
 * @param {String} args The arguments to the command
 */
function BcolorCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('BCOLOR command requires 3 arguments');
    this.red = parsed.args[0];
    this.green = parsed.args[1];
    this.blue = parsed.args[2];
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
BcolorCommand.prototype.toString = function() {
    return [this.red, this.green, this.blue].join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
BcolorCommand.prototype.toJSON = function() {
    return {
        r: this.red.toJSON(),
        g: this.green.toJSON(),
        b: this.blue.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
BcolorCommand.prototype.execute = function(data, next) {
    var red = this.red.execute(data);
    var green = this.green.execute(data);
    var blue = this.blue.execute(data);

    data.validate(red, 'number');
    data.validate(green, 'number');
    data.validate(blue, 'number');

    var oldRed = red, oldGreen = green, oldBlue = blue;

    if (red > 1) red /= 255;
    if (green > 1) green /= 255;
    if (blue > 1) blue /= 255;

    red = Math.max(0, Math.min(red, 1));
    green = Math.max(0, Math.min(green, 1));
    blue = Math.max(0, Math.min(blue, 1));

    data.setConstant('BColorR', oldRed);
    data.setConstant('BColorG', oldGreen);
    data.setConstant('BColorB', oldBlue);

    ctx.write({
        "command": "bcolor",
        "args": {
            "r": red,
            "g": green,
            "b": blue
        }
    });
    next();
};

module.exports = BcolorCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],45:[function(require,module,exports){
var ctx = require('../../IOInterface').get('draw');

/**
 * Begins canvas caching
 *
 * @constructor
 */
function BegindrawCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
BegindrawCommand.prototype.execute = function(data, next) {
    ctx.write({
        command: "startCache"
    });
    next();
};

module.exports = BegindrawCommand;
},{"../../IOInterface":27}],46:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a filled or stroked circle
 *
 * @param {String} args The arguments to the command
 */
function CircleCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('CIRCLE command requires 3 arguments');
    this.x = parsed.args[0];
    this.y = parsed.args[1];
    this.radius = parsed.args[2];
    this.stroke = parsed.args.length > 3 ? parsed.args[3] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
CircleCommand.prototype.toString = function() {
    var args = [this.x, this.y, this.radius];
    if (this.stroke) args.push(this.stroke);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
CircleCommand.prototype.toJSON = function() {
    return {
        x: this.x.toJSON(),
        y: this.y.toJSON(),
        radius: this.radius.toJSON(),
        stroke: this.stroke ? this.stroke.toJSON() : false
    };
};


/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
CircleCommand.prototype.execute = function(data, next) {
    var x = this.x.execute(data);
    var y = this.y.execute(data);
    var radius = this.radius.execute(data);
    var stroke = this.stroke ? this.stroke.execute(data) : 0;

    data.validate(x, 'number');
    data.validate(y, 'number');
    data.validate(radius, 'number');
    data.validate(stroke, 'number');

    ctx.write({
        command: "circle",
        args: {
            x: x,
            y: y,
            radius: radius,
            stroke: stroke
        }
    });

    next();
};

module.exports = CircleCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],47:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');

/**
 * Closes a file in a pointer
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function CloseCommand(args, define) {
    var parsed = new statements.ExpressionStatement(args, define);
    if (!(parsed.child instanceof statements.PointerStatement)) throw new SyntaxError('Expected pointer');

    this.pointer = parsed;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
CloseCommand.prototype.toString = function() {
    return this.pointer.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
CloseCommand.prototype.toJSON = function() {
    return {
        pointer: this.pointer.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
CloseCommand.prototype.execute = function(data, next) {
    var file = this.pointer.execute(data);
    if (!(file instanceof filesystem.File)) throw new Error('Expected file');
    data.setPointer(this.pointer.child, false);

    next();
};

module.exports = CloseCommand;
},{"../../filesystem":33,"../SyntaxError":41,"../statements":103}],48:[function(require,module,exports){
(function (process){
var ctx = require('../../IOInterface').get('draw');

/**
 * Clears the screen
 *
 * @param {String} args The arguments to the command
 */
function ClsCommand(args) {
    var lowerArgs = args.toLowerCase();
    this.tty = lowerArgs !== 'gfx';
    this.gfx = lowerArgs !== 'tty';
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ClsCommand.prototype.toString = function() {
    if (this.tty && !this.gfx) return 'TTY';
    if (this.gfx && !this.tty) return 'GFX';
    return '';
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ClsCommand.prototype.toJSON = function() {
    return {
        tty: this.tty,
        gfx: this.gfx
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ClsCommand.prototype.execute = function(data, next) {
    if (this.tty) {
        if (process.browser) {
            ctx.write({
                command: "clear",
                args: {
                    type: "tty"
                }
            });
        } else console.log((new Array(process.stdout.rows + 1)).join("\n"));
    }
    if (this.gfx && process.browser) {
        ctx.write({
            command: "clear",
            args: {
                type: "gfx"
            }
        });
    }

    next();
};

module.exports = ClsCommand;
}).call(this,require('_process'))

},{"../../IOInterface":27,"_process":10}],49:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Sets the draw color of the canvas
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function ColorCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('COLOR command requires 3 arguments');
    this.red = parsed.args[0];
    this.green = parsed.args[1];
    this.blue = parsed.args[2];
    this.alpha = parsed.args.length > 3 ? parsed.args[3] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ColorCommand.prototype.toString = function() {
    var args = [this.red, this.green, this.blue];
    if (this.alpha) args.push(this.alpha);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ColorCommand.prototype.toJSON = function() {
    return {
        r: this.red.toJSON(),
        g: this.green.toJSON(),
        b: this.blue.toJSON(),
        a: this.alpha ? this.alpha.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ColorCommand.prototype.execute = function(data, next) {
    var red = this.red.execute(data);
    var green = this.green.execute(data);
    var blue = this.blue.execute(data);
    var alpha = this.alpha ? this.alpha.execute(data) : false;

    data.validate(red, 'number');
    data.validate(green, 'number');
    data.validate(blue, 'number');
    if (alpha !== false) data.validate(alpha, 'number');
    else alpha = data.constants['ColorA'];

    var oldRed = red, oldGreen = green, oldBlue = blue, oldAlpha = alpha;

    if (red > 1) red /= 255;
    if (green > 1) green /= 255;
    if (blue > 1) blue /= 255;
    if (alpha > 1) alpha /= 255;

    red = Math.max(0, Math.min(red, 1));
    green = Math.max(0, Math.min(green, 1));
    blue = Math.max(0, Math.min(blue, 1));
    alpha = Math.max(0, Math.min(alpha, 1));

    data.setConstant('ColorR', oldRed);
    data.setConstant('ColorG', oldGreen);
    data.setConstant('ColorB', oldBlue);
    data.setConstant('ColorA', oldAlpha);

    ctx.write({
        "properties": {
            "r": red,
            "g": green,
            "b": blue,
            "a": alpha
        }
    });
    next();
};

module.exports = ColorCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],50:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');

/**
 * Declares one or more arrays
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function DimCommand(args) {
    var parsed = new statements.ArgumentStatement(args, {
        parseArgs: false
    });

    this.creates = [];

    for (var i = 0; i < parsed.args.length; i++) {
        var dimDef = parsed.args[i];
        var startBracket = dimDef.indexOf('(');
        var endBracket = dimDef.indexOf(')');

        if (startBracket === -1) throw new SyntaxError('Expected start bracket');
        if (endBracket === -1) throw new SyntaxError('Expected end bracket');

        var arrayName = dimDef.substring(0, startBracket).trim();
        var arrayLengthName = dimDef.substring(startBracket + 1, endBracket);
        var arrayLengthArg = new statements.ArgumentStatement(arrayLengthName);

        this.creates.push({
            name: arrayName,
            lengths: arrayLengthArg.args
        })
    }
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
DimCommand.prototype.toString = function() {
    var creates = [];
    for (var i = 0; i < this.creates.length; i++) {
        var create = this.creates[i];
        creates.push(create.name + '(' + create.lengths.join(', ') + ')');
    }
    return creates.join(', ');
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
DimCommand.prototype.toJSON = function() {
    var creates = [];
    for (var i = 0; i < this.creates.length; i++) {
        var lengths = [], create = this.creates[i];
        for (var x = 0; x < create.lengths.length; x++) {
            lengths.push(create.lengths[x].toJSON());
        }

        creates.push({
            name: create.name.toJSON(),
            lengths: lengths
        });
    }

    return {
        creates: creates
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
DimCommand.prototype.execute = function(data, next) {
    for (var i = 0; i < this.creates.length; i++) {
        var dimDef = this.creates[i];

        var lengths = [];
        for (var x = 0; x < dimDef.lengths.length; x++) {
            var length = dimDef.lengths[x].execute(data);
            data.validate(length, 'number');
            lengths.push(length);
        }

        data.defineArray(dimDef.name, lengths);
    }
    next();
};

module.exports = DimCommand;
},{"../SyntaxError":41,"../statements":103}],51:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a sprite
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function DrawspriteCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('DRAWSPRITE command requires 3 arguments');
    this.id = parsed.args[0];
    this.x = parsed.args[1];
    this.y = parsed.args[2];
    this.scale = parsed.args.length === 4 ? parsed.args[3] : false;
    this.rotation = parsed.args.length === 5 ? parsed.args[4] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
DrawspriteCommand.prototype.toString = function() {
    var args = [this.id, this.x, this.y];
    if (this.scale) args.push(this.scale);
    if (this.rotation) args.push(this.rotation);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
DrawspriteCommand.prototype.toJSON = function() {
    return {
        id: this.id.toJSON(),
        x: this.x.toJSON(),
        y: this.y.toJSON(),
        scale: this.scale ? this.scale.toJSON() : false,
        rotation: this.rotation ? this.rotation.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
DrawspriteCommand.prototype.execute = function(data, next) {
    var id = this.id.execute(data);
    var x = this.x.execute(data);
    var y = this.y.execute(data);
    var scale = this.scale ? this.scale.execute(data) : 1;
    var rotation = this.rotation ? this.rotation.execute(data) : 0;

    data.validate(id, 'number');
    data.validate(x, 'number');
    data.validate(y, 'number');
    data.validate(scale, 'number');
    data.validate(rotation, 'number');

    if (!data.private.sprites[id]) throw new Error('Invalid sprite ID');
    var img = data.private.sprites[id];

    ctx.print({
        command: 'sprite',
        args: {
            x: x,
            y: y,
            scale: scale,
            rotation: rotation,
            sprite: img
        }
    });

    next();
};

module.exports = DrawspriteCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],52:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws text either at a point or inside a rectangle
 *
 * @param {String} args The arguments to the command
 */
function DrawtextCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('DRAWTEXT command requires 3 arguments');
    else if (parsed.args.length > 3) throw new SyntaxError('DRAWTEXT command requires 5 arguments');

    this.text = parsed.args[0];
    this.x1 = parsed.args[1];
    this.y1 = parsed.args[2];
    if (parsed.args.length > 3) {
        this.x2 = parsed.args[3];
        this.y2 = parsed.args[4];
    } else {
        this.x2 = false;
        this.y2 = false;
    }
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
DrawtextCommand.prototype.toString = function() {
    var args = [this.text, this.x1, this.y1];
    if (this.x2) args.push(this.x2, this.y2);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
DrawtextCommand.prototype.toJSON = function() {
    return {
        text: this.text.toJSON(),
        x1: this.x1.toJSON(),
        y1: this.y1.toJSON(),
        x2: this.x2 ? this.x2.toJSON() : false,
        y2: this.y2 ? this.y2.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
DrawtextCommand.prototype.execute = function(data, next) {
    var text = this.text.execute(data);
    var x1 = this.x1.execute(data);
    var y1 = this.y1.execute(data);
    data.validate(text, 'string');
    data.validate(x1, 'number');
    data.validate(y1, 'number');

    var x2, y2 = false;
    if (this.x2) {
        x2 = this.x2.execute(data);
        y2 = this.y2.execute(data);
        data.validate(x2, 'number');
        data.validate(y2, 'number');
    }

    ctx.write({
        command: "text",
        args: {
            text: text,
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2
        }
    });

    next();
};

module.exports = DrawtextCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],53:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a filled or stroked ellipse
 *
 * @param {String} args The arguments to the command
 */
function EllipseCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 4) throw new SyntaxError('ELLIPSE command requires 4 arguments');
    this.x1 = parsed.args[0];
    this.y1 = parsed.args[1];
    this.x2 = parsed.args[2];
    this.y2 = parsed.args[3];
    this.stroke = parsed.args.length > 4 ? parsed.args[4] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
EllipseCommand.prototype.toString = function() {
    var args = [this.x1, this.y1, this.x2, this.y2];
    if (this.stroke) args.push(this.stroke);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
EllipseCommand.prototype.toJSON = function() {
    return {
        x1 : this.x1.toJSON(),
        y1: this.y1.toJSON(),
        x2: this.x2.toJSON(),
        y2: this.y2.toJSON(),
        stroke: this.stroke ? this.stroke.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
EllipseCommand.prototype.execute = function(data, next) {
    var x1 = this.x1.execute(data);
    var y1 = this.y1.execute(data);
    var x2 = this.x2.execute(data);
    var y2 = this.y2.execute(data);
    var stroke = this.stroke ? this.stroke.execute(data) : 0;

    data.validate(x1, 'number');
    data.validate(y1, 'number');
    data.validate(x2, 'number');
    data.validate(y2, 'number');
    data.validate(stroke, 'number');

    ctx.write({
        command: "ellipse",
        args: {
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2,
            stroke: stroke
        }
    });

    next();
};

module.exports = EllipseCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],54:[function(require,module,exports){
/**
 * Skips to the next matching ENDIF command
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function ElseCommand(args, define) {
    this.block = define;
}

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ElseCommand.prototype.toJSON = function() {
    return {
        block: this.block.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ElseCommand.prototype.execute = function(data, next) {
    var refs = this.block.references();
    if (!refs.length) throw new Error('ELSE without IF');

    data.cursor = refs[0].end;
    next();
};

module.exports = ElseCommand;
},{}],55:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');

/**
 * Terminates the program
 *
 * @constructor
 */
function EndCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
EndCommand.prototype.execute = function(data, next) {
    data.terminate();
    next();
};

module.exports = EndCommand;
},{"../SyntaxError":41,"../statements":103}],56:[function(require,module,exports){
var ctx = require('../../IOInterface').get('draw');

/**
 * Begins canvas caching
 *
 * @constructor
 */
function EnddrawCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
EnddrawCommand.prototype.execute = function(data, next) {
    ctx.write({
        command: "flushCache"
    });
    next();
};

module.exports = EnddrawCommand;
},{"../../IOInterface":27}],57:[function(require,module,exports){
/**
 * End of an IF block
 *
 * @constructor
 */
function EndifCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
EndifCommand.prototype.execute = function(data, next) {
    next();
};

module.exports = EndifCommand;
},{}],58:[function(require,module,exports){
var statements = require('../statements');
var util = require('../../util');
var SyntaxError = require('../SyntaxError');
var setImmediate = util.setImmediate;

/**
 * Iterates over the body a certain amount of times
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function ForCommand(args, define) {
    var lowerArgs = args.toLowerCase();
    var toIndex = lowerArgs.indexOf(' to ');
    if (toIndex === -1) throw new SyntaxError('FOR has no TO');
    var assignmentText = args.substring(0, toIndex).trim();

    var stepIndex = lowerArgs.indexOf(' step ');
    var upperLimitText, stepText;
    if (stepIndex === -1) {
        upperLimitText = args.substring(toIndex + 4).trim();
        stepText = '1';
    } else {
        upperLimitText = args.substring(toIndex + 4, stepIndex).trim();
        stepText = args.substring(stepIndex + 6).trim();
    }

    var assignmentEquals = assignmentText.indexOf('=');
    if (assignmentEquals === -1) throw new SyntaxError('Expected assignment');
    var variableName = assignmentText.substring(0, assignmentEquals).trim();
    var equalsExpression = assignmentText.substring(assignmentEquals + 1).trim();
    var assignmentExpr = new statements.AssignmentStatement(
            new statements.VariableStatement(variableName),
            new statements.ExpressionStatement(equalsExpression, define)
    );

    var upperLimitExpr = new statements.ExpressionStatement(upperLimitText, define);
    if (upperLimitExpr.error) throw upperLimitExpr.error;

    var stepExpr = new statements.ExpressionStatement(stepText, define);
    if (stepExpr.error) throw stepExpr.error;

    this.assignmentExpr = assignmentExpr;
    this.upperLimitExpr = upperLimitExpr;
    this.stepExpr = stepExpr;

    this.block = define({
        start: 'FOR',
        end: 'NEXT'
    });
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ForCommand.prototype.toString = function() {
    return this.assignmentExpr.toString() + ' TO ' + this.upperLimitExpr.toString() + ' STEP ' + this.stepExpr.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ForCommand.prototype.toJSON = function() {
    return {
        assignment: this.assignmentExpr.toJSON(),
        upperLimit: this.upperLimitExpr.toJSON(),
        step: this.stepExpr.toJSON(),
        block: this.block.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ForCommand.prototype.execute = function(data, next) {
    var trackValue;

    if (!this.hasRun) {
        this.hasRun = true;
        this.assignmentExpr.execute(data);
        this.trackVar = this.assignmentExpr.variable;
        trackValue = data.getVariable(this.trackVar);
    } else {
        var increment = this.stepExpr.execute(data);
        data.validate(increment, 'number');
        trackValue = data.getVariable(this.trackVar);
        data.validate(trackValue, 'number');
        trackValue += increment;
        data.setVariable(this.trackVar, trackValue);
    }

    var maxValue = this.upperLimitExpr.execute(data);
    data.validate(maxValue, 'number');
    if ((maxValue > 0 && trackValue > maxValue) || (maxValue < 0 && trackValue < maxValue)) {
        this.hasRun = false;
        data.cursor = this.block.end + 1;
    }

    //setImmediate(next);
    next();
};

module.exports = ForCommand;
},{"../../util":123,"../SyntaxError":41,"../statements":103}],59:[function(require,module,exports){
var SyntaxError = require('../SyntaxError');
var util = require('../../util');
var setImmediate = util.setImmediate;

/**
 * Goes to a label and returns on RETURN
 *
 * @param {String} args the arguments to the command
 * @constructor
 */
function GosubCommand(args) {
    if (!args.length) throw new SyntaxError('Label required');
    this.label = args;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
GosubCommand.prototype.toString = function() {
    return this.label;
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
GosubCommand.prototype.toJSON = function() {
    return {
        label: this.label
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
GosubCommand.prototype.execute = function(data, next) {
    data.gosubLabel(this.label);
    setImmediate(next);
};

module.exports = GosubCommand;
},{"../../util":123,"../SyntaxError":41}],60:[function(require,module,exports){
var SyntaxError = require('../SyntaxError');
var util = require('../../util');
var setImmediate = util.setImmediate;

/**
 * Goes to a label
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function GotoCommand(args) {
    if (!args.length) throw new SyntaxError('Label required');
    this.label = args;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
GotoCommand.prototype.toString = function() {
    return this.label;
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
GotoCommand.prototype.toJSON = function() {
    return {
        label: this.label
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
GotoCommand.prototype.execute = function(data, next) {
    data.gotoLabel(this.label);
    setImmediate(next);
};

module.exports = GotoCommand;
},{"../../util":123,"../SyntaxError":41}],61:[function(require,module,exports){
var statements = require('../statements');
var util = require('../../util');
var SyntaxError = require('../SyntaxError');
/**
 * Executes the body if the condition is true
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function IfCommand(args, define) {
    if (util.endsWith(args.toLowerCase(), ' then')) args = args.slice(0, args.length - 5).trim();
    else throw new SyntaxError('IF has no THEN');

    var parsed = new statements.ArgumentStatement(args, {
        separator: false
    }, define);

    this.condition = parsed.args[0];
    this.block = define({
        start: 'IF',
        then: 'ELSE',
        end: 'ENDIF'
    });
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
IfCommand.prototype.toString = function() {
    return this.condition.toString() + " THEN";
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
IfCommand.prototype.toJSON = function() {
    return {
        condition: this.condition.toJSON(),
        block: this.block.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
IfCommand.prototype.execute = function(data, next) {
    var shouldRun = this.condition.execute(data);
    if (!shouldRun) {
        if (this.block.has('ELSE')) data.cursor = this.block.next('ELSE') + 1;
        else data.cursor = this.block.end;
    }
    next();
};

module.exports = IfCommand;
},{"../../util":123,"../SyntaxError":41,"../statements":103}],62:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');
var rl = require('../../IOInterface').getDefault();

/**
 * Inputs a line from the user
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function InputCommand(args) {
    var parsed = new statements.ArgumentStatement(args);
    if (!parsed.args.length) throw new SyntaxError('INPUT requires at least one argument');

    var question = "", placeVar, file;
    if (parsed.args.length === 1) placeVar = parsed.args[0];
    else {
        if (parsed.args[0].child instanceof statements.PointerStatement) file = parsed.args[0];
        else question = parsed.args[0];

        placeVar = parsed.args[1];
    }

    if (!(placeVar.child instanceof statements.VariableStatement)) throw new SyntaxError('Expected variable');

    this.file = file;
    this.question = question;
    this.placeVar = placeVar;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
InputCommand.prototype.toString = function() {
    return  (this.file ? this.file.toString() + ', ' : '') +
            (this.question ? this.question.toString() + ', ' : '') +
            this.placeVar.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
InputCommand.prototype.toJSON = function() {
    return {
        file: this.file ? this.file.toJSON() : false,
        question: this.question ? this.question.toJSON() : false,
        variable: this.placeVar.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
InputCommand.prototype.execute = function(data, next) {
    var placeVar = this.placeVar;

    if (this.file) {
        var file = this.file.execute(data);
        if (!(file instanceof filesystem.File)) throw new Error('Expected file');

        if (file.mode !== 'input') throw new Error('File not readable');

        var value = file.nextLine();
        if (file.eof && placeVar.child.type === "number") value = 0;

        data.setVariable(placeVar.child, value);
        data.setConstant('EOF', file.eof ? 1 : 0);
        next();
    } else {
        var question = this.question ? this.question.execute(data) : '';

        rl.question(question + "> ", function (answer) {
            data.setVariable(placeVar.child, answer);
            next();
        });
    }
};

module.exports = InputCommand;
},{"../../IOInterface":27,"../../filesystem":33,"../SyntaxError":41,"../statements":103}],63:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a line
 *
 * @param {String} args The arguments to the command
 */
function LineCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 4) throw new SyntaxError('LINE command requires 4 arguments');
    this.x1 = parsed.args[0];
    this.y1 = parsed.args[1];
    this.x2 = parsed.args[2];
    this.y2 = parsed.args[3];
    this.width = parsed.args.length > 4 ? parsed.args[4] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
LineCommand.prototype.toString = function() {
    var args = [this.x1, this.y1, this.x2, this.y2];
    if (this.width) args.push(this.width);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
LineCommand.prototype.toJSON = function() {
    return {
        x1: this.x1.toJSON(),
        y1: this.y1.toJSON(),
        x2: this.x2.toJSON(),
        y2: this.y2.toJSON(),
        width: this.width ? this.width.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
LineCommand.prototype.execute = function(data, next) {
    var x1 = this.x1.execute(data);
    var y1 = this.y1.execute(data);
    var x2 = this.x2.execute(data);
    var y2 = this.y2.execute(data);
    var width = this.width ? this.width.execute(data) : 1;

    data.validate(x1, 'number');
    data.validate(y1, 'number');
    data.validate(x2, 'number');
    data.validate(y2, 'number');
    data.validate(width, 'number');

    if (width < 1) throw new Error('Width out of bounds');
    ctx.write({
        command: "line",
        args: {
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2,
            width: width
        }
    });

    next();
};

module.exports = LineCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],64:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');
var ctx = require('../../IOInterface').get('draw');

/**
 * Loads a sprite from a file
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function LoadspriteCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 2) throw new SyntaxError('LOADSPRITE command requires 2 arguments');
    else if (parsed.args.length > 2 && parsed.args.length < 5) throw new SyntaxError('LOADSPRITE command requires 5 arguments');

    this.id = parsed.args[0];

    if (parsed.args.length > 2) {
        this.x1 = parsed.args[1];
        this.y1 = parsed.args[2];
        this.x2 = parsed.args[3];
        this.y2 = parsed.args[4];
    } else {
        this.fileName = parsed.args[1];
    }
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
LoadspriteCommand.prototype.toString = function() {
    if (this.x1) {
        var args = [this.id, this.x1, this.y1, this.x2, this.y2];
        return args.join(", ");
    }
    return this.id + ", " + this.fileName;
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
LoadspriteCommand.prototype.toJSON = function() {
    return {
        id: this.id.toJSON(),
        x1: this.x1 ? this.x1.toJSON() : false,
        y1: this.y1 ? this.y1.toJSON() : false,
        x2: this.x2 ? this.x2.toJSON() : false,
        y2: this.y2 ? this.y2.toJSON() : false,
        fileName: this.fileName ? this.fileName.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
LoadspriteCommand.prototype.execute = function(data, next) {
    var id = this.id.execute(data);
    data.validate(id, 'number');

    if (this.x1) {
        var x1 = this.x1.execute(data);
        var y1 = this.y1.execute(data);
        var x2 = this.x2.execute(data);
        var y2 = this.y2.execute(data);

        data.validate(x1, 'number');
        data.validate(y1, 'number');
        data.validate(x2, 'number');
        data.validate(y2, 'number');

        ctx.read(function(response, cancel) {
            if (response.command !== 'capture') return;
            cancel();

            data.private.sprites[id] = response.data;
            next();
        });
        ctx.write({
            command: 'capture',
            args: {
                x1: x1,
                y1: y1,
                x2: x2,
                y2: y2
            }
        });
    } else {
        var filename = this.fileName.execute(data);
        data.validate(filename, 'string');

        var driveIndex = filename.indexOf(':');
        var drive = 'A';
        if (driveIndex !== -1) {
            drive = filename.substring(0, driveIndex);
            filename = filename.substring(driveIndex + 1);
        }

        filesystem.drive(drive, function (fs) {
            var file = fs.open(filename);
            var imageLine = file.nextLine();
            if (file.eof || !imageLine.length) throw new Error('Invalid image file');

            var img = new Image();
            img.src = imageLine;

            data.private.sprites[id] = img;
            next();
        });
    }
};

module.exports = LoadspriteCommand;
},{"../../IOInterface":27,"../../filesystem":33,"../SyntaxError":41,"../statements":103}],65:[function(require,module,exports){
var ctx = require('../../IOInterface').get('draw');

/**
 * Locks the size of the canvas
 */
function LockorientationCommand() { }

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
LockorientationCommand.prototype.execute = function(data, next) {
    ctx.write({
        command: 'locksize'
    });
    next();
};

module.exports = LockorientationCommand;
},{"../../IOInterface":27}],66:[function(require,module,exports){
/**
 * End of a FOR block
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function NextCommand(args, define) {
    this.block = define;
}

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
NextCommand.prototype.toJSON = function() {
    return {
        block: this.block.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
NextCommand.prototype.execute = function(data, next) {
    var refs = this.block.references();
    if (!refs.length) throw new Error('NEXT without FOR');

    data.cursor = refs[0].start;
    next();
};

module.exports = NextCommand;
},{}],67:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');

/**
 * Opens a file in a pointer
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function OpenCommand(args, define) {
    var lowerArgs = args.toLowerCase();
    var forIndex = lowerArgs.indexOf(' for ');
    if (forIndex === -1) throw new SyntaxError('OPEN without FOR');
    var filename = new statements.ExpressionStatement(args.substring(0, forIndex).trim(), define);

    var asIndex = lowerArgs.indexOf(' as ');
    if (asIndex === -1) throw new SyntaxError('OPEN without AS');
    var type = args.substring(forIndex + 5, asIndex).trim().toLowerCase();
    if (type !== 'input' && type !== 'output' && type !== 'append') throw new SyntaxError('Invalid mode');

    var pointer = new statements.ExpressionStatement(args.substring(asIndex + 4).trim(), define);
    if (!(pointer.child instanceof statements.PointerStatement)) throw new SyntaxError('Expected pointer');

    this.filename = filename;
    this.type = type;
    this.pointer = pointer;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
OpenCommand.prototype.toString = function() {
    return this.filename.toString() + " FOR " + this.type.toUpperCase() + " AS " + this.pointer.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
OpenCommand.prototype.toJSON = function() {
    return {
        filename: this.filename.toJSON(),
        type: this.type,
        pointer: this.pointer.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
OpenCommand.prototype.execute = function(data, next) {
    var filename = this.filename.execute(data);
    data.validate(filename, 'string');

    var driveIndex = filename.indexOf(':');
    var drive = 'A';
    if (driveIndex !== -1) {
        drive = filename.substring(0, driveIndex);
        filename = filename.substring(driveIndex + 1);
    }

    var pointer = this.pointer.child, mode = this.type;
    filesystem.drive(drive, function(fs) {
        var file = fs.open(filename);
        file.mode = mode;
        if (mode === 'output') file.clear();
        data.setPointer(pointer, file);
        next();
    });
};

module.exports = OpenCommand;
},{"../../filesystem":33,"../SyntaxError":41,"../statements":103}],68:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var rl = require('../../IOInterface').getDefault();

/**
 * Pauses execution until RETURN is pressed
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function PauseCommand(args, define) {
    if (args.length) {
        this.message = new statements.ExpressionStatement(args, define);
        if (this.message.error) throw this.message.error;
    } else this.message = new statements.StringStatement("[<< Paused, Press RETURN to Continue >>]");
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
PauseCommand.prototype.toString = function() {
    return this.message.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
PauseCommand.prototype.toJSON = function() {
    return {
        message: this.message.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
PauseCommand.prototype.execute = function(data, next) {
    var message = this.message.execute(data);
    data.validate(message, 'string');

    rl.question(message, function(answer) {
        next();
    });
};

module.exports = PauseCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],69:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a piechart
 *
 * @param {String} args The arguments to the command
 */
function PiechartCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 8) throw new SyntaxError('PIECHART command requires 8 arguments');
    this.x = parsed.args[0];
    this.y = parsed.args[1];
    this.r = parsed.args[2];
    this.itemsLength = parsed.args[3];
    this.percentages = parsed.args[4];
    this.itemsRed = parsed.args[5];
    this.itemsGreen = parsed.args[6];
    this.itemsBlue = parsed.args[7];
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
PiechartCommand.prototype.toString = function() {
    var args = [this.x, this.y, this.r, this.itemsLength, this.percentages, this.itemsRed, this.itemsGreen, this.itemsBlue];
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
PiechartCommand.prototype.toJSON = function() {
    return {
        x: this.x.toJSON(),
        y: this.y.toJSON(),
        r: this.r.toJSON(),
        itemsLength: this.itemsLength.toJSON(),
        percentages: this.percentages.toJSON(),
        itemsRed: this.itemsRed.toJSON(),
        itemsGreen: this.itemsGreen.toJSON(),
        itemsBlue: this.itemsBlue.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
PiechartCommand.prototype.execute = function(data, next) {
    var x = this.x.execute(data);
    var y = this.y.execute(data);
    var r = this.r.execute(data);
    var itemsLength = this.itemsLength.execute(data);
    var percentages = this.percentages.execute(data);
    var itemsRed = this.itemsRed.execute(data);
    var itemsGreen = this.itemsGreen.execute(data);
    var itemsBlue = this.itemsBlue.execute(data);

    data.validate(x, 'number');
    data.validate(y, 'number');
    data.validate(r, 'number');
    data.validate(itemsLength, 'number');
    if (!Array.isArray(percentages)) throw new Error('Types mismatch');
    if (!Array.isArray(itemsRed)) throw new Error('Types mismatch');
    if (!Array.isArray(itemsGreen)) throw new Error('Types mismatch');
    if (!Array.isArray(itemsBlue)) throw new Error('Types mismatch');

    if (itemsLength > percentages.length ||
            itemsLength > itemsRed.length ||
            itemsLength > itemsGreen.length ||
            itemsLength > itemsBlue.length) {
        throw new Error('Invalid array bounds');
    }

    var items = [];
    for (var i = 0; i < itemsLength; i++) {
        var size = percentages[i];
        var red = itemsRed[i];
        var green = itemsGreen[i];
        var blue = itemsBlue[i];
        data.validate(size, 'number');
        data.validate(red, 'number');
        data.validate(green, 'number');
        data.validate(blue, 'number');
        items.push({
            size: size,
            r: red,
            g: green,
            b: blue
        });
    }

    ctx.write({
        command: "piechart",
        args: {
            items: items,
            x: x,
            y: y,
            r: r
        }
    });

    next();
};

module.exports = PiechartCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],70:[function(require,module,exports){
/**
 * TODO
 */
function PlayCommand() {}

PlayCommand.prototype.execute = function(data, next) { next(); };

module.exports = PlayCommand;
},{}],71:[function(require,module,exports){
/**
 * TODO
 */
function PlayspeedCommand() {}

PlayspeedCommand.prototype.execute = function(data, next) { next(); };

module.exports = PlayspeedCommand;
},{}],72:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a point
 *
 * @param {String} args The arguments to the command
 */
function PointCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 2) throw new SyntaxError('POINT command requires 2 arguments');
    this.x = parsed.args[0];
    this.y = parsed.args[1];
    if (parsed.args.length > 2) this.size = parsed.args[2];
    else this.size = false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
PointCommand.prototype.toString = function() {
    var args = [this.x, this.y];
    if (this.size) args.push(this.size);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
PointCommand.prototype.toJSON = function() {
    return {
        x: this.x.toJSON(),
        y: this.y.toJSON(),
        size: this.size ? this.size.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
PointCommand.prototype.execute = function(data, next) {
    var x = this.x.execute(data);
    var y = this.y.execute(data);
    var size = this.size ? this.size.execute(data) : 1;

    data.validate(x, 'number');
    data.validate(y, 'number');
    data.validate(size, 'number');

    if (size < 1) throw new Error('Size out of bounds');
    ctx.write({
        command: "point",
        args: {
            "x": x,
            "y": y,
            "size": size
        }
    });

    next();
};

module.exports = PointCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],73:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');
var rl = require('../../IOInterface').getDefault();

/**
 * Outputs or formats and outputs a string
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function PrintCommand(args, define) {
    var parsed = new statements.ArgumentStatement(args, {
        flags: ['USING'],
        parseArgs: false
    });

    if (parsed.flags.USING) {
        if (parsed.args.length !== 1) throw new SyntaxError('PRINT USING command requires 1 argument');
        if (parsed.args.length > 1) throw new SyntaxError('Unexpected comma');

        var semicolonIndex = parsed.args[0].indexOf(';');
        if (semicolonIndex === -1) throw new SyntaxError('Expected semicolon');

        var formatExpression = new statements.ExpressionStatement(parsed.args[0].substring(0, semicolonIndex).trim(), define);
        var numberExpression = new statements.ExpressionStatement(parsed.args[0].substring(semicolonIndex + 1).trim(), define);
        if (formatExpression.error instanceof SyntaxError) throw formatExpression.error;
        if (numberExpression.error instanceof SyntaxError) throw numberExpression.error;

        this.formatExpr = formatExpression;
        this.numberExpr = numberExpression;
    } else {
        var items = [];
        for (var i = 0; i < parsed.args.length; i++) {
            var expr = new statements.ExpressionStatement(parsed.args[i], define);
            if (expr.error instanceof SyntaxError) throw expr.error;
            items.push(expr);
        }
        this.items = items;
    }
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
PrintCommand.prototype.toString = function() {
    if (this.formatExpr) {
        return 'USING ' + this.formatExpr.toString() + '; ' + this.numberExpr.toString();
    } else {
        return this.items.join(', ');
    }
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
PrintCommand.prototype.toJSON = function() {
    var items = [];
    if (this.items) {
        for (var i = 0; i < this.items.length; i++) {
            items.push(this.items[i].toJSON());
        }
    }

    return {
        format: this.formatExpr ? this.formatExpr.toJSON() : false,
        number: this.numberExpr ? this.numberExpr.toJSON() : false,
        items: items
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
PrintCommand.prototype.execute = function(data, next) {
    if (this.formatExpr) {
        var format = this.formatExpr.execute(data);
        var number = this.numberExpr.execute(data);

        data.validate(format, 'string');
        data.validate(number, 'number');

        var stringNumber = number.toString().split('.');
        var preDecimal = stringNumber[0];
        var postDecimal = stringNumber.length > 1 ? stringNumber[1] : '';

        var formatSplit = format.split('.');
        var preDecimalFormat = formatSplit[0];
        var postDecimalFormat = formatSplit.length > 1 ? formatSplit[1] : '';

        var preDecimalResult = '', postDecimalResult = '';

        var preDecimalStart = preDecimal.length - preDecimalFormat.length;
        var preDecimalText = preDecimal.substring(preDecimalStart < 0 ? 0 : preDecimalStart);
        if (preDecimalStart < 0) {
            var preDecimalDiff = preDecimalStart * -1;
            preDecimalText = (new Array(preDecimalDiff + 1)).join(" ") + preDecimalText;
        }
        for (var pre = 0; pre < preDecimalFormat.length; pre++) {
            var preChar = preDecimalFormat[pre];
            if (preChar !== '#') preDecimalResult += preChar;
            else preDecimalResult += preDecimalText[pre];
        }

        var postDecimalText = postDecimal.substring(0, postDecimalFormat.length);
        if (postDecimalText.length < postDecimalFormat.length) {
            var postDecimalDiff = postDecimalFormat.length - postDecimalText.length;
            postDecimalText += (new Array(postDecimalDiff + 1)).join(" ");
        }
        for (var post = 0; post < postDecimalFormat.length; post++) {
            var postChar = postDecimalFormat[post];
            if (postChar !== '#') postDecimalResult += postChar;
            else postDecimalResult += postDecimalText[post];
        }

        rl.write(preDecimalResult + (postDecimalResult.length ? '.' + postDecimalResult : '') + '\n');
    } else {
        var items = [];
        for (var i = 0; i < this.items.length; i++) {
            var result = this.items[i].execute(data);
            if (typeof result !== 'string' && typeof result !== 'number' && !(result instanceof filesystem.File && i === 0)) throw new Error('Types mismatch');
            items.push(result);
        }
        if (items[0] instanceof filesystem.File) {
            var file = items[0];
            if (file.mode !== 'output' && file.mode !== 'append') throw new Error('File not writable');
            file.write(items.slice(1).join(' '));
            file.save(function() {
                next();
            });
            return;
        } else rl.write(items.join(' ') + '\n');
    }

    next();
};

module.exports = PrintCommand;
},{"../../IOInterface":27,"../../filesystem":33,"../SyntaxError":41,"../statements":103}],74:[function(require,module,exports){
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
},{}],75:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a filled or stroked rectangle
 *
 * @param {String} args The arguments to the command
 */
function RectCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 4) throw new SyntaxError('RECT command requires 4 arguments');
    this.x1 = parsed.args[0];
    this.y1 = parsed.args[1];
    this.x2 = parsed.args[2];
    this.y2 = parsed.args[3];
    this.stroke = parsed.args.length > 4 ? parsed.args[4] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
RectCommand.prototype.toString = function() {
    var args = [this.x1, this.y1, this.x2, this.y2];
    if (this.stroke) args.push(this.stroke);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
RectCommand.prototype.toJSON = function() {
    return {
        x1: this.x1.toJSON(),
        y1: this.y1.toJSON(),
        x2: this.x2.toJSON(),
        y2: this.y2.toJSON(),
        stroke: this.stroke ? this.stroke.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
RectCommand.prototype.execute = function(data, next) {
    var x1 = this.x1.execute(data);
    var y1 = this.y1.execute(data);
    var x2 = this.x2.execute(data);
    var y2 = this.y2.execute(data);
    var stroke = this.stroke ? this.stroke.execute(data) : 0;

    data.validate(x1, 'number');
    data.validate(y1, 'number');
    data.validate(x2, 'number');
    data.validate(y2, 'number');
    data.validate(stroke, 'number');

    ctx.write({
        command: "rect",
        args: {
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2,
            stroke: stroke
        }
    });

    next();
};

module.exports = RectCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],76:[function(require,module,exports){
var ctx = require('../../IOInterface').get('draw');

/**
 * Sets the canvas to landscape and locks it
 */
function RequirelandscapeCommand() { }

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
RequirelandscapeCommand.prototype.execute = function(data, next) {
    var width = data.constants['ScreenWidth']();
    var height = data.constants['ScreenHeight']();

    if (height > width) {
        var swapped = width;
        width = height;
        height = swapped;
    }

    ctx.write({
        command: 'setsize',
        args: {
            width: width,
            height: height
        }
    });
    ctx.write({
        command: 'locksize'
    });
    next();
};

module.exports = RequirelandscapeCommand;
},{"../../IOInterface":27}],77:[function(require,module,exports){
var ctx = require('../../IOInterface').get('draw');

/**
 * Sets the canvas to portrait and locks it
 */
function RequireportraitCommand() { }

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
RequireportraitCommand.prototype.execute = function(data, next) {
    var width = data.constants['ScreenWidth']();
    var height = data.constants['ScreenHeight']();

    if (width > height) {
        var swapped = width;
        width = height;
        height = swapped;
    }

    ctx.write({
        command: 'setsize',
        args: {
            width: width,
            height: height
        }
    });
    ctx.write({
        command: 'locksize'
    });
    next();
};

module.exports = RequireportraitCommand;
},{"../../IOInterface":27}],78:[function(require,module,exports){
/**
 * Does nothing, as retina is not possible on desktop
 */
function RetinaCommand() {}

RetinaCommand.prototype.execute = function(data, next) { next(); };

module.exports = RetinaCommand;
},{}],79:[function(require,module,exports){
/**
 * Returns to a GOSUB
 *
 * @constructor
 */
function ReturnCommand() {}

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ReturnCommand.prototype.execute = function(data, next) {
    data.returnLabel();
    next();
};

module.exports = ReturnCommand;
},{}],80:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a filled or stroked rounded rectangle
 *
 * @param {String} args The arguments to the command
 */
function RrectCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 5) throw new SyntaxError('RRECT command requires 5 arguments');
    this.x1 = parsed.args[0];
    this.y1 = parsed.args[1];
    this.x2 = parsed.args[2];
    this.y2 = parsed.args[3];
    this.radius = parsed.args[4];
    this.stroke = parsed.args.length > 5 ? parsed.args[5] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
RrectCommand.prototype.toString = function() {
    var args = [this.x1, this.y1, this.x2, this.y2, this.radius];
    if (this.stroke) args.push(this.stroke);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
RrectCommand.prototype.toJSON = function() {
    return {
        x1: this.x1.toJSON(),
        y1: this.y1.toJSON(),
        x2: this.x2.toJSON(),
        y2: this.y2.toJSON(),
        radius: this.radius.toJSON(),
        stroke: this.stroke ? this.stroke.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
RrectCommand.prototype.execute = function(data, next) {
    var x1 = this.x1.execute(data);
    var y1 = this.y1.execute(data);
    var x2 = this.x2.execute(data);
    var y2 = this.y2.execute(data);
    var radius = this.radius.execute(data);
    var stroke = this.stroke ? this.stroke.execute(data) : 0;

    data.validate(x1, 'number');
    data.validate(y1, 'number');
    data.validate(x2, 'number');
    data.validate(y2, 'number');
    data.validate(radius, 'number');
    data.validate(stroke, 'number');

    ctx.write({
        command: "rrect",
        args: {
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2,
            radius: radius,
            stroke: stroke
        }
    });

    next();
};

module.exports = RrectCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],81:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var filesystem = require('../../filesystem');

/**
 * Saves a sprite to a file
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function SavespriteCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 2) throw new SyntaxError('SAVESPRITE command requires 2 arguments');

    this.id = parsed.args[0];
    this.fileName = parsed.args[1];
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
SavespriteCommand.prototype.toString = function() {
    return this.id + ", " + this.fileName;
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
SavespriteCommand.prototype.toJSON = function() {
    return {
        id: this.id.toJSON(),
        fileName: this.fileName.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
SavespriteCommand.prototype.execute = function(data, next) {
    var id = this.id.execute(data);
    var filename = this.fileName.execute(data);

    data.validate(id, 'number');
    data.validate(filename, 'string');

    if (!data.private.sprites[id]) throw new Error('Invalid sprite ID');
    var img = data.private.sprites[id];
    var dataCode = img.toDataUrl();

    var driveIndex = filename.indexOf(':');
    var drive = 'A';
    if (driveIndex !== -1) {
        drive = filename.substring(0, driveIndex);
        filename = filename.substring(driveIndex + 1);
    }

    filesystem.drive(drive, function(fs) {
        var file = fs.open(filename);
        file.clear();
        file.write(dataCode);
        file.save();

        next();
    });
};

module.exports = SavespriteCommand;
},{"../../filesystem":33,"../SyntaxError":41,"../statements":103}],82:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a custom shape
 *
 * @param {String} args The arguments to the command
 */
function ShapeCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('SHAPE command requires 3 arguments');
    this.pointsLength = parsed.args[0];
    this.pointsX = parsed.args[1];
    this.pointsY = parsed.args[2];
    this.stroke = parsed.args.length > 3 ? parsed.args[3] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ShapeCommand.prototype.toString = function() {
    var args = [this.pointsLength, this.pointsX, this.pointsY];
    if (this.stroke) args.push(this.stroke);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ShapeCommand.prototype.toJSON = function() {
    return {
        pointsLength: this.pointsLength.toJSON(),
        pointsX: this.pointsX.toJSON(),
        pointsY: this.pointsY.toJSON(),
        stroke: this.stroke ? this.stroke.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ShapeCommand.prototype.execute = function(data, next) {
    var pointsLength = this.pointsLength.execute(data);
    var pointsX = this.pointsX.execute(data);
    var pointsY = this.pointsY.execute(data);
    var stroke = this.stroke ? this.stroke.execute(data) : 0;

    data.validate(pointsLength, 'number');
    if (!Array.isArray(pointsX)) throw new Error('Types mismatch');
    if (!Array.isArray(pointsY)) throw new Error('Types mismatch');

    if (pointsLength > pointsX.length || pointsLength > pointsY.length) throw new Error('Invalid array bounds');

    var points = [];
    for (var i = 0; i < pointsLength; i++) {
        var x = pointsX[i];
        var y = pointsY[i];
        data.validate(x, 'number');
        data.validate(y, 'number');
        points.push({ x: x, y: y });
    }

    ctx.write({
        command: "shape",
        args: {
            points: points,
            stroke: stroke
        }
    });

    next();
};

module.exports = ShapeCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],83:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');

/**
 * Sleeps for a certain amount of seconds
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function SleepCommand(args, define) {
    this.duration = new statements.ExpressionStatement(args, define);
    if (this.duration.error) throw this.duration.error;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
SleepCommand.prototype.toString = function() {
    return this.duration.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
SleepCommand.prototype.toJSON = function() {
    return {
        duration: this.duration.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
SleepCommand.prototype.execute = function(data, next) {
    var duration = this.duration.execute(data);
    data.validate(duration, 'number');

    setTimeout(function() {
        next();
    }, duration * 1000);
};

module.exports = SleepCommand;
},{"../SyntaxError":41,"../statements":103}],84:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Sets the color of text
 *
 * @param {String} args The arguments to the command
 */
function TcolorCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 3) throw new SyntaxError('TCOLOR command requires 3 arguments');
    this.red = parsed.args[0];
    this.green = parsed.args[1];
    this.blue = parsed.args[2];
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
TcolorCommand.prototype.toString = function() {
    return [this.red, this.green, this.blue].join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
TcolorCommand.prototype.toJSON = function() {
    return {
        r: this.red.toJSON(),
        g: this.green.toJSON(),
        b: this.blue.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
TcolorCommand.prototype.execute = function(data, next) {
    var red = this.red.execute(data);
    var green = this.green.execute(data);
    var blue = this.blue.execute(data);

    data.validate(red, 'number');
    data.validate(green, 'number');
    data.validate(blue, 'number');

    var oldRed = red, oldGreen = green, oldBlue = blue;

    if (red > 1) red /= 255;
    if (green > 1) green /= 255;
    if (blue > 1) blue /= 255;

    red = Math.max(0, Math.min(red, 1));
    green = Math.max(0, Math.min(green, 1));
    blue = Math.max(0, Math.min(blue, 1));

    data.setConstant('TColorR', oldRed);
    data.setConstant('TColorG', oldGreen);
    data.setConstant('TColorB', oldBlue);

    ctx.write({
        "command": "tcolor",
        "args": {
            "r": red,
            "g": green,
            "b": blue
        }
    });
    next();
};

module.exports = TcolorCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],85:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

var styleNames = [
    "light",
    "bold",
    "italic"
];
var fontNames = [
    "American Typewriter",
    "AppleGothic",
    "Arial",
    "Arial Rounded",
    "Courier",
    "Courier New",
    "Georgia",
    "Helvetica",
    "Marker Felt",
    "Times",
    "Trebuchet",
    "Verdana",
    "Zapfino"
];

/**
 * Modifies the DRAWTEXT font
 *
 * @param {String} args The arguments to the command
 */
function TextfontCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length > 2) {
        this.family = parsed.args[0];
        this.style = parsed.args[1];
        this.size = parsed.args[2];
    } else if (parsed.args.length > 1) {
        this.familyOrStyle = parsed.args[0];
        this.size = parsed.args[1];
    } else if (parsed.args.length > 0) {
        var arg = parsed.args[0];
        if (arg.child.type === 'string' || arg.child instanceof statements.StringStatement) this.familyOrStyle = arg;
        else this.size = arg;
    } else {
        this.reset = true;
    }
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
TextfontCommand.prototype.toString = function() {
    var result = [];
    if (this.family) result.push(this.family, this.style);
    else if (this.familyOrStyle) result.push(this.familyOrStyle);
    if (this.size) result.push(this.size);

    return result.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
TextfontCommand.prototype.toJSON = function() {
    return {
        reset: this.reset,
        family: this.family ? this.family.toJSON() : false,
        style: this.style ? this.style.toJSON() : false,
        size: this.size ? this.size.toJSON() : false,
        familyOrStyle: this.familyOrStyle ? this.familyOrStyle.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
TextfontCommand.prototype.execute = function(data, next) {
    var family = false, style = false, height = false;

    if (this.reset) {
        family = "Zapfino";
        style = "";
        height = 14;
    } else if (this.family) {
        family = this.family.execute(data);
        style = this.style.execute(data).toLowerCase();
    } else if (this.familyOrStyle) {
        var familyOrStyle = this.familyOrStyle.execute(data);
        var lowerStyle = familyOrStyle.toLowerCase();
        var splitStyle = lowerStyle.split(" ");

        var isStyle = true;
        for (var i = 0; i < splitStyle.length; i++) {
            if (styleNames.indexOf(splitStyle[i]) === -1) {
                isStyle = false;
                break;
            }
        }

        if (isStyle) style = lowerStyle;
        else family = familyOrStyle;
    }
    if (this.size) {
        height = this.size.execute(data);
    }

    if (family !== false) {
        data.validate(family, 'string');
        if (fontNames.indexOf(family) === -1) throw new Error('Invalid font name');
    }
    if (style !== false) {
        data.validate(style, 'string');
        style = style.trim();
        var styles = style.split(" ");
        for (var x = 0; x < styles.length; x++) {
            var stl = styles[x].trim();
            if (stl.length && styleNames.indexOf(stl) === -1) throw new Error('Invalid font style');
        }
    }
    if (height !== false) {
        data.validate(height, 'number');
        if (height <= 0) throw new Error('Height out of bounds');
    }

    ctx.write({
        command: 'font',
        args: {
            family: family,
            style: style,
            height: height
        }
    });

    next();
};

module.exports = TextfontCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],86:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');
var ctx = require('../../IOInterface').get('draw');

/**
 * Draws a filled or stroked triangle
 *
 * @param {String} args The arguments to the command
 */
function TriangleCommand(args) {
    var parsed = new statements.ArgumentStatement(args);

    if (parsed.args.length < 6) throw new SyntaxError('TRIANGLE command requires 6 arguments');
    this.x1 = parsed.args[0];
    this.y1 = parsed.args[1];
    this.x2 = parsed.args[2];
    this.y2 = parsed.args[3];
    this.x3 = parsed.args[4];
    this.y3 = parsed.args[5];
    this.stroke = parsed.args.length > 6 ? parsed.args[6] : false;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
TriangleCommand.prototype.toString = function() {
    var args = [this.x1, this.y1, this.x2, this.y2, this.x3, this.y3];
    if (this.stroke) args.push(this.stroke);
    return args.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
TriangleCommand.prototype.toJSON = function() {
    return {
        x1: this.x1.toJSON(),
        y1: this.y1.toJSON(),
        x2: this.x2.toJSON(),
        y2: this.y2.toJSON(),
        x3: this.x3.toJSON(),
        y3: this.y3.toJSON(),
        stroke: this.stroke ? this.stroke.toJSON() : false
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
TriangleCommand.prototype.execute = function(data, next) {
    var x1 = this.x1.execute(data);
    var y1 = this.y1.execute(data);
    var x2 = this.x2.execute(data);
    var y2 = this.y2.execute(data);
    var x3 = this.x3.execute(data);
    var y3 = this.y3.execute(data);
    var stroke = this.stroke ? this.stroke.execute(data) : 0;

    data.validate(x1, 'number');
    data.validate(y1, 'number');
    data.validate(x2, 'number');
    data.validate(y2, 'number');
    data.validate(x3, 'number');
    data.validate(y3, 'number');
    data.validate(stroke, 'number');

    ctx.write({
        command: "triangle",
        args: {
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2,
            x3: x3,
            y3: y3,
            stroke: stroke
        }
    });

    next();
};

module.exports = TriangleCommand;
},{"../../IOInterface":27,"../SyntaxError":41,"../statements":103}],87:[function(require,module,exports){
/**
 * TODO
 */
function VolumeCommand() {}

VolumeCommand.prototype.execute = function(data, next) { next(); };

module.exports = VolumeCommand;
},{}],88:[function(require,module,exports){
/**
 * Returns to the matching WHILE command
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function WendCommand(args, define) {
    this.block = define;
}

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
WendCommand.prototype.toJSON = function() {
    return {
        block: this.block.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
WendCommand.prototype.execute = function(data, next) {
    var refs = this.block.references();
    if (!refs.length) throw new Error('WEND without WHILE');

    data.cursor = refs[0].start;
    next();
};

module.exports = WendCommand;
},{}],89:[function(require,module,exports){
var statements = require('../statements');
var util = require('../../util');
var setImmediate = util.setImmediate;

/**
 * Iterates over the commands body until the condition is true
 *
 * @param {String} args The arguments to the command
 * @param {Function} define
 * @constructor
 */
function WhileCommand(args, define) {
    var parsed = new statements.ArgumentStatement(args, {
        separator: false
    });

    this.condition = parsed.args[0];
    this.block = define({
        start: 'WHILE',
        end: 'WEND'
    });
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
WhileCommand.prototype.toString = function() {
    return this.condition.toString();
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
WhileCommand.prototype.toJSON = function() {
    return {
        condition: this.condition.toJSON(),
        block: this.block.toJSON()
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
WhileCommand.prototype.execute = function(data, next) {
    var shouldRun = this.condition.execute(data);
    if (!shouldRun) {
        data.cursor = this.block.end + 1;
        next();
    } else setImmediate(next);
};

module.exports = WhileCommand;
},{"../../util":123,"../statements":103}],90:[function(require,module,exports){
/**
 * Command list
 */

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
},{"./AccelcalibrateCommand":42,"./AntialiasCommand":43,"./BcolorCommand":44,"./BegindrawCommand":45,"./CircleCommand":46,"./CloseCommand":47,"./ClsCommand":48,"./ColorCommand":49,"./DimCommand":50,"./DrawspriteCommand":51,"./DrawtextCommand":52,"./EllipseCommand":53,"./ElseCommand":54,"./EndCommand":55,"./EnddrawCommand":56,"./EndifCommand":57,"./ForCommand":58,"./GosubCommand":59,"./GotoCommand":60,"./IfCommand":61,"./InputCommand":62,"./LineCommand":63,"./LoadspriteCommand":64,"./LockorientationCommand":65,"./NextCommand":66,"./OpenCommand":67,"./PauseCommand":68,"./PiechartCommand":69,"./PlayCommand":70,"./PlayspeedCommand":71,"./PointCommand":72,"./PrintCommand":73,"./RandomizeCommand":74,"./RectCommand":75,"./RequirelandscapeCommand":76,"./RequireportraitCommand":77,"./RetinaCommand":78,"./ReturnCommand":79,"./RrectCommand":80,"./SavespriteCommand":81,"./ShapeCommand":82,"./SleepCommand":83,"./TcolorCommand":84,"./TextfontCommand":85,"./TriangleCommand":86,"./VolumeCommand":87,"./WendCommand":88,"./WhileCommand":89}],91:[function(require,module,exports){
/**
 * Parses BASIC code and creates an abstract syntax tree
 */

var AbstractSyntaxTree = require('./AbstractSyntaxTree');
var SyntaxError = require('./SyntaxError');
var BlockManager = require('./Block');
var util = require('../util');

var statements = require('./statements');
var AssignmentStatement = statements.AssignmentStatement;
var CommentStatement = statements.CommentStatement;
var CommandStatement = statements.CommandStatement;
var VariableStatement = statements.VariableStatement;
var ExpressionStatement = statements.ExpressionStatement;
var EmptyStatement = statements.EmptyStatement;
var FunctionStatement = statements.FunctionStatement;

exports.Block = BlockManager;
exports.commands = require('./commands');
exports.statements = statements;
exports.AbstractSyntaxTree = require('./AbstractSyntaxTree');
exports.SyntaxError = require('./SyntaxError');

/**
 * Parses BASIC code and returns an abstract syntax tree
 *
 * @param {String} code
 * @returns {AbstractSyntaxTree|{error: String}} The resulting AST
 */
function parse(code) {
    try {
        var labels = {};
        var root = [];
        var manager = new BlockManager();

        var lines = code.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = parseLine(lines[i].trim(), i, labels, false, manager);

            if (line instanceof SyntaxError) return { "error": line };
            if (line.error instanceof SyntaxError) return { "error": line.error };
            root[i] = line;
        }

        return new AbstractSyntaxTree(root, labels, manager);
    } catch (ex) {
        return { "error": ex };
    }
}
exports.parse = parse;

/**
 * Parses a line and returns the statement
 *
 * @param {String} line The line to parse
 * @param {Number} i The line index
 * @param {Object} labels The list of labels
 * @param {Boolean} notLineNumber If true, wont see if it starts with a line number
 * @param {BlockManager} manager The block manager
 * @returns {AssignmentStatement|CommentStatement|CommandStatement|EmptyStatement|FunctionStatement|SyntaxError}
 */
function parseLine(line, i, labels, notLineNumber, manager) {
    line = line.trim();

    // Is it an empty line?
    if (line === "") return new EmptyStatement();

    if (line.indexOf("'") === 0 || line.toUpperCase() === "REM" || line.toUpperCase().indexOf("REM ") === 0) {
        return new CommentStatement(line.substring(line.indexOf(" ")).trim());
    }

    // Is it a label?
    if (line[line.length - 1] === ':') {
        var labelName = line.substring(0, line.length - 1);
        labels[labelName] = i;
        return new EmptyStatement();
    }

    if (line.indexOf('END IF') === 0) line = 'ENDIF';

    // Find first space, but only outside of brackets
    var bracketPositions = util.findPositions(line, [
        { start: '(', end: ')' }
    ]);
    var spaceIndex = util.indexOfOutside(line, ' ', 0, bracketPositions);

    var commandSection, argumentSection;
    if (spaceIndex !== -1) {
        commandSection = line.substring(0, spaceIndex).trim();
        argumentSection = line.substring(spaceIndex).trim();

        // Is it a line number?
        if (!notLineNumber && !isNaN(parseInt(commandSection))) {
            labels[commandSection] = i;
            return parseLine(argumentSection, i, labels, true, manager);
        }

        // If it follows the pattern x = y or x =y, it must be an assignment
        if (argumentSection[0] === '=') {
            return new AssignmentStatement(new VariableStatement(commandSection), new ExpressionStatement(argumentSection.substring(1).trim()));
        }

        // If there is an equal sign in the command, it must be an assignment
        var cmdEqualIndex = commandSection.indexOf('=');
        if (cmdEqualIndex !== -1) {
            var equalLine = commandSection + ' ' + argumentSection;
            var varName = equalLine.substring(0, cmdEqualIndex).trim();
            var varExpr = equalLine.substring(cmdEqualIndex + 1).trim();
            return new AssignmentStatement(new VariableStatement(varName), new ExpressionStatement(varExpr));
        }
    } else {
        commandSection = line;
        argumentSection = '';

        // If there is an equal sign, it must be an assignment (with no space, e.g. x=y)
        var equalIndex = commandSection.indexOf('=');
        if (equalIndex !== -1) {
            var variableName = commandSection.substring(0, equalIndex);
            var variableExpr = commandSection.substring(equalIndex + 1);
            return new AssignmentStatement(new VariableStatement(variableName), new ExpressionStatement(variableExpr));
        }

        // Is it a root-level function call?
        var bracketIndex = commandSection.indexOf('(');
        if (bracketIndex !== -1) {
            var endBracketIndex = commandSection.indexOf(')');
            if (endBracketIndex === -1) return new SyntaxError('Unexpected open bracket');
            var functionName = commandSection.substring(0, bracketIndex);
            if (!isNaN(parseInt(functionName))) return new SyntaxError('Expected function name');
            var args = commandSection.substring(bracketIndex + 1, endBracketIndex);
            return new FunctionStatement(functionName, args);
        }
    }

    commandSection = commandSection.toUpperCase();
    return new CommandStatement(commandSection.toLowerCase(), argumentSection, manager, i);
}

exports.parseLine = parseLine;
},{"../util":123,"./AbstractSyntaxTree":38,"./Block":40,"./SyntaxError":41,"./commands":90,"./statements":103}],92:[function(require,module,exports){
var statements = require('./');
var util = require('../../util');

/**
 * Represents a set of arguments to a command call
 *
 * @param {String} args The arguments to parse
 * @param {Object} options Command options
 * @param {Function?} define
 */
function ArgumentStatement(args, options, define) {
    options = options || {};
    this.value = args;
    this.flags = {};
    this.args = [];
    this.options = options;

    if (typeof options.parse === 'undefined') options.parse = true;
    if (typeof options.separator === 'undefined') options.separator = ',';
    if (typeof options.parseArgs === 'undefined') options.parseArgs = true;

    if (options.parse) {
        if (options.flags) {
            var isFlag = true;

            // Find all matching flags  until no flag is found
            while(isFlag) {
                var firstFlagEnd = args.indexOf(' ');
                if (firstFlagEnd === -1) firstFlagEnd = args.length;
                var firstFlag = args.substring(0, firstFlagEnd).trim().toUpperCase();

                if (options.flags.indexOf(firstFlag) !== -1) {
                    this.flags[firstFlag] = true;
                    args = args.substring(firstFlagEnd).trim();
                }
                else isFlag = false;
            }
        }

        this.rawArgs = args;

        args = args.trim();
        var argList = [args];
        if (options.separator) {
            if (!args.length) argList = [];
            else {
                var positions = util.findPositions(args, [
                    {'start': '"', 'end': '"'},
                    {'start': '(', 'end': ')'}
                ]);
                argList = util.splitOutside(args, options.separator, positions);
            }
        }
        for (var i = 0; i < argList.length; i++) {
            var arg = argList[i].trim();
            if (options.parseArgs) arg = new statements.ExpressionStatement(arg, define);
            this.args.push(arg);
        }
    }
}

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
ArgumentStatement.prototype.toJSON = function() {
    return {
        type: 'ArgumentStatement',
        value: this.value,
        flags: this.flags,
        args: this.args,
        options: this.options
    };
};

module.exports = ArgumentStatement;
},{"../../util":123,"./":103}],93:[function(require,module,exports){
/**
 * Represents an assignment of a value to a variable
 *
 * @param {VariableStatement} variable The variable to assign
 * @param {ExpressionStatement} expression The expression to evaluate
 */
function AssignmentStatement(variable, expression) {
    this.variable = variable;
    this.expression = expression;
}

/**
 * Outputs executable code that represents the assignment
 *
 * @returns {string}
 */
AssignmentStatement.prototype.toString = function() {
    return this.variable.toString() + " = " + this.expression.toString();
};

/**
 * Converts the assignment to serializable JSON
 *
 * @returns {Object}
 */
AssignmentStatement.prototype.toJSON = function() {
    return {
        type: "AssignmentStatement",
        variable: this.variable.toJSON(),
        expression: this.expression.toJSON()
    };
};

/**
 * Executes the assignment
 *
 * @param {ExecutionContext} data The execution data context
 */
AssignmentStatement.prototype.execute = function(data) {
    data.setVariable(this.variable, this.expression);
};

module.exports = AssignmentStatement;
},{}],94:[function(require,module,exports){
var commands = require('../commands');
var SyntaxError = require('../SyntaxError');

/**
 * Represents a command call
 *
 * @param {String} name The name of the command
 * @param {String} args The arguments to the command
 * @param {BlockManager} manager The block manager
 * @param {Number} line The line number
 */
function CommandStatement(name, args, manager, line) {
    this.name = name;
    this.args = args;

    if (!commands[name]) throw new SyntaxError('Unknown command: ' + name);
    this.command = new commands[name](args, manager.create(line));
}

/**
 * Outputs executable cde that represents the command call
 *
 * @returns {string}
 */
CommandStatement.prototype.toString = function() {
    var stringArgs = this.command.toString();
    return this.name.toUpperCase() + (stringArgs === '[object Object]' ? '' : ' ' + stringArgs);
};

/**
 * Converts the assignment to serializable JSON
 *
 * @returns {Object}
 */
CommandStatement.prototype.toJSON = function() {
    return {
        type: "CommandStatement",
        name: this.name,
        command: this.command.toJSON ? this.command.toJSON() : {}
    };
};

/**
 * Executes the command call
 *
 * @param {ExecutionContext} data The execution data context
 */
CommandStatement.prototype.execute = function(data) {
    return data.callCommand(this.command);
};

module.exports = CommandStatement;
},{"../SyntaxError":41,"../commands":90}],95:[function(require,module,exports){
/**
 * Represents a comment, which does nothing
 *
 * @param {String} text The comment text
 */
function CommentStatement(text) {
    this.text = text;
}

/**
 * Outputs executable code representing the statement
 *
 * @returns {string}
 */
CommentStatement.prototype.toString = function() {
    return "' " + this.text;
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
CommentStatement.prototype.toJSON = function() {
    return {
        type: 'CommentStatement',
        text: this.text
    };
};

/**
 * Executes the comment (i.e does nothing)
 */
CommentStatement.prototype.execute = function() { };

module.exports = CommentStatement;
},{}],96:[function(require,module,exports){
/**
 * An empty statement that does nothing
 *
 * @constructor
 */
function EmptyStatement() { }

/**
 * Outputs executable code representing the statement
 *
 * @returns {string}
 */
EmptyStatement.prototype.toString = function() {
    return "";
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
EmptyStatement.prototype.toJSON = function() {
    return { type: 'EmptyStatement' };
};

/**
 * Executes the comment (i.e does nothing)
 */
EmptyStatement.prototype.execute = function() { };

module.exports = EmptyStatement;
},{}],97:[function(require,module,exports){
var statements = require('./');
var SyntaxError = require('../SyntaxError');
var operators = require('./operators');
var util = require('../../util');

var allOperators = [];
for (var i = 0; i < operators.length; i++) allOperators = allOperators.concat(Object.keys(operators[i]));

/**
 * Represents some form of expression to find a value
 *
 * @param {String} data The code to parse
 * @param {Function} define
 */
function ExpressionStatement(data, define) {
    this.child = parseExpression(data, define ? define.line : 'unknown');

    if (this.child instanceof SyntaxError) throw this.child;
    else if (this.child.error) throw this.child.error;
}

/**
 * Outputs executable code that represents the expression
 *
 * @returns {string}
 */
ExpressionStatement.prototype.toString = function() {
    return this.child.toString();
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
ExpressionStatement.prototype.toJSON = function() {
    return {
        type: "ExpressionStatement",
        child: this.child.toJSON()
    };
};

/**
 * Executes the expression
 *
 * @param {ExecutionContext} data The execution data context
 * @returns {String|Number} The value of the expression
 */
ExpressionStatement.prototype.execute = function(data) {
    if (this.error) throw this.error;

    return this.child.execute(data);
};

/**
 * Parses a given expression, following BOCMDAS
 * (Brackets, Comparators, Multiplication/Division, Addition/Subtraction/binary operators)
 * To configure the order @see operators/index.js
 *
 * Two operators of the same precedence will execute left to right, just as expected
 *
 * @param data
 * @param line
 */
function parseExpression(data, line) {
    data = data.trim();

    var lowerData = data.toLowerCase();
    var positions = util.findPositions(lowerData, [
        { 'start': '"', 'end': '"' },
        { 'start': '(', 'end': ')' }
    ]);

    // Try to find an operator in the root of the data
    for (var i = 0; i < operators.length; i++) {
        var operatorList = operators[i];
        var operatorNames = Object.keys(operatorList);

        // We go backwards so that the resulting object nesting goes from left to right
        // in the case of two operators with the same precedence are beside each other.
        // For example, with the expression '1 * 2 / 3' you would expect it to do the
        // '1 * 2' part first, so we have to go this way so that it parses as
        // DivisionOperator('1 * 2', '3') instead of MultiplicationOperator('1', '2 / 3')
        var found = util.findLastOutside(lowerData, operatorNames, lowerData.length, positions);

        // If there is an operator, parse the two sides and then return the operator
        if (found.index !== -1) {
            // If there is no number before and the character is '-' or '+', ignore
            var beforeText = data.substring(0, found.index).trim();
            if ((found.found === '-' || found.found === '+')) {
                var previousOperator = util.findLast(beforeText, allOperators);
                if (previousOperator.index !== -1) {
                    var middleContent = beforeText.substring(previousOperator.index + previousOperator.found.length).trim();
                    if (!middleContent.length) continue;
                }
            }

            var before = parseExpression(beforeText);
            var after = parseExpression(data.substring(found.index + found.found.length));

            var operatorConstructor = operatorList[found.found];
            if (!operatorConstructor) throw new SyntaxError('Unknown operator');
            return new operatorConstructor(before, after);
        }
    }

    // If none are found, its either a syntax error, function call, bracket, or singular expression
    var startBracketIndex = data.indexOf('(');
    if (startBracketIndex !== -1) {
        var endBracketIndex = data.indexOf(')', startBracketIndex);
        if (endBracketIndex === -1) throw new SyntaxError('Expected end bracket in ' + data + ' on line ' + line);
        var bracketContent = data.substring(startBracketIndex + 1, endBracketIndex).trim();

        // If there is something before the bracket, its a function call
        var beforeBracket = data.substring(0, startBracketIndex).trim();
        if (beforeBracket.length) return new statements.FunctionStatement(beforeBracket, bracketContent);

        // If there is something after the bracket, its a syntax error
        var afterBracket = data.substring(endBracketIndex + 1).trim();
        if (afterBracket.length) throw new SyntaxError("Unexpected expression");

        // If we've gotten to here, its just an expression in brackets
        return parseExpression(bracketContent);
    }

    // It must be a singular expression
    return parseSingularExpression(data);
}

/**
 * Parses a single expression (one without any operators) and returns a variable, string, or number
 *
 * @param {String} data The expression data
 * @returns {SyntaxError|exports.StringStatement|exports.NumberStatement|exports.VariableStatement|exports.PointerStatement}
 * @private
 */
function parseSingularExpression(data) {
    // A hash signifies a pointer
    if (data[0] === '#') {
        var pointerId = data.substring(1);
        if (isNaN(parseInt(pointerId))) return new SyntaxError('Unexpected hash');
        return new statements.PointerStatement(pointerId);
    }

    var isString = data.indexOf('"') !== -1;

    // If there is any quote, its either a string or syntax error
    if (isString) {
        if (data[0] !== '"' || data[data.length - 1] !== '"') return new SyntaxError('Unexpected quote');
        var stringContent = data.slice(1, data.length - 1);
        return new statements.StringStatement(stringContent);
    }

    // If it is not not a number, it must be a number (see my logic?)
    var numberValue = parseFloat(data);
    if (!isNaN(numberValue)) {
        return new statements.NumberStatement(numberValue);
    }

    // Otherwise, it must be a variable
    // TODO: validate variable name (this should actually go in the variable constructor..)
    return new statements.VariableStatement(data);
}

module.exports = ExpressionStatement;
},{"../../util":123,"../SyntaxError":41,"./":103,"./operators":121}],98:[function(require,module,exports){
var statements = require('./');
var util = require('../../util');

/**
 * Represents a function call
 *
 * @param {String} name The name of the function
 * @param {String} args The arguments to the function
 */
function FunctionStatement(name, args) {
    if (name[name.length - 1] === '$') {
        this.type = 'string';
        this.name = name.substring(0, name.length - 1);
    } else {
        this.type = 'number';
        this.name = name;
    }

    var positions = util.findPositions(args, [
        { 'start': '"', 'end': '"' },
        { 'start': '(', 'end': ')' }
    ]);
    var argList = util.splitOutside(args, ",", positions);

    this.args = [];
    for (var i = 0; i < argList.length; i++) {
        this.args.push(new statements.ExpressionStatement(argList[i].trim()));
    }
}

/**
 * Outputs executable code that represents the function call
 *
 * @returns {string}
 */
FunctionStatement.prototype.toString = function() {
    var args = [];
    for (var i = 0; i < this.args.length; i++) {
        args.push(this.args[i].toString());
    }

    return this.name + (this.type === 'string' ? '$' : '') + '(' + args.join(', ') + ')';
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
FunctionStatement.prototype.toJSON = function() {
    return {
        type: "FunctionStatement",
        name: this.name,
        varType: this.type,
        args: this.args
    };
};

/**
 * Gets the value of the function
 *
 * @param {ExecutionContext} data The execution data context
 * @returns {String|Number} The value of the function
 */
FunctionStatement.prototype.execute = function(data) {
    var args = [];
    for (var i = 0; i < this.args.length; i++) {
        var arg = this.args[i];
        if (arg.error) throw arg.error;

        args.push(arg.execute(data));
    }
    return data.callFunction(this, args);
};

module.exports = FunctionStatement;
},{"../../util":123,"./":103}],99:[function(require,module,exports){
/**
 * Represents a number value
 *
 * @param {Number} number The number to assign
 */
function NumberStatement(number) {
    this.value = number;
}

/**
 * Outputs executable code that represents the number
 *
 * @returns {string}
 */
NumberStatement.prototype.toString = function() {
    return this.value.toString();
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
NumberStatement.prototype.toJSON = function() {
    return {
        type: "NumberStatement",
        value: this.value
    };
};

/**
 * Gets the number
 *
 * @returns {Number} The number
 */
NumberStatement.prototype.execute = function() {
    return this.value;
};

module.exports = NumberStatement;
},{}],100:[function(require,module,exports){
/**
 * Represents a pointer
 *
 * @param {String} id The id of the pointer
 */
function PointerStatement(id) {
    this.id = id;
}

/**
 * Outputs executable code that represents the pointer
 *
 * @returns {string}
 */
PointerStatement.prototype.toString = function() {
    return '#' + this.id;
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
PointerStatement.prototype.toJSON = function() {
    return {
        type: "PointerStatement",
        id: this.id
    };
};

/**
 * Gets the pointer value
 *
 * @returns {*} The value of the pointer
 */
PointerStatement.prototype.execute = function(data) {
    return data.getPointer(this);
};

module.exports = PointerStatement;
},{}],101:[function(require,module,exports){
/**
 * Represents a string value
 *
 * @param {String} value The value to assign
 */
function StringStatement(value) {
    this.value = value;
}

/**
 * Outputs executable code that represents the string
 *
 * @returns {string}
 */
StringStatement.prototype.toString = function() {
    return '"' + this.value + '"';
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
StringStatement.prototype.toJSON = function() {
    return {
        type: "StringStatement",
        value: this.value
    };
};

/**
 * Gets the string
 *
 * @returns {String} The string
 */
StringStatement.prototype.execute = function() {
    return this.value;
};

module.exports = StringStatement;
},{}],102:[function(require,module,exports){
var SyntaxError = require('../SyntaxError');
var statements = require('./');

/**
 * Represents a variable
 *
 * @param {String} name The name of the variable
 */
function VariableStatement(name) {
    var bracketIndex = name.indexOf('(');
    if (bracketIndex !== -1) {
        var endBracketIndex = name.indexOf(')');
        if (endBracketIndex === -1) throw new SyntaxError('Expected end bracket');

        var arrayName = name.substring(0, bracketIndex);
        var arrayDimensionsText = name.substring(bracketIndex + 1, endBracketIndex).trim();
        var arrayDimensions = new statements.ArgumentStatement(arrayDimensionsText);

        name = arrayName;
        this.isArray = true;
        this.dimensions = arrayDimensions.args;
    } else this.isArray = false;

    if (name[name.length - 1] === '$') {
        this.type = 'string';
        this.name = name.substring(0, name.length - 1);
    } else {
        this.type = 'number';
        this.name = name;
    }
}

/**
 * Outputs executable code that represents the variable
 *
 * @returns {string}
 */
VariableStatement.prototype.toString = function() {
    var name = this.name + (this.type === 'string' ? '$' : '');
    if (this.isArray) name += '(' + this.dimensions.join(', ') + ')';
    return name;
};

/**
 * Converts the statement to JSON
 *
 * @returns {Object}
 */
VariableStatement.prototype.toJSON = function() {
    return {
        type: "VariableStatement",
        name: this.name,
        varType: this.type,
        dimensions: this.dimensions
    };
};

/**
 * Gets the value of the variable
 * Since the parser is going to think that getting the value of an array is a function call,
 * we don't need to implement getting of the value here
 *
 * @param {ExecutionContext} data The execution data context
 * @returns {String|Number} The value of the variable
 */
VariableStatement.prototype.execute = function(data) {
    return data.getVariable(this);
};



module.exports = VariableStatement;
},{"../SyntaxError":41,"./":103}],103:[function(require,module,exports){
/**
 * 'Statements' are the nodes in the abstract syntax tree.
 * Each statement either holds other statements or a Javascript primitive, and has
 * the ability to parse the input and execute it later.
 */

exports.operators = require('./operators');
exports.ArgumentStatement = require('./ArgumentStatement');
exports.AssignmentStatement = require('./AssignmentStatement');
exports.CommandStatement = require('./CommandStatement');
exports.CommentStatement = require('./CommentStatement');
exports.EmptyStatement = require('./EmptyStatement');
exports.ExpressionStatement = require('./ExpressionStatement');
exports.FunctionStatement = require('./FunctionStatement');
exports.NumberStatement = require('./NumberStatement');
exports.PointerStatement = require('./PointerStatement');
exports.StringStatement = require('./StringStatement');
exports.VariableStatement = require('./VariableStatement');
},{"./ArgumentStatement":92,"./AssignmentStatement":93,"./CommandStatement":94,"./CommentStatement":95,"./EmptyStatement":96,"./ExpressionStatement":97,"./FunctionStatement":98,"./NumberStatement":99,"./PointerStatement":100,"./StringStatement":101,"./VariableStatement":102,"./operators":121}],104:[function(require,module,exports){
/**
 * Adds two numbers or strings together
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function AdditionOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
AdditionOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' + ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
AdditionOperator.prototype.toJSON = function() {
    return {
        type: "+",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number|String} The resulting value
 */
AdditionOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);
    if (!lval) return rval;
    return lval + rval;
};

module.exports = AdditionOperator;
},{}],105:[function(require,module,exports){
/**
 * Requires both values to be truthy
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function AndComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
AndComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' AND ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
AndComparator.prototype.toJSON = function() {
    return {
        type: " and ",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 */
AndComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) && this.rexpr.execute(data) ? 1 : 0;
};

module.exports = AndComparator;
},{}],106:[function(require,module,exports){
/**
 * Bitwise AND operator
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function AndOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
AndOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' BAND ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
AndOperator.prototype.toJSON = function() {
    return {
        type: " band ",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 * @throws Error if either value is not a number
 */
AndOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);

    data.validate(lval, 'number');
    data.validate(rval, 'number');
    return lval & rval;
};

module.exports = AndOperator;
},{}],107:[function(require,module,exports){
/**
 * Divides two numbers
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function DivisionOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
DivisionOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' / ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
DivisionOperator.prototype.toJSON = function() {
    return {
        type: "/",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 * @throws Error if either expression does not evaluate to a number
 */
DivisionOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);
    if (typeof lval !== 'number' || typeof rval !== 'number') throw new Error('Types mismatch');
    return lval / rval;
};

module.exports = DivisionOperator;
},{}],108:[function(require,module,exports){
/**
 * Requires both values to be equal
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function EqualComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
EqualComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' = ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
EqualComparator.prototype.toJSON = function() {
    return {
        type: "=",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 */
EqualComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) == this.rexpr.execute(data) ? 1 : 0;
};

module.exports = EqualComparator;
},{}],109:[function(require,module,exports){
/**
 * Requires the left expression to be greater than the right
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function GtComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
GtComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' > ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
GtComparator.prototype.toJSON = function() {
    return {
        type: ">",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 */
GtComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) > this.rexpr.execute(data) ? 1 : 0;
};

module.exports = GtComparator;
},{}],110:[function(require,module,exports){
/**
 * Requires the left expression to be greater than or equal to the right
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function GteComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
GteComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' >= ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
GteComparator.prototype.toJSON = function() {
    return {
        type: ">=",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 */
GteComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) >= this.rexpr.execute(data) ? 1 : 0;
};

module.exports = GteComparator;
},{}],111:[function(require,module,exports){
/**
 * Requires the left expression to be less than the right
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function LtComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
LtComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' < ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
LtComparator.prototype.toJSON = function() {
    return {
        type: "<",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 */
LtComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) < this.rexpr.execute(data) ? 1 : 0;
};

module.exports = LtComparator;
},{}],112:[function(require,module,exports){
/**
 * Requires the left expression to be less than or equal to the right
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function LteComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
LteComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' <= ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
LteComparator.prototype.toJSON = function() {
    return {
        type: "<=",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 */
LteComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) <= this.rexpr.execute(data) ? 1 : 0;
};

module.exports = LteComparator;
},{}],113:[function(require,module,exports){
/**
 * Multiplies two numbers
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function MultiplicationOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {String}
 */
MultiplicationOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' * ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
MultiplicationOperator.prototype.toJSON = function() {
    return {
        type: "*",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 * @throws Error if either expression does not evaluate to a number
 */
MultiplicationOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);
    if (typeof lval !== 'number' || typeof rval !== 'number') throw new Error('Types mismatch');
    return lval * rval;
};

module.exports = MultiplicationOperator;
},{}],114:[function(require,module,exports){
/**
 * Inverts the right value
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function NotComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
NotComparator.prototype.toString = function() {
    return 'NOT ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
NotComparator.prototype.toJSON = function() {
    return {
        type: "not ",
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 */
NotComparator.prototype.execute = function(data) {
    return !this.rexpr.execute(data) ? 1 : 0;
};

module.exports = NotComparator;
},{}],115:[function(require,module,exports){
/**
 * Bitwise NOT operator
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function NotOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
NotOperator.prototype.toString = function() {
    return 'BNOT ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
NotOperator.prototype.toJSON = function() {
    return {
        type: "bnot ",
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 * @throws Error if either value is not a number
 */
NotOperator.prototype.execute = function(data) {
    var rval = this.rexpr.execute(data);
    data.validate(rval, 'number');
    return ~rval;
};

module.exports = NotOperator;
},{}],116:[function(require,module,exports){
/**
 * Requires either value to be truthy
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function OrComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
OrComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' OR ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
OrComparator.prototype.toJSON = function() {
    return {
        type: " or ",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 */
OrComparator.prototype.execute = function(data) {
    return this.lexpr.execute(data) || this.rexpr.execute(data) ? 1 : 0;
};

module.exports = OrComparator;
},{}],117:[function(require,module,exports){
/**
 * Bitwise OR operator
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function OrOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
OrOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' BOR ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
OrOperator.prototype.toJSON = function() {
    return {
        type: " bor ",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 * @throws Error if either value is not a number
 */
OrOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);

    data.validate(lval, 'number');
    data.validate(rval, 'number');
    return lval | rval;
};

module.exports = OrOperator;
},{}],118:[function(require,module,exports){
/**
 * Raises one number to the power of the other
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function PowerOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
PowerOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' ^ ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
PowerOperator.prototype.toJSON = function() {
    return {
        type: "^",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 * @throws Error if either expression does not evaluate to a number
 */
PowerOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);
    if (typeof lval !== 'number' || typeof rval !== 'number') throw new Error('Types mismatch');
    return Math.pow(lval, rval);
};

module.exports = PowerOperator;

},{}],119:[function(require,module,exports){
/**
 * Subtracts a number from another
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function SubtractionOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {String}
 */
SubtractionOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' - ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
SubtractionOperator.prototype.toJSON = function() {
    return {
        type: "-",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 * @throws Error if either expression does not evaluate to a number
 */
SubtractionOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);
    if (!lval && typeof rval === 'number') return rval * -1;

    if (typeof lval !== 'number' || typeof rval !== 'number') throw new Error('Types mismatch');
    return lval - rval;
};

module.exports = SubtractionOperator;
},{}],120:[function(require,module,exports){
/**
 * Bitwise XOR operator
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function XorOperator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
XorOperator.prototype.toString = function() {
    return this.lexpr.toString() + ' BXOR ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
XorOperator.prototype.toJSON = function() {
    return {
        type: " bxor ",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {Number} The resulting value
 * @throws Error if either value is not a number
 */
XorOperator.prototype.execute = function(data) {
    var lval = this.lexpr.execute(data);
    var rval = this.rexpr.execute(data);

    data.validate(lval, 'number');
    data.validate(rval, 'number');
    return lval ^ rval;
};

module.exports = XorOperator;
},{}],121:[function(require,module,exports){
/**
 * Provides the order of operations, and the mapping of operator to class
 *
 * NOTE: This *should* be in the reverse order of operations
 */

module.exports = [
    {
        ' and ': require('./AndComparator'),
        ' or ': require('./OrComparator')
    },
    {
        'not ': require('./NotComparator'),
        '=': require('./EqualComparator'),
        '>': require('./GtComparator'),
        '>=': require('./GteComparator'),
        '<': require('./LtComparator'),
        '<=': require('./LteComparator')
    },
    {
        '+': require('./AdditionOperator'),
        '-': require('./SubtractionOperator'),

        ' band ': require('./AndOperator'),
        ' bor ': require('./OrOperator'),
        ' bxor ': require('./XorOperator'),
        ' xor ': require('./XorOperator'),
        'bnot ': require('./NotOperator')
    },
    {
        '/': require('./DivisionOperator'),
        '*': require('./MultiplicationOperator')
    },
    {
        '^': require('./PowerOperator')
    }
];
},{"./AdditionOperator":104,"./AndComparator":105,"./AndOperator":106,"./DivisionOperator":107,"./EqualComparator":108,"./GtComparator":109,"./GteComparator":110,"./LtComparator":111,"./LteComparator":112,"./MultiplicationOperator":113,"./NotComparator":114,"./NotOperator":115,"./OrComparator":116,"./OrOperator":117,"./PowerOperator":118,"./SubtractionOperator":119,"./XorOperator":120}],122:[function(require,module,exports){
/**
 * BASIC REPL
 *
 * Implements a similar interface to Node's REPL package
 */
var IOInterface = require('./IOInterface');
var rl = IOInterface.getDefault();
var fs = require('fs');
var ExecutionContext = require('./executor/ExecutionContext');
var AbstractSyntaxTree = require('./parser/AbstractSyntaxTree');
var BlockManager = require('./parser/Block/index');
var parser = require('./parser/index');
var statements = require('./parser/statements/index');
var SyntaxError = require('./parser/SyntaxError');
var commands = require('./parser/commands/index');
var commandNames = Object.keys(commands);
var upperCommandNames = [];
for (var i = 0; i < commandNames.length; i++) upperCommandNames.push(commandNames[i].toUpperCase());

/**
 * Starts the REPL. Options can be:
 *
 *  - `prompt` - the prompt and `stream` for all I/O. Defaults to `> `.
 *  - `eval` - function that will be used to eval each given line. Defaults to an async wrapper for `executor.execute`.
 *  - `completer` - function that will be used for auto-completing.
 *
 * @param {Object} options Options for the REPL
 */
function start(options) {
    options = options || {};

    var prompt = options.prompt || '> ';

    var eval = options.eval || run;

    var context = new ExecutionContext();
    var manager = new BlockManager();
    var ast = new AbstractSyntaxTree([], {}, manager);
    nextLine(context, ast, prompt, prompt, -1, eval);
}

exports.start = start;

/**
 * The default eval function
 *
 * @param {String} cmd The command to be executed
 * @param {ExecutionContext} context The current execution context
 * @param {AbstractSyntaxTree} ast The current abstract syntax tree
 * @param {Number} cursor The position for the cursor
 * @param {Function} next A function to call when complete
 * @private
 */
function run(cmd, context, ast, cursor, next) {
    try {
        // Must be a command
        if (cmd[0] === ".") {
            var command = cmd.substring(1);
            var spaceIndex = command.indexOf(" ");

            var args = "";
            if (spaceIndex !== -1) {
                args = command.substring(spaceIndex + 1).trim();
                command = command.substring(0, spaceIndex).trim();
            }

            switch (command) {
                case "break":
                    ast.root.splice(context._blockStart);
                    context._blockStart = false;
                    next();
                break;
                case "clear":
                    context._blockStart = false;
                    context.root = ast.root = [];
                    context.labels = ast.labels = {};
                    context.options.cursorStart = 0;
                    context.gosubs = [];
                    context.stringVars = {};
                    context.numberVars = {};
                    context.pointers = {};
                    next();
                break;
                case "exit":
                    // TODO
                break;
                case "help":
                    rl.write(".break       - Clear the current multi-line expression\n");
                    rl.write(".clear       - Reset the current context and clear the current multi-line expression\n");
                    rl.write(".exit        - Close the I/O stream, causing the REPL to exit\n");
                    rl.write(".help        - Show this list of special commands\n");
                    rl.write(".load <file> - Load a file into the session\n");
                    rl.write(".save <file> - Save the current session\n");
                    next();
                break;
                case "load":
                    fs.readFile(args, {
                        encoding: 'utf8'
                    }, function(err, data) {
                        try {
                            if (err) throw err;

                            var lines = data.split("\n");
                            for (var i = 0; i < lines.length; i++) {
                                var line = lines[i];
                                var parsedLine = parser.parseLine(line, ast.root.length, ast.labels, false, ast.manager);
                                if (parsedLine instanceof SyntaxError) throw parsedLine;
                                if (parsedLine.error) throw parsedLine.error;
                                ast.root.push(parsedLine);
                            }
                            ast.manager.parse(ast);
                            ast.execute(context, next);
                        } catch (err) {
                            rl.write(err + "\n");
                            next();
                        }
                    });
                break;
                case "save":
                    var code = ast.toString();
                    fs.writeFile(args, code, function(err) {
                        if (err) {
                            rl.write(err + "\n");
                        }
                        next();
                    });
                break;
                default:
                    throw new Error('Unknown REPL command');
            }
            return;
        }

        var line = parser.parseLine(cmd, ast.root.length, ast.labels, false, ast.manager);
        if (line instanceof SyntaxError) throw line;
        if (line.error) throw line.error;

        ast.root.push(line);
        ast.manager.parse(ast);
        if (typeof context._blockStart === 'number') {
            context.options.cursorStart = context._blockStart;
            context._blockStart = false;
        } else context.options.cursorStart = cursor;
        ast.execute(context, next);
    } catch (err) {
        var message = err.message;

        // Detect x without y and add a layer
        if (err instanceof SyntaxError && message.indexOf('without') !== -1) {
            if (typeof context._blockStart !== 'number') context._blockStart = ast.root.length - 1;
            next('... ');
        } else {
            rl.write(err + "\n");
            ast.root.pop();
            ast.root.push(new statements.EmptyStatement());
            next();
        }
    }
}

/**
 * Inputs and executes the next line
 *
 * @param {ExecutionContext} context The current execution context
 * @param {AbstractSyntaxTree} ast The current abstract syntax tree
 * @param {String} prompt
 * @param {String} oldPrompt
 * @param {Number} forceCursor
 * @param {Function} eval The function to evaluate
 * @private
 */
function nextLine(context, ast, prompt, oldPrompt, forceCursor, eval) {
    rl.question(prompt, function(answer) {
        eval(answer, context, ast, forceCursor === -1 ? ast.root.length : forceCursor, function(newPrompt, newCursor) {
            nextLine(context, ast, newPrompt || oldPrompt, oldPrompt, typeof newCursor === 'undefined' ? -1 : newCursor, eval);
        });
    });
}
},{"./IOInterface":27,"./executor/ExecutionContext":28,"./parser/AbstractSyntaxTree":38,"./parser/Block/index":40,"./parser/SyntaxError":41,"./parser/commands/index":90,"./parser/index":91,"./parser/statements/index":103,"fs":1}],123:[function(require,module,exports){
(function (process){
/**
 * Finds the next one of the items
 *
 * @param {String} data The string to search
 * @param {Array<String>} items The items to find
 * @param {Number=0} index The start index
 * @returns {{index: Number, found: String}} The found index and the found item
 */
function findNext(data, items, index) {
    var currentIndex = data.length + 1, found = '';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var location = data.indexOf(item, index);
        if (location !== -1 && location < currentIndex) {
            currentIndex = location;
            found = item;
        }
    }
    if (currentIndex === data.length + 1) return { index: -1, found: '' };
    return {
        index: currentIndex,
        found: found
    };
}

exports.findNext = findNext;

/**
 * Finds the last one of the items
 *
 * @param {String} data The string to search
 * @param {Array<String>} items The items to find
 * @param {Number=0} index The end index
 * @returns {{index: number, found: string}} The found index and the found item
 */
function findLast(data, items, index) {
    var currentIndex = -1, found = '';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var location = data.lastIndexOf(item, index);
        if (location > currentIndex) {
            currentIndex = location;
            found = item;
        }
    }
    return {
        index: currentIndex,
        found: found
    };
}

exports.findLast = findLast;

/**
 * Finds the next one of the items outside of the given positions
 *
 * @param {String} data The string to search
 * @param {Array<String>} items The items to find
 * @param {Number=0} index The start index
 * @param {Array<{start: Number, end: Number}>} exclude The boundaries to exclude
 * @returns {{index: Number, found: String}} The found index and the found item
 */
function findNextOutside(data, items, index, exclude) {
    var result, positionResult = {start: 0, end: index ? index - 1 : -1};

    do {
        result = findNext(data, items, positionResult.end + 1);
    } while (result.index !== -1 && (positionResult = inPosition(result.index, exclude)));
    return result;
}

exports.findNextOutside = findNextOutside;

/**
 * Finds the last one of the items outside of the given positions
 *
 * @param {String} data The string to search
 * @param {Array<String>} items The items to find
 * @param {Number?} index The end index
 * @param {Array<{start: Number, end: Number}>} exclude The boundaries to exclude
 * @returns {{index: Number, found: String}} The found index and the found item
 */
function findLastOutside(data, items, index, exclude) {
    var result, positionResult = {start: index ? index + 1 : data.length + 1, end: 0};

    do {
        result = findLast(data, items, positionResult.start - 1);
    } while (result.index !== -1 && (positionResult = inPosition(result.index, exclude)));
    return result;
}

exports.findLastOutside = findLastOutside;

/**
 * Finds the next index of the item outside of the given positions
 *
 * @param {String} data The string to search
 * @param {String} item The item to find
 * @param {Number=0} index The start index
 * @param {Array<{start: Number, end: Number}>} exclude The boundaries to exclude
 * @returns {Number} The found index, or -1 if none found
 */
function indexOfOutside(data, item, index, exclude) {
    var result, positionResult = {start: 0, end: index ? index - 1 : -1};

    do {
        result = data.indexOf(item, positionResult.end + 1);
    } while (result !== -1 && (positionResult = inPosition(result, exclude)));
    return result;
}

exports.indexOfOutside = indexOfOutside;

/**
 * Splits data into an array by the separator, except if in the exclude regions
 *
 * @param {String} data The string to split
 * @param {String} separator The separator
 * @param {Array<{start: Number, end: Number}>} exclude The boundaries to exclude
 * @returns {Array<String>} The separated array
 */
function splitOutside(data, separator, exclude) {
    var result = [];

    var accumulator = "";
    for (var i = 0; i < data.length; i++) {
        accumulator += data[i];

        var isInExclusion = inPosition(i, exclude);
        if (!isInExclusion && endsWith(accumulator, separator)) {
            result.push(accumulator.substring(0, accumulator.length - separator.length));
            accumulator = '';
        }
    }
    result.push(accumulator);
    return result;
}

exports.splitOutside = splitOutside;

/**
 * Finds the start/end position of each item
 *
 * @param {String} data The string to search
 * @param {Array<{start: String, end: String}>} items The array of items to find
 * @returns {Array<{startChar: String, endChar: String, start: Number, end: Number}>} The found items and locations
 */
function findPositions(data, items) {
    var depth = 0;
    var currentItem = {};
    var currentId = -1;
    var result = [];

    var accumulator = '';
    for (var ci = 0; ci < data.length; ci++) {
        accumulator += data[ci];

        for (var x = 0; x < items.length; x++) {
            var itm = items[x];
            if (endsWith(accumulator, itm.start) && depth === 0) {
                depth = 1;
                currentItem = {
                    startChar: itm.start,
                    endChar: itm.end,
                    start: ci/* + 1*/
                };
                currentId = x;
                accumulator = '';
            } else if (endsWith(accumulator, itm.end) && depth === 1 && currentId === x) {
                depth = 0;
                currentItem.end = ci - itm.end.length + 1;
                currentId = -1;
                accumulator = '';
                result.push(currentItem);
                currentItem = {};
            }
        }
    }
    return result;
}

exports.findPositions = findPositions;

/**
 * Finds if the index is inside one of the items
 * Items should be in the same format as returned from util.findPositions
 *
 * @param {Number} index The index to check
 * @param {Array<{start: Number, end: Number}>} items The items to search
 * @returns {*} The start/end position if index is inside an item, else false
 */
function inPosition(index, items) {
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (index >= item.start && index <= item.end) return item;
    }
    return false;
}

exports.inPosition = inPosition;

/**
 * Finds if data ends with str
 *
 * @param {String} data The text to search
 * @param {String} str The text to find
 * @returns {Boolean} whether data ends with str
 */
function endsWith(data, str) {
    if (data.length < str.length) return false;
    if (data === str) return true;
    return data.lastIndexOf(str) === data.length - str.length;
}

exports.endsWith = endsWith;

/**
 * Pads a string
 *
 * @param {*} data The text to pad
 * @param {Number} length The padded length
 * @param {String?} pad The text to pad with, default is space
 * @returns {String}
 */
function pad(data, length, pad) {
    data = String(data);
    pad = pad || ' ';
    while (data.length < length) data += pad;
    return data;
}

exports.pad = pad;

/**
 * Shallowly clones the object into the source object
 *
 * @param {Object?} source The source object
 * @param {Object} obj The object to clone
 * @returns {Object} The source object
 */
function shallowClone(source, obj) {
    if (arguments.length < 2) {
        obj = source;
        source = {};
    }

    for (var key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        source[key] = obj[key];
    }
    return source;
}

exports.shallowClone = shallowClone;

/**
 * Uses setImmediate or setTimeout if unavailable
 */
exports.setImmediate = (function() {
    if (typeof setImmediate !== 'undefined') return setImmediate;
    return function(func) {
        setTimeout(func, 0);
    };
}());

/**
 * Gets the current high-resolution time in seconds, using process.hrtime or performance.now
 */
exports.now = (function() {
    if (process.hrtime) {
        return function() {
            var time = process.hrtime();
            return time[0] + (time[1] / 1e9);
        };
    } else {
        return function() {
            var now = window.performance.now();
            return now / 1000;
        };
    }
}());

/**
 * A deferred value
 *
 * @constructor
 */
function DeferredValue() {}

/**
 * Gets the value
 *
 * @returns {*}
 */
DeferredValue.prototype.valueOf = function() {
    return this.value;
};

exports.DeferredValue = DeferredValue;
}).call(this,require('_process'))

},{"_process":10}]},{},[26])(26)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbGliXFxfZW1wdHkuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXGluZGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnVmZmVyXFxub2RlX21vZHVsZXNcXGJhc2U2NC1qc1xcbGliXFxiNjQuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXG5vZGVfbW9kdWxlc1xcaWVlZTc1NFxcaW5kZXguanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXG5vZGVfbW9kdWxlc1xcaXMtYXJyYXlcXGluZGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcZG9tYWluLWJyb3dzZXJcXGluZGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcZXZlbnRzXFxldmVudHMuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxpbmhlcml0c1xcaW5oZXJpdHNfYnJvd3Nlci5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGlzYXJyYXlcXGluZGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xccHJvY2Vzc1xcYnJvd3Nlci5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHJlYWRhYmxlLXN0cmVhbVxcZHVwbGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xccmVhZGFibGUtc3RyZWFtXFxsaWJcXF9zdHJlYW1fZHVwbGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xccmVhZGFibGUtc3RyZWFtXFxsaWJcXF9zdHJlYW1fcGFzc3Rocm91Z2guanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxyZWFkYWJsZS1zdHJlYW1cXGxpYlxcX3N0cmVhbV9yZWFkYWJsZS5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHJlYWRhYmxlLXN0cmVhbVxcbGliXFxfc3RyZWFtX3RyYW5zZm9ybS5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHJlYWRhYmxlLXN0cmVhbVxcbGliXFxfc3RyZWFtX3dyaXRhYmxlLmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xccmVhZGFibGUtc3RyZWFtXFxub2RlX21vZHVsZXNcXGNvcmUtdXRpbC1pc1xcbGliXFx1dGlsLmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xccmVhZGFibGUtc3RyZWFtXFxwYXNzdGhyb3VnaC5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHJlYWRhYmxlLXN0cmVhbVxccmVhZGFibGUuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxyZWFkYWJsZS1zdHJlYW1cXHRyYW5zZm9ybS5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHJlYWRhYmxlLXN0cmVhbVxcd3JpdGFibGUuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxzdHJlYW0tYnJvd3NlcmlmeVxcaW5kZXguanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxzdHJpbmdfZGVjb2RlclxcaW5kZXguanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFx1dGlsXFxzdXBwb3J0XFxpc0J1ZmZlckJyb3dzZXIuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFx1dGlsXFx1dGlsLmpzIiwiaW5kZXguanMiLCJsaWJcXElPSW50ZXJmYWNlLmpzIiwibGliXFxleGVjdXRvclxcRXhlY3V0aW9uQ29udGV4dC5qcyIsImxpYlxcZXhlY3V0b3JcXGNvbnN0YW50cy5qcyIsImxpYlxcZXhlY3V0b3JcXGluZGV4LmpzIiwibGliXFxmaWxlc3lzdGVtXFxEcml2ZS5qcyIsImxpYlxcZmlsZXN5c3RlbVxcRmlsZS5qcyIsImxpYlxcZmlsZXN5c3RlbVxcaW5kZXguanMiLCJsaWJcXGZ1bmN0aW9uc1xcZ3JhcGhpY3MuanMiLCJsaWJcXGZ1bmN0aW9uc1xcaW5kZXguanMiLCJsaWJcXGZ1bmN0aW9uc1xcbnVtYmVyLmpzIiwibGliXFxmdW5jdGlvbnNcXHN0cmluZy5qcyIsImxpYlxccGFyc2VyXFxBYnN0cmFjdFN5bnRheFRyZWUuanMiLCJsaWJcXHBhcnNlclxcQmxvY2tcXEJsb2NrLmpzIiwibGliXFxwYXJzZXJcXEJsb2NrXFxpbmRleC5qcyIsImxpYlxccGFyc2VyXFxTeW50YXhFcnJvci5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcQWNjZWxjYWxpYnJhdGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxBbnRpYWxpYXNDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxCY29sb3JDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxCZWdpbmRyYXdDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxDaXJjbGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxDbG9zZUNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXENsc0NvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXENvbG9yQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcRGltQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcRHJhd3Nwcml0ZUNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXERyYXd0ZXh0Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcRWxsaXBzZUNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXEVsc2VDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxFbmRDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxFbmRkcmF3Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcRW5kaWZDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxGb3JDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxHb3N1YkNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXEdvdG9Db21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxJZkNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXElucHV0Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcTGluZUNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXExvYWRzcHJpdGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxMb2Nrb3JpZW50YXRpb25Db21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxOZXh0Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcT3BlbkNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXFBhdXNlQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUGllY2hhcnRDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxQbGF5Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUGxheXNwZWVkQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUG9pbnRDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxQcmludENvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXFJhbmRvbWl6ZUNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXFJlY3RDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxSZXF1aXJlbGFuZHNjYXBlQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUmVxdWlyZXBvcnRyYWl0Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUmV0aW5hQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUmV0dXJuQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUnJlY3RDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxTYXZlc3ByaXRlQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcU2hhcGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxTbGVlcENvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXFRjb2xvckNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXFRleHRmb250Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcVHJpYW5nbGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxWb2x1bWVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxXZW5kQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcV2hpbGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxpbmRleC5qcyIsImxpYlxccGFyc2VyXFxpbmRleC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxBcmd1bWVudFN0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxBc3NpZ25tZW50U3RhdGVtZW50LmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXENvbW1hbmRTdGF0ZW1lbnQuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcQ29tbWVudFN0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxFbXB0eVN0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxFeHByZXNzaW9uU3RhdGVtZW50LmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXEZ1bmN0aW9uU3RhdGVtZW50LmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXE51bWJlclN0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxQb2ludGVyU3RhdGVtZW50LmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXFN0cmluZ1N0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxWYXJpYWJsZVN0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxpbmRleC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxvcGVyYXRvcnNcXEFkZGl0aW9uT3BlcmF0b3IuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcb3BlcmF0b3JzXFxBbmRDb21wYXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcQW5kT3BlcmF0b3IuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcb3BlcmF0b3JzXFxEaXZpc2lvbk9wZXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcRXF1YWxDb21wYXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcR3RDb21wYXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcR3RlQ29tcGFyYXRvci5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxvcGVyYXRvcnNcXEx0Q29tcGFyYXRvci5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxvcGVyYXRvcnNcXEx0ZUNvbXBhcmF0b3IuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcb3BlcmF0b3JzXFxNdWx0aXBsaWNhdGlvbk9wZXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcTm90Q29tcGFyYXRvci5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxvcGVyYXRvcnNcXE5vdE9wZXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcT3JDb21wYXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcT3JPcGVyYXRvci5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxvcGVyYXRvcnNcXFBvd2VyT3BlcmF0b3IuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcb3BlcmF0b3JzXFxTdWJ0cmFjdGlvbk9wZXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcWG9yT3BlcmF0b3IuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcb3BlcmF0b3JzXFxpbmRleC5qcyIsImxpYlxccmVwbC5qcyIsImxpYlxcdXRpbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1aENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTs7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDdDlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDbE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUNsWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzFHQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBOztBQ0RBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMxa0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDbE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDM0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6TUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNqTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLG51bGwsIi8qIVxuICogVGhlIGJ1ZmZlciBtb2R1bGUgZnJvbSBub2RlLmpzLCBmb3IgdGhlIGJyb3dzZXIuXG4gKlxuICogQGF1dGhvciAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGZlcm9zc0BmZXJvc3Mub3JnPiA8aHR0cDovL2Zlcm9zcy5vcmc+XG4gKiBAbGljZW5zZSAgTUlUXG4gKi9cblxudmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxudmFyIGlzQXJyYXkgPSByZXF1aXJlKCdpcy1hcnJheScpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MiAvLyBub3QgdXNlZCBieSB0aGlzIGltcGxlbWVudGF0aW9uXG5cbnZhciBrTWF4TGVuZ3RoID0gMHgzZmZmZmZmZlxuXG4vKipcbiAqIElmIGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGA6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChtb3N0IGNvbXBhdGlibGUsIGV2ZW4gSUU2KVxuICpcbiAqIEJyb3dzZXJzIHRoYXQgc3VwcG9ydCB0eXBlZCBhcnJheXMgYXJlIElFIDEwKywgRmlyZWZveCA0KywgQ2hyb21lIDcrLCBTYWZhcmkgNS4xKyxcbiAqIE9wZXJhIDExLjYrLCBpT1MgNC4yKy5cbiAqXG4gKiBOb3RlOlxuICpcbiAqIC0gSW1wbGVtZW50YXRpb24gbXVzdCBzdXBwb3J0IGFkZGluZyBuZXcgcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLlxuICogICBGaXJlZm94IDQtMjkgbGFja2VkIHN1cHBvcnQsIGZpeGVkIGluIEZpcmVmb3ggMzArLlxuICogICBTZWU6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOC5cbiAqXG4gKiAgLSBDaHJvbWUgOS0xMCBpcyBtaXNzaW5nIHRoZSBgVHlwZWRBcnJheS5wcm90b3R5cGUuc3ViYXJyYXlgIGZ1bmN0aW9uLlxuICpcbiAqICAtIElFMTAgaGFzIGEgYnJva2VuIGBUeXBlZEFycmF5LnByb3RvdHlwZS5zdWJhcnJheWAgZnVuY3Rpb24gd2hpY2ggcmV0dXJucyBhcnJheXMgb2ZcbiAqICAgIGluY29ycmVjdCBsZW5ndGggaW4gc29tZSBzaXR1YXRpb25zLlxuICpcbiAqIFdlIGRldGVjdCB0aGVzZSBidWdneSBicm93c2VycyBhbmQgc2V0IGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGAgdG8gYGZhbHNlYCBzbyB0aGV5IHdpbGxcbiAqIGdldCB0aGUgT2JqZWN0IGltcGxlbWVudGF0aW9uLCB3aGljaCBpcyBzbG93ZXIgYnV0IHdpbGwgd29yayBjb3JyZWN0bHkuXG4gKi9cbkJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUID0gKGZ1bmN0aW9uICgpIHtcbiAgdHJ5IHtcbiAgICB2YXIgYnVmID0gbmV3IEFycmF5QnVmZmVyKDApXG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KGJ1ZilcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmIC8vIHR5cGVkIGFycmF5IGluc3RhbmNlcyBjYW4gYmUgYXVnbWVudGVkXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgJiYgLy8gY2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gICAgICAgIG5ldyBVaW50OEFycmF5KDEpLnN1YmFycmF5KDEsIDEpLmJ5dGVMZW5ndGggPT09IDAgLy8gaWUxMCBoYXMgYnJva2VuIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IHN1YmplY3QgPiAwID8gc3ViamVjdCA+Pj4gMCA6IDBcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnKVxuICAgICAgc3ViamVjdCA9IGJhc2U2NGNsZWFuKHN1YmplY3QpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcgJiYgc3ViamVjdCAhPT0gbnVsbCkgeyAvLyBhc3N1bWUgb2JqZWN0IGlzIGFycmF5LWxpa2VcbiAgICBpZiAoc3ViamVjdC50eXBlID09PSAnQnVmZmVyJyAmJiBpc0FycmF5KHN1YmplY3QuZGF0YSkpXG4gICAgICBzdWJqZWN0ID0gc3ViamVjdC5kYXRhXG4gICAgbGVuZ3RoID0gK3N1YmplY3QubGVuZ3RoID4gMCA/IE1hdGguZmxvb3IoK3N1YmplY3QubGVuZ3RoKSA6IDBcbiAgfSBlbHNlXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbXVzdCBzdGFydCB3aXRoIG51bWJlciwgYnVmZmVyLCBhcnJheSBvciBzdHJpbmcnKVxuXG4gIGlmICh0aGlzLmxlbmd0aCA+IGtNYXhMZW5ndGgpXG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0F0dGVtcHQgdG8gYWxsb2NhdGUgQnVmZmVyIGxhcmdlciB0aGFuIG1heGltdW0gJyArXG4gICAgICAnc2l6ZTogMHgnICsga01heExlbmd0aC50b1N0cmluZygxNikgKyAnIGJ5dGVzJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBCdWZmZXIuX2F1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCAmJiB0eXBlb2Ygc3ViamVjdC5ieXRlTGVuZ3RoID09PSAnbnVtYmVyJykge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIHR5cGVkIGFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSkge1xuICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspXG4gICAgICAgIGJ1ZltpXSA9ICgoc3ViamVjdFtpXSAlIDI1NikgKyAyNTYpICUgMjU2XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPSBudWxsICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuY29tcGFyZSA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGEpIHx8ICFCdWZmZXIuaXNCdWZmZXIoYikpXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIG11c3QgYmUgQnVmZmVycycpXG5cbiAgdmFyIHggPSBhLmxlbmd0aFxuICB2YXIgeSA9IGIubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwLCBsZW4gPSBNYXRoLm1pbih4LCB5KTsgaSA8IGxlbiAmJiBhW2ldID09PSBiW2ldOyBpKyspIHt9XG4gIGlmIChpICE9PSBsZW4pIHtcbiAgICB4ID0gYVtpXVxuICAgIHkgPSBiW2ldXG4gIH1cbiAgaWYgKHggPCB5KSByZXR1cm4gLTFcbiAgaWYgKHkgPCB4KSByZXR1cm4gMVxuICByZXR1cm4gMFxufVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBpZiAoIWlzQXJyYXkobGlzdCkpIHRocm93IG5ldyBUeXBlRXJyb3IoJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3RbLCBsZW5ndGhdKScpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodG90YWxMZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoICogMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCA+Pj4gMVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICB9XG4gIHJldHVybiByZXRcbn1cblxuLy8gcHJlLXNldCBmb3IgdmFsdWVzIHRoYXQgbWF5IGV4aXN0IGluIHRoZSBmdXR1cmVcbkJ1ZmZlci5wcm90b3R5cGUubGVuZ3RoID0gdW5kZWZpbmVkXG5CdWZmZXIucHJvdG90eXBlLnBhcmVudCA9IHVuZGVmaW5lZFxuXG4vLyB0b1N0cmluZyhlbmNvZGluZywgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsb3dlcmVkQ2FzZSA9IGZhbHNlXG5cbiAgc3RhcnQgPSBzdGFydCA+Pj4gMFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCB8fCBlbmQgPT09IEluZmluaXR5ID8gdGhpcy5sZW5ndGggOiBlbmQgPj4+IDBcblxuICBpZiAoIWVuY29kaW5nKSBlbmNvZGluZyA9ICd1dGY4J1xuICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoZW5kIDw9IHN0YXJ0KSByZXR1cm4gJydcblxuICB3aGlsZSAodHJ1ZSkge1xuICAgIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICAgIGNhc2UgJ2hleCc6XG4gICAgICAgIHJldHVybiBoZXhTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICd1dGY4JzpcbiAgICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgICAgcmV0dXJuIHV0ZjhTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdhc2NpaSc6XG4gICAgICAgIHJldHVybiBhc2NpaVNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICAgIHJldHVybiBiaW5hcnlTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgICByZXR1cm4gYmFzZTY0U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAndWNzMic6XG4gICAgICBjYXNlICd1Y3MtMic6XG4gICAgICBjYXNlICd1dGYxNmxlJzpcbiAgICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgICAgcmV0dXJuIHV0ZjE2bGVTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAobG93ZXJlZENhc2UpXG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICAgICAgICBlbmNvZGluZyA9IChlbmNvZGluZyArICcnKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGxvd2VyZWRDYXNlID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIChiKSB7XG4gIGlmKCFCdWZmZXIuaXNCdWZmZXIoYikpIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50IG11c3QgYmUgYSBCdWZmZXInKVxuICByZXR1cm4gQnVmZmVyLmNvbXBhcmUodGhpcywgYikgPT09IDBcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc3RyID0gJydcbiAgdmFyIG1heCA9IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVNcbiAgaWYgKHRoaXMubGVuZ3RoID4gMCkge1xuICAgIHN0ciA9IHRoaXMudG9TdHJpbmcoJ2hleCcsIDAsIG1heCkubWF0Y2goLy57Mn0vZykuam9pbignICcpXG4gICAgaWYgKHRoaXMubGVuZ3RoID4gbWF4KVxuICAgICAgc3RyICs9ICcgLi4uICdcbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIHN0ciArICc+J1xufVxuXG5CdWZmZXIucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbiAoYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnQgbXVzdCBiZSBhIEJ1ZmZlcicpXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuZnVuY3Rpb24gaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBpZiAoc3RyTGVuICUgMiAhPT0gMCkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBpZiAoaXNOYU4oYnl0ZSkpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBhc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGJhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgsIDIpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IGFzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IGJpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gdXRmMTZsZVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG5mdW5jdGlvbiBiYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIGFzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIGhleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpICsgMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gfn5zdGFydFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCA/IGxlbiA6IH5+ZW5kXG5cbiAgaWYgKHN0YXJ0IDwgMCkge1xuICAgIHN0YXJ0ICs9IGxlbjtcbiAgICBpZiAoc3RhcnQgPCAwKVxuICAgICAgc3RhcnQgPSAwXG4gIH0gZWxzZSBpZiAoc3RhcnQgPiBsZW4pIHtcbiAgICBzdGFydCA9IGxlblxuICB9XG5cbiAgaWYgKGVuZCA8IDApIHtcbiAgICBlbmQgKz0gbGVuXG4gICAgaWYgKGVuZCA8IDApXG4gICAgICBlbmQgPSAwXG4gIH0gZWxzZSBpZiAoZW5kID4gbGVuKSB7XG4gICAgZW5kID0gbGVuXG4gIH1cblxuICBpZiAoZW5kIDwgc3RhcnQpXG4gICAgZW5kID0gc3RhcnRcblxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICByZXR1cm4gQnVmZmVyLl9hdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vKlxuICogTmVlZCB0byBtYWtlIHN1cmUgdGhhdCBidWZmZXIgaXNuJ3QgdHJ5aW5nIHRvIHdyaXRlIG91dCBvZiBib3VuZHMuXG4gKi9cbmZ1bmN0aW9uIGNoZWNrT2Zmc2V0IChvZmZzZXQsIGV4dCwgbGVuZ3RoKSB7XG4gIGlmICgob2Zmc2V0ICUgMSkgIT09IDAgfHwgb2Zmc2V0IDwgMClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignb2Zmc2V0IGlzIG5vdCB1aW50JylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGxlbmd0aClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignVHJ5aW5nIHRvIGFjY2VzcyBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDEsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdIHwgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDgpIHwgdGhpc1tvZmZzZXQgKyAxXVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKCh0aGlzW29mZnNldF0pIHxcbiAgICAgICh0aGlzW29mZnNldCArIDFdIDw8IDgpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDE2KSkgK1xuICAgICAgKHRoaXNbb2Zmc2V0ICsgM10gKiAweDEwMDAwMDApXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdICogMHgxMDAwMDAwKSArXG4gICAgICAoKHRoaXNbb2Zmc2V0ICsgMV0gPDwgMTYpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDgpIHxcbiAgICAgIHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMSwgdGhpcy5sZW5ndGgpXG4gIGlmICghKHRoaXNbb2Zmc2V0XSAmIDB4ODApKVxuICAgIHJldHVybiAodGhpc1tvZmZzZXRdKVxuICByZXR1cm4gKCgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMSlcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0ICsgMV0gfCAodGhpc1tvZmZzZXRdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgMTYpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDNdIDw8IDI0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDI0KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCAxNikgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCB0cnVlLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIGZhbHNlLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCB0cnVlLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCBmYWxzZSwgNTIsIDgpXG59XG5cbmZ1bmN0aW9uIGNoZWNrSW50IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYnVmKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignYnVmZmVyIG11c3QgYmUgYSBCdWZmZXIgaW5zdGFuY2UnKVxuICBpZiAodmFsdWUgPiBtYXggfHwgdmFsdWUgPCBtaW4pIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ZhbHVlIGlzIG91dCBvZiBib3VuZHMnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gYnVmLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignaW5kZXggb3V0IG9mIHJhbmdlJylcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDEsIDB4ZmYsIDApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHZhbHVlID0gTWF0aC5mbG9vcih2YWx1ZSlcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuZnVuY3Rpb24gb2JqZWN0V3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmICsgdmFsdWUgKyAxXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4oYnVmLmxlbmd0aCAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSB2YWx1ZVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbmZ1bmN0aW9uIG9iamVjdFdyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDFcbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihidWYubGVuZ3RoIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9ICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHhmZmZmZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4ZmZmZmZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDNdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweDdmLCAtMHg4MClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmYgKyB2YWx1ZSArIDFcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweDdmZmYsIC0weDgwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9IHZhbHVlXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuZnVuY3Rpb24gY2hlY2tJRUVFNzU0IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgVHlwZUVycm9yKCd2YWx1ZSBpcyBvdXQgb2YgYm91bmRzJylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGJ1Zi5sZW5ndGgpIHRocm93IG5ldyBUeXBlRXJyb3IoJ2luZGV4IG91dCBvZiByYW5nZScpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDQsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDgsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxuICByZXR1cm4gb2Zmc2V0ICsgOFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBpZiAodGFyZ2V0X3N0YXJ0IDwgMCB8fCB0YXJnZXRfc3RhcnQgPj0gdGFyZ2V0Lmxlbmd0aClcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSBzb3VyY2UubGVuZ3RoKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKGVuZCA8IDAgfHwgZW5kID4gc291cmNlLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aClcbiAgICBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCA8IGVuZCAtIHN0YXJ0KVxuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgKyBzdGFydFxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuXG4gIGlmIChsZW4gPCAxMDAwIHx8ICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldF9zdGFydClcbiAgfVxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IFR5cGVFcnJvcignZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSB0aGlzLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChlbmQgPCAwIHx8IGVuZCA+IHRoaXMubGVuZ3RoKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICB0aGlzW2ldID0gdmFsdWVcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIGJ5dGVzID0gdXRmOFRvQnl0ZXModmFsdWUudG9TdHJpbmcoKSlcbiAgICB2YXIgbGVuID0gYnl0ZXMubGVuZ3RoXG4gICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgdGhpc1tpXSA9IGJ5dGVzW2kgJSBsZW5dXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKSB7XG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIH1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IGEgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIFVpbnQ4QXJyYXkgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbkJ1ZmZlci5fYXVnbWVudCA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgYXJyLmNvbnN0cnVjdG9yID0gQnVmZmVyXG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5lcXVhbHMgPSBCUC5lcXVhbHNcbiAgYXJyLmNvbXBhcmUgPSBCUC5jb21wYXJlXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG52YXIgSU5WQUxJRF9CQVNFNjRfUkUgPSAvW14rXFwvMC05QS16XS9nXG5cbmZ1bmN0aW9uIGJhc2U2NGNsZWFuIChzdHIpIHtcbiAgLy8gTm9kZSBzdHJpcHMgb3V0IGludmFsaWQgY2hhcmFjdGVycyBsaWtlIFxcbiBhbmQgXFx0IGZyb20gdGhlIHN0cmluZywgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHN0ciA9IHN0cmluZ3RyaW0oc3RyKS5yZXBsYWNlKElOVkFMSURfQkFTRTY0X1JFLCAnJylcbiAgLy8gTm9kZSBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgYmFzZTY0IHN0cmluZ3MgKG1pc3NpbmcgdHJhaWxpbmcgPT09KSwgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHdoaWxlIChzdHIubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgIHN0ciA9IHN0ciArICc9J1xuICB9XG4gIHJldHVybiBzdHJcbn1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYiA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaWYgKGIgPD0gMHg3Rikge1xuICAgICAgYnl0ZUFycmF5LnB1c2goYilcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHN0YXJ0ID0gaVxuICAgICAgaWYgKGIgPj0gMHhEODAwICYmIGIgPD0gMHhERkZGKSBpKytcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5zbGljZShzdGFydCwgaSsxKSkuc3Vic3RyKDEpLnNwbGl0KCclJylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaC5sZW5ndGg7IGorKykge1xuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYywgaGksIGxvXG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoLCB1bml0U2l6ZSkge1xuICBpZiAodW5pdFNpemUpIGxlbmd0aCAtPSBsZW5ndGggJSB1bml0U2l6ZTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG4iLCJ2YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTKVxuXHRcdFx0cmV0dXJuIDYyIC8vICcrJ1xuXHRcdGlmIChjb2RlID09PSBTTEFTSClcblx0XHRcdHJldHVybiA2MyAvLyAnLydcblx0XHRpZiAoY29kZSA8IE5VTUJFUilcblx0XHRcdHJldHVybiAtMSAvL25vIG1hdGNoXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIgKyAxMClcblx0XHRcdHJldHVybiBjb2RlIC0gTlVNQkVSICsgMjYgKyAyNlxuXHRcdGlmIChjb2RlIDwgVVBQRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gVVBQRVJcblx0XHRpZiAoY29kZSA8IExPV0VSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIExPV0VSICsgMjZcblx0fVxuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5IChiNjQpIHtcblx0XHR2YXIgaSwgaiwgbCwgdG1wLCBwbGFjZUhvbGRlcnMsIGFyclxuXG5cdFx0aWYgKGI2NC5sZW5ndGggJSA0ID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jylcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0dmFyIGxlbiA9IGI2NC5sZW5ndGhcblx0XHRwbGFjZUhvbGRlcnMgPSAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMikgPyAyIDogJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDEpID8gMSA6IDBcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IG5ldyBBcnIoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoXG5cblx0XHR2YXIgTCA9IDBcblxuXHRcdGZ1bmN0aW9uIHB1c2ggKHYpIHtcblx0XHRcdGFycltMKytdID0gdlxuXHRcdH1cblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBkZWNvZGUoYjY0LmNoYXJBdChpICsgMykpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDAwMCkgPj4gMTYpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDApID4+IDgpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpID4+IDQpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKVxuXHRcdFx0cHVzaCgodG1wID4+IDgpICYgMHhGRilcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyXG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0ICh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoXG5cblx0XHRmdW5jdGlvbiBlbmNvZGUgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtKVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NCAobnVtKSB7XG5cdFx0XHRyZXR1cm4gZW5jb2RlKG51bSA+PiAxOCAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiAxMiAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiA2ICYgMHgzRikgKyBlbmNvZGUobnVtICYgMHgzRilcblx0XHR9XG5cblx0XHQvLyBnbyB0aHJvdWdoIHRoZSBhcnJheSBldmVyeSB0aHJlZSBieXRlcywgd2UnbGwgZGVhbCB3aXRoIHRyYWlsaW5nIHN0dWZmIGxhdGVyXG5cdFx0Zm9yIChpID0gMCwgbGVuZ3RoID0gdWludDgubGVuZ3RoIC0gZXh0cmFCeXRlczsgaSA8IGxlbmd0aDsgaSArPSAzKSB7XG5cdFx0XHR0ZW1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKVxuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAyKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSdcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgMjpcblx0XHRcdFx0dGVtcCA9ICh1aW50OFt1aW50OC5sZW5ndGggLSAyXSA8PCA4KSArICh1aW50OFt1aW50OC5sZW5ndGggLSAxXSlcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDEwKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wID4+IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCAyKSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPSdcblx0XHRcdFx0YnJlYWtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0XG5cdH1cblxuXHRleHBvcnRzLnRvQnl0ZUFycmF5ID0gYjY0VG9CeXRlQXJyYXlcblx0ZXhwb3J0cy5mcm9tQnl0ZUFycmF5ID0gdWludDhUb0Jhc2U2NFxufSh0eXBlb2YgZXhwb3J0cyA9PT0gJ3VuZGVmaW5lZCcgPyAodGhpcy5iYXNlNjRqcyA9IHt9KSA6IGV4cG9ydHMpKVxuIiwiZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24oYnVmZmVyLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBuQml0cyA9IC03LFxuICAgICAgaSA9IGlzTEUgPyAobkJ5dGVzIC0gMSkgOiAwLFxuICAgICAgZCA9IGlzTEUgPyAtMSA6IDEsXG4gICAgICBzID0gYnVmZmVyW29mZnNldCArIGldO1xuXG4gIGkgKz0gZDtcblxuICBlID0gcyAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgcyA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IGVMZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IGUgPSBlICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIG0gPSBlICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBlID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gbUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgbSA9IG0gKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgaWYgKGUgPT09IDApIHtcbiAgICBlID0gMSAtIGVCaWFzO1xuICB9IGVsc2UgaWYgKGUgPT09IGVNYXgpIHtcbiAgICByZXR1cm4gbSA/IE5hTiA6ICgocyA/IC0xIDogMSkgKiBJbmZpbml0eSk7XG4gIH0gZWxzZSB7XG4gICAgbSA9IG0gKyBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICBlID0gZSAtIGVCaWFzO1xuICB9XG4gIHJldHVybiAocyA/IC0xIDogMSkgKiBtICogTWF0aC5wb3coMiwgZSAtIG1MZW4pO1xufTtcblxuZXhwb3J0cy53cml0ZSA9IGZ1bmN0aW9uKGJ1ZmZlciwgdmFsdWUsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLCBjLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIHJ0ID0gKG1MZW4gPT09IDIzID8gTWF0aC5wb3coMiwgLTI0KSAtIE1hdGgucG93KDIsIC03NykgOiAwKSxcbiAgICAgIGkgPSBpc0xFID8gMCA6IChuQnl0ZXMgLSAxKSxcbiAgICAgIGQgPSBpc0xFID8gMSA6IC0xLFxuICAgICAgcyA9IHZhbHVlIDwgMCB8fCAodmFsdWUgPT09IDAgJiYgMSAvIHZhbHVlIDwgMCkgPyAxIDogMDtcblxuICB2YWx1ZSA9IE1hdGguYWJzKHZhbHVlKTtcblxuICBpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlID09PSBJbmZpbml0eSkge1xuICAgIG0gPSBpc05hTih2YWx1ZSkgPyAxIDogMDtcbiAgICBlID0gZU1heDtcbiAgfSBlbHNlIHtcbiAgICBlID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMik7XG4gICAgaWYgKHZhbHVlICogKGMgPSBNYXRoLnBvdygyLCAtZSkpIDwgMSkge1xuICAgICAgZS0tO1xuICAgICAgYyAqPSAyO1xuICAgIH1cbiAgICBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIHZhbHVlICs9IHJ0IC8gYztcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgKz0gcnQgKiBNYXRoLnBvdygyLCAxIC0gZUJpYXMpO1xuICAgIH1cbiAgICBpZiAodmFsdWUgKiBjID49IDIpIHtcbiAgICAgIGUrKztcbiAgICAgIGMgLz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZSArIGVCaWFzID49IGVNYXgpIHtcbiAgICAgIG0gPSAwO1xuICAgICAgZSA9IGVNYXg7XG4gICAgfSBlbHNlIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgbSA9ICh2YWx1ZSAqIGMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IGUgKyBlQmlhcztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IHZhbHVlICogTWF0aC5wb3coMiwgZUJpYXMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IDA7XG4gICAgfVxuICB9XG5cbiAgZm9yICg7IG1MZW4gPj0gODsgYnVmZmVyW29mZnNldCArIGldID0gbSAmIDB4ZmYsIGkgKz0gZCwgbSAvPSAyNTYsIG1MZW4gLT0gOCk7XG5cbiAgZSA9IChlIDw8IG1MZW4pIHwgbTtcbiAgZUxlbiArPSBtTGVuO1xuICBmb3IgKDsgZUxlbiA+IDA7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IGUgJiAweGZmLCBpICs9IGQsIGUgLz0gMjU2LCBlTGVuIC09IDgpO1xuXG4gIGJ1ZmZlcltvZmZzZXQgKyBpIC0gZF0gfD0gcyAqIDEyODtcbn07XG4iLCJcbi8qKlxuICogaXNBcnJheVxuICovXG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheTtcblxuLyoqXG4gKiB0b1N0cmluZ1xuICovXG5cbnZhciBzdHIgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4vKipcbiAqIFdoZXRoZXIgb3Igbm90IHRoZSBnaXZlbiBgdmFsYFxuICogaXMgYW4gYXJyYXkuXG4gKlxuICogZXhhbXBsZTpcbiAqXG4gKiAgICAgICAgaXNBcnJheShbXSk7XG4gKiAgICAgICAgLy8gPiB0cnVlXG4gKiAgICAgICAgaXNBcnJheShhcmd1bWVudHMpO1xuICogICAgICAgIC8vID4gZmFsc2VcbiAqICAgICAgICBpc0FycmF5KCcnKTtcbiAqICAgICAgICAvLyA+IGZhbHNlXG4gKlxuICogQHBhcmFtIHttaXhlZH0gdmFsXG4gKiBAcmV0dXJuIHtib29sfVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcnJheSB8fCBmdW5jdGlvbiAodmFsKSB7XG4gIHJldHVybiAhISB2YWwgJiYgJ1tvYmplY3QgQXJyYXldJyA9PSBzdHIuY2FsbCh2YWwpO1xufTtcbiIsIi8qZ2xvYmFsIGRlZmluZTpmYWxzZSByZXF1aXJlOmZhbHNlICovXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpe1xuXHQvLyBJbXBvcnQgRXZlbnRzXG5cdHZhciBldmVudHMgPSByZXF1aXJlKCdldmVudHMnKTtcblxuXHQvLyBFeHBvcnQgRG9tYWluXG5cdHZhciBkb21haW4gPSB7fTtcblx0ZG9tYWluLmNyZWF0ZURvbWFpbiA9IGRvbWFpbi5jcmVhdGUgPSBmdW5jdGlvbigpe1xuXHRcdHZhciBkID0gbmV3IGV2ZW50cy5FdmVudEVtaXR0ZXIoKTtcblxuXHRcdGZ1bmN0aW9uIGVtaXRFcnJvcihlKSB7XG5cdFx0XHRkLmVtaXQoJ2Vycm9yJywgZSlcblx0XHR9XG5cblx0XHRkLmFkZCA9IGZ1bmN0aW9uKGVtaXR0ZXIpe1xuXHRcdFx0ZW1pdHRlci5vbignZXJyb3InLCBlbWl0RXJyb3IpO1xuXHRcdH1cblx0XHRkLnJlbW92ZSA9IGZ1bmN0aW9uKGVtaXR0ZXIpe1xuXHRcdFx0ZW1pdHRlci5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBlbWl0RXJyb3IpO1xuXHRcdH1cblx0XHRkLnJ1biA9IGZ1bmN0aW9uKGZuKXtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZuKCk7XG5cdFx0XHR9XG5cdFx0XHRjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRkLmRpc3Bvc2UgPSBmdW5jdGlvbigpe1xuXHRcdFx0dGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cmV0dXJuIGQ7XG5cdH07XG5cdHJldHVybiBkb21haW47XG59KS5jYWxsKHRoaXMpOyIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIoKSB7XG4gIHRoaXMuX2V2ZW50cyA9IHRoaXMuX2V2ZW50cyB8fCB7fTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gdGhpcy5fbWF4TGlzdGVuZXJzIHx8IHVuZGVmaW5lZDtcbn1cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRFbWl0dGVyO1xuXG4vLyBCYWNrd2FyZHMtY29tcGF0IHdpdGggbm9kZSAwLjEwLnhcbkV2ZW50RW1pdHRlci5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX2V2ZW50cyA9IHVuZGVmaW5lZDtcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX21heExpc3RlbmVycyA9IHVuZGVmaW5lZDtcblxuLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhbiAxMCBsaXN0ZW5lcnMgYXJlXG4vLyBhZGRlZCB0byBpdC4gVGhpcyBpcyBhIHVzZWZ1bCBkZWZhdWx0IHdoaWNoIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxuRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnMgPSAxMDtcblxuLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXG4vLyB0aGF0IHRvIGJlIGluY3JlYXNlZC4gU2V0IHRvIHplcm8gZm9yIHVubGltaXRlZC5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuc2V0TWF4TGlzdGVuZXJzID0gZnVuY3Rpb24obikge1xuICBpZiAoIWlzTnVtYmVyKG4pIHx8IG4gPCAwIHx8IGlzTmFOKG4pKVxuICAgIHRocm93IFR5cGVFcnJvcignbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJyk7XG4gIHRoaXMuX21heExpc3RlbmVycyA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgZXIsIGhhbmRsZXIsIGxlbiwgYXJncywgaSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIElmIHRoZXJlIGlzIG5vICdlcnJvcicgZXZlbnQgbGlzdGVuZXIgdGhlbiB0aHJvdy5cbiAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICBpZiAoIXRoaXMuX2V2ZW50cy5lcnJvciB8fFxuICAgICAgICAoaXNPYmplY3QodGhpcy5fZXZlbnRzLmVycm9yKSAmJiAhdGhpcy5fZXZlbnRzLmVycm9yLmxlbmd0aCkpIHtcbiAgICAgIGVyID0gYXJndW1lbnRzWzFdO1xuICAgICAgaWYgKGVyIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgdGhyb3cgZXI7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XG4gICAgICB9XG4gICAgICB0aHJvdyBUeXBlRXJyb3IoJ1VuY2F1Z2h0LCB1bnNwZWNpZmllZCBcImVycm9yXCIgZXZlbnQuJyk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNVbmRlZmluZWQoaGFuZGxlcikpXG4gICAgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG4gICAgc3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAvLyBmYXN0IGNhc2VzXG4gICAgICBjYXNlIDE6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAvLyBzbG93ZXJcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkobGVuIC0gMSk7XG4gICAgICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoaXNPYmplY3QoaGFuZGxlcikpIHtcbiAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgIGFyZ3MgPSBuZXcgQXJyYXkobGVuIC0gMSk7XG4gICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG5cbiAgICBsaXN0ZW5lcnMgPSBoYW5kbGVyLnNsaWNlKCk7XG4gICAgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICBsaXN0ZW5lcnNbaV0uYXBwbHkodGhpcywgYXJncyk7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gVG8gYXZvaWQgcmVjdXJzaW9uIGluIHRoZSBjYXNlIHRoYXQgdHlwZSA9PT0gXCJuZXdMaXN0ZW5lclwiISBCZWZvcmVcbiAgLy8gYWRkaW5nIGl0IHRvIHRoZSBsaXN0ZW5lcnMsIGZpcnN0IGVtaXQgXCJuZXdMaXN0ZW5lclwiLlxuICBpZiAodGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKVxuICAgIHRoaXMuZW1pdCgnbmV3TGlzdGVuZXInLCB0eXBlLFxuICAgICAgICAgICAgICBpc0Z1bmN0aW9uKGxpc3RlbmVyLmxpc3RlbmVyKSA/XG4gICAgICAgICAgICAgIGxpc3RlbmVyLmxpc3RlbmVyIDogbGlzdGVuZXIpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIC8vIE9wdGltaXplIHRoZSBjYXNlIG9mIG9uZSBsaXN0ZW5lci4gRG9uJ3QgbmVlZCB0aGUgZXh0cmEgYXJyYXkgb2JqZWN0LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IGxpc3RlbmVyO1xuICBlbHNlIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFwcGVuZC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG4gIGVsc2VcbiAgICAvLyBBZGRpbmcgdGhlIHNlY29uZCBlbGVtZW50LCBuZWVkIHRvIGNoYW5nZSB0byBhcnJheS5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBbdGhpcy5fZXZlbnRzW3R5cGVdLCBsaXN0ZW5lcl07XG5cbiAgLy8gQ2hlY2sgZm9yIGxpc3RlbmVyIGxlYWtcbiAgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkgJiYgIXRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQpIHtcbiAgICB2YXIgbTtcbiAgICBpZiAoIWlzVW5kZWZpbmVkKHRoaXMuX21heExpc3RlbmVycykpIHtcbiAgICAgIG0gPSB0aGlzLl9tYXhMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSBFdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycztcbiAgICB9XG5cbiAgICBpZiAobSAmJiBtID4gMCAmJiB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoID4gbSkge1xuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCA9IHRydWU7XG4gICAgICBjb25zb2xlLmVycm9yKCcobm9kZSkgd2FybmluZzogcG9zc2libGUgRXZlbnRFbWl0dGVyIG1lbW9yeSAnICtcbiAgICAgICAgICAgICAgICAgICAgJ2xlYWsgZGV0ZWN0ZWQuICVkIGxpc3RlbmVycyBhZGRlZC4gJyArXG4gICAgICAgICAgICAgICAgICAgICdVc2UgZW1pdHRlci5zZXRNYXhMaXN0ZW5lcnMoKSB0byBpbmNyZWFzZSBsaW1pdC4nLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoKTtcbiAgICAgIGlmICh0eXBlb2YgY29uc29sZS50cmFjZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAvLyBub3Qgc3VwcG9ydGVkIGluIElFIDEwXG4gICAgICAgIGNvbnNvbGUudHJhY2UoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgdmFyIGZpcmVkID0gZmFsc2U7XG5cbiAgZnVuY3Rpb24gZygpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGcpO1xuXG4gICAgaWYgKCFmaXJlZCkge1xuICAgICAgZmlyZWQgPSB0cnVlO1xuICAgICAgbGlzdGVuZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9XG4gIH1cblxuICBnLmxpc3RlbmVyID0gbGlzdGVuZXI7XG4gIHRoaXMub24odHlwZSwgZyk7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBlbWl0cyBhICdyZW1vdmVMaXN0ZW5lcicgZXZlbnQgaWZmIHRoZSBsaXN0ZW5lciB3YXMgcmVtb3ZlZFxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBsaXN0LCBwb3NpdGlvbiwgbGVuZ3RoLCBpO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIGxpc3QgPSB0aGlzLl9ldmVudHNbdHlwZV07XG4gIGxlbmd0aCA9IGxpc3QubGVuZ3RoO1xuICBwb3NpdGlvbiA9IC0xO1xuXG4gIGlmIChsaXN0ID09PSBsaXN0ZW5lciB8fFxuICAgICAgKGlzRnVuY3Rpb24obGlzdC5saXN0ZW5lcikgJiYgbGlzdC5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcblxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGxpc3QpKSB7XG4gICAgZm9yIChpID0gbGVuZ3RoOyBpLS0gPiAwOykge1xuICAgICAgaWYgKGxpc3RbaV0gPT09IGxpc3RlbmVyIHx8XG4gICAgICAgICAgKGxpc3RbaV0ubGlzdGVuZXIgJiYgbGlzdFtpXS5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgICAgIHBvc2l0aW9uID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHBvc2l0aW9uIDwgMClcbiAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgICBsaXN0Lmxlbmd0aCA9IDA7XG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIH0gZWxzZSB7XG4gICAgICBsaXN0LnNwbGljZShwb3NpdGlvbiwgMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIga2V5LCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgLy8gbm90IGxpc3RlbmluZyBmb3IgcmVtb3ZlTGlzdGVuZXIsIG5vIG5lZWQgdG8gZW1pdFxuICBpZiAoIXRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcikge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKVxuICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgZWxzZSBpZiAodGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIGVtaXQgcmVtb3ZlTGlzdGVuZXIgZm9yIGFsbCBsaXN0ZW5lcnMgb24gYWxsIGV2ZW50c1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIGZvciAoa2V5IGluIHRoaXMuX2V2ZW50cykge1xuICAgICAgaWYgKGtleSA9PT0gJ3JlbW92ZUxpc3RlbmVyJykgY29udGludWU7XG4gICAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycyhrZXkpO1xuICAgIH1cbiAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycygncmVtb3ZlTGlzdGVuZXInKTtcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNGdW5jdGlvbihsaXN0ZW5lcnMpKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnMpO1xuICB9IGVsc2Uge1xuICAgIC8vIExJRk8gb3JkZXJcbiAgICB3aGlsZSAobGlzdGVuZXJzLmxlbmd0aClcbiAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzW2xpc3RlbmVycy5sZW5ndGggLSAxXSk7XG4gIH1cbiAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgcmV0O1xuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIHJldCA9IFtdO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XG4gIGVsc2VcbiAgICByZXQgPSB0aGlzLl9ldmVudHNbdHlwZV0uc2xpY2UoKTtcbiAgcmV0dXJuIHJldDtcbn07XG5cbkV2ZW50RW1pdHRlci5saXN0ZW5lckNvdW50ID0gZnVuY3Rpb24oZW1pdHRlciwgdHlwZSkge1xuICB2YXIgcmV0O1xuICBpZiAoIWVtaXR0ZXIuX2V2ZW50cyB8fCAhZW1pdHRlci5fZXZlbnRzW3R5cGVdKVxuICAgIHJldCA9IDA7XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24oZW1pdHRlci5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSAxO1xuICBlbHNlXG4gICAgcmV0ID0gZW1pdHRlci5fZXZlbnRzW3R5cGVdLmxlbmd0aDtcbiAgcmV0dXJuIHJldDtcbn07XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbiIsImlmICh0eXBlb2YgT2JqZWN0LmNyZWF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAvLyBpbXBsZW1lbnRhdGlvbiBmcm9tIHN0YW5kYXJkIG5vZGUuanMgJ3V0aWwnIG1vZHVsZVxuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgY3Rvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKHN1cGVyQ3Rvci5wcm90b3R5cGUsIHtcbiAgICAgIGNvbnN0cnVjdG9yOiB7XG4gICAgICAgIHZhbHVlOiBjdG9yLFxuICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgfVxuICAgIH0pO1xuICB9O1xufSBlbHNlIHtcbiAgLy8gb2xkIHNjaG9vbCBzaGltIGZvciBvbGQgYnJvd3NlcnNcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIHZhciBUZW1wQ3RvciA9IGZ1bmN0aW9uICgpIHt9XG4gICAgVGVtcEN0b3IucHJvdG90eXBlID0gc3VwZXJDdG9yLnByb3RvdHlwZVxuICAgIGN0b3IucHJvdG90eXBlID0gbmV3IFRlbXBDdG9yKClcbiAgICBjdG9yLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGN0b3JcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChhcnIpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhcnIpID09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuTXV0YXRpb25PYnNlcnZlciA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93Lk11dGF0aW9uT2JzZXJ2ZXI7XG4gICAgdmFyIGNhblBvc3QgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5wb3N0TWVzc2FnZSAmJiB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lclxuICAgIDtcblxuICAgIGlmIChjYW5TZXRJbW1lZGlhdGUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmKSB7IHJldHVybiB3aW5kb3cuc2V0SW1tZWRpYXRlKGYpIH07XG4gICAgfVxuXG4gICAgdmFyIHF1ZXVlID0gW107XG5cbiAgICBpZiAoY2FuTXV0YXRpb25PYnNlcnZlcikge1xuICAgICAgICB2YXIgaGlkZGVuRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdmFyIG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHF1ZXVlTGlzdCA9IHF1ZXVlLnNsaWNlKCk7XG4gICAgICAgICAgICBxdWV1ZS5sZW5ndGggPSAwO1xuICAgICAgICAgICAgcXVldWVMaXN0LmZvckVhY2goZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBvYnNlcnZlci5vYnNlcnZlKGhpZGRlbkRpdiwgeyBhdHRyaWJ1dGVzOiB0cnVlIH0pO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgaWYgKCFxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBoaWRkZW5EaXYuc2V0QXR0cmlidXRlKCd5ZXMnLCAnbm8nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gZXYuc291cmNlO1xuICAgICAgICAgICAgaWYgKChzb3VyY2UgPT09IHdpbmRvdyB8fCBzb3VyY2UgPT09IG51bGwpICYmIGV2LmRhdGEgPT09ICdwcm9jZXNzLXRpY2snKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoJ3Byb2Nlc3MtdGljaycsICcqJyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgIH07XG59KSgpO1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcIi4vbGliL19zdHJlYW1fZHVwbGV4LmpzXCIpXG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gYSBkdXBsZXggc3RyZWFtIGlzIGp1c3QgYSBzdHJlYW0gdGhhdCBpcyBib3RoIHJlYWRhYmxlIGFuZCB3cml0YWJsZS5cbi8vIFNpbmNlIEpTIGRvZXNuJ3QgaGF2ZSBtdWx0aXBsZSBwcm90b3R5cGFsIGluaGVyaXRhbmNlLCB0aGlzIGNsYXNzXG4vLyBwcm90b3R5cGFsbHkgaW5oZXJpdHMgZnJvbSBSZWFkYWJsZSwgYW5kIHRoZW4gcGFyYXNpdGljYWxseSBmcm9tXG4vLyBXcml0YWJsZS5cblxubW9kdWxlLmV4cG9ydHMgPSBEdXBsZXg7XG5cbi8qPHJlcGxhY2VtZW50PiovXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIGtleXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikga2V5cy5wdXNoKGtleSk7XG4gIHJldHVybiBrZXlzO1xufVxuLyo8L3JlcGxhY2VtZW50PiovXG5cblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbnZhciB1dGlsID0gcmVxdWlyZSgnY29yZS11dGlsLWlzJyk7XG51dGlsLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcbi8qPC9yZXBsYWNlbWVudD4qL1xuXG52YXIgUmVhZGFibGUgPSByZXF1aXJlKCcuL19zdHJlYW1fcmVhZGFibGUnKTtcbnZhciBXcml0YWJsZSA9IHJlcXVpcmUoJy4vX3N0cmVhbV93cml0YWJsZScpO1xuXG51dGlsLmluaGVyaXRzKER1cGxleCwgUmVhZGFibGUpO1xuXG5mb3JFYWNoKG9iamVjdEtleXMoV3JpdGFibGUucHJvdG90eXBlKSwgZnVuY3Rpb24obWV0aG9kKSB7XG4gIGlmICghRHVwbGV4LnByb3RvdHlwZVttZXRob2RdKVxuICAgIER1cGxleC5wcm90b3R5cGVbbWV0aG9kXSA9IFdyaXRhYmxlLnByb3RvdHlwZVttZXRob2RdO1xufSk7XG5cbmZ1bmN0aW9uIER1cGxleChvcHRpb25zKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBEdXBsZXgpKVxuICAgIHJldHVybiBuZXcgRHVwbGV4KG9wdGlvbnMpO1xuXG4gIFJlYWRhYmxlLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gIFdyaXRhYmxlLmNhbGwodGhpcywgb3B0aW9ucyk7XG5cbiAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5yZWFkYWJsZSA9PT0gZmFsc2UpXG4gICAgdGhpcy5yZWFkYWJsZSA9IGZhbHNlO1xuXG4gIGlmIChvcHRpb25zICYmIG9wdGlvbnMud3JpdGFibGUgPT09IGZhbHNlKVxuICAgIHRoaXMud3JpdGFibGUgPSBmYWxzZTtcblxuICB0aGlzLmFsbG93SGFsZk9wZW4gPSB0cnVlO1xuICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLmFsbG93SGFsZk9wZW4gPT09IGZhbHNlKVxuICAgIHRoaXMuYWxsb3dIYWxmT3BlbiA9IGZhbHNlO1xuXG4gIHRoaXMub25jZSgnZW5kJywgb25lbmQpO1xufVxuXG4vLyB0aGUgbm8taGFsZi1vcGVuIGVuZm9yY2VyXG5mdW5jdGlvbiBvbmVuZCgpIHtcbiAgLy8gaWYgd2UgYWxsb3cgaGFsZi1vcGVuIHN0YXRlLCBvciBpZiB0aGUgd3JpdGFibGUgc2lkZSBlbmRlZCxcbiAgLy8gdGhlbiB3ZSdyZSBvay5cbiAgaWYgKHRoaXMuYWxsb3dIYWxmT3BlbiB8fCB0aGlzLl93cml0YWJsZVN0YXRlLmVuZGVkKVxuICAgIHJldHVybjtcblxuICAvLyBubyBtb3JlIGRhdGEgY2FuIGJlIHdyaXR0ZW4uXG4gIC8vIEJ1dCBhbGxvdyBtb3JlIHdyaXRlcyB0byBoYXBwZW4gaW4gdGhpcyB0aWNrLlxuICBwcm9jZXNzLm5leHRUaWNrKHRoaXMuZW5kLmJpbmQodGhpcykpO1xufVxuXG5mdW5jdGlvbiBmb3JFYWNoICh4cywgZikge1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHhzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGYoeHNbaV0sIGkpO1xuICB9XG59XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gYSBwYXNzdGhyb3VnaCBzdHJlYW0uXG4vLyBiYXNpY2FsbHkganVzdCB0aGUgbW9zdCBtaW5pbWFsIHNvcnQgb2YgVHJhbnNmb3JtIHN0cmVhbS5cbi8vIEV2ZXJ5IHdyaXR0ZW4gY2h1bmsgZ2V0cyBvdXRwdXQgYXMtaXMuXG5cbm1vZHVsZS5leHBvcnRzID0gUGFzc1Rocm91Z2g7XG5cbnZhciBUcmFuc2Zvcm0gPSByZXF1aXJlKCcuL19zdHJlYW1fdHJhbnNmb3JtJyk7XG5cbi8qPHJlcGxhY2VtZW50PiovXG52YXIgdXRpbCA9IHJlcXVpcmUoJ2NvcmUtdXRpbC1pcycpO1xudXRpbC5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG4vKjwvcmVwbGFjZW1lbnQ+Ki9cblxudXRpbC5pbmhlcml0cyhQYXNzVGhyb3VnaCwgVHJhbnNmb3JtKTtcblxuZnVuY3Rpb24gUGFzc1Rocm91Z2gob3B0aW9ucykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgUGFzc1Rocm91Z2gpKVxuICAgIHJldHVybiBuZXcgUGFzc1Rocm91Z2gob3B0aW9ucyk7XG5cbiAgVHJhbnNmb3JtLmNhbGwodGhpcywgb3B0aW9ucyk7XG59XG5cblBhc3NUaHJvdWdoLnByb3RvdHlwZS5fdHJhbnNmb3JtID0gZnVuY3Rpb24oY2h1bmssIGVuY29kaW5nLCBjYikge1xuICBjYihudWxsLCBjaHVuayk7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbm1vZHVsZS5leHBvcnRzID0gUmVhZGFibGU7XG5cbi8qPHJlcGxhY2VtZW50PiovXG52YXIgaXNBcnJheSA9IHJlcXVpcmUoJ2lzYXJyYXknKTtcbi8qPC9yZXBsYWNlbWVudD4qL1xuXG5cbi8qPHJlcGxhY2VtZW50PiovXG52YXIgQnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyO1xuLyo8L3JlcGxhY2VtZW50PiovXG5cblJlYWRhYmxlLlJlYWRhYmxlU3RhdGUgPSBSZWFkYWJsZVN0YXRlO1xuXG52YXIgRUUgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG5cbi8qPHJlcGxhY2VtZW50PiovXG5pZiAoIUVFLmxpc3RlbmVyQ291bnQpIEVFLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbihlbWl0dGVyLCB0eXBlKSB7XG4gIHJldHVybiBlbWl0dGVyLmxpc3RlbmVycyh0eXBlKS5sZW5ndGg7XG59O1xuLyo8L3JlcGxhY2VtZW50PiovXG5cbnZhciBTdHJlYW0gPSByZXF1aXJlKCdzdHJlYW0nKTtcblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbnZhciB1dGlsID0gcmVxdWlyZSgnY29yZS11dGlsLWlzJyk7XG51dGlsLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcbi8qPC9yZXBsYWNlbWVudD4qL1xuXG52YXIgU3RyaW5nRGVjb2RlcjtcblxudXRpbC5pbmhlcml0cyhSZWFkYWJsZSwgU3RyZWFtKTtcblxuZnVuY3Rpb24gUmVhZGFibGVTdGF0ZShvcHRpb25zLCBzdHJlYW0pIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgLy8gdGhlIHBvaW50IGF0IHdoaWNoIGl0IHN0b3BzIGNhbGxpbmcgX3JlYWQoKSB0byBmaWxsIHRoZSBidWZmZXJcbiAgLy8gTm90ZTogMCBpcyBhIHZhbGlkIHZhbHVlLCBtZWFucyBcImRvbid0IGNhbGwgX3JlYWQgcHJlZW1wdGl2ZWx5IGV2ZXJcIlxuICB2YXIgaHdtID0gb3B0aW9ucy5oaWdoV2F0ZXJNYXJrO1xuICB0aGlzLmhpZ2hXYXRlck1hcmsgPSAoaHdtIHx8IGh3bSA9PT0gMCkgPyBod20gOiAxNiAqIDEwMjQ7XG5cbiAgLy8gY2FzdCB0byBpbnRzLlxuICB0aGlzLmhpZ2hXYXRlck1hcmsgPSB+fnRoaXMuaGlnaFdhdGVyTWFyaztcblxuICB0aGlzLmJ1ZmZlciA9IFtdO1xuICB0aGlzLmxlbmd0aCA9IDA7XG4gIHRoaXMucGlwZXMgPSBudWxsO1xuICB0aGlzLnBpcGVzQ291bnQgPSAwO1xuICB0aGlzLmZsb3dpbmcgPSBmYWxzZTtcbiAgdGhpcy5lbmRlZCA9IGZhbHNlO1xuICB0aGlzLmVuZEVtaXR0ZWQgPSBmYWxzZTtcbiAgdGhpcy5yZWFkaW5nID0gZmFsc2U7XG5cbiAgLy8gSW4gc3RyZWFtcyB0aGF0IG5ldmVyIGhhdmUgYW55IGRhdGEsIGFuZCBkbyBwdXNoKG51bGwpIHJpZ2h0IGF3YXksXG4gIC8vIHRoZSBjb25zdW1lciBjYW4gbWlzcyB0aGUgJ2VuZCcgZXZlbnQgaWYgdGhleSBkbyBzb21lIEkvTyBiZWZvcmVcbiAgLy8gY29uc3VtaW5nIHRoZSBzdHJlYW0uICBTbywgd2UgZG9uJ3QgZW1pdCgnZW5kJykgdW50aWwgc29tZSByZWFkaW5nXG4gIC8vIGhhcHBlbnMuXG4gIHRoaXMuY2FsbGVkUmVhZCA9IGZhbHNlO1xuXG4gIC8vIGEgZmxhZyB0byBiZSBhYmxlIHRvIHRlbGwgaWYgdGhlIG9ud3JpdGUgY2IgaXMgY2FsbGVkIGltbWVkaWF0ZWx5LFxuICAvLyBvciBvbiBhIGxhdGVyIHRpY2suICBXZSBzZXQgdGhpcyB0byB0cnVlIGF0IGZpcnN0LCBiZWN1YXNlIGFueVxuICAvLyBhY3Rpb25zIHRoYXQgc2hvdWxkbid0IGhhcHBlbiB1bnRpbCBcImxhdGVyXCIgc2hvdWxkIGdlbmVyYWxseSBhbHNvXG4gIC8vIG5vdCBoYXBwZW4gYmVmb3JlIHRoZSBmaXJzdCB3cml0ZSBjYWxsLlxuICB0aGlzLnN5bmMgPSB0cnVlO1xuXG4gIC8vIHdoZW5ldmVyIHdlIHJldHVybiBudWxsLCB0aGVuIHdlIHNldCBhIGZsYWcgdG8gc2F5XG4gIC8vIHRoYXQgd2UncmUgYXdhaXRpbmcgYSAncmVhZGFibGUnIGV2ZW50IGVtaXNzaW9uLlxuICB0aGlzLm5lZWRSZWFkYWJsZSA9IGZhbHNlO1xuICB0aGlzLmVtaXR0ZWRSZWFkYWJsZSA9IGZhbHNlO1xuICB0aGlzLnJlYWRhYmxlTGlzdGVuaW5nID0gZmFsc2U7XG5cblxuICAvLyBvYmplY3Qgc3RyZWFtIGZsYWcuIFVzZWQgdG8gbWFrZSByZWFkKG4pIGlnbm9yZSBuIGFuZCB0b1xuICAvLyBtYWtlIGFsbCB0aGUgYnVmZmVyIG1lcmdpbmcgYW5kIGxlbmd0aCBjaGVja3MgZ28gYXdheVxuICB0aGlzLm9iamVjdE1vZGUgPSAhIW9wdGlvbnMub2JqZWN0TW9kZTtcblxuICAvLyBDcnlwdG8gaXMga2luZCBvZiBvbGQgYW5kIGNydXN0eS4gIEhpc3RvcmljYWxseSwgaXRzIGRlZmF1bHQgc3RyaW5nXG4gIC8vIGVuY29kaW5nIGlzICdiaW5hcnknIHNvIHdlIGhhdmUgdG8gbWFrZSB0aGlzIGNvbmZpZ3VyYWJsZS5cbiAgLy8gRXZlcnl0aGluZyBlbHNlIGluIHRoZSB1bml2ZXJzZSB1c2VzICd1dGY4JywgdGhvdWdoLlxuICB0aGlzLmRlZmF1bHRFbmNvZGluZyA9IG9wdGlvbnMuZGVmYXVsdEVuY29kaW5nIHx8ICd1dGY4JztcblxuICAvLyB3aGVuIHBpcGluZywgd2Ugb25seSBjYXJlIGFib3V0ICdyZWFkYWJsZScgZXZlbnRzIHRoYXQgaGFwcGVuXG4gIC8vIGFmdGVyIHJlYWQoKWluZyBhbGwgdGhlIGJ5dGVzIGFuZCBub3QgZ2V0dGluZyBhbnkgcHVzaGJhY2suXG4gIHRoaXMucmFuT3V0ID0gZmFsc2U7XG5cbiAgLy8gdGhlIG51bWJlciBvZiB3cml0ZXJzIHRoYXQgYXJlIGF3YWl0aW5nIGEgZHJhaW4gZXZlbnQgaW4gLnBpcGUoKXNcbiAgdGhpcy5hd2FpdERyYWluID0gMDtcblxuICAvLyBpZiB0cnVlLCBhIG1heWJlUmVhZE1vcmUgaGFzIGJlZW4gc2NoZWR1bGVkXG4gIHRoaXMucmVhZGluZ01vcmUgPSBmYWxzZTtcblxuICB0aGlzLmRlY29kZXIgPSBudWxsO1xuICB0aGlzLmVuY29kaW5nID0gbnVsbDtcbiAgaWYgKG9wdGlvbnMuZW5jb2RpbmcpIHtcbiAgICBpZiAoIVN0cmluZ0RlY29kZXIpXG4gICAgICBTdHJpbmdEZWNvZGVyID0gcmVxdWlyZSgnc3RyaW5nX2RlY29kZXIvJykuU3RyaW5nRGVjb2RlcjtcbiAgICB0aGlzLmRlY29kZXIgPSBuZXcgU3RyaW5nRGVjb2RlcihvcHRpb25zLmVuY29kaW5nKTtcbiAgICB0aGlzLmVuY29kaW5nID0gb3B0aW9ucy5lbmNvZGluZztcbiAgfVxufVxuXG5mdW5jdGlvbiBSZWFkYWJsZShvcHRpb25zKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBSZWFkYWJsZSkpXG4gICAgcmV0dXJuIG5ldyBSZWFkYWJsZShvcHRpb25zKTtcblxuICB0aGlzLl9yZWFkYWJsZVN0YXRlID0gbmV3IFJlYWRhYmxlU3RhdGUob3B0aW9ucywgdGhpcyk7XG5cbiAgLy8gbGVnYWN5XG4gIHRoaXMucmVhZGFibGUgPSB0cnVlO1xuXG4gIFN0cmVhbS5jYWxsKHRoaXMpO1xufVxuXG4vLyBNYW51YWxseSBzaG92ZSBzb21ldGhpbmcgaW50byB0aGUgcmVhZCgpIGJ1ZmZlci5cbi8vIFRoaXMgcmV0dXJucyB0cnVlIGlmIHRoZSBoaWdoV2F0ZXJNYXJrIGhhcyBub3QgYmVlbiBoaXQgeWV0LFxuLy8gc2ltaWxhciB0byBob3cgV3JpdGFibGUud3JpdGUoKSByZXR1cm5zIHRydWUgaWYgeW91IHNob3VsZFxuLy8gd3JpdGUoKSBzb21lIG1vcmUuXG5SZWFkYWJsZS5wcm90b3R5cGUucHVzaCA9IGZ1bmN0aW9uKGNodW5rLCBlbmNvZGluZykge1xuICB2YXIgc3RhdGUgPSB0aGlzLl9yZWFkYWJsZVN0YXRlO1xuXG4gIGlmICh0eXBlb2YgY2h1bmsgPT09ICdzdHJpbmcnICYmICFzdGF0ZS5vYmplY3RNb2RlKSB7XG4gICAgZW5jb2RpbmcgPSBlbmNvZGluZyB8fCBzdGF0ZS5kZWZhdWx0RW5jb2Rpbmc7XG4gICAgaWYgKGVuY29kaW5nICE9PSBzdGF0ZS5lbmNvZGluZykge1xuICAgICAgY2h1bmsgPSBuZXcgQnVmZmVyKGNodW5rLCBlbmNvZGluZyk7XG4gICAgICBlbmNvZGluZyA9ICcnO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZWFkYWJsZUFkZENodW5rKHRoaXMsIHN0YXRlLCBjaHVuaywgZW5jb2RpbmcsIGZhbHNlKTtcbn07XG5cbi8vIFVuc2hpZnQgc2hvdWxkICphbHdheXMqIGJlIHNvbWV0aGluZyBkaXJlY3RseSBvdXQgb2YgcmVhZCgpXG5SZWFkYWJsZS5wcm90b3R5cGUudW5zaGlmdCA9IGZ1bmN0aW9uKGNodW5rKSB7XG4gIHZhciBzdGF0ZSA9IHRoaXMuX3JlYWRhYmxlU3RhdGU7XG4gIHJldHVybiByZWFkYWJsZUFkZENodW5rKHRoaXMsIHN0YXRlLCBjaHVuaywgJycsIHRydWUpO1xufTtcblxuZnVuY3Rpb24gcmVhZGFibGVBZGRDaHVuayhzdHJlYW0sIHN0YXRlLCBjaHVuaywgZW5jb2RpbmcsIGFkZFRvRnJvbnQpIHtcbiAgdmFyIGVyID0gY2h1bmtJbnZhbGlkKHN0YXRlLCBjaHVuayk7XG4gIGlmIChlcikge1xuICAgIHN0cmVhbS5lbWl0KCdlcnJvcicsIGVyKTtcbiAgfSBlbHNlIGlmIChjaHVuayA9PT0gbnVsbCB8fCBjaHVuayA9PT0gdW5kZWZpbmVkKSB7XG4gICAgc3RhdGUucmVhZGluZyA9IGZhbHNlO1xuICAgIGlmICghc3RhdGUuZW5kZWQpXG4gICAgICBvbkVvZkNodW5rKHN0cmVhbSwgc3RhdGUpO1xuICB9IGVsc2UgaWYgKHN0YXRlLm9iamVjdE1vZGUgfHwgY2h1bmsgJiYgY2h1bmsubGVuZ3RoID4gMCkge1xuICAgIGlmIChzdGF0ZS5lbmRlZCAmJiAhYWRkVG9Gcm9udCkge1xuICAgICAgdmFyIGUgPSBuZXcgRXJyb3IoJ3N0cmVhbS5wdXNoKCkgYWZ0ZXIgRU9GJyk7XG4gICAgICBzdHJlYW0uZW1pdCgnZXJyb3InLCBlKTtcbiAgICB9IGVsc2UgaWYgKHN0YXRlLmVuZEVtaXR0ZWQgJiYgYWRkVG9Gcm9udCkge1xuICAgICAgdmFyIGUgPSBuZXcgRXJyb3IoJ3N0cmVhbS51bnNoaWZ0KCkgYWZ0ZXIgZW5kIGV2ZW50Jyk7XG4gICAgICBzdHJlYW0uZW1pdCgnZXJyb3InLCBlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHN0YXRlLmRlY29kZXIgJiYgIWFkZFRvRnJvbnQgJiYgIWVuY29kaW5nKVxuICAgICAgICBjaHVuayA9IHN0YXRlLmRlY29kZXIud3JpdGUoY2h1bmspO1xuXG4gICAgICAvLyB1cGRhdGUgdGhlIGJ1ZmZlciBpbmZvLlxuICAgICAgc3RhdGUubGVuZ3RoICs9IHN0YXRlLm9iamVjdE1vZGUgPyAxIDogY2h1bmsubGVuZ3RoO1xuICAgICAgaWYgKGFkZFRvRnJvbnQpIHtcbiAgICAgICAgc3RhdGUuYnVmZmVyLnVuc2hpZnQoY2h1bmspO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RhdGUucmVhZGluZyA9IGZhbHNlO1xuICAgICAgICBzdGF0ZS5idWZmZXIucHVzaChjaHVuayk7XG4gICAgICB9XG5cbiAgICAgIGlmIChzdGF0ZS5uZWVkUmVhZGFibGUpXG4gICAgICAgIGVtaXRSZWFkYWJsZShzdHJlYW0pO1xuXG4gICAgICBtYXliZVJlYWRNb3JlKHN0cmVhbSwgc3RhdGUpO1xuICAgIH1cbiAgfSBlbHNlIGlmICghYWRkVG9Gcm9udCkge1xuICAgIHN0YXRlLnJlYWRpbmcgPSBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiBuZWVkTW9yZURhdGEoc3RhdGUpO1xufVxuXG5cblxuLy8gaWYgaXQncyBwYXN0IHRoZSBoaWdoIHdhdGVyIG1hcmssIHdlIGNhbiBwdXNoIGluIHNvbWUgbW9yZS5cbi8vIEFsc28sIGlmIHdlIGhhdmUgbm8gZGF0YSB5ZXQsIHdlIGNhbiBzdGFuZCBzb21lXG4vLyBtb3JlIGJ5dGVzLiAgVGhpcyBpcyB0byB3b3JrIGFyb3VuZCBjYXNlcyB3aGVyZSBod209MCxcbi8vIHN1Y2ggYXMgdGhlIHJlcGwuICBBbHNvLCBpZiB0aGUgcHVzaCgpIHRyaWdnZXJlZCBhXG4vLyByZWFkYWJsZSBldmVudCwgYW5kIHRoZSB1c2VyIGNhbGxlZCByZWFkKGxhcmdlTnVtYmVyKSBzdWNoIHRoYXRcbi8vIG5lZWRSZWFkYWJsZSB3YXMgc2V0LCB0aGVuIHdlIG91Z2h0IHRvIHB1c2ggbW9yZSwgc28gdGhhdCBhbm90aGVyXG4vLyAncmVhZGFibGUnIGV2ZW50IHdpbGwgYmUgdHJpZ2dlcmVkLlxuZnVuY3Rpb24gbmVlZE1vcmVEYXRhKHN0YXRlKSB7XG4gIHJldHVybiAhc3RhdGUuZW5kZWQgJiZcbiAgICAgICAgIChzdGF0ZS5uZWVkUmVhZGFibGUgfHxcbiAgICAgICAgICBzdGF0ZS5sZW5ndGggPCBzdGF0ZS5oaWdoV2F0ZXJNYXJrIHx8XG4gICAgICAgICAgc3RhdGUubGVuZ3RoID09PSAwKTtcbn1cblxuLy8gYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG5SZWFkYWJsZS5wcm90b3R5cGUuc2V0RW5jb2RpbmcgPSBmdW5jdGlvbihlbmMpIHtcbiAgaWYgKCFTdHJpbmdEZWNvZGVyKVxuICAgIFN0cmluZ0RlY29kZXIgPSByZXF1aXJlKCdzdHJpbmdfZGVjb2Rlci8nKS5TdHJpbmdEZWNvZGVyO1xuICB0aGlzLl9yZWFkYWJsZVN0YXRlLmRlY29kZXIgPSBuZXcgU3RyaW5nRGVjb2RlcihlbmMpO1xuICB0aGlzLl9yZWFkYWJsZVN0YXRlLmVuY29kaW5nID0gZW5jO1xufTtcblxuLy8gRG9uJ3QgcmFpc2UgdGhlIGh3bSA+IDEyOE1CXG52YXIgTUFYX0hXTSA9IDB4ODAwMDAwO1xuZnVuY3Rpb24gcm91bmRVcFRvTmV4dFBvd2VyT2YyKG4pIHtcbiAgaWYgKG4gPj0gTUFYX0hXTSkge1xuICAgIG4gPSBNQVhfSFdNO1xuICB9IGVsc2Uge1xuICAgIC8vIEdldCB0aGUgbmV4dCBoaWdoZXN0IHBvd2VyIG9mIDJcbiAgICBuLS07XG4gICAgZm9yICh2YXIgcCA9IDE7IHAgPCAzMjsgcCA8PD0gMSkgbiB8PSBuID4+IHA7XG4gICAgbisrO1xuICB9XG4gIHJldHVybiBuO1xufVxuXG5mdW5jdGlvbiBob3dNdWNoVG9SZWFkKG4sIHN0YXRlKSB7XG4gIGlmIChzdGF0ZS5sZW5ndGggPT09IDAgJiYgc3RhdGUuZW5kZWQpXG4gICAgcmV0dXJuIDA7XG5cbiAgaWYgKHN0YXRlLm9iamVjdE1vZGUpXG4gICAgcmV0dXJuIG4gPT09IDAgPyAwIDogMTtcblxuICBpZiAobiA9PT0gbnVsbCB8fCBpc05hTihuKSkge1xuICAgIC8vIG9ubHkgZmxvdyBvbmUgYnVmZmVyIGF0IGEgdGltZVxuICAgIGlmIChzdGF0ZS5mbG93aW5nICYmIHN0YXRlLmJ1ZmZlci5sZW5ndGgpXG4gICAgICByZXR1cm4gc3RhdGUuYnVmZmVyWzBdLmxlbmd0aDtcbiAgICBlbHNlXG4gICAgICByZXR1cm4gc3RhdGUubGVuZ3RoO1xuICB9XG5cbiAgaWYgKG4gPD0gMClcbiAgICByZXR1cm4gMDtcblxuICAvLyBJZiB3ZSdyZSBhc2tpbmcgZm9yIG1vcmUgdGhhbiB0aGUgdGFyZ2V0IGJ1ZmZlciBsZXZlbCxcbiAgLy8gdGhlbiByYWlzZSB0aGUgd2F0ZXIgbWFyay4gIEJ1bXAgdXAgdG8gdGhlIG5leHQgaGlnaGVzdFxuICAvLyBwb3dlciBvZiAyLCB0byBwcmV2ZW50IGluY3JlYXNpbmcgaXQgZXhjZXNzaXZlbHkgaW4gdGlueVxuICAvLyBhbW91bnRzLlxuICBpZiAobiA+IHN0YXRlLmhpZ2hXYXRlck1hcmspXG4gICAgc3RhdGUuaGlnaFdhdGVyTWFyayA9IHJvdW5kVXBUb05leHRQb3dlck9mMihuKTtcblxuICAvLyBkb24ndCBoYXZlIHRoYXQgbXVjaC4gIHJldHVybiBudWxsLCB1bmxlc3Mgd2UndmUgZW5kZWQuXG4gIGlmIChuID4gc3RhdGUubGVuZ3RoKSB7XG4gICAgaWYgKCFzdGF0ZS5lbmRlZCkge1xuICAgICAgc3RhdGUubmVlZFJlYWRhYmxlID0gdHJ1ZTtcbiAgICAgIHJldHVybiAwO1xuICAgIH0gZWxzZVxuICAgICAgcmV0dXJuIHN0YXRlLmxlbmd0aDtcbiAgfVxuXG4gIHJldHVybiBuO1xufVxuXG4vLyB5b3UgY2FuIG92ZXJyaWRlIGVpdGhlciB0aGlzIG1ldGhvZCwgb3IgdGhlIGFzeW5jIF9yZWFkKG4pIGJlbG93LlxuUmVhZGFibGUucHJvdG90eXBlLnJlYWQgPSBmdW5jdGlvbihuKSB7XG4gIHZhciBzdGF0ZSA9IHRoaXMuX3JlYWRhYmxlU3RhdGU7XG4gIHN0YXRlLmNhbGxlZFJlYWQgPSB0cnVlO1xuICB2YXIgbk9yaWcgPSBuO1xuICB2YXIgcmV0O1xuXG4gIGlmICh0eXBlb2YgbiAhPT0gJ251bWJlcicgfHwgbiA+IDApXG4gICAgc3RhdGUuZW1pdHRlZFJlYWRhYmxlID0gZmFsc2U7XG5cbiAgLy8gaWYgd2UncmUgZG9pbmcgcmVhZCgwKSB0byB0cmlnZ2VyIGEgcmVhZGFibGUgZXZlbnQsIGJ1dCB3ZVxuICAvLyBhbHJlYWR5IGhhdmUgYSBidW5jaCBvZiBkYXRhIGluIHRoZSBidWZmZXIsIHRoZW4ganVzdCB0cmlnZ2VyXG4gIC8vIHRoZSAncmVhZGFibGUnIGV2ZW50IGFuZCBtb3ZlIG9uLlxuICBpZiAobiA9PT0gMCAmJlxuICAgICAgc3RhdGUubmVlZFJlYWRhYmxlICYmXG4gICAgICAoc3RhdGUubGVuZ3RoID49IHN0YXRlLmhpZ2hXYXRlck1hcmsgfHwgc3RhdGUuZW5kZWQpKSB7XG4gICAgZW1pdFJlYWRhYmxlKHRoaXMpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgbiA9IGhvd011Y2hUb1JlYWQobiwgc3RhdGUpO1xuXG4gIC8vIGlmIHdlJ3ZlIGVuZGVkLCBhbmQgd2UncmUgbm93IGNsZWFyLCB0aGVuIGZpbmlzaCBpdCB1cC5cbiAgaWYgKG4gPT09IDAgJiYgc3RhdGUuZW5kZWQpIHtcbiAgICByZXQgPSBudWxsO1xuXG4gICAgLy8gSW4gY2FzZXMgd2hlcmUgdGhlIGRlY29kZXIgZGlkIG5vdCByZWNlaXZlIGVub3VnaCBkYXRhXG4gICAgLy8gdG8gcHJvZHVjZSBhIGZ1bGwgY2h1bmssIHRoZW4gaW1tZWRpYXRlbHkgcmVjZWl2ZWQgYW5cbiAgICAvLyBFT0YsIHN0YXRlLmJ1ZmZlciB3aWxsIGNvbnRhaW4gWzxCdWZmZXIgPiwgPEJ1ZmZlciAwMCAuLi4+XS5cbiAgICAvLyBob3dNdWNoVG9SZWFkIHdpbGwgc2VlIHRoaXMgYW5kIGNvZXJjZSB0aGUgYW1vdW50IHRvXG4gICAgLy8gcmVhZCB0byB6ZXJvIChiZWNhdXNlIGl0J3MgbG9va2luZyBhdCB0aGUgbGVuZ3RoIG9mIHRoZVxuICAgIC8vIGZpcnN0IDxCdWZmZXIgPiBpbiBzdGF0ZS5idWZmZXIpLCBhbmQgd2UnbGwgZW5kIHVwIGhlcmUuXG4gICAgLy9cbiAgICAvLyBUaGlzIGNhbiBvbmx5IGhhcHBlbiB2aWEgc3RhdGUuZGVjb2RlciAtLSBubyBvdGhlciB2ZW51ZVxuICAgIC8vIGV4aXN0cyBmb3IgcHVzaGluZyBhIHplcm8tbGVuZ3RoIGNodW5rIGludG8gc3RhdGUuYnVmZmVyXG4gICAgLy8gYW5kIHRyaWdnZXJpbmcgdGhpcyBiZWhhdmlvci4gSW4gdGhpcyBjYXNlLCB3ZSByZXR1cm4gb3VyXG4gICAgLy8gcmVtYWluaW5nIGRhdGEgYW5kIGVuZCB0aGUgc3RyZWFtLCBpZiBhcHByb3ByaWF0ZS5cbiAgICBpZiAoc3RhdGUubGVuZ3RoID4gMCAmJiBzdGF0ZS5kZWNvZGVyKSB7XG4gICAgICByZXQgPSBmcm9tTGlzdChuLCBzdGF0ZSk7XG4gICAgICBzdGF0ZS5sZW5ndGggLT0gcmV0Lmxlbmd0aDtcbiAgICB9XG5cbiAgICBpZiAoc3RhdGUubGVuZ3RoID09PSAwKVxuICAgICAgZW5kUmVhZGFibGUodGhpcyk7XG5cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gQWxsIHRoZSBhY3R1YWwgY2h1bmsgZ2VuZXJhdGlvbiBsb2dpYyBuZWVkcyB0byBiZVxuICAvLyAqYmVsb3cqIHRoZSBjYWxsIHRvIF9yZWFkLiAgVGhlIHJlYXNvbiBpcyB0aGF0IGluIGNlcnRhaW5cbiAgLy8gc3ludGhldGljIHN0cmVhbSBjYXNlcywgc3VjaCBhcyBwYXNzdGhyb3VnaCBzdHJlYW1zLCBfcmVhZFxuICAvLyBtYXkgYmUgYSBjb21wbGV0ZWx5IHN5bmNocm9ub3VzIG9wZXJhdGlvbiB3aGljaCBtYXkgY2hhbmdlXG4gIC8vIHRoZSBzdGF0ZSBvZiB0aGUgcmVhZCBidWZmZXIsIHByb3ZpZGluZyBlbm91Z2ggZGF0YSB3aGVuXG4gIC8vIGJlZm9yZSB0aGVyZSB3YXMgKm5vdCogZW5vdWdoLlxuICAvL1xuICAvLyBTbywgdGhlIHN0ZXBzIGFyZTpcbiAgLy8gMS4gRmlndXJlIG91dCB3aGF0IHRoZSBzdGF0ZSBvZiB0aGluZ3Mgd2lsbCBiZSBhZnRlciB3ZSBkb1xuICAvLyBhIHJlYWQgZnJvbSB0aGUgYnVmZmVyLlxuICAvL1xuICAvLyAyLiBJZiB0aGF0IHJlc3VsdGluZyBzdGF0ZSB3aWxsIHRyaWdnZXIgYSBfcmVhZCwgdGhlbiBjYWxsIF9yZWFkLlxuICAvLyBOb3RlIHRoYXQgdGhpcyBtYXkgYmUgYXN5bmNocm9ub3VzLCBvciBzeW5jaHJvbm91cy4gIFllcywgaXQgaXNcbiAgLy8gZGVlcGx5IHVnbHkgdG8gd3JpdGUgQVBJcyB0aGlzIHdheSwgYnV0IHRoYXQgc3RpbGwgZG9lc24ndCBtZWFuXG4gIC8vIHRoYXQgdGhlIFJlYWRhYmxlIGNsYXNzIHNob3VsZCBiZWhhdmUgaW1wcm9wZXJseSwgYXMgc3RyZWFtcyBhcmVcbiAgLy8gZGVzaWduZWQgdG8gYmUgc3luYy9hc3luYyBhZ25vc3RpYy5cbiAgLy8gVGFrZSBub3RlIGlmIHRoZSBfcmVhZCBjYWxsIGlzIHN5bmMgb3IgYXN5bmMgKGllLCBpZiB0aGUgcmVhZCBjYWxsXG4gIC8vIGhhcyByZXR1cm5lZCB5ZXQpLCBzbyB0aGF0IHdlIGtub3cgd2hldGhlciBvciBub3QgaXQncyBzYWZlIHRvIGVtaXRcbiAgLy8gJ3JlYWRhYmxlJyBldGMuXG4gIC8vXG4gIC8vIDMuIEFjdHVhbGx5IHB1bGwgdGhlIHJlcXVlc3RlZCBjaHVua3Mgb3V0IG9mIHRoZSBidWZmZXIgYW5kIHJldHVybi5cblxuICAvLyBpZiB3ZSBuZWVkIGEgcmVhZGFibGUgZXZlbnQsIHRoZW4gd2UgbmVlZCB0byBkbyBzb21lIHJlYWRpbmcuXG4gIHZhciBkb1JlYWQgPSBzdGF0ZS5uZWVkUmVhZGFibGU7XG5cbiAgLy8gaWYgd2UgY3VycmVudGx5IGhhdmUgbGVzcyB0aGFuIHRoZSBoaWdoV2F0ZXJNYXJrLCB0aGVuIGFsc28gcmVhZCBzb21lXG4gIGlmIChzdGF0ZS5sZW5ndGggLSBuIDw9IHN0YXRlLmhpZ2hXYXRlck1hcmspXG4gICAgZG9SZWFkID0gdHJ1ZTtcblxuICAvLyBob3dldmVyLCBpZiB3ZSd2ZSBlbmRlZCwgdGhlbiB0aGVyZSdzIG5vIHBvaW50LCBhbmQgaWYgd2UncmUgYWxyZWFkeVxuICAvLyByZWFkaW5nLCB0aGVuIGl0J3MgdW5uZWNlc3NhcnkuXG4gIGlmIChzdGF0ZS5lbmRlZCB8fCBzdGF0ZS5yZWFkaW5nKVxuICAgIGRvUmVhZCA9IGZhbHNlO1xuXG4gIGlmIChkb1JlYWQpIHtcbiAgICBzdGF0ZS5yZWFkaW5nID0gdHJ1ZTtcbiAgICBzdGF0ZS5zeW5jID0gdHJ1ZTtcbiAgICAvLyBpZiB0aGUgbGVuZ3RoIGlzIGN1cnJlbnRseSB6ZXJvLCB0aGVuIHdlICpuZWVkKiBhIHJlYWRhYmxlIGV2ZW50LlxuICAgIGlmIChzdGF0ZS5sZW5ndGggPT09IDApXG4gICAgICBzdGF0ZS5uZWVkUmVhZGFibGUgPSB0cnVlO1xuICAgIC8vIGNhbGwgaW50ZXJuYWwgcmVhZCBtZXRob2RcbiAgICB0aGlzLl9yZWFkKHN0YXRlLmhpZ2hXYXRlck1hcmspO1xuICAgIHN0YXRlLnN5bmMgPSBmYWxzZTtcbiAgfVxuXG4gIC8vIElmIF9yZWFkIGNhbGxlZCBpdHMgY2FsbGJhY2sgc3luY2hyb25vdXNseSwgdGhlbiBgcmVhZGluZ2BcbiAgLy8gd2lsbCBiZSBmYWxzZSwgYW5kIHdlIG5lZWQgdG8gcmUtZXZhbHVhdGUgaG93IG11Y2ggZGF0YSB3ZVxuICAvLyBjYW4gcmV0dXJuIHRvIHRoZSB1c2VyLlxuICBpZiAoZG9SZWFkICYmICFzdGF0ZS5yZWFkaW5nKVxuICAgIG4gPSBob3dNdWNoVG9SZWFkKG5PcmlnLCBzdGF0ZSk7XG5cbiAgaWYgKG4gPiAwKVxuICAgIHJldCA9IGZyb21MaXN0KG4sIHN0YXRlKTtcbiAgZWxzZVxuICAgIHJldCA9IG51bGw7XG5cbiAgaWYgKHJldCA9PT0gbnVsbCkge1xuICAgIHN0YXRlLm5lZWRSZWFkYWJsZSA9IHRydWU7XG4gICAgbiA9IDA7XG4gIH1cblxuICBzdGF0ZS5sZW5ndGggLT0gbjtcblxuICAvLyBJZiB3ZSBoYXZlIG5vdGhpbmcgaW4gdGhlIGJ1ZmZlciwgdGhlbiB3ZSB3YW50IHRvIGtub3dcbiAgLy8gYXMgc29vbiBhcyB3ZSAqZG8qIGdldCBzb21ldGhpbmcgaW50byB0aGUgYnVmZmVyLlxuICBpZiAoc3RhdGUubGVuZ3RoID09PSAwICYmICFzdGF0ZS5lbmRlZClcbiAgICBzdGF0ZS5uZWVkUmVhZGFibGUgPSB0cnVlO1xuXG4gIC8vIElmIHdlIGhhcHBlbmVkIHRvIHJlYWQoKSBleGFjdGx5IHRoZSByZW1haW5pbmcgYW1vdW50IGluIHRoZVxuICAvLyBidWZmZXIsIGFuZCB0aGUgRU9GIGhhcyBiZWVuIHNlZW4gYXQgdGhpcyBwb2ludCwgdGhlbiBtYWtlIHN1cmVcbiAgLy8gdGhhdCB3ZSBlbWl0ICdlbmQnIG9uIHRoZSB2ZXJ5IG5leHQgdGljay5cbiAgaWYgKHN0YXRlLmVuZGVkICYmICFzdGF0ZS5lbmRFbWl0dGVkICYmIHN0YXRlLmxlbmd0aCA9PT0gMClcbiAgICBlbmRSZWFkYWJsZSh0aGlzKTtcblxuICByZXR1cm4gcmV0O1xufTtcblxuZnVuY3Rpb24gY2h1bmtJbnZhbGlkKHN0YXRlLCBjaHVuaykge1xuICB2YXIgZXIgPSBudWxsO1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihjaHVuaykgJiZcbiAgICAgICdzdHJpbmcnICE9PSB0eXBlb2YgY2h1bmsgJiZcbiAgICAgIGNodW5rICE9PSBudWxsICYmXG4gICAgICBjaHVuayAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAhc3RhdGUub2JqZWN0TW9kZSkge1xuICAgIGVyID0gbmV3IFR5cGVFcnJvcignSW52YWxpZCBub24tc3RyaW5nL2J1ZmZlciBjaHVuaycpO1xuICB9XG4gIHJldHVybiBlcjtcbn1cblxuXG5mdW5jdGlvbiBvbkVvZkNodW5rKHN0cmVhbSwgc3RhdGUpIHtcbiAgaWYgKHN0YXRlLmRlY29kZXIgJiYgIXN0YXRlLmVuZGVkKSB7XG4gICAgdmFyIGNodW5rID0gc3RhdGUuZGVjb2Rlci5lbmQoKTtcbiAgICBpZiAoY2h1bmsgJiYgY2h1bmsubGVuZ3RoKSB7XG4gICAgICBzdGF0ZS5idWZmZXIucHVzaChjaHVuayk7XG4gICAgICBzdGF0ZS5sZW5ndGggKz0gc3RhdGUub2JqZWN0TW9kZSA/IDEgOiBjaHVuay5sZW5ndGg7XG4gICAgfVxuICB9XG4gIHN0YXRlLmVuZGVkID0gdHJ1ZTtcblxuICAvLyBpZiB3ZSd2ZSBlbmRlZCBhbmQgd2UgaGF2ZSBzb21lIGRhdGEgbGVmdCwgdGhlbiBlbWl0XG4gIC8vICdyZWFkYWJsZScgbm93IHRvIG1ha2Ugc3VyZSBpdCBnZXRzIHBpY2tlZCB1cC5cbiAgaWYgKHN0YXRlLmxlbmd0aCA+IDApXG4gICAgZW1pdFJlYWRhYmxlKHN0cmVhbSk7XG4gIGVsc2VcbiAgICBlbmRSZWFkYWJsZShzdHJlYW0pO1xufVxuXG4vLyBEb24ndCBlbWl0IHJlYWRhYmxlIHJpZ2h0IGF3YXkgaW4gc3luYyBtb2RlLCBiZWNhdXNlIHRoaXMgY2FuIHRyaWdnZXJcbi8vIGFub3RoZXIgcmVhZCgpIGNhbGwgPT4gc3RhY2sgb3ZlcmZsb3cuICBUaGlzIHdheSwgaXQgbWlnaHQgdHJpZ2dlclxuLy8gYSBuZXh0VGljayByZWN1cnNpb24gd2FybmluZywgYnV0IHRoYXQncyBub3Qgc28gYmFkLlxuZnVuY3Rpb24gZW1pdFJlYWRhYmxlKHN0cmVhbSkge1xuICB2YXIgc3RhdGUgPSBzdHJlYW0uX3JlYWRhYmxlU3RhdGU7XG4gIHN0YXRlLm5lZWRSZWFkYWJsZSA9IGZhbHNlO1xuICBpZiAoc3RhdGUuZW1pdHRlZFJlYWRhYmxlKVxuICAgIHJldHVybjtcblxuICBzdGF0ZS5lbWl0dGVkUmVhZGFibGUgPSB0cnVlO1xuICBpZiAoc3RhdGUuc3luYylcbiAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgZW1pdFJlYWRhYmxlXyhzdHJlYW0pO1xuICAgIH0pO1xuICBlbHNlXG4gICAgZW1pdFJlYWRhYmxlXyhzdHJlYW0pO1xufVxuXG5mdW5jdGlvbiBlbWl0UmVhZGFibGVfKHN0cmVhbSkge1xuICBzdHJlYW0uZW1pdCgncmVhZGFibGUnKTtcbn1cblxuXG4vLyBhdCB0aGlzIHBvaW50LCB0aGUgdXNlciBoYXMgcHJlc3VtYWJseSBzZWVuIHRoZSAncmVhZGFibGUnIGV2ZW50LFxuLy8gYW5kIGNhbGxlZCByZWFkKCkgdG8gY29uc3VtZSBzb21lIGRhdGEuICB0aGF0IG1heSBoYXZlIHRyaWdnZXJlZFxuLy8gaW4gdHVybiBhbm90aGVyIF9yZWFkKG4pIGNhbGwsIGluIHdoaWNoIGNhc2UgcmVhZGluZyA9IHRydWUgaWZcbi8vIGl0J3MgaW4gcHJvZ3Jlc3MuXG4vLyBIb3dldmVyLCBpZiB3ZSdyZSBub3QgZW5kZWQsIG9yIHJlYWRpbmcsIGFuZCB0aGUgbGVuZ3RoIDwgaHdtLFxuLy8gdGhlbiBnbyBhaGVhZCBhbmQgdHJ5IHRvIHJlYWQgc29tZSBtb3JlIHByZWVtcHRpdmVseS5cbmZ1bmN0aW9uIG1heWJlUmVhZE1vcmUoc3RyZWFtLCBzdGF0ZSkge1xuICBpZiAoIXN0YXRlLnJlYWRpbmdNb3JlKSB7XG4gICAgc3RhdGUucmVhZGluZ01vcmUgPSB0cnVlO1xuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICBtYXliZVJlYWRNb3JlXyhzdHJlYW0sIHN0YXRlKTtcbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYXliZVJlYWRNb3JlXyhzdHJlYW0sIHN0YXRlKSB7XG4gIHZhciBsZW4gPSBzdGF0ZS5sZW5ndGg7XG4gIHdoaWxlICghc3RhdGUucmVhZGluZyAmJiAhc3RhdGUuZmxvd2luZyAmJiAhc3RhdGUuZW5kZWQgJiZcbiAgICAgICAgIHN0YXRlLmxlbmd0aCA8IHN0YXRlLmhpZ2hXYXRlck1hcmspIHtcbiAgICBzdHJlYW0ucmVhZCgwKTtcbiAgICBpZiAobGVuID09PSBzdGF0ZS5sZW5ndGgpXG4gICAgICAvLyBkaWRuJ3QgZ2V0IGFueSBkYXRhLCBzdG9wIHNwaW5uaW5nLlxuICAgICAgYnJlYWs7XG4gICAgZWxzZVxuICAgICAgbGVuID0gc3RhdGUubGVuZ3RoO1xuICB9XG4gIHN0YXRlLnJlYWRpbmdNb3JlID0gZmFsc2U7XG59XG5cbi8vIGFic3RyYWN0IG1ldGhvZC4gIHRvIGJlIG92ZXJyaWRkZW4gaW4gc3BlY2lmaWMgaW1wbGVtZW50YXRpb24gY2xhc3Nlcy5cbi8vIGNhbGwgY2IoZXIsIGRhdGEpIHdoZXJlIGRhdGEgaXMgPD0gbiBpbiBsZW5ndGguXG4vLyBmb3IgdmlydHVhbCAobm9uLXN0cmluZywgbm9uLWJ1ZmZlcikgc3RyZWFtcywgXCJsZW5ndGhcIiBpcyBzb21ld2hhdFxuLy8gYXJiaXRyYXJ5LCBhbmQgcGVyaGFwcyBub3QgdmVyeSBtZWFuaW5nZnVsLlxuUmVhZGFibGUucHJvdG90eXBlLl9yZWFkID0gZnVuY3Rpb24obikge1xuICB0aGlzLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKSk7XG59O1xuXG5SZWFkYWJsZS5wcm90b3R5cGUucGlwZSA9IGZ1bmN0aW9uKGRlc3QsIHBpcGVPcHRzKSB7XG4gIHZhciBzcmMgPSB0aGlzO1xuICB2YXIgc3RhdGUgPSB0aGlzLl9yZWFkYWJsZVN0YXRlO1xuXG4gIHN3aXRjaCAoc3RhdGUucGlwZXNDb3VudCkge1xuICAgIGNhc2UgMDpcbiAgICAgIHN0YXRlLnBpcGVzID0gZGVzdDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMTpcbiAgICAgIHN0YXRlLnBpcGVzID0gW3N0YXRlLnBpcGVzLCBkZXN0XTtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBzdGF0ZS5waXBlcy5wdXNoKGRlc3QpO1xuICAgICAgYnJlYWs7XG4gIH1cbiAgc3RhdGUucGlwZXNDb3VudCArPSAxO1xuXG4gIHZhciBkb0VuZCA9ICghcGlwZU9wdHMgfHwgcGlwZU9wdHMuZW5kICE9PSBmYWxzZSkgJiZcbiAgICAgICAgICAgICAgZGVzdCAhPT0gcHJvY2Vzcy5zdGRvdXQgJiZcbiAgICAgICAgICAgICAgZGVzdCAhPT0gcHJvY2Vzcy5zdGRlcnI7XG5cbiAgdmFyIGVuZEZuID0gZG9FbmQgPyBvbmVuZCA6IGNsZWFudXA7XG4gIGlmIChzdGF0ZS5lbmRFbWl0dGVkKVxuICAgIHByb2Nlc3MubmV4dFRpY2soZW5kRm4pO1xuICBlbHNlXG4gICAgc3JjLm9uY2UoJ2VuZCcsIGVuZEZuKTtcblxuICBkZXN0Lm9uKCd1bnBpcGUnLCBvbnVucGlwZSk7XG4gIGZ1bmN0aW9uIG9udW5waXBlKHJlYWRhYmxlKSB7XG4gICAgaWYgKHJlYWRhYmxlICE9PSBzcmMpIHJldHVybjtcbiAgICBjbGVhbnVwKCk7XG4gIH1cblxuICBmdW5jdGlvbiBvbmVuZCgpIHtcbiAgICBkZXN0LmVuZCgpO1xuICB9XG5cbiAgLy8gd2hlbiB0aGUgZGVzdCBkcmFpbnMsIGl0IHJlZHVjZXMgdGhlIGF3YWl0RHJhaW4gY291bnRlclxuICAvLyBvbiB0aGUgc291cmNlLiAgVGhpcyB3b3VsZCBiZSBtb3JlIGVsZWdhbnQgd2l0aCBhIC5vbmNlKClcbiAgLy8gaGFuZGxlciBpbiBmbG93KCksIGJ1dCBhZGRpbmcgYW5kIHJlbW92aW5nIHJlcGVhdGVkbHkgaXNcbiAgLy8gdG9vIHNsb3cuXG4gIHZhciBvbmRyYWluID0gcGlwZU9uRHJhaW4oc3JjKTtcbiAgZGVzdC5vbignZHJhaW4nLCBvbmRyYWluKTtcblxuICBmdW5jdGlvbiBjbGVhbnVwKCkge1xuICAgIC8vIGNsZWFudXAgZXZlbnQgaGFuZGxlcnMgb25jZSB0aGUgcGlwZSBpcyBicm9rZW5cbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9uY2xvc2UpO1xuICAgIGRlc3QucmVtb3ZlTGlzdGVuZXIoJ2ZpbmlzaCcsIG9uZmluaXNoKTtcbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdkcmFpbicsIG9uZHJhaW4pO1xuICAgIGRlc3QucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgb25lcnJvcik7XG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcigndW5waXBlJywgb251bnBpcGUpO1xuICAgIHNyYy5yZW1vdmVMaXN0ZW5lcignZW5kJywgb25lbmQpO1xuICAgIHNyYy5yZW1vdmVMaXN0ZW5lcignZW5kJywgY2xlYW51cCk7XG5cbiAgICAvLyBpZiB0aGUgcmVhZGVyIGlzIHdhaXRpbmcgZm9yIGEgZHJhaW4gZXZlbnQgZnJvbSB0aGlzXG4gICAgLy8gc3BlY2lmaWMgd3JpdGVyLCB0aGVuIGl0IHdvdWxkIGNhdXNlIGl0IHRvIG5ldmVyIHN0YXJ0XG4gICAgLy8gZmxvd2luZyBhZ2Fpbi5cbiAgICAvLyBTbywgaWYgdGhpcyBpcyBhd2FpdGluZyBhIGRyYWluLCB0aGVuIHdlIGp1c3QgY2FsbCBpdCBub3cuXG4gICAgLy8gSWYgd2UgZG9uJ3Qga25vdywgdGhlbiBhc3N1bWUgdGhhdCB3ZSBhcmUgd2FpdGluZyBmb3Igb25lLlxuICAgIGlmICghZGVzdC5fd3JpdGFibGVTdGF0ZSB8fCBkZXN0Ll93cml0YWJsZVN0YXRlLm5lZWREcmFpbilcbiAgICAgIG9uZHJhaW4oKTtcbiAgfVxuXG4gIC8vIGlmIHRoZSBkZXN0IGhhcyBhbiBlcnJvciwgdGhlbiBzdG9wIHBpcGluZyBpbnRvIGl0LlxuICAvLyBob3dldmVyLCBkb24ndCBzdXBwcmVzcyB0aGUgdGhyb3dpbmcgYmVoYXZpb3IgZm9yIHRoaXMuXG4gIGZ1bmN0aW9uIG9uZXJyb3IoZXIpIHtcbiAgICB1bnBpcGUoKTtcbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIG9uZXJyb3IpO1xuICAgIGlmIChFRS5saXN0ZW5lckNvdW50KGRlc3QsICdlcnJvcicpID09PSAwKVxuICAgICAgZGVzdC5lbWl0KCdlcnJvcicsIGVyKTtcbiAgfVxuICAvLyBUaGlzIGlzIGEgYnJ1dGFsbHkgdWdseSBoYWNrIHRvIG1ha2Ugc3VyZSB0aGF0IG91ciBlcnJvciBoYW5kbGVyXG4gIC8vIGlzIGF0dGFjaGVkIGJlZm9yZSBhbnkgdXNlcmxhbmQgb25lcy4gIE5FVkVSIERPIFRISVMuXG4gIGlmICghZGVzdC5fZXZlbnRzIHx8ICFkZXN0Ll9ldmVudHMuZXJyb3IpXG4gICAgZGVzdC5vbignZXJyb3InLCBvbmVycm9yKTtcbiAgZWxzZSBpZiAoaXNBcnJheShkZXN0Ll9ldmVudHMuZXJyb3IpKVxuICAgIGRlc3QuX2V2ZW50cy5lcnJvci51bnNoaWZ0KG9uZXJyb3IpO1xuICBlbHNlXG4gICAgZGVzdC5fZXZlbnRzLmVycm9yID0gW29uZXJyb3IsIGRlc3QuX2V2ZW50cy5lcnJvcl07XG5cblxuXG4gIC8vIEJvdGggY2xvc2UgYW5kIGZpbmlzaCBzaG91bGQgdHJpZ2dlciB1bnBpcGUsIGJ1dCBvbmx5IG9uY2UuXG4gIGZ1bmN0aW9uIG9uY2xvc2UoKSB7XG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignZmluaXNoJywgb25maW5pc2gpO1xuICAgIHVucGlwZSgpO1xuICB9XG4gIGRlc3Qub25jZSgnY2xvc2UnLCBvbmNsb3NlKTtcbiAgZnVuY3Rpb24gb25maW5pc2goKSB7XG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignY2xvc2UnLCBvbmNsb3NlKTtcbiAgICB1bnBpcGUoKTtcbiAgfVxuICBkZXN0Lm9uY2UoJ2ZpbmlzaCcsIG9uZmluaXNoKTtcblxuICBmdW5jdGlvbiB1bnBpcGUoKSB7XG4gICAgc3JjLnVucGlwZShkZXN0KTtcbiAgfVxuXG4gIC8vIHRlbGwgdGhlIGRlc3QgdGhhdCBpdCdzIGJlaW5nIHBpcGVkIHRvXG4gIGRlc3QuZW1pdCgncGlwZScsIHNyYyk7XG5cbiAgLy8gc3RhcnQgdGhlIGZsb3cgaWYgaXQgaGFzbid0IGJlZW4gc3RhcnRlZCBhbHJlYWR5LlxuICBpZiAoIXN0YXRlLmZsb3dpbmcpIHtcbiAgICAvLyB0aGUgaGFuZGxlciB0aGF0IHdhaXRzIGZvciByZWFkYWJsZSBldmVudHMgYWZ0ZXIgYWxsXG4gICAgLy8gdGhlIGRhdGEgZ2V0cyBzdWNrZWQgb3V0IGluIGZsb3cuXG4gICAgLy8gVGhpcyB3b3VsZCBiZSBlYXNpZXIgdG8gZm9sbG93IHdpdGggYSAub25jZSgpIGhhbmRsZXJcbiAgICAvLyBpbiBmbG93KCksIGJ1dCB0aGF0IGlzIHRvbyBzbG93LlxuICAgIHRoaXMub24oJ3JlYWRhYmxlJywgcGlwZU9uUmVhZGFibGUpO1xuXG4gICAgc3RhdGUuZmxvd2luZyA9IHRydWU7XG4gICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgIGZsb3coc3JjKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBkZXN0O1xufTtcblxuZnVuY3Rpb24gcGlwZU9uRHJhaW4oc3JjKSB7XG4gIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICB2YXIgZGVzdCA9IHRoaXM7XG4gICAgdmFyIHN0YXRlID0gc3JjLl9yZWFkYWJsZVN0YXRlO1xuICAgIHN0YXRlLmF3YWl0RHJhaW4tLTtcbiAgICBpZiAoc3RhdGUuYXdhaXREcmFpbiA9PT0gMClcbiAgICAgIGZsb3coc3JjKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gZmxvdyhzcmMpIHtcbiAgdmFyIHN0YXRlID0gc3JjLl9yZWFkYWJsZVN0YXRlO1xuICB2YXIgY2h1bms7XG4gIHN0YXRlLmF3YWl0RHJhaW4gPSAwO1xuXG4gIGZ1bmN0aW9uIHdyaXRlKGRlc3QsIGksIGxpc3QpIHtcbiAgICB2YXIgd3JpdHRlbiA9IGRlc3Qud3JpdGUoY2h1bmspO1xuICAgIGlmIChmYWxzZSA9PT0gd3JpdHRlbikge1xuICAgICAgc3RhdGUuYXdhaXREcmFpbisrO1xuICAgIH1cbiAgfVxuXG4gIHdoaWxlIChzdGF0ZS5waXBlc0NvdW50ICYmIG51bGwgIT09IChjaHVuayA9IHNyYy5yZWFkKCkpKSB7XG5cbiAgICBpZiAoc3RhdGUucGlwZXNDb3VudCA9PT0gMSlcbiAgICAgIHdyaXRlKHN0YXRlLnBpcGVzLCAwLCBudWxsKTtcbiAgICBlbHNlXG4gICAgICBmb3JFYWNoKHN0YXRlLnBpcGVzLCB3cml0ZSk7XG5cbiAgICBzcmMuZW1pdCgnZGF0YScsIGNodW5rKTtcblxuICAgIC8vIGlmIGFueW9uZSBuZWVkcyBhIGRyYWluLCB0aGVuIHdlIGhhdmUgdG8gd2FpdCBmb3IgdGhhdC5cbiAgICBpZiAoc3RhdGUuYXdhaXREcmFpbiA+IDApXG4gICAgICByZXR1cm47XG4gIH1cblxuICAvLyBpZiBldmVyeSBkZXN0aW5hdGlvbiB3YXMgdW5waXBlZCwgZWl0aGVyIGJlZm9yZSBlbnRlcmluZyB0aGlzXG4gIC8vIGZ1bmN0aW9uLCBvciBpbiB0aGUgd2hpbGUgbG9vcCwgdGhlbiBzdG9wIGZsb3dpbmcuXG4gIC8vXG4gIC8vIE5COiBUaGlzIGlzIGEgcHJldHR5IHJhcmUgZWRnZSBjYXNlLlxuICBpZiAoc3RhdGUucGlwZXNDb3VudCA9PT0gMCkge1xuICAgIHN0YXRlLmZsb3dpbmcgPSBmYWxzZTtcblxuICAgIC8vIGlmIHRoZXJlIHdlcmUgZGF0YSBldmVudCBsaXN0ZW5lcnMgYWRkZWQsIHRoZW4gc3dpdGNoIHRvIG9sZCBtb2RlLlxuICAgIGlmIChFRS5saXN0ZW5lckNvdW50KHNyYywgJ2RhdGEnKSA+IDApXG4gICAgICBlbWl0RGF0YUV2ZW50cyhzcmMpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIGF0IHRoaXMgcG9pbnQsIG5vIG9uZSBuZWVkZWQgYSBkcmFpbiwgc28gd2UganVzdCByYW4gb3V0IG9mIGRhdGFcbiAgLy8gb24gdGhlIG5leHQgcmVhZGFibGUgZXZlbnQsIHN0YXJ0IGl0IG92ZXIgYWdhaW4uXG4gIHN0YXRlLnJhbk91dCA9IHRydWU7XG59XG5cbmZ1bmN0aW9uIHBpcGVPblJlYWRhYmxlKCkge1xuICBpZiAodGhpcy5fcmVhZGFibGVTdGF0ZS5yYW5PdXQpIHtcbiAgICB0aGlzLl9yZWFkYWJsZVN0YXRlLnJhbk91dCA9IGZhbHNlO1xuICAgIGZsb3codGhpcyk7XG4gIH1cbn1cblxuXG5SZWFkYWJsZS5wcm90b3R5cGUudW5waXBlID0gZnVuY3Rpb24oZGVzdCkge1xuICB2YXIgc3RhdGUgPSB0aGlzLl9yZWFkYWJsZVN0YXRlO1xuXG4gIC8vIGlmIHdlJ3JlIG5vdCBwaXBpbmcgYW55d2hlcmUsIHRoZW4gZG8gbm90aGluZy5cbiAgaWYgKHN0YXRlLnBpcGVzQ291bnQgPT09IDApXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgLy8ganVzdCBvbmUgZGVzdGluYXRpb24uICBtb3N0IGNvbW1vbiBjYXNlLlxuICBpZiAoc3RhdGUucGlwZXNDb3VudCA9PT0gMSkge1xuICAgIC8vIHBhc3NlZCBpbiBvbmUsIGJ1dCBpdCdzIG5vdCB0aGUgcmlnaHQgb25lLlxuICAgIGlmIChkZXN0ICYmIGRlc3QgIT09IHN0YXRlLnBpcGVzKVxuICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICBpZiAoIWRlc3QpXG4gICAgICBkZXN0ID0gc3RhdGUucGlwZXM7XG5cbiAgICAvLyBnb3QgYSBtYXRjaC5cbiAgICBzdGF0ZS5waXBlcyA9IG51bGw7XG4gICAgc3RhdGUucGlwZXNDb3VudCA9IDA7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcigncmVhZGFibGUnLCBwaXBlT25SZWFkYWJsZSk7XG4gICAgc3RhdGUuZmxvd2luZyA9IGZhbHNlO1xuICAgIGlmIChkZXN0KVxuICAgICAgZGVzdC5lbWl0KCd1bnBpcGUnLCB0aGlzKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIHNsb3cgY2FzZS4gbXVsdGlwbGUgcGlwZSBkZXN0aW5hdGlvbnMuXG5cbiAgaWYgKCFkZXN0KSB7XG4gICAgLy8gcmVtb3ZlIGFsbC5cbiAgICB2YXIgZGVzdHMgPSBzdGF0ZS5waXBlcztcbiAgICB2YXIgbGVuID0gc3RhdGUucGlwZXNDb3VudDtcbiAgICBzdGF0ZS5waXBlcyA9IG51bGw7XG4gICAgc3RhdGUucGlwZXNDb3VudCA9IDA7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcigncmVhZGFibGUnLCBwaXBlT25SZWFkYWJsZSk7XG4gICAgc3RhdGUuZmxvd2luZyA9IGZhbHNlO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIGRlc3RzW2ldLmVtaXQoJ3VucGlwZScsIHRoaXMpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gdHJ5IHRvIGZpbmQgdGhlIHJpZ2h0IG9uZS5cbiAgdmFyIGkgPSBpbmRleE9mKHN0YXRlLnBpcGVzLCBkZXN0KTtcbiAgaWYgKGkgPT09IC0xKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIHN0YXRlLnBpcGVzLnNwbGljZShpLCAxKTtcbiAgc3RhdGUucGlwZXNDb3VudCAtPSAxO1xuICBpZiAoc3RhdGUucGlwZXNDb3VudCA9PT0gMSlcbiAgICBzdGF0ZS5waXBlcyA9IHN0YXRlLnBpcGVzWzBdO1xuXG4gIGRlc3QuZW1pdCgndW5waXBlJywgdGhpcyk7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBzZXQgdXAgZGF0YSBldmVudHMgaWYgdGhleSBhcmUgYXNrZWQgZm9yXG4vLyBFbnN1cmUgcmVhZGFibGUgbGlzdGVuZXJzIGV2ZW50dWFsbHkgZ2V0IHNvbWV0aGluZ1xuUmVhZGFibGUucHJvdG90eXBlLm9uID0gZnVuY3Rpb24oZXYsIGZuKSB7XG4gIHZhciByZXMgPSBTdHJlYW0ucHJvdG90eXBlLm9uLmNhbGwodGhpcywgZXYsIGZuKTtcblxuICBpZiAoZXYgPT09ICdkYXRhJyAmJiAhdGhpcy5fcmVhZGFibGVTdGF0ZS5mbG93aW5nKVxuICAgIGVtaXREYXRhRXZlbnRzKHRoaXMpO1xuXG4gIGlmIChldiA9PT0gJ3JlYWRhYmxlJyAmJiB0aGlzLnJlYWRhYmxlKSB7XG4gICAgdmFyIHN0YXRlID0gdGhpcy5fcmVhZGFibGVTdGF0ZTtcbiAgICBpZiAoIXN0YXRlLnJlYWRhYmxlTGlzdGVuaW5nKSB7XG4gICAgICBzdGF0ZS5yZWFkYWJsZUxpc3RlbmluZyA9IHRydWU7XG4gICAgICBzdGF0ZS5lbWl0dGVkUmVhZGFibGUgPSBmYWxzZTtcbiAgICAgIHN0YXRlLm5lZWRSZWFkYWJsZSA9IHRydWU7XG4gICAgICBpZiAoIXN0YXRlLnJlYWRpbmcpIHtcbiAgICAgICAgdGhpcy5yZWFkKDApO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5sZW5ndGgpIHtcbiAgICAgICAgZW1pdFJlYWRhYmxlKHRoaXMsIHN0YXRlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzO1xufTtcblJlYWRhYmxlLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IFJlYWRhYmxlLnByb3RvdHlwZS5vbjtcblxuLy8gcGF1c2UoKSBhbmQgcmVzdW1lKCkgYXJlIHJlbW5hbnRzIG9mIHRoZSBsZWdhY3kgcmVhZGFibGUgc3RyZWFtIEFQSVxuLy8gSWYgdGhlIHVzZXIgdXNlcyB0aGVtLCB0aGVuIHN3aXRjaCBpbnRvIG9sZCBtb2RlLlxuUmVhZGFibGUucHJvdG90eXBlLnJlc3VtZSA9IGZ1bmN0aW9uKCkge1xuICBlbWl0RGF0YUV2ZW50cyh0aGlzKTtcbiAgdGhpcy5yZWFkKDApO1xuICB0aGlzLmVtaXQoJ3Jlc3VtZScpO1xufTtcblxuUmVhZGFibGUucHJvdG90eXBlLnBhdXNlID0gZnVuY3Rpb24oKSB7XG4gIGVtaXREYXRhRXZlbnRzKHRoaXMsIHRydWUpO1xuICB0aGlzLmVtaXQoJ3BhdXNlJyk7XG59O1xuXG5mdW5jdGlvbiBlbWl0RGF0YUV2ZW50cyhzdHJlYW0sIHN0YXJ0UGF1c2VkKSB7XG4gIHZhciBzdGF0ZSA9IHN0cmVhbS5fcmVhZGFibGVTdGF0ZTtcblxuICBpZiAoc3RhdGUuZmxvd2luZykge1xuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9pc2FhY3MvcmVhZGFibGUtc3RyZWFtL2lzc3Vlcy8xNlxuICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IHN3aXRjaCB0byBvbGQgbW9kZSBub3cuJyk7XG4gIH1cblxuICB2YXIgcGF1c2VkID0gc3RhcnRQYXVzZWQgfHwgZmFsc2U7XG4gIHZhciByZWFkYWJsZSA9IGZhbHNlO1xuXG4gIC8vIGNvbnZlcnQgdG8gYW4gb2xkLXN0eWxlIHN0cmVhbS5cbiAgc3RyZWFtLnJlYWRhYmxlID0gdHJ1ZTtcbiAgc3RyZWFtLnBpcGUgPSBTdHJlYW0ucHJvdG90eXBlLnBpcGU7XG4gIHN0cmVhbS5vbiA9IHN0cmVhbS5hZGRMaXN0ZW5lciA9IFN0cmVhbS5wcm90b3R5cGUub247XG5cbiAgc3RyZWFtLm9uKCdyZWFkYWJsZScsIGZ1bmN0aW9uKCkge1xuICAgIHJlYWRhYmxlID0gdHJ1ZTtcblxuICAgIHZhciBjO1xuICAgIHdoaWxlICghcGF1c2VkICYmIChudWxsICE9PSAoYyA9IHN0cmVhbS5yZWFkKCkpKSlcbiAgICAgIHN0cmVhbS5lbWl0KCdkYXRhJywgYyk7XG5cbiAgICBpZiAoYyA9PT0gbnVsbCkge1xuICAgICAgcmVhZGFibGUgPSBmYWxzZTtcbiAgICAgIHN0cmVhbS5fcmVhZGFibGVTdGF0ZS5uZWVkUmVhZGFibGUgPSB0cnVlO1xuICAgIH1cbiAgfSk7XG5cbiAgc3RyZWFtLnBhdXNlID0gZnVuY3Rpb24oKSB7XG4gICAgcGF1c2VkID0gdHJ1ZTtcbiAgICB0aGlzLmVtaXQoJ3BhdXNlJyk7XG4gIH07XG5cbiAgc3RyZWFtLnJlc3VtZSA9IGZ1bmN0aW9uKCkge1xuICAgIHBhdXNlZCA9IGZhbHNlO1xuICAgIGlmIChyZWFkYWJsZSlcbiAgICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgIHN0cmVhbS5lbWl0KCdyZWFkYWJsZScpO1xuICAgICAgfSk7XG4gICAgZWxzZVxuICAgICAgdGhpcy5yZWFkKDApO1xuICAgIHRoaXMuZW1pdCgncmVzdW1lJyk7XG4gIH07XG5cbiAgLy8gbm93IG1ha2UgaXQgc3RhcnQsIGp1c3QgaW4gY2FzZSBpdCBoYWRuJ3QgYWxyZWFkeS5cbiAgc3RyZWFtLmVtaXQoJ3JlYWRhYmxlJyk7XG59XG5cbi8vIHdyYXAgYW4gb2xkLXN0eWxlIHN0cmVhbSBhcyB0aGUgYXN5bmMgZGF0YSBzb3VyY2UuXG4vLyBUaGlzIGlzICpub3QqIHBhcnQgb2YgdGhlIHJlYWRhYmxlIHN0cmVhbSBpbnRlcmZhY2UuXG4vLyBJdCBpcyBhbiB1Z2x5IHVuZm9ydHVuYXRlIG1lc3Mgb2YgaGlzdG9yeS5cblJlYWRhYmxlLnByb3RvdHlwZS53cmFwID0gZnVuY3Rpb24oc3RyZWFtKSB7XG4gIHZhciBzdGF0ZSA9IHRoaXMuX3JlYWRhYmxlU3RhdGU7XG4gIHZhciBwYXVzZWQgPSBmYWxzZTtcblxuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHN0cmVhbS5vbignZW5kJywgZnVuY3Rpb24oKSB7XG4gICAgaWYgKHN0YXRlLmRlY29kZXIgJiYgIXN0YXRlLmVuZGVkKSB7XG4gICAgICB2YXIgY2h1bmsgPSBzdGF0ZS5kZWNvZGVyLmVuZCgpO1xuICAgICAgaWYgKGNodW5rICYmIGNodW5rLmxlbmd0aClcbiAgICAgICAgc2VsZi5wdXNoKGNodW5rKTtcbiAgICB9XG5cbiAgICBzZWxmLnB1c2gobnVsbCk7XG4gIH0pO1xuXG4gIHN0cmVhbS5vbignZGF0YScsIGZ1bmN0aW9uKGNodW5rKSB7XG4gICAgaWYgKHN0YXRlLmRlY29kZXIpXG4gICAgICBjaHVuayA9IHN0YXRlLmRlY29kZXIud3JpdGUoY2h1bmspO1xuXG4gICAgLy8gZG9uJ3Qgc2tpcCBvdmVyIGZhbHN5IHZhbHVlcyBpbiBvYmplY3RNb2RlXG4gICAgLy9pZiAoc3RhdGUub2JqZWN0TW9kZSAmJiB1dGlsLmlzTnVsbE9yVW5kZWZpbmVkKGNodW5rKSlcbiAgICBpZiAoc3RhdGUub2JqZWN0TW9kZSAmJiAoY2h1bmsgPT09IG51bGwgfHwgY2h1bmsgPT09IHVuZGVmaW5lZCkpXG4gICAgICByZXR1cm47XG4gICAgZWxzZSBpZiAoIXN0YXRlLm9iamVjdE1vZGUgJiYgKCFjaHVuayB8fCAhY2h1bmsubGVuZ3RoKSlcbiAgICAgIHJldHVybjtcblxuICAgIHZhciByZXQgPSBzZWxmLnB1c2goY2h1bmspO1xuICAgIGlmICghcmV0KSB7XG4gICAgICBwYXVzZWQgPSB0cnVlO1xuICAgICAgc3RyZWFtLnBhdXNlKCk7XG4gICAgfVxuICB9KTtcblxuICAvLyBwcm94eSBhbGwgdGhlIG90aGVyIG1ldGhvZHMuXG4gIC8vIGltcG9ydGFudCB3aGVuIHdyYXBwaW5nIGZpbHRlcnMgYW5kIGR1cGxleGVzLlxuICBmb3IgKHZhciBpIGluIHN0cmVhbSkge1xuICAgIGlmICh0eXBlb2Ygc3RyZWFtW2ldID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgIHR5cGVvZiB0aGlzW2ldID09PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhpc1tpXSA9IGZ1bmN0aW9uKG1ldGhvZCkgeyByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBzdHJlYW1bbWV0aG9kXS5hcHBseShzdHJlYW0sIGFyZ3VtZW50cyk7XG4gICAgICB9fShpKTtcbiAgICB9XG4gIH1cblxuICAvLyBwcm94eSBjZXJ0YWluIGltcG9ydGFudCBldmVudHMuXG4gIHZhciBldmVudHMgPSBbJ2Vycm9yJywgJ2Nsb3NlJywgJ2Rlc3Ryb3knLCAncGF1c2UnLCAncmVzdW1lJ107XG4gIGZvckVhY2goZXZlbnRzLCBmdW5jdGlvbihldikge1xuICAgIHN0cmVhbS5vbihldiwgc2VsZi5lbWl0LmJpbmQoc2VsZiwgZXYpKTtcbiAgfSk7XG5cbiAgLy8gd2hlbiB3ZSB0cnkgdG8gY29uc3VtZSBzb21lIG1vcmUgYnl0ZXMsIHNpbXBseSB1bnBhdXNlIHRoZVxuICAvLyB1bmRlcmx5aW5nIHN0cmVhbS5cbiAgc2VsZi5fcmVhZCA9IGZ1bmN0aW9uKG4pIHtcbiAgICBpZiAocGF1c2VkKSB7XG4gICAgICBwYXVzZWQgPSBmYWxzZTtcbiAgICAgIHN0cmVhbS5yZXN1bWUoKTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIHNlbGY7XG59O1xuXG5cblxuLy8gZXhwb3NlZCBmb3IgdGVzdGluZyBwdXJwb3NlcyBvbmx5LlxuUmVhZGFibGUuX2Zyb21MaXN0ID0gZnJvbUxpc3Q7XG5cbi8vIFBsdWNrIG9mZiBuIGJ5dGVzIGZyb20gYW4gYXJyYXkgb2YgYnVmZmVycy5cbi8vIExlbmd0aCBpcyB0aGUgY29tYmluZWQgbGVuZ3RocyBvZiBhbGwgdGhlIGJ1ZmZlcnMgaW4gdGhlIGxpc3QuXG5mdW5jdGlvbiBmcm9tTGlzdChuLCBzdGF0ZSkge1xuICB2YXIgbGlzdCA9IHN0YXRlLmJ1ZmZlcjtcbiAgdmFyIGxlbmd0aCA9IHN0YXRlLmxlbmd0aDtcbiAgdmFyIHN0cmluZ01vZGUgPSAhIXN0YXRlLmRlY29kZXI7XG4gIHZhciBvYmplY3RNb2RlID0gISFzdGF0ZS5vYmplY3RNb2RlO1xuICB2YXIgcmV0O1xuXG4gIC8vIG5vdGhpbmcgaW4gdGhlIGxpc3QsIGRlZmluaXRlbHkgZW1wdHkuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMClcbiAgICByZXR1cm4gbnVsbDtcblxuICBpZiAobGVuZ3RoID09PSAwKVxuICAgIHJldCA9IG51bGw7XG4gIGVsc2UgaWYgKG9iamVjdE1vZGUpXG4gICAgcmV0ID0gbGlzdC5zaGlmdCgpO1xuICBlbHNlIGlmICghbiB8fCBuID49IGxlbmd0aCkge1xuICAgIC8vIHJlYWQgaXQgYWxsLCB0cnVuY2F0ZSB0aGUgYXJyYXkuXG4gICAgaWYgKHN0cmluZ01vZGUpXG4gICAgICByZXQgPSBsaXN0LmpvaW4oJycpO1xuICAgIGVsc2VcbiAgICAgIHJldCA9IEJ1ZmZlci5jb25jYXQobGlzdCwgbGVuZ3RoKTtcbiAgICBsaXN0Lmxlbmd0aCA9IDA7XG4gIH0gZWxzZSB7XG4gICAgLy8gcmVhZCBqdXN0IHNvbWUgb2YgaXQuXG4gICAgaWYgKG4gPCBsaXN0WzBdLmxlbmd0aCkge1xuICAgICAgLy8ganVzdCB0YWtlIGEgcGFydCBvZiB0aGUgZmlyc3QgbGlzdCBpdGVtLlxuICAgICAgLy8gc2xpY2UgaXMgdGhlIHNhbWUgZm9yIGJ1ZmZlcnMgYW5kIHN0cmluZ3MuXG4gICAgICB2YXIgYnVmID0gbGlzdFswXTtcbiAgICAgIHJldCA9IGJ1Zi5zbGljZSgwLCBuKTtcbiAgICAgIGxpc3RbMF0gPSBidWYuc2xpY2Uobik7XG4gICAgfSBlbHNlIGlmIChuID09PSBsaXN0WzBdLmxlbmd0aCkge1xuICAgICAgLy8gZmlyc3QgbGlzdCBpcyBhIHBlcmZlY3QgbWF0Y2hcbiAgICAgIHJldCA9IGxpc3Quc2hpZnQoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gY29tcGxleCBjYXNlLlxuICAgICAgLy8gd2UgaGF2ZSBlbm91Z2ggdG8gY292ZXIgaXQsIGJ1dCBpdCBzcGFucyBwYXN0IHRoZSBmaXJzdCBidWZmZXIuXG4gICAgICBpZiAoc3RyaW5nTW9kZSlcbiAgICAgICAgcmV0ID0gJyc7XG4gICAgICBlbHNlXG4gICAgICAgIHJldCA9IG5ldyBCdWZmZXIobik7XG5cbiAgICAgIHZhciBjID0gMDtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gbGlzdC5sZW5ndGg7IGkgPCBsICYmIGMgPCBuOyBpKyspIHtcbiAgICAgICAgdmFyIGJ1ZiA9IGxpc3RbMF07XG4gICAgICAgIHZhciBjcHkgPSBNYXRoLm1pbihuIC0gYywgYnVmLmxlbmd0aCk7XG5cbiAgICAgICAgaWYgKHN0cmluZ01vZGUpXG4gICAgICAgICAgcmV0ICs9IGJ1Zi5zbGljZSgwLCBjcHkpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgYnVmLmNvcHkocmV0LCBjLCAwLCBjcHkpO1xuXG4gICAgICAgIGlmIChjcHkgPCBidWYubGVuZ3RoKVxuICAgICAgICAgIGxpc3RbMF0gPSBidWYuc2xpY2UoY3B5KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgIGxpc3Quc2hpZnQoKTtcblxuICAgICAgICBjICs9IGNweTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmV0O1xufVxuXG5mdW5jdGlvbiBlbmRSZWFkYWJsZShzdHJlYW0pIHtcbiAgdmFyIHN0YXRlID0gc3RyZWFtLl9yZWFkYWJsZVN0YXRlO1xuXG4gIC8vIElmIHdlIGdldCBoZXJlIGJlZm9yZSBjb25zdW1pbmcgYWxsIHRoZSBieXRlcywgdGhlbiB0aGF0IGlzIGFcbiAgLy8gYnVnIGluIG5vZGUuICBTaG91bGQgbmV2ZXIgaGFwcGVuLlxuICBpZiAoc3RhdGUubGVuZ3RoID4gMClcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2VuZFJlYWRhYmxlIGNhbGxlZCBvbiBub24tZW1wdHkgc3RyZWFtJyk7XG5cbiAgaWYgKCFzdGF0ZS5lbmRFbWl0dGVkICYmIHN0YXRlLmNhbGxlZFJlYWQpIHtcbiAgICBzdGF0ZS5lbmRlZCA9IHRydWU7XG4gICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgIC8vIENoZWNrIHRoYXQgd2UgZGlkbid0IGdldCBvbmUgbGFzdCB1bnNoaWZ0LlxuICAgICAgaWYgKCFzdGF0ZS5lbmRFbWl0dGVkICYmIHN0YXRlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBzdGF0ZS5lbmRFbWl0dGVkID0gdHJ1ZTtcbiAgICAgICAgc3RyZWFtLnJlYWRhYmxlID0gZmFsc2U7XG4gICAgICAgIHN0cmVhbS5lbWl0KCdlbmQnKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoICh4cywgZikge1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHhzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGYoeHNbaV0sIGkpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGluZGV4T2YgKHhzLCB4KSB7XG4gIGZvciAodmFyIGkgPSAwLCBsID0geHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgaWYgKHhzW2ldID09PSB4KSByZXR1cm4gaTtcbiAgfVxuICByZXR1cm4gLTE7XG59XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuXG4vLyBhIHRyYW5zZm9ybSBzdHJlYW0gaXMgYSByZWFkYWJsZS93cml0YWJsZSBzdHJlYW0gd2hlcmUgeW91IGRvXG4vLyBzb21ldGhpbmcgd2l0aCB0aGUgZGF0YS4gIFNvbWV0aW1lcyBpdCdzIGNhbGxlZCBhIFwiZmlsdGVyXCIsXG4vLyBidXQgdGhhdCdzIG5vdCBhIGdyZWF0IG5hbWUgZm9yIGl0LCBzaW5jZSB0aGF0IGltcGxpZXMgYSB0aGluZyB3aGVyZVxuLy8gc29tZSBiaXRzIHBhc3MgdGhyb3VnaCwgYW5kIG90aGVycyBhcmUgc2ltcGx5IGlnbm9yZWQuICAoVGhhdCB3b3VsZFxuLy8gYmUgYSB2YWxpZCBleGFtcGxlIG9mIGEgdHJhbnNmb3JtLCBvZiBjb3Vyc2UuKVxuLy9cbi8vIFdoaWxlIHRoZSBvdXRwdXQgaXMgY2F1c2FsbHkgcmVsYXRlZCB0byB0aGUgaW5wdXQsIGl0J3Mgbm90IGFcbi8vIG5lY2Vzc2FyaWx5IHN5bW1ldHJpYyBvciBzeW5jaHJvbm91cyB0cmFuc2Zvcm1hdGlvbi4gIEZvciBleGFtcGxlLFxuLy8gYSB6bGliIHN0cmVhbSBtaWdodCB0YWtlIG11bHRpcGxlIHBsYWluLXRleHQgd3JpdGVzKCksIGFuZCB0aGVuXG4vLyBlbWl0IGEgc2luZ2xlIGNvbXByZXNzZWQgY2h1bmsgc29tZSB0aW1lIGluIHRoZSBmdXR1cmUuXG4vL1xuLy8gSGVyZSdzIGhvdyB0aGlzIHdvcmtzOlxuLy9cbi8vIFRoZSBUcmFuc2Zvcm0gc3RyZWFtIGhhcyBhbGwgdGhlIGFzcGVjdHMgb2YgdGhlIHJlYWRhYmxlIGFuZCB3cml0YWJsZVxuLy8gc3RyZWFtIGNsYXNzZXMuICBXaGVuIHlvdSB3cml0ZShjaHVuayksIHRoYXQgY2FsbHMgX3dyaXRlKGNodW5rLGNiKVxuLy8gaW50ZXJuYWxseSwgYW5kIHJldHVybnMgZmFsc2UgaWYgdGhlcmUncyBhIGxvdCBvZiBwZW5kaW5nIHdyaXRlc1xuLy8gYnVmZmVyZWQgdXAuICBXaGVuIHlvdSBjYWxsIHJlYWQoKSwgdGhhdCBjYWxscyBfcmVhZChuKSB1bnRpbFxuLy8gdGhlcmUncyBlbm91Z2ggcGVuZGluZyByZWFkYWJsZSBkYXRhIGJ1ZmZlcmVkIHVwLlxuLy9cbi8vIEluIGEgdHJhbnNmb3JtIHN0cmVhbSwgdGhlIHdyaXR0ZW4gZGF0YSBpcyBwbGFjZWQgaW4gYSBidWZmZXIuICBXaGVuXG4vLyBfcmVhZChuKSBpcyBjYWxsZWQsIGl0IHRyYW5zZm9ybXMgdGhlIHF1ZXVlZCB1cCBkYXRhLCBjYWxsaW5nIHRoZVxuLy8gYnVmZmVyZWQgX3dyaXRlIGNiJ3MgYXMgaXQgY29uc3VtZXMgY2h1bmtzLiAgSWYgY29uc3VtaW5nIGEgc2luZ2xlXG4vLyB3cml0dGVuIGNodW5rIHdvdWxkIHJlc3VsdCBpbiBtdWx0aXBsZSBvdXRwdXQgY2h1bmtzLCB0aGVuIHRoZSBmaXJzdFxuLy8gb3V0cHV0dGVkIGJpdCBjYWxscyB0aGUgcmVhZGNiLCBhbmQgc3Vic2VxdWVudCBjaHVua3MganVzdCBnbyBpbnRvXG4vLyB0aGUgcmVhZCBidWZmZXIsIGFuZCB3aWxsIGNhdXNlIGl0IHRvIGVtaXQgJ3JlYWRhYmxlJyBpZiBuZWNlc3NhcnkuXG4vL1xuLy8gVGhpcyB3YXksIGJhY2stcHJlc3N1cmUgaXMgYWN0dWFsbHkgZGV0ZXJtaW5lZCBieSB0aGUgcmVhZGluZyBzaWRlLFxuLy8gc2luY2UgX3JlYWQgaGFzIHRvIGJlIGNhbGxlZCB0byBzdGFydCBwcm9jZXNzaW5nIGEgbmV3IGNodW5rLiAgSG93ZXZlcixcbi8vIGEgcGF0aG9sb2dpY2FsIGluZmxhdGUgdHlwZSBvZiB0cmFuc2Zvcm0gY2FuIGNhdXNlIGV4Y2Vzc2l2ZSBidWZmZXJpbmdcbi8vIGhlcmUuICBGb3IgZXhhbXBsZSwgaW1hZ2luZSBhIHN0cmVhbSB3aGVyZSBldmVyeSBieXRlIG9mIGlucHV0IGlzXG4vLyBpbnRlcnByZXRlZCBhcyBhbiBpbnRlZ2VyIGZyb20gMC0yNTUsIGFuZCB0aGVuIHJlc3VsdHMgaW4gdGhhdCBtYW55XG4vLyBieXRlcyBvZiBvdXRwdXQuICBXcml0aW5nIHRoZSA0IGJ5dGVzIHtmZixmZixmZixmZn0gd291bGQgcmVzdWx0IGluXG4vLyAxa2Igb2YgZGF0YSBiZWluZyBvdXRwdXQuICBJbiB0aGlzIGNhc2UsIHlvdSBjb3VsZCB3cml0ZSBhIHZlcnkgc21hbGxcbi8vIGFtb3VudCBvZiBpbnB1dCwgYW5kIGVuZCB1cCB3aXRoIGEgdmVyeSBsYXJnZSBhbW91bnQgb2Ygb3V0cHV0LiAgSW5cbi8vIHN1Y2ggYSBwYXRob2xvZ2ljYWwgaW5mbGF0aW5nIG1lY2hhbmlzbSwgdGhlcmUnZCBiZSBubyB3YXkgdG8gdGVsbFxuLy8gdGhlIHN5c3RlbSB0byBzdG9wIGRvaW5nIHRoZSB0cmFuc2Zvcm0uICBBIHNpbmdsZSA0TUIgd3JpdGUgY291bGRcbi8vIGNhdXNlIHRoZSBzeXN0ZW0gdG8gcnVuIG91dCBvZiBtZW1vcnkuXG4vL1xuLy8gSG93ZXZlciwgZXZlbiBpbiBzdWNoIGEgcGF0aG9sb2dpY2FsIGNhc2UsIG9ubHkgYSBzaW5nbGUgd3JpdHRlbiBjaHVua1xuLy8gd291bGQgYmUgY29uc3VtZWQsIGFuZCB0aGVuIHRoZSByZXN0IHdvdWxkIHdhaXQgKHVuLXRyYW5zZm9ybWVkKSB1bnRpbFxuLy8gdGhlIHJlc3VsdHMgb2YgdGhlIHByZXZpb3VzIHRyYW5zZm9ybWVkIGNodW5rIHdlcmUgY29uc3VtZWQuXG5cbm1vZHVsZS5leHBvcnRzID0gVHJhbnNmb3JtO1xuXG52YXIgRHVwbGV4ID0gcmVxdWlyZSgnLi9fc3RyZWFtX2R1cGxleCcpO1xuXG4vKjxyZXBsYWNlbWVudD4qL1xudmFyIHV0aWwgPSByZXF1aXJlKCdjb3JlLXV0aWwtaXMnKTtcbnV0aWwuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuLyo8L3JlcGxhY2VtZW50PiovXG5cbnV0aWwuaW5oZXJpdHMoVHJhbnNmb3JtLCBEdXBsZXgpO1xuXG5cbmZ1bmN0aW9uIFRyYW5zZm9ybVN0YXRlKG9wdGlvbnMsIHN0cmVhbSkge1xuICB0aGlzLmFmdGVyVHJhbnNmb3JtID0gZnVuY3Rpb24oZXIsIGRhdGEpIHtcbiAgICByZXR1cm4gYWZ0ZXJUcmFuc2Zvcm0oc3RyZWFtLCBlciwgZGF0YSk7XG4gIH07XG5cbiAgdGhpcy5uZWVkVHJhbnNmb3JtID0gZmFsc2U7XG4gIHRoaXMudHJhbnNmb3JtaW5nID0gZmFsc2U7XG4gIHRoaXMud3JpdGVjYiA9IG51bGw7XG4gIHRoaXMud3JpdGVjaHVuayA9IG51bGw7XG59XG5cbmZ1bmN0aW9uIGFmdGVyVHJhbnNmb3JtKHN0cmVhbSwgZXIsIGRhdGEpIHtcbiAgdmFyIHRzID0gc3RyZWFtLl90cmFuc2Zvcm1TdGF0ZTtcbiAgdHMudHJhbnNmb3JtaW5nID0gZmFsc2U7XG5cbiAgdmFyIGNiID0gdHMud3JpdGVjYjtcblxuICBpZiAoIWNiKVxuICAgIHJldHVybiBzdHJlYW0uZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IoJ25vIHdyaXRlY2IgaW4gVHJhbnNmb3JtIGNsYXNzJykpO1xuXG4gIHRzLndyaXRlY2h1bmsgPSBudWxsO1xuICB0cy53cml0ZWNiID0gbnVsbDtcblxuICBpZiAoZGF0YSAhPT0gbnVsbCAmJiBkYXRhICE9PSB1bmRlZmluZWQpXG4gICAgc3RyZWFtLnB1c2goZGF0YSk7XG5cbiAgaWYgKGNiKVxuICAgIGNiKGVyKTtcblxuICB2YXIgcnMgPSBzdHJlYW0uX3JlYWRhYmxlU3RhdGU7XG4gIHJzLnJlYWRpbmcgPSBmYWxzZTtcbiAgaWYgKHJzLm5lZWRSZWFkYWJsZSB8fCBycy5sZW5ndGggPCBycy5oaWdoV2F0ZXJNYXJrKSB7XG4gICAgc3RyZWFtLl9yZWFkKHJzLmhpZ2hXYXRlck1hcmspO1xuICB9XG59XG5cblxuZnVuY3Rpb24gVHJhbnNmb3JtKG9wdGlvbnMpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFRyYW5zZm9ybSkpXG4gICAgcmV0dXJuIG5ldyBUcmFuc2Zvcm0ob3B0aW9ucyk7XG5cbiAgRHVwbGV4LmNhbGwodGhpcywgb3B0aW9ucyk7XG5cbiAgdmFyIHRzID0gdGhpcy5fdHJhbnNmb3JtU3RhdGUgPSBuZXcgVHJhbnNmb3JtU3RhdGUob3B0aW9ucywgdGhpcyk7XG5cbiAgLy8gd2hlbiB0aGUgd3JpdGFibGUgc2lkZSBmaW5pc2hlcywgdGhlbiBmbHVzaCBvdXQgYW55dGhpbmcgcmVtYWluaW5nLlxuICB2YXIgc3RyZWFtID0gdGhpcztcblxuICAvLyBzdGFydCBvdXQgYXNraW5nIGZvciBhIHJlYWRhYmxlIGV2ZW50IG9uY2UgZGF0YSBpcyB0cmFuc2Zvcm1lZC5cbiAgdGhpcy5fcmVhZGFibGVTdGF0ZS5uZWVkUmVhZGFibGUgPSB0cnVlO1xuXG4gIC8vIHdlIGhhdmUgaW1wbGVtZW50ZWQgdGhlIF9yZWFkIG1ldGhvZCwgYW5kIGRvbmUgdGhlIG90aGVyIHRoaW5nc1xuICAvLyB0aGF0IFJlYWRhYmxlIHdhbnRzIGJlZm9yZSB0aGUgZmlyc3QgX3JlYWQgY2FsbCwgc28gdW5zZXQgdGhlXG4gIC8vIHN5bmMgZ3VhcmQgZmxhZy5cbiAgdGhpcy5fcmVhZGFibGVTdGF0ZS5zeW5jID0gZmFsc2U7XG5cbiAgdGhpcy5vbmNlKCdmaW5pc2gnLCBmdW5jdGlvbigpIHtcbiAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRoaXMuX2ZsdXNoKVxuICAgICAgdGhpcy5fZmx1c2goZnVuY3Rpb24oZXIpIHtcbiAgICAgICAgZG9uZShzdHJlYW0sIGVyKTtcbiAgICAgIH0pO1xuICAgIGVsc2VcbiAgICAgIGRvbmUoc3RyZWFtKTtcbiAgfSk7XG59XG5cblRyYW5zZm9ybS5wcm90b3R5cGUucHVzaCA9IGZ1bmN0aW9uKGNodW5rLCBlbmNvZGluZykge1xuICB0aGlzLl90cmFuc2Zvcm1TdGF0ZS5uZWVkVHJhbnNmb3JtID0gZmFsc2U7XG4gIHJldHVybiBEdXBsZXgucHJvdG90eXBlLnB1c2guY2FsbCh0aGlzLCBjaHVuaywgZW5jb2RpbmcpO1xufTtcblxuLy8gVGhpcyBpcyB0aGUgcGFydCB3aGVyZSB5b3UgZG8gc3R1ZmYhXG4vLyBvdmVycmlkZSB0aGlzIGZ1bmN0aW9uIGluIGltcGxlbWVudGF0aW9uIGNsYXNzZXMuXG4vLyAnY2h1bmsnIGlzIGFuIGlucHV0IGNodW5rLlxuLy9cbi8vIENhbGwgYHB1c2gobmV3Q2h1bmspYCB0byBwYXNzIGFsb25nIHRyYW5zZm9ybWVkIG91dHB1dFxuLy8gdG8gdGhlIHJlYWRhYmxlIHNpZGUuICBZb3UgbWF5IGNhbGwgJ3B1c2gnIHplcm8gb3IgbW9yZSB0aW1lcy5cbi8vXG4vLyBDYWxsIGBjYihlcnIpYCB3aGVuIHlvdSBhcmUgZG9uZSB3aXRoIHRoaXMgY2h1bmsuICBJZiB5b3UgcGFzc1xuLy8gYW4gZXJyb3IsIHRoZW4gdGhhdCdsbCBwdXQgdGhlIGh1cnQgb24gdGhlIHdob2xlIG9wZXJhdGlvbi4gIElmIHlvdVxuLy8gbmV2ZXIgY2FsbCBjYigpLCB0aGVuIHlvdSdsbCBuZXZlciBnZXQgYW5vdGhlciBjaHVuay5cblRyYW5zZm9ybS5wcm90b3R5cGUuX3RyYW5zZm9ybSA9IGZ1bmN0aW9uKGNodW5rLCBlbmNvZGluZywgY2IpIHtcbiAgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcbn07XG5cblRyYW5zZm9ybS5wcm90b3R5cGUuX3dyaXRlID0gZnVuY3Rpb24oY2h1bmssIGVuY29kaW5nLCBjYikge1xuICB2YXIgdHMgPSB0aGlzLl90cmFuc2Zvcm1TdGF0ZTtcbiAgdHMud3JpdGVjYiA9IGNiO1xuICB0cy53cml0ZWNodW5rID0gY2h1bms7XG4gIHRzLndyaXRlZW5jb2RpbmcgPSBlbmNvZGluZztcbiAgaWYgKCF0cy50cmFuc2Zvcm1pbmcpIHtcbiAgICB2YXIgcnMgPSB0aGlzLl9yZWFkYWJsZVN0YXRlO1xuICAgIGlmICh0cy5uZWVkVHJhbnNmb3JtIHx8XG4gICAgICAgIHJzLm5lZWRSZWFkYWJsZSB8fFxuICAgICAgICBycy5sZW5ndGggPCBycy5oaWdoV2F0ZXJNYXJrKVxuICAgICAgdGhpcy5fcmVhZChycy5oaWdoV2F0ZXJNYXJrKTtcbiAgfVxufTtcblxuLy8gRG9lc24ndCBtYXR0ZXIgd2hhdCB0aGUgYXJncyBhcmUgaGVyZS5cbi8vIF90cmFuc2Zvcm0gZG9lcyBhbGwgdGhlIHdvcmsuXG4vLyBUaGF0IHdlIGdvdCBoZXJlIG1lYW5zIHRoYXQgdGhlIHJlYWRhYmxlIHNpZGUgd2FudHMgbW9yZSBkYXRhLlxuVHJhbnNmb3JtLnByb3RvdHlwZS5fcmVhZCA9IGZ1bmN0aW9uKG4pIHtcbiAgdmFyIHRzID0gdGhpcy5fdHJhbnNmb3JtU3RhdGU7XG5cbiAgaWYgKHRzLndyaXRlY2h1bmsgIT09IG51bGwgJiYgdHMud3JpdGVjYiAmJiAhdHMudHJhbnNmb3JtaW5nKSB7XG4gICAgdHMudHJhbnNmb3JtaW5nID0gdHJ1ZTtcbiAgICB0aGlzLl90cmFuc2Zvcm0odHMud3JpdGVjaHVuaywgdHMud3JpdGVlbmNvZGluZywgdHMuYWZ0ZXJUcmFuc2Zvcm0pO1xuICB9IGVsc2Uge1xuICAgIC8vIG1hcmsgdGhhdCB3ZSBuZWVkIGEgdHJhbnNmb3JtLCBzbyB0aGF0IGFueSBkYXRhIHRoYXQgY29tZXMgaW5cbiAgICAvLyB3aWxsIGdldCBwcm9jZXNzZWQsIG5vdyB0aGF0IHdlJ3ZlIGFza2VkIGZvciBpdC5cbiAgICB0cy5uZWVkVHJhbnNmb3JtID0gdHJ1ZTtcbiAgfVxufTtcblxuXG5mdW5jdGlvbiBkb25lKHN0cmVhbSwgZXIpIHtcbiAgaWYgKGVyKVxuICAgIHJldHVybiBzdHJlYW0uZW1pdCgnZXJyb3InLCBlcik7XG5cbiAgLy8gaWYgdGhlcmUncyBub3RoaW5nIGluIHRoZSB3cml0ZSBidWZmZXIsIHRoZW4gdGhhdCBtZWFuc1xuICAvLyB0aGF0IG5vdGhpbmcgbW9yZSB3aWxsIGV2ZXIgYmUgcHJvdmlkZWRcbiAgdmFyIHdzID0gc3RyZWFtLl93cml0YWJsZVN0YXRlO1xuICB2YXIgcnMgPSBzdHJlYW0uX3JlYWRhYmxlU3RhdGU7XG4gIHZhciB0cyA9IHN0cmVhbS5fdHJhbnNmb3JtU3RhdGU7XG5cbiAgaWYgKHdzLmxlbmd0aClcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxpbmcgdHJhbnNmb3JtIGRvbmUgd2hlbiB3cy5sZW5ndGggIT0gMCcpO1xuXG4gIGlmICh0cy50cmFuc2Zvcm1pbmcpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsaW5nIHRyYW5zZm9ybSBkb25lIHdoZW4gc3RpbGwgdHJhbnNmb3JtaW5nJyk7XG5cbiAgcmV0dXJuIHN0cmVhbS5wdXNoKG51bGwpO1xufVxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIEEgYml0IHNpbXBsZXIgdGhhbiByZWFkYWJsZSBzdHJlYW1zLlxuLy8gSW1wbGVtZW50IGFuIGFzeW5jIC5fd3JpdGUoY2h1bmssIGNiKSwgYW5kIGl0J2xsIGhhbmRsZSBhbGxcbi8vIHRoZSBkcmFpbiBldmVudCBlbWlzc2lvbiBhbmQgYnVmZmVyaW5nLlxuXG5tb2R1bGUuZXhwb3J0cyA9IFdyaXRhYmxlO1xuXG4vKjxyZXBsYWNlbWVudD4qL1xudmFyIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlcjtcbi8qPC9yZXBsYWNlbWVudD4qL1xuXG5Xcml0YWJsZS5Xcml0YWJsZVN0YXRlID0gV3JpdGFibGVTdGF0ZTtcblxuXG4vKjxyZXBsYWNlbWVudD4qL1xudmFyIHV0aWwgPSByZXF1aXJlKCdjb3JlLXV0aWwtaXMnKTtcbnV0aWwuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuLyo8L3JlcGxhY2VtZW50PiovXG5cbnZhciBTdHJlYW0gPSByZXF1aXJlKCdzdHJlYW0nKTtcblxudXRpbC5pbmhlcml0cyhXcml0YWJsZSwgU3RyZWFtKTtcblxuZnVuY3Rpb24gV3JpdGVSZXEoY2h1bmssIGVuY29kaW5nLCBjYikge1xuICB0aGlzLmNodW5rID0gY2h1bms7XG4gIHRoaXMuZW5jb2RpbmcgPSBlbmNvZGluZztcbiAgdGhpcy5jYWxsYmFjayA9IGNiO1xufVxuXG5mdW5jdGlvbiBXcml0YWJsZVN0YXRlKG9wdGlvbnMsIHN0cmVhbSkge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAvLyB0aGUgcG9pbnQgYXQgd2hpY2ggd3JpdGUoKSBzdGFydHMgcmV0dXJuaW5nIGZhbHNlXG4gIC8vIE5vdGU6IDAgaXMgYSB2YWxpZCB2YWx1ZSwgbWVhbnMgdGhhdCB3ZSBhbHdheXMgcmV0dXJuIGZhbHNlIGlmXG4gIC8vIHRoZSBlbnRpcmUgYnVmZmVyIGlzIG5vdCBmbHVzaGVkIGltbWVkaWF0ZWx5IG9uIHdyaXRlKClcbiAgdmFyIGh3bSA9IG9wdGlvbnMuaGlnaFdhdGVyTWFyaztcbiAgdGhpcy5oaWdoV2F0ZXJNYXJrID0gKGh3bSB8fCBod20gPT09IDApID8gaHdtIDogMTYgKiAxMDI0O1xuXG4gIC8vIG9iamVjdCBzdHJlYW0gZmxhZyB0byBpbmRpY2F0ZSB3aGV0aGVyIG9yIG5vdCB0aGlzIHN0cmVhbVxuICAvLyBjb250YWlucyBidWZmZXJzIG9yIG9iamVjdHMuXG4gIHRoaXMub2JqZWN0TW9kZSA9ICEhb3B0aW9ucy5vYmplY3RNb2RlO1xuXG4gIC8vIGNhc3QgdG8gaW50cy5cbiAgdGhpcy5oaWdoV2F0ZXJNYXJrID0gfn50aGlzLmhpZ2hXYXRlck1hcms7XG5cbiAgdGhpcy5uZWVkRHJhaW4gPSBmYWxzZTtcbiAgLy8gYXQgdGhlIHN0YXJ0IG9mIGNhbGxpbmcgZW5kKClcbiAgdGhpcy5lbmRpbmcgPSBmYWxzZTtcbiAgLy8gd2hlbiBlbmQoKSBoYXMgYmVlbiBjYWxsZWQsIGFuZCByZXR1cm5lZFxuICB0aGlzLmVuZGVkID0gZmFsc2U7XG4gIC8vIHdoZW4gJ2ZpbmlzaCcgaXMgZW1pdHRlZFxuICB0aGlzLmZpbmlzaGVkID0gZmFsc2U7XG5cbiAgLy8gc2hvdWxkIHdlIGRlY29kZSBzdHJpbmdzIGludG8gYnVmZmVycyBiZWZvcmUgcGFzc2luZyB0byBfd3JpdGU/XG4gIC8vIHRoaXMgaXMgaGVyZSBzbyB0aGF0IHNvbWUgbm9kZS1jb3JlIHN0cmVhbXMgY2FuIG9wdGltaXplIHN0cmluZ1xuICAvLyBoYW5kbGluZyBhdCBhIGxvd2VyIGxldmVsLlxuICB2YXIgbm9EZWNvZGUgPSBvcHRpb25zLmRlY29kZVN0cmluZ3MgPT09IGZhbHNlO1xuICB0aGlzLmRlY29kZVN0cmluZ3MgPSAhbm9EZWNvZGU7XG5cbiAgLy8gQ3J5cHRvIGlzIGtpbmQgb2Ygb2xkIGFuZCBjcnVzdHkuICBIaXN0b3JpY2FsbHksIGl0cyBkZWZhdWx0IHN0cmluZ1xuICAvLyBlbmNvZGluZyBpcyAnYmluYXJ5JyBzbyB3ZSBoYXZlIHRvIG1ha2UgdGhpcyBjb25maWd1cmFibGUuXG4gIC8vIEV2ZXJ5dGhpbmcgZWxzZSBpbiB0aGUgdW5pdmVyc2UgdXNlcyAndXRmOCcsIHRob3VnaC5cbiAgdGhpcy5kZWZhdWx0RW5jb2RpbmcgPSBvcHRpb25zLmRlZmF1bHRFbmNvZGluZyB8fCAndXRmOCc7XG5cbiAgLy8gbm90IGFuIGFjdHVhbCBidWZmZXIgd2Uga2VlcCB0cmFjayBvZiwgYnV0IGEgbWVhc3VyZW1lbnRcbiAgLy8gb2YgaG93IG11Y2ggd2UncmUgd2FpdGluZyB0byBnZXQgcHVzaGVkIHRvIHNvbWUgdW5kZXJseWluZ1xuICAvLyBzb2NrZXQgb3IgZmlsZS5cbiAgdGhpcy5sZW5ndGggPSAwO1xuXG4gIC8vIGEgZmxhZyB0byBzZWUgd2hlbiB3ZSdyZSBpbiB0aGUgbWlkZGxlIG9mIGEgd3JpdGUuXG4gIHRoaXMud3JpdGluZyA9IGZhbHNlO1xuXG4gIC8vIGEgZmxhZyB0byBiZSBhYmxlIHRvIHRlbGwgaWYgdGhlIG9ud3JpdGUgY2IgaXMgY2FsbGVkIGltbWVkaWF0ZWx5LFxuICAvLyBvciBvbiBhIGxhdGVyIHRpY2suICBXZSBzZXQgdGhpcyB0byB0cnVlIGF0IGZpcnN0LCBiZWN1YXNlIGFueVxuICAvLyBhY3Rpb25zIHRoYXQgc2hvdWxkbid0IGhhcHBlbiB1bnRpbCBcImxhdGVyXCIgc2hvdWxkIGdlbmVyYWxseSBhbHNvXG4gIC8vIG5vdCBoYXBwZW4gYmVmb3JlIHRoZSBmaXJzdCB3cml0ZSBjYWxsLlxuICB0aGlzLnN5bmMgPSB0cnVlO1xuXG4gIC8vIGEgZmxhZyB0byBrbm93IGlmIHdlJ3JlIHByb2Nlc3NpbmcgcHJldmlvdXNseSBidWZmZXJlZCBpdGVtcywgd2hpY2hcbiAgLy8gbWF5IGNhbGwgdGhlIF93cml0ZSgpIGNhbGxiYWNrIGluIHRoZSBzYW1lIHRpY2ssIHNvIHRoYXQgd2UgZG9uJ3RcbiAgLy8gZW5kIHVwIGluIGFuIG92ZXJsYXBwZWQgb253cml0ZSBzaXR1YXRpb24uXG4gIHRoaXMuYnVmZmVyUHJvY2Vzc2luZyA9IGZhbHNlO1xuXG4gIC8vIHRoZSBjYWxsYmFjayB0aGF0J3MgcGFzc2VkIHRvIF93cml0ZShjaHVuayxjYilcbiAgdGhpcy5vbndyaXRlID0gZnVuY3Rpb24oZXIpIHtcbiAgICBvbndyaXRlKHN0cmVhbSwgZXIpO1xuICB9O1xuXG4gIC8vIHRoZSBjYWxsYmFjayB0aGF0IHRoZSB1c2VyIHN1cHBsaWVzIHRvIHdyaXRlKGNodW5rLGVuY29kaW5nLGNiKVxuICB0aGlzLndyaXRlY2IgPSBudWxsO1xuXG4gIC8vIHRoZSBhbW91bnQgdGhhdCBpcyBiZWluZyB3cml0dGVuIHdoZW4gX3dyaXRlIGlzIGNhbGxlZC5cbiAgdGhpcy53cml0ZWxlbiA9IDA7XG5cbiAgdGhpcy5idWZmZXIgPSBbXTtcblxuICAvLyBUcnVlIGlmIHRoZSBlcnJvciB3YXMgYWxyZWFkeSBlbWl0dGVkIGFuZCBzaG91bGQgbm90IGJlIHRocm93biBhZ2FpblxuICB0aGlzLmVycm9yRW1pdHRlZCA9IGZhbHNlO1xufVxuXG5mdW5jdGlvbiBXcml0YWJsZShvcHRpb25zKSB7XG4gIHZhciBEdXBsZXggPSByZXF1aXJlKCcuL19zdHJlYW1fZHVwbGV4Jyk7XG5cbiAgLy8gV3JpdGFibGUgY3RvciBpcyBhcHBsaWVkIHRvIER1cGxleGVzLCB0aG91Z2ggdGhleSdyZSBub3RcbiAgLy8gaW5zdGFuY2VvZiBXcml0YWJsZSwgdGhleSdyZSBpbnN0YW5jZW9mIFJlYWRhYmxlLlxuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgV3JpdGFibGUpICYmICEodGhpcyBpbnN0YW5jZW9mIER1cGxleCkpXG4gICAgcmV0dXJuIG5ldyBXcml0YWJsZShvcHRpb25zKTtcblxuICB0aGlzLl93cml0YWJsZVN0YXRlID0gbmV3IFdyaXRhYmxlU3RhdGUob3B0aW9ucywgdGhpcyk7XG5cbiAgLy8gbGVnYWN5LlxuICB0aGlzLndyaXRhYmxlID0gdHJ1ZTtcblxuICBTdHJlYW0uY2FsbCh0aGlzKTtcbn1cblxuLy8gT3RoZXJ3aXNlIHBlb3BsZSBjYW4gcGlwZSBXcml0YWJsZSBzdHJlYW1zLCB3aGljaCBpcyBqdXN0IHdyb25nLlxuV3JpdGFibGUucHJvdG90eXBlLnBpcGUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5lbWl0KCdlcnJvcicsIG5ldyBFcnJvcignQ2Fubm90IHBpcGUuIE5vdCByZWFkYWJsZS4nKSk7XG59O1xuXG5cbmZ1bmN0aW9uIHdyaXRlQWZ0ZXJFbmQoc3RyZWFtLCBzdGF0ZSwgY2IpIHtcbiAgdmFyIGVyID0gbmV3IEVycm9yKCd3cml0ZSBhZnRlciBlbmQnKTtcbiAgLy8gVE9ETzogZGVmZXIgZXJyb3IgZXZlbnRzIGNvbnNpc3RlbnRseSBldmVyeXdoZXJlLCBub3QganVzdCB0aGUgY2JcbiAgc3RyZWFtLmVtaXQoJ2Vycm9yJywgZXIpO1xuICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgIGNiKGVyKTtcbiAgfSk7XG59XG5cbi8vIElmIHdlIGdldCBzb21ldGhpbmcgdGhhdCBpcyBub3QgYSBidWZmZXIsIHN0cmluZywgbnVsbCwgb3IgdW5kZWZpbmVkLFxuLy8gYW5kIHdlJ3JlIG5vdCBpbiBvYmplY3RNb2RlLCB0aGVuIHRoYXQncyBhbiBlcnJvci5cbi8vIE90aGVyd2lzZSBzdHJlYW0gY2h1bmtzIGFyZSBhbGwgY29uc2lkZXJlZCB0byBiZSBvZiBsZW5ndGg9MSwgYW5kIHRoZVxuLy8gd2F0ZXJtYXJrcyBkZXRlcm1pbmUgaG93IG1hbnkgb2JqZWN0cyB0byBrZWVwIGluIHRoZSBidWZmZXIsIHJhdGhlciB0aGFuXG4vLyBob3cgbWFueSBieXRlcyBvciBjaGFyYWN0ZXJzLlxuZnVuY3Rpb24gdmFsaWRDaHVuayhzdHJlYW0sIHN0YXRlLCBjaHVuaywgY2IpIHtcbiAgdmFyIHZhbGlkID0gdHJ1ZTtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoY2h1bmspICYmXG4gICAgICAnc3RyaW5nJyAhPT0gdHlwZW9mIGNodW5rICYmXG4gICAgICBjaHVuayAhPT0gbnVsbCAmJlxuICAgICAgY2h1bmsgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgIXN0YXRlLm9iamVjdE1vZGUpIHtcbiAgICB2YXIgZXIgPSBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIG5vbi1zdHJpbmcvYnVmZmVyIGNodW5rJyk7XG4gICAgc3RyZWFtLmVtaXQoJ2Vycm9yJywgZXIpO1xuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICBjYihlcik7XG4gICAgfSk7XG4gICAgdmFsaWQgPSBmYWxzZTtcbiAgfVxuICByZXR1cm4gdmFsaWQ7XG59XG5cbldyaXRhYmxlLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uKGNodW5rLCBlbmNvZGluZywgY2IpIHtcbiAgdmFyIHN0YXRlID0gdGhpcy5fd3JpdGFibGVTdGF0ZTtcbiAgdmFyIHJldCA9IGZhbHNlO1xuXG4gIGlmICh0eXBlb2YgZW5jb2RpbmcgPT09ICdmdW5jdGlvbicpIHtcbiAgICBjYiA9IGVuY29kaW5nO1xuICAgIGVuY29kaW5nID0gbnVsbDtcbiAgfVxuXG4gIGlmIChCdWZmZXIuaXNCdWZmZXIoY2h1bmspKVxuICAgIGVuY29kaW5nID0gJ2J1ZmZlcic7XG4gIGVsc2UgaWYgKCFlbmNvZGluZylcbiAgICBlbmNvZGluZyA9IHN0YXRlLmRlZmF1bHRFbmNvZGluZztcblxuICBpZiAodHlwZW9mIGNiICE9PSAnZnVuY3Rpb24nKVxuICAgIGNiID0gZnVuY3Rpb24oKSB7fTtcblxuICBpZiAoc3RhdGUuZW5kZWQpXG4gICAgd3JpdGVBZnRlckVuZCh0aGlzLCBzdGF0ZSwgY2IpO1xuICBlbHNlIGlmICh2YWxpZENodW5rKHRoaXMsIHN0YXRlLCBjaHVuaywgY2IpKVxuICAgIHJldCA9IHdyaXRlT3JCdWZmZXIodGhpcywgc3RhdGUsIGNodW5rLCBlbmNvZGluZywgY2IpO1xuXG4gIHJldHVybiByZXQ7XG59O1xuXG5mdW5jdGlvbiBkZWNvZGVDaHVuayhzdGF0ZSwgY2h1bmssIGVuY29kaW5nKSB7XG4gIGlmICghc3RhdGUub2JqZWN0TW9kZSAmJlxuICAgICAgc3RhdGUuZGVjb2RlU3RyaW5ncyAhPT0gZmFsc2UgJiZcbiAgICAgIHR5cGVvZiBjaHVuayA9PT0gJ3N0cmluZycpIHtcbiAgICBjaHVuayA9IG5ldyBCdWZmZXIoY2h1bmssIGVuY29kaW5nKTtcbiAgfVxuICByZXR1cm4gY2h1bms7XG59XG5cbi8vIGlmIHdlJ3JlIGFscmVhZHkgd3JpdGluZyBzb21ldGhpbmcsIHRoZW4ganVzdCBwdXQgdGhpc1xuLy8gaW4gdGhlIHF1ZXVlLCBhbmQgd2FpdCBvdXIgdHVybi4gIE90aGVyd2lzZSwgY2FsbCBfd3JpdGVcbi8vIElmIHdlIHJldHVybiBmYWxzZSwgdGhlbiB3ZSBuZWVkIGEgZHJhaW4gZXZlbnQsIHNvIHNldCB0aGF0IGZsYWcuXG5mdW5jdGlvbiB3cml0ZU9yQnVmZmVyKHN0cmVhbSwgc3RhdGUsIGNodW5rLCBlbmNvZGluZywgY2IpIHtcbiAgY2h1bmsgPSBkZWNvZGVDaHVuayhzdGF0ZSwgY2h1bmssIGVuY29kaW5nKTtcbiAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihjaHVuaykpXG4gICAgZW5jb2RpbmcgPSAnYnVmZmVyJztcbiAgdmFyIGxlbiA9IHN0YXRlLm9iamVjdE1vZGUgPyAxIDogY2h1bmsubGVuZ3RoO1xuXG4gIHN0YXRlLmxlbmd0aCArPSBsZW47XG5cbiAgdmFyIHJldCA9IHN0YXRlLmxlbmd0aCA8IHN0YXRlLmhpZ2hXYXRlck1hcms7XG4gIC8vIHdlIG11c3QgZW5zdXJlIHRoYXQgcHJldmlvdXMgbmVlZERyYWluIHdpbGwgbm90IGJlIHJlc2V0IHRvIGZhbHNlLlxuICBpZiAoIXJldClcbiAgICBzdGF0ZS5uZWVkRHJhaW4gPSB0cnVlO1xuXG4gIGlmIChzdGF0ZS53cml0aW5nKVxuICAgIHN0YXRlLmJ1ZmZlci5wdXNoKG5ldyBXcml0ZVJlcShjaHVuaywgZW5jb2RpbmcsIGNiKSk7XG4gIGVsc2VcbiAgICBkb1dyaXRlKHN0cmVhbSwgc3RhdGUsIGxlbiwgY2h1bmssIGVuY29kaW5nLCBjYik7XG5cbiAgcmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gZG9Xcml0ZShzdHJlYW0sIHN0YXRlLCBsZW4sIGNodW5rLCBlbmNvZGluZywgY2IpIHtcbiAgc3RhdGUud3JpdGVsZW4gPSBsZW47XG4gIHN0YXRlLndyaXRlY2IgPSBjYjtcbiAgc3RhdGUud3JpdGluZyA9IHRydWU7XG4gIHN0YXRlLnN5bmMgPSB0cnVlO1xuICBzdHJlYW0uX3dyaXRlKGNodW5rLCBlbmNvZGluZywgc3RhdGUub253cml0ZSk7XG4gIHN0YXRlLnN5bmMgPSBmYWxzZTtcbn1cblxuZnVuY3Rpb24gb253cml0ZUVycm9yKHN0cmVhbSwgc3RhdGUsIHN5bmMsIGVyLCBjYikge1xuICBpZiAoc3luYylcbiAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgY2IoZXIpO1xuICAgIH0pO1xuICBlbHNlXG4gICAgY2IoZXIpO1xuXG4gIHN0cmVhbS5fd3JpdGFibGVTdGF0ZS5lcnJvckVtaXR0ZWQgPSB0cnVlO1xuICBzdHJlYW0uZW1pdCgnZXJyb3InLCBlcik7XG59XG5cbmZ1bmN0aW9uIG9ud3JpdGVTdGF0ZVVwZGF0ZShzdGF0ZSkge1xuICBzdGF0ZS53cml0aW5nID0gZmFsc2U7XG4gIHN0YXRlLndyaXRlY2IgPSBudWxsO1xuICBzdGF0ZS5sZW5ndGggLT0gc3RhdGUud3JpdGVsZW47XG4gIHN0YXRlLndyaXRlbGVuID0gMDtcbn1cblxuZnVuY3Rpb24gb253cml0ZShzdHJlYW0sIGVyKSB7XG4gIHZhciBzdGF0ZSA9IHN0cmVhbS5fd3JpdGFibGVTdGF0ZTtcbiAgdmFyIHN5bmMgPSBzdGF0ZS5zeW5jO1xuICB2YXIgY2IgPSBzdGF0ZS53cml0ZWNiO1xuXG4gIG9ud3JpdGVTdGF0ZVVwZGF0ZShzdGF0ZSk7XG5cbiAgaWYgKGVyKVxuICAgIG9ud3JpdGVFcnJvcihzdHJlYW0sIHN0YXRlLCBzeW5jLCBlciwgY2IpO1xuICBlbHNlIHtcbiAgICAvLyBDaGVjayBpZiB3ZSdyZSBhY3R1YWxseSByZWFkeSB0byBmaW5pc2gsIGJ1dCBkb24ndCBlbWl0IHlldFxuICAgIHZhciBmaW5pc2hlZCA9IG5lZWRGaW5pc2goc3RyZWFtLCBzdGF0ZSk7XG5cbiAgICBpZiAoIWZpbmlzaGVkICYmICFzdGF0ZS5idWZmZXJQcm9jZXNzaW5nICYmIHN0YXRlLmJ1ZmZlci5sZW5ndGgpXG4gICAgICBjbGVhckJ1ZmZlcihzdHJlYW0sIHN0YXRlKTtcblxuICAgIGlmIChzeW5jKSB7XG4gICAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICBhZnRlcldyaXRlKHN0cmVhbSwgc3RhdGUsIGZpbmlzaGVkLCBjYik7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgYWZ0ZXJXcml0ZShzdHJlYW0sIHN0YXRlLCBmaW5pc2hlZCwgY2IpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZnRlcldyaXRlKHN0cmVhbSwgc3RhdGUsIGZpbmlzaGVkLCBjYikge1xuICBpZiAoIWZpbmlzaGVkKVxuICAgIG9ud3JpdGVEcmFpbihzdHJlYW0sIHN0YXRlKTtcbiAgY2IoKTtcbiAgaWYgKGZpbmlzaGVkKVxuICAgIGZpbmlzaE1heWJlKHN0cmVhbSwgc3RhdGUpO1xufVxuXG4vLyBNdXN0IGZvcmNlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBvbiBuZXh0VGljaywgc28gdGhhdCB3ZSBkb24ndFxuLy8gZW1pdCAnZHJhaW4nIGJlZm9yZSB0aGUgd3JpdGUoKSBjb25zdW1lciBnZXRzIHRoZSAnZmFsc2UnIHJldHVyblxuLy8gdmFsdWUsIGFuZCBoYXMgYSBjaGFuY2UgdG8gYXR0YWNoIGEgJ2RyYWluJyBsaXN0ZW5lci5cbmZ1bmN0aW9uIG9ud3JpdGVEcmFpbihzdHJlYW0sIHN0YXRlKSB7XG4gIGlmIChzdGF0ZS5sZW5ndGggPT09IDAgJiYgc3RhdGUubmVlZERyYWluKSB7XG4gICAgc3RhdGUubmVlZERyYWluID0gZmFsc2U7XG4gICAgc3RyZWFtLmVtaXQoJ2RyYWluJyk7XG4gIH1cbn1cblxuXG4vLyBpZiB0aGVyZSdzIHNvbWV0aGluZyBpbiB0aGUgYnVmZmVyIHdhaXRpbmcsIHRoZW4gcHJvY2VzcyBpdFxuZnVuY3Rpb24gY2xlYXJCdWZmZXIoc3RyZWFtLCBzdGF0ZSkge1xuICBzdGF0ZS5idWZmZXJQcm9jZXNzaW5nID0gdHJ1ZTtcblxuICBmb3IgKHZhciBjID0gMDsgYyA8IHN0YXRlLmJ1ZmZlci5sZW5ndGg7IGMrKykge1xuICAgIHZhciBlbnRyeSA9IHN0YXRlLmJ1ZmZlcltjXTtcbiAgICB2YXIgY2h1bmsgPSBlbnRyeS5jaHVuaztcbiAgICB2YXIgZW5jb2RpbmcgPSBlbnRyeS5lbmNvZGluZztcbiAgICB2YXIgY2IgPSBlbnRyeS5jYWxsYmFjaztcbiAgICB2YXIgbGVuID0gc3RhdGUub2JqZWN0TW9kZSA/IDEgOiBjaHVuay5sZW5ndGg7XG5cbiAgICBkb1dyaXRlKHN0cmVhbSwgc3RhdGUsIGxlbiwgY2h1bmssIGVuY29kaW5nLCBjYik7XG5cbiAgICAvLyBpZiB3ZSBkaWRuJ3QgY2FsbCB0aGUgb253cml0ZSBpbW1lZGlhdGVseSwgdGhlblxuICAgIC8vIGl0IG1lYW5zIHRoYXQgd2UgbmVlZCB0byB3YWl0IHVudGlsIGl0IGRvZXMuXG4gICAgLy8gYWxzbywgdGhhdCBtZWFucyB0aGF0IHRoZSBjaHVuayBhbmQgY2IgYXJlIGN1cnJlbnRseVxuICAgIC8vIGJlaW5nIHByb2Nlc3NlZCwgc28gbW92ZSB0aGUgYnVmZmVyIGNvdW50ZXIgcGFzdCB0aGVtLlxuICAgIGlmIChzdGF0ZS53cml0aW5nKSB7XG4gICAgICBjKys7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICBzdGF0ZS5idWZmZXJQcm9jZXNzaW5nID0gZmFsc2U7XG4gIGlmIChjIDwgc3RhdGUuYnVmZmVyLmxlbmd0aClcbiAgICBzdGF0ZS5idWZmZXIgPSBzdGF0ZS5idWZmZXIuc2xpY2UoYyk7XG4gIGVsc2VcbiAgICBzdGF0ZS5idWZmZXIubGVuZ3RoID0gMDtcbn1cblxuV3JpdGFibGUucHJvdG90eXBlLl93cml0ZSA9IGZ1bmN0aW9uKGNodW5rLCBlbmNvZGluZywgY2IpIHtcbiAgY2IobmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKSk7XG59O1xuXG5Xcml0YWJsZS5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oY2h1bmssIGVuY29kaW5nLCBjYikge1xuICB2YXIgc3RhdGUgPSB0aGlzLl93cml0YWJsZVN0YXRlO1xuXG4gIGlmICh0eXBlb2YgY2h1bmsgPT09ICdmdW5jdGlvbicpIHtcbiAgICBjYiA9IGNodW5rO1xuICAgIGNodW5rID0gbnVsbDtcbiAgICBlbmNvZGluZyA9IG51bGw7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGVuY29kaW5nID09PSAnZnVuY3Rpb24nKSB7XG4gICAgY2IgPSBlbmNvZGluZztcbiAgICBlbmNvZGluZyA9IG51bGw7XG4gIH1cblxuICBpZiAodHlwZW9mIGNodW5rICE9PSAndW5kZWZpbmVkJyAmJiBjaHVuayAhPT0gbnVsbClcbiAgICB0aGlzLndyaXRlKGNodW5rLCBlbmNvZGluZyk7XG5cbiAgLy8gaWdub3JlIHVubmVjZXNzYXJ5IGVuZCgpIGNhbGxzLlxuICBpZiAoIXN0YXRlLmVuZGluZyAmJiAhc3RhdGUuZmluaXNoZWQpXG4gICAgZW5kV3JpdGFibGUodGhpcywgc3RhdGUsIGNiKTtcbn07XG5cblxuZnVuY3Rpb24gbmVlZEZpbmlzaChzdHJlYW0sIHN0YXRlKSB7XG4gIHJldHVybiAoc3RhdGUuZW5kaW5nICYmXG4gICAgICAgICAgc3RhdGUubGVuZ3RoID09PSAwICYmXG4gICAgICAgICAgIXN0YXRlLmZpbmlzaGVkICYmXG4gICAgICAgICAgIXN0YXRlLndyaXRpbmcpO1xufVxuXG5mdW5jdGlvbiBmaW5pc2hNYXliZShzdHJlYW0sIHN0YXRlKSB7XG4gIHZhciBuZWVkID0gbmVlZEZpbmlzaChzdHJlYW0sIHN0YXRlKTtcbiAgaWYgKG5lZWQpIHtcbiAgICBzdGF0ZS5maW5pc2hlZCA9IHRydWU7XG4gICAgc3RyZWFtLmVtaXQoJ2ZpbmlzaCcpO1xuICB9XG4gIHJldHVybiBuZWVkO1xufVxuXG5mdW5jdGlvbiBlbmRXcml0YWJsZShzdHJlYW0sIHN0YXRlLCBjYikge1xuICBzdGF0ZS5lbmRpbmcgPSB0cnVlO1xuICBmaW5pc2hNYXliZShzdHJlYW0sIHN0YXRlKTtcbiAgaWYgKGNiKSB7XG4gICAgaWYgKHN0YXRlLmZpbmlzaGVkKVxuICAgICAgcHJvY2Vzcy5uZXh0VGljayhjYik7XG4gICAgZWxzZVxuICAgICAgc3RyZWFtLm9uY2UoJ2ZpbmlzaCcsIGNiKTtcbiAgfVxuICBzdGF0ZS5lbmRlZCA9IHRydWU7XG59XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmZ1bmN0aW9uIGlzQnVmZmVyKGFyZykge1xuICByZXR1cm4gQnVmZmVyLmlzQnVmZmVyKGFyZyk7XG59XG5leHBvcnRzLmlzQnVmZmVyID0gaXNCdWZmZXI7XG5cbmZ1bmN0aW9uIG9iamVjdFRvU3RyaW5nKG8pIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKTtcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCIuL2xpYi9fc3RyZWFtX3Bhc3N0aHJvdWdoLmpzXCIpXG4iLCJ2YXIgU3RyZWFtID0gcmVxdWlyZSgnc3RyZWFtJyk7IC8vIGhhY2sgdG8gZml4IGEgY2lyY3VsYXIgZGVwZW5kZW5jeSBpc3N1ZSB3aGVuIHVzZWQgd2l0aCBicm93c2VyaWZ5XG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2xpYi9fc3RyZWFtX3JlYWRhYmxlLmpzJyk7XG5leHBvcnRzLlN0cmVhbSA9IFN0cmVhbTtcbmV4cG9ydHMuUmVhZGFibGUgPSBleHBvcnRzO1xuZXhwb3J0cy5Xcml0YWJsZSA9IHJlcXVpcmUoJy4vbGliL19zdHJlYW1fd3JpdGFibGUuanMnKTtcbmV4cG9ydHMuRHVwbGV4ID0gcmVxdWlyZSgnLi9saWIvX3N0cmVhbV9kdXBsZXguanMnKTtcbmV4cG9ydHMuVHJhbnNmb3JtID0gcmVxdWlyZSgnLi9saWIvX3N0cmVhbV90cmFuc2Zvcm0uanMnKTtcbmV4cG9ydHMuUGFzc1Rocm91Z2ggPSByZXF1aXJlKCcuL2xpYi9fc3RyZWFtX3Bhc3N0aHJvdWdoLmpzJyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCIuL2xpYi9fc3RyZWFtX3RyYW5zZm9ybS5qc1wiKVxuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiLi9saWIvX3N0cmVhbV93cml0YWJsZS5qc1wiKVxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbm1vZHVsZS5leHBvcnRzID0gU3RyZWFtO1xuXG52YXIgRUUgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG52YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuXG5pbmhlcml0cyhTdHJlYW0sIEVFKTtcblN0cmVhbS5SZWFkYWJsZSA9IHJlcXVpcmUoJ3JlYWRhYmxlLXN0cmVhbS9yZWFkYWJsZS5qcycpO1xuU3RyZWFtLldyaXRhYmxlID0gcmVxdWlyZSgncmVhZGFibGUtc3RyZWFtL3dyaXRhYmxlLmpzJyk7XG5TdHJlYW0uRHVwbGV4ID0gcmVxdWlyZSgncmVhZGFibGUtc3RyZWFtL2R1cGxleC5qcycpO1xuU3RyZWFtLlRyYW5zZm9ybSA9IHJlcXVpcmUoJ3JlYWRhYmxlLXN0cmVhbS90cmFuc2Zvcm0uanMnKTtcblN0cmVhbS5QYXNzVGhyb3VnaCA9IHJlcXVpcmUoJ3JlYWRhYmxlLXN0cmVhbS9wYXNzdGhyb3VnaC5qcycpO1xuXG4vLyBCYWNrd2FyZHMtY29tcGF0IHdpdGggbm9kZSAwLjQueFxuU3RyZWFtLlN0cmVhbSA9IFN0cmVhbTtcblxuXG5cbi8vIG9sZC1zdHlsZSBzdHJlYW1zLiAgTm90ZSB0aGF0IHRoZSBwaXBlIG1ldGhvZCAodGhlIG9ubHkgcmVsZXZhbnRcbi8vIHBhcnQgb2YgdGhpcyBjbGFzcykgaXMgb3ZlcnJpZGRlbiBpbiB0aGUgUmVhZGFibGUgY2xhc3MuXG5cbmZ1bmN0aW9uIFN0cmVhbSgpIHtcbiAgRUUuY2FsbCh0aGlzKTtcbn1cblxuU3RyZWFtLnByb3RvdHlwZS5waXBlID0gZnVuY3Rpb24oZGVzdCwgb3B0aW9ucykge1xuICB2YXIgc291cmNlID0gdGhpcztcblxuICBmdW5jdGlvbiBvbmRhdGEoY2h1bmspIHtcbiAgICBpZiAoZGVzdC53cml0YWJsZSkge1xuICAgICAgaWYgKGZhbHNlID09PSBkZXN0LndyaXRlKGNodW5rKSAmJiBzb3VyY2UucGF1c2UpIHtcbiAgICAgICAgc291cmNlLnBhdXNlKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc291cmNlLm9uKCdkYXRhJywgb25kYXRhKTtcblxuICBmdW5jdGlvbiBvbmRyYWluKCkge1xuICAgIGlmIChzb3VyY2UucmVhZGFibGUgJiYgc291cmNlLnJlc3VtZSkge1xuICAgICAgc291cmNlLnJlc3VtZSgpO1xuICAgIH1cbiAgfVxuXG4gIGRlc3Qub24oJ2RyYWluJywgb25kcmFpbik7XG5cbiAgLy8gSWYgdGhlICdlbmQnIG9wdGlvbiBpcyBub3Qgc3VwcGxpZWQsIGRlc3QuZW5kKCkgd2lsbCBiZSBjYWxsZWQgd2hlblxuICAvLyBzb3VyY2UgZ2V0cyB0aGUgJ2VuZCcgb3IgJ2Nsb3NlJyBldmVudHMuICBPbmx5IGRlc3QuZW5kKCkgb25jZS5cbiAgaWYgKCFkZXN0Ll9pc1N0ZGlvICYmICghb3B0aW9ucyB8fCBvcHRpb25zLmVuZCAhPT0gZmFsc2UpKSB7XG4gICAgc291cmNlLm9uKCdlbmQnLCBvbmVuZCk7XG4gICAgc291cmNlLm9uKCdjbG9zZScsIG9uY2xvc2UpO1xuICB9XG5cbiAgdmFyIGRpZE9uRW5kID0gZmFsc2U7XG4gIGZ1bmN0aW9uIG9uZW5kKCkge1xuICAgIGlmIChkaWRPbkVuZCkgcmV0dXJuO1xuICAgIGRpZE9uRW5kID0gdHJ1ZTtcblxuICAgIGRlc3QuZW5kKCk7XG4gIH1cblxuXG4gIGZ1bmN0aW9uIG9uY2xvc2UoKSB7XG4gICAgaWYgKGRpZE9uRW5kKSByZXR1cm47XG4gICAgZGlkT25FbmQgPSB0cnVlO1xuXG4gICAgaWYgKHR5cGVvZiBkZXN0LmRlc3Ryb3kgPT09ICdmdW5jdGlvbicpIGRlc3QuZGVzdHJveSgpO1xuICB9XG5cbiAgLy8gZG9uJ3QgbGVhdmUgZGFuZ2xpbmcgcGlwZXMgd2hlbiB0aGVyZSBhcmUgZXJyb3JzLlxuICBmdW5jdGlvbiBvbmVycm9yKGVyKSB7XG4gICAgY2xlYW51cCgpO1xuICAgIGlmIChFRS5saXN0ZW5lckNvdW50KHRoaXMsICdlcnJvcicpID09PSAwKSB7XG4gICAgICB0aHJvdyBlcjsgLy8gVW5oYW5kbGVkIHN0cmVhbSBlcnJvciBpbiBwaXBlLlxuICAgIH1cbiAgfVxuXG4gIHNvdXJjZS5vbignZXJyb3InLCBvbmVycm9yKTtcbiAgZGVzdC5vbignZXJyb3InLCBvbmVycm9yKTtcblxuICAvLyByZW1vdmUgYWxsIHRoZSBldmVudCBsaXN0ZW5lcnMgdGhhdCB3ZXJlIGFkZGVkLlxuICBmdW5jdGlvbiBjbGVhbnVwKCkge1xuICAgIHNvdXJjZS5yZW1vdmVMaXN0ZW5lcignZGF0YScsIG9uZGF0YSk7XG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignZHJhaW4nLCBvbmRyYWluKTtcblxuICAgIHNvdXJjZS5yZW1vdmVMaXN0ZW5lcignZW5kJywgb25lbmQpO1xuICAgIHNvdXJjZS5yZW1vdmVMaXN0ZW5lcignY2xvc2UnLCBvbmNsb3NlKTtcblxuICAgIHNvdXJjZS5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBvbmVycm9yKTtcbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIG9uZXJyb3IpO1xuXG4gICAgc291cmNlLnJlbW92ZUxpc3RlbmVyKCdlbmQnLCBjbGVhbnVwKTtcbiAgICBzb3VyY2UucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgY2xlYW51cCk7XG5cbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIGNsZWFudXApO1xuICB9XG5cbiAgc291cmNlLm9uKCdlbmQnLCBjbGVhbnVwKTtcbiAgc291cmNlLm9uKCdjbG9zZScsIGNsZWFudXApO1xuXG4gIGRlc3Qub24oJ2Nsb3NlJywgY2xlYW51cCk7XG5cbiAgZGVzdC5lbWl0KCdwaXBlJywgc291cmNlKTtcblxuICAvLyBBbGxvdyBmb3IgdW5peC1saWtlIHVzYWdlOiBBLnBpcGUoQikucGlwZShDKVxuICByZXR1cm4gZGVzdDtcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlcjtcblxudmFyIGlzQnVmZmVyRW5jb2RpbmcgPSBCdWZmZXIuaXNFbmNvZGluZ1xuICB8fCBmdW5jdGlvbihlbmNvZGluZykge1xuICAgICAgIHN3aXRjaCAoZW5jb2RpbmcgJiYgZW5jb2RpbmcudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgY2FzZSAnaGV4JzogY2FzZSAndXRmOCc6IGNhc2UgJ3V0Zi04JzogY2FzZSAnYXNjaWknOiBjYXNlICdiaW5hcnknOiBjYXNlICdiYXNlNjQnOiBjYXNlICd1Y3MyJzogY2FzZSAndWNzLTInOiBjYXNlICd1dGYxNmxlJzogY2FzZSAndXRmLTE2bGUnOiBjYXNlICdyYXcnOiByZXR1cm4gdHJ1ZTtcbiAgICAgICAgIGRlZmF1bHQ6IHJldHVybiBmYWxzZTtcbiAgICAgICB9XG4gICAgIH1cblxuXG5mdW5jdGlvbiBhc3NlcnRFbmNvZGluZyhlbmNvZGluZykge1xuICBpZiAoZW5jb2RpbmcgJiYgIWlzQnVmZmVyRW5jb2RpbmcoZW5jb2RpbmcpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpO1xuICB9XG59XG5cbi8vIFN0cmluZ0RlY29kZXIgcHJvdmlkZXMgYW4gaW50ZXJmYWNlIGZvciBlZmZpY2llbnRseSBzcGxpdHRpbmcgYSBzZXJpZXMgb2Zcbi8vIGJ1ZmZlcnMgaW50byBhIHNlcmllcyBvZiBKUyBzdHJpbmdzIHdpdGhvdXQgYnJlYWtpbmcgYXBhcnQgbXVsdGktYnl0ZVxuLy8gY2hhcmFjdGVycy4gQ0VTVS04IGlzIGhhbmRsZWQgYXMgcGFydCBvZiB0aGUgVVRGLTggZW5jb2RpbmcuXG4vL1xuLy8gQFRPRE8gSGFuZGxpbmcgYWxsIGVuY29kaW5ncyBpbnNpZGUgYSBzaW5nbGUgb2JqZWN0IG1ha2VzIGl0IHZlcnkgZGlmZmljdWx0XG4vLyB0byByZWFzb24gYWJvdXQgdGhpcyBjb2RlLCBzbyBpdCBzaG91bGQgYmUgc3BsaXQgdXAgaW4gdGhlIGZ1dHVyZS5cbi8vIEBUT0RPIFRoZXJlIHNob3VsZCBiZSBhIHV0Zjgtc3RyaWN0IGVuY29kaW5nIHRoYXQgcmVqZWN0cyBpbnZhbGlkIFVURi04IGNvZGVcbi8vIHBvaW50cyBhcyB1c2VkIGJ5IENFU1UtOC5cbnZhciBTdHJpbmdEZWNvZGVyID0gZXhwb3J0cy5TdHJpbmdEZWNvZGVyID0gZnVuY3Rpb24oZW5jb2RpbmcpIHtcbiAgdGhpcy5lbmNvZGluZyA9IChlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvWy1fXS8sICcnKTtcbiAgYXNzZXJ0RW5jb2RpbmcoZW5jb2RpbmcpO1xuICBzd2l0Y2ggKHRoaXMuZW5jb2RpbmcpIHtcbiAgICBjYXNlICd1dGY4JzpcbiAgICAgIC8vIENFU1UtOCByZXByZXNlbnRzIGVhY2ggb2YgU3Vycm9nYXRlIFBhaXIgYnkgMy1ieXRlc1xuICAgICAgdGhpcy5zdXJyb2dhdGVTaXplID0gMztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgICAgLy8gVVRGLTE2IHJlcHJlc2VudHMgZWFjaCBvZiBTdXJyb2dhdGUgUGFpciBieSAyLWJ5dGVzXG4gICAgICB0aGlzLnN1cnJvZ2F0ZVNpemUgPSAyO1xuICAgICAgdGhpcy5kZXRlY3RJbmNvbXBsZXRlQ2hhciA9IHV0ZjE2RGV0ZWN0SW5jb21wbGV0ZUNoYXI7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgLy8gQmFzZS02NCBzdG9yZXMgMyBieXRlcyBpbiA0IGNoYXJzLCBhbmQgcGFkcyB0aGUgcmVtYWluZGVyLlxuICAgICAgdGhpcy5zdXJyb2dhdGVTaXplID0gMztcbiAgICAgIHRoaXMuZGV0ZWN0SW5jb21wbGV0ZUNoYXIgPSBiYXNlNjREZXRlY3RJbmNvbXBsZXRlQ2hhcjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aGlzLndyaXRlID0gcGFzc1Rocm91Z2hXcml0ZTtcbiAgICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEVub3VnaCBzcGFjZSB0byBzdG9yZSBhbGwgYnl0ZXMgb2YgYSBzaW5nbGUgY2hhcmFjdGVyLiBVVEYtOCBuZWVkcyA0XG4gIC8vIGJ5dGVzLCBidXQgQ0VTVS04IG1heSByZXF1aXJlIHVwIHRvIDYgKDMgYnl0ZXMgcGVyIHN1cnJvZ2F0ZSkuXG4gIHRoaXMuY2hhckJ1ZmZlciA9IG5ldyBCdWZmZXIoNik7XG4gIC8vIE51bWJlciBvZiBieXRlcyByZWNlaXZlZCBmb3IgdGhlIGN1cnJlbnQgaW5jb21wbGV0ZSBtdWx0aS1ieXRlIGNoYXJhY3Rlci5cbiAgdGhpcy5jaGFyUmVjZWl2ZWQgPSAwO1xuICAvLyBOdW1iZXIgb2YgYnl0ZXMgZXhwZWN0ZWQgZm9yIHRoZSBjdXJyZW50IGluY29tcGxldGUgbXVsdGktYnl0ZSBjaGFyYWN0ZXIuXG4gIHRoaXMuY2hhckxlbmd0aCA9IDA7XG59O1xuXG5cbi8vIHdyaXRlIGRlY29kZXMgdGhlIGdpdmVuIGJ1ZmZlciBhbmQgcmV0dXJucyBpdCBhcyBKUyBzdHJpbmcgdGhhdCBpc1xuLy8gZ3VhcmFudGVlZCB0byBub3QgY29udGFpbiBhbnkgcGFydGlhbCBtdWx0aS1ieXRlIGNoYXJhY3RlcnMuIEFueSBwYXJ0aWFsXG4vLyBjaGFyYWN0ZXIgZm91bmQgYXQgdGhlIGVuZCBvZiB0aGUgYnVmZmVyIGlzIGJ1ZmZlcmVkIHVwLCBhbmQgd2lsbCBiZVxuLy8gcmV0dXJuZWQgd2hlbiBjYWxsaW5nIHdyaXRlIGFnYWluIHdpdGggdGhlIHJlbWFpbmluZyBieXRlcy5cbi8vXG4vLyBOb3RlOiBDb252ZXJ0aW5nIGEgQnVmZmVyIGNvbnRhaW5pbmcgYW4gb3JwaGFuIHN1cnJvZ2F0ZSB0byBhIFN0cmluZ1xuLy8gY3VycmVudGx5IHdvcmtzLCBidXQgY29udmVydGluZyBhIFN0cmluZyB0byBhIEJ1ZmZlciAodmlhIGBuZXcgQnVmZmVyYCwgb3Jcbi8vIEJ1ZmZlciN3cml0ZSkgd2lsbCByZXBsYWNlIGluY29tcGxldGUgc3Vycm9nYXRlcyB3aXRoIHRoZSB1bmljb2RlXG4vLyByZXBsYWNlbWVudCBjaGFyYWN0ZXIuIFNlZSBodHRwczovL2NvZGVyZXZpZXcuY2hyb21pdW0ub3JnLzEyMTE3MzAwOS8gLlxuU3RyaW5nRGVjb2Rlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgdmFyIGNoYXJTdHIgPSAnJztcbiAgLy8gaWYgb3VyIGxhc3Qgd3JpdGUgZW5kZWQgd2l0aCBhbiBpbmNvbXBsZXRlIG11bHRpYnl0ZSBjaGFyYWN0ZXJcbiAgd2hpbGUgKHRoaXMuY2hhckxlbmd0aCkge1xuICAgIC8vIGRldGVybWluZSBob3cgbWFueSByZW1haW5pbmcgYnl0ZXMgdGhpcyBidWZmZXIgaGFzIHRvIG9mZmVyIGZvciB0aGlzIGNoYXJcbiAgICB2YXIgYXZhaWxhYmxlID0gKGJ1ZmZlci5sZW5ndGggPj0gdGhpcy5jaGFyTGVuZ3RoIC0gdGhpcy5jaGFyUmVjZWl2ZWQpID9cbiAgICAgICAgdGhpcy5jaGFyTGVuZ3RoIC0gdGhpcy5jaGFyUmVjZWl2ZWQgOlxuICAgICAgICBidWZmZXIubGVuZ3RoO1xuXG4gICAgLy8gYWRkIHRoZSBuZXcgYnl0ZXMgdG8gdGhlIGNoYXIgYnVmZmVyXG4gICAgYnVmZmVyLmNvcHkodGhpcy5jaGFyQnVmZmVyLCB0aGlzLmNoYXJSZWNlaXZlZCwgMCwgYXZhaWxhYmxlKTtcbiAgICB0aGlzLmNoYXJSZWNlaXZlZCArPSBhdmFpbGFibGU7XG5cbiAgICBpZiAodGhpcy5jaGFyUmVjZWl2ZWQgPCB0aGlzLmNoYXJMZW5ndGgpIHtcbiAgICAgIC8vIHN0aWxsIG5vdCBlbm91Z2ggY2hhcnMgaW4gdGhpcyBidWZmZXI/IHdhaXQgZm9yIG1vcmUgLi4uXG4gICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgLy8gcmVtb3ZlIGJ5dGVzIGJlbG9uZ2luZyB0byB0aGUgY3VycmVudCBjaGFyYWN0ZXIgZnJvbSB0aGUgYnVmZmVyXG4gICAgYnVmZmVyID0gYnVmZmVyLnNsaWNlKGF2YWlsYWJsZSwgYnVmZmVyLmxlbmd0aCk7XG5cbiAgICAvLyBnZXQgdGhlIGNoYXJhY3RlciB0aGF0IHdhcyBzcGxpdFxuICAgIGNoYXJTdHIgPSB0aGlzLmNoYXJCdWZmZXIuc2xpY2UoMCwgdGhpcy5jaGFyTGVuZ3RoKS50b1N0cmluZyh0aGlzLmVuY29kaW5nKTtcblxuICAgIC8vIENFU1UtODogbGVhZCBzdXJyb2dhdGUgKEQ4MDAtREJGRikgaXMgYWxzbyB0aGUgaW5jb21wbGV0ZSBjaGFyYWN0ZXJcbiAgICB2YXIgY2hhckNvZGUgPSBjaGFyU3RyLmNoYXJDb2RlQXQoY2hhclN0ci5sZW5ndGggLSAxKTtcbiAgICBpZiAoY2hhckNvZGUgPj0gMHhEODAwICYmIGNoYXJDb2RlIDw9IDB4REJGRikge1xuICAgICAgdGhpcy5jaGFyTGVuZ3RoICs9IHRoaXMuc3Vycm9nYXRlU2l6ZTtcbiAgICAgIGNoYXJTdHIgPSAnJztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB0aGlzLmNoYXJSZWNlaXZlZCA9IHRoaXMuY2hhckxlbmd0aCA9IDA7XG5cbiAgICAvLyBpZiB0aGVyZSBhcmUgbm8gbW9yZSBieXRlcyBpbiB0aGlzIGJ1ZmZlciwganVzdCBlbWl0IG91ciBjaGFyXG4gICAgaWYgKGJ1ZmZlci5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiBjaGFyU3RyO1xuICAgIH1cbiAgICBicmVhaztcbiAgfVxuXG4gIC8vIGRldGVybWluZSBhbmQgc2V0IGNoYXJMZW5ndGggLyBjaGFyUmVjZWl2ZWRcbiAgdGhpcy5kZXRlY3RJbmNvbXBsZXRlQ2hhcihidWZmZXIpO1xuXG4gIHZhciBlbmQgPSBidWZmZXIubGVuZ3RoO1xuICBpZiAodGhpcy5jaGFyTGVuZ3RoKSB7XG4gICAgLy8gYnVmZmVyIHRoZSBpbmNvbXBsZXRlIGNoYXJhY3RlciBieXRlcyB3ZSBnb3RcbiAgICBidWZmZXIuY29weSh0aGlzLmNoYXJCdWZmZXIsIDAsIGJ1ZmZlci5sZW5ndGggLSB0aGlzLmNoYXJSZWNlaXZlZCwgZW5kKTtcbiAgICBlbmQgLT0gdGhpcy5jaGFyUmVjZWl2ZWQ7XG4gIH1cblxuICBjaGFyU3RyICs9IGJ1ZmZlci50b1N0cmluZyh0aGlzLmVuY29kaW5nLCAwLCBlbmQpO1xuXG4gIHZhciBlbmQgPSBjaGFyU3RyLmxlbmd0aCAtIDE7XG4gIHZhciBjaGFyQ29kZSA9IGNoYXJTdHIuY2hhckNvZGVBdChlbmQpO1xuICAvLyBDRVNVLTg6IGxlYWQgc3Vycm9nYXRlIChEODAwLURCRkYpIGlzIGFsc28gdGhlIGluY29tcGxldGUgY2hhcmFjdGVyXG4gIGlmIChjaGFyQ29kZSA+PSAweEQ4MDAgJiYgY2hhckNvZGUgPD0gMHhEQkZGKSB7XG4gICAgdmFyIHNpemUgPSB0aGlzLnN1cnJvZ2F0ZVNpemU7XG4gICAgdGhpcy5jaGFyTGVuZ3RoICs9IHNpemU7XG4gICAgdGhpcy5jaGFyUmVjZWl2ZWQgKz0gc2l6ZTtcbiAgICB0aGlzLmNoYXJCdWZmZXIuY29weSh0aGlzLmNoYXJCdWZmZXIsIHNpemUsIDAsIHNpemUpO1xuICAgIGJ1ZmZlci5jb3B5KHRoaXMuY2hhckJ1ZmZlciwgMCwgMCwgc2l6ZSk7XG4gICAgcmV0dXJuIGNoYXJTdHIuc3Vic3RyaW5nKDAsIGVuZCk7XG4gIH1cblxuICAvLyBvciBqdXN0IGVtaXQgdGhlIGNoYXJTdHJcbiAgcmV0dXJuIGNoYXJTdHI7XG59O1xuXG4vLyBkZXRlY3RJbmNvbXBsZXRlQ2hhciBkZXRlcm1pbmVzIGlmIHRoZXJlIGlzIGFuIGluY29tcGxldGUgVVRGLTggY2hhcmFjdGVyIGF0XG4vLyB0aGUgZW5kIG9mIHRoZSBnaXZlbiBidWZmZXIuIElmIHNvLCBpdCBzZXRzIHRoaXMuY2hhckxlbmd0aCB0byB0aGUgYnl0ZVxuLy8gbGVuZ3RoIHRoYXQgY2hhcmFjdGVyLCBhbmQgc2V0cyB0aGlzLmNoYXJSZWNlaXZlZCB0byB0aGUgbnVtYmVyIG9mIGJ5dGVzXG4vLyB0aGF0IGFyZSBhdmFpbGFibGUgZm9yIHRoaXMgY2hhcmFjdGVyLlxuU3RyaW5nRGVjb2Rlci5wcm90b3R5cGUuZGV0ZWN0SW5jb21wbGV0ZUNoYXIgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgLy8gZGV0ZXJtaW5lIGhvdyBtYW55IGJ5dGVzIHdlIGhhdmUgdG8gY2hlY2sgYXQgdGhlIGVuZCBvZiB0aGlzIGJ1ZmZlclxuICB2YXIgaSA9IChidWZmZXIubGVuZ3RoID49IDMpID8gMyA6IGJ1ZmZlci5sZW5ndGg7XG5cbiAgLy8gRmlndXJlIG91dCBpZiBvbmUgb2YgdGhlIGxhc3QgaSBieXRlcyBvZiBvdXIgYnVmZmVyIGFubm91bmNlcyBhblxuICAvLyBpbmNvbXBsZXRlIGNoYXIuXG4gIGZvciAoOyBpID4gMDsgaS0tKSB7XG4gICAgdmFyIGMgPSBidWZmZXJbYnVmZmVyLmxlbmd0aCAtIGldO1xuXG4gICAgLy8gU2VlIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvVVRGLTgjRGVzY3JpcHRpb25cblxuICAgIC8vIDExMFhYWFhYXG4gICAgaWYgKGkgPT0gMSAmJiBjID4+IDUgPT0gMHgwNikge1xuICAgICAgdGhpcy5jaGFyTGVuZ3RoID0gMjtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8vIDExMTBYWFhYXG4gICAgaWYgKGkgPD0gMiAmJiBjID4+IDQgPT0gMHgwRSkge1xuICAgICAgdGhpcy5jaGFyTGVuZ3RoID0gMztcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8vIDExMTEwWFhYXG4gICAgaWYgKGkgPD0gMyAmJiBjID4+IDMgPT0gMHgxRSkge1xuICAgICAgdGhpcy5jaGFyTGVuZ3RoID0gNDtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICB0aGlzLmNoYXJSZWNlaXZlZCA9IGk7XG59O1xuXG5TdHJpbmdEZWNvZGVyLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgdmFyIHJlcyA9ICcnO1xuICBpZiAoYnVmZmVyICYmIGJ1ZmZlci5sZW5ndGgpXG4gICAgcmVzID0gdGhpcy53cml0ZShidWZmZXIpO1xuXG4gIGlmICh0aGlzLmNoYXJSZWNlaXZlZCkge1xuICAgIHZhciBjciA9IHRoaXMuY2hhclJlY2VpdmVkO1xuICAgIHZhciBidWYgPSB0aGlzLmNoYXJCdWZmZXI7XG4gICAgdmFyIGVuYyA9IHRoaXMuZW5jb2Rpbmc7XG4gICAgcmVzICs9IGJ1Zi5zbGljZSgwLCBjcikudG9TdHJpbmcoZW5jKTtcbiAgfVxuXG4gIHJldHVybiByZXM7XG59O1xuXG5mdW5jdGlvbiBwYXNzVGhyb3VnaFdyaXRlKGJ1ZmZlcikge1xuICByZXR1cm4gYnVmZmVyLnRvU3RyaW5nKHRoaXMuZW5jb2RpbmcpO1xufVxuXG5mdW5jdGlvbiB1dGYxNkRldGVjdEluY29tcGxldGVDaGFyKGJ1ZmZlcikge1xuICB0aGlzLmNoYXJSZWNlaXZlZCA9IGJ1ZmZlci5sZW5ndGggJSAyO1xuICB0aGlzLmNoYXJMZW5ndGggPSB0aGlzLmNoYXJSZWNlaXZlZCA/IDIgOiAwO1xufVxuXG5mdW5jdGlvbiBiYXNlNjREZXRlY3RJbmNvbXBsZXRlQ2hhcihidWZmZXIpIHtcbiAgdGhpcy5jaGFyUmVjZWl2ZWQgPSBidWZmZXIubGVuZ3RoICUgMztcbiAgdGhpcy5jaGFyTGVuZ3RoID0gdGhpcy5jaGFyUmVjZWl2ZWQgPyAzIDogMDtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNCdWZmZXIoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgdHlwZW9mIGFyZyA9PT0gJ29iamVjdCdcbiAgICAmJiB0eXBlb2YgYXJnLmNvcHkgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLmZpbGwgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLnJlYWRVSW50OCA9PT0gJ2Z1bmN0aW9uJztcbn0iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIGZvcm1hdFJlZ0V4cCA9IC8lW3NkaiVdL2c7XG5leHBvcnRzLmZvcm1hdCA9IGZ1bmN0aW9uKGYpIHtcbiAgaWYgKCFpc1N0cmluZyhmKSkge1xuICAgIHZhciBvYmplY3RzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG9iamVjdHMucHVzaChpbnNwZWN0KGFyZ3VtZW50c1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0cy5qb2luKCcgJyk7XG4gIH1cblxuICB2YXIgaSA9IDE7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG4gIHZhciBzdHIgPSBTdHJpbmcoZikucmVwbGFjZShmb3JtYXRSZWdFeHAsIGZ1bmN0aW9uKHgpIHtcbiAgICBpZiAoeCA9PT0gJyUlJykgcmV0dXJuICclJztcbiAgICBpZiAoaSA+PSBsZW4pIHJldHVybiB4O1xuICAgIHN3aXRjaCAoeCkge1xuICAgICAgY2FzZSAnJXMnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclZCc6IHJldHVybiBOdW1iZXIoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVqJzpcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnc1tpKytdKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbiAgfSk7XG4gIGZvciAodmFyIHggPSBhcmdzW2ldOyBpIDwgbGVuOyB4ID0gYXJnc1srK2ldKSB7XG4gICAgaWYgKGlzTnVsbCh4KSB8fCAhaXNPYmplY3QoeCkpIHtcbiAgICAgIHN0ciArPSAnICcgKyB4O1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gJyAnICsgaW5zcGVjdCh4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn07XG5cblxuLy8gTWFyayB0aGF0IGEgbWV0aG9kIHNob3VsZCBub3QgYmUgdXNlZC5cbi8vIFJldHVybnMgYSBtb2RpZmllZCBmdW5jdGlvbiB3aGljaCB3YXJucyBvbmNlIGJ5IGRlZmF1bHQuXG4vLyBJZiAtLW5vLWRlcHJlY2F0aW9uIGlzIHNldCwgdGhlbiBpdCBpcyBhIG5vLW9wLlxuZXhwb3J0cy5kZXByZWNhdGUgPSBmdW5jdGlvbihmbiwgbXNnKSB7XG4gIC8vIEFsbG93IGZvciBkZXByZWNhdGluZyB0aGluZ3MgaW4gdGhlIHByb2Nlc3Mgb2Ygc3RhcnRpbmcgdXAuXG4gIGlmIChpc1VuZGVmaW5lZChnbG9iYWwucHJvY2VzcykpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZXByZWNhdGUoZm4sIG1zZykuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiAgaWYgKHByb2Nlc3Mubm9EZXByZWNhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHZhciB3YXJuZWQgPSBmYWxzZTtcbiAgZnVuY3Rpb24gZGVwcmVjYXRlZCgpIHtcbiAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgaWYgKHByb2Nlc3MudGhyb3dEZXByZWNhdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy50cmFjZURlcHJlY2F0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUudHJhY2UobXNnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgICAgIH1cbiAgICAgIHdhcm5lZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgcmV0dXJuIGRlcHJlY2F0ZWQ7XG59O1xuXG5cbnZhciBkZWJ1Z3MgPSB7fTtcbnZhciBkZWJ1Z0Vudmlyb247XG5leHBvcnRzLmRlYnVnbG9nID0gZnVuY3Rpb24oc2V0KSB7XG4gIGlmIChpc1VuZGVmaW5lZChkZWJ1Z0Vudmlyb24pKVxuICAgIGRlYnVnRW52aXJvbiA9IHByb2Nlc3MuZW52Lk5PREVfREVCVUcgfHwgJyc7XG4gIHNldCA9IHNldC50b1VwcGVyQ2FzZSgpO1xuICBpZiAoIWRlYnVnc1tzZXRdKSB7XG4gICAgaWYgKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNldCArICdcXFxcYicsICdpJykudGVzdChkZWJ1Z0Vudmlyb24pKSB7XG4gICAgICB2YXIgcGlkID0gcHJvY2Vzcy5waWQ7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXNnID0gZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJXMgJWQ6ICVzJywgc2V0LCBwaWQsIG1zZyk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWJ1Z3Nbc2V0XTtcbn07XG5cblxuLyoqXG4gKiBFY2hvcyB0aGUgdmFsdWUgb2YgYSB2YWx1ZS4gVHJ5cyB0byBwcmludCB0aGUgdmFsdWUgb3V0XG4gKiBpbiB0aGUgYmVzdCB3YXkgcG9zc2libGUgZ2l2ZW4gdGhlIGRpZmZlcmVudCB0eXBlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcHJpbnQgb3V0LlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QgdGhhdCBhbHRlcnMgdGhlIG91dHB1dC5cbiAqL1xuLyogbGVnYWN5OiBvYmosIHNob3dIaWRkZW4sIGRlcHRoLCBjb2xvcnMqL1xuZnVuY3Rpb24gaW5zcGVjdChvYmosIG9wdHMpIHtcbiAgLy8gZGVmYXVsdCBvcHRpb25zXG4gIHZhciBjdHggPSB7XG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogc3R5bGl6ZU5vQ29sb3JcbiAgfTtcbiAgLy8gbGVnYWN5Li4uXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIGN0eC5kZXB0aCA9IGFyZ3VtZW50c1syXTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gNCkgY3R4LmNvbG9ycyA9IGFyZ3VtZW50c1szXTtcbiAgaWYgKGlzQm9vbGVhbihvcHRzKSkge1xuICAgIC8vIGxlZ2FjeS4uLlxuICAgIGN0eC5zaG93SGlkZGVuID0gb3B0cztcbiAgfSBlbHNlIGlmIChvcHRzKSB7XG4gICAgLy8gZ290IGFuIFwib3B0aW9uc1wiIG9iamVjdFxuICAgIGV4cG9ydHMuX2V4dGVuZChjdHgsIG9wdHMpO1xuICB9XG4gIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5zaG93SGlkZGVuKSkgY3R4LnNob3dIaWRkZW4gPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5kZXB0aCkpIGN0eC5kZXB0aCA9IDI7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY29sb3JzKSkgY3R4LmNvbG9ycyA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmN1c3RvbUluc3BlY3QpKSBjdHguY3VzdG9tSW5zcGVjdCA9IHRydWU7XG4gIGlmIChjdHguY29sb3JzKSBjdHguc3R5bGl6ZSA9IHN0eWxpemVXaXRoQ29sb3I7XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgY3R4LmRlcHRoKTtcbn1cbmV4cG9ydHMuaW5zcGVjdCA9IGluc3BlY3Q7XG5cblxuLy8gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI2dyYXBoaWNzXG5pbnNwZWN0LmNvbG9ycyA9IHtcbiAgJ2JvbGQnIDogWzEsIDIyXSxcbiAgJ2l0YWxpYycgOiBbMywgMjNdLFxuICAndW5kZXJsaW5lJyA6IFs0LCAyNF0sXG4gICdpbnZlcnNlJyA6IFs3LCAyN10sXG4gICd3aGl0ZScgOiBbMzcsIDM5XSxcbiAgJ2dyZXknIDogWzkwLCAzOV0sXG4gICdibGFjaycgOiBbMzAsIDM5XSxcbiAgJ2JsdWUnIDogWzM0LCAzOV0sXG4gICdjeWFuJyA6IFszNiwgMzldLFxuICAnZ3JlZW4nIDogWzMyLCAzOV0sXG4gICdtYWdlbnRhJyA6IFszNSwgMzldLFxuICAncmVkJyA6IFszMSwgMzldLFxuICAneWVsbG93JyA6IFszMywgMzldXG59O1xuXG4vLyBEb24ndCB1c2UgJ2JsdWUnIG5vdCB2aXNpYmxlIG9uIGNtZC5leGVcbmluc3BlY3Quc3R5bGVzID0ge1xuICAnc3BlY2lhbCc6ICdjeWFuJyxcbiAgJ251bWJlcic6ICd5ZWxsb3cnLFxuICAnYm9vbGVhbic6ICd5ZWxsb3cnLFxuICAndW5kZWZpbmVkJzogJ2dyZXknLFxuICAnbnVsbCc6ICdib2xkJyxcbiAgJ3N0cmluZyc6ICdncmVlbicsXG4gICdkYXRlJzogJ21hZ2VudGEnLFxuICAvLyBcIm5hbWVcIjogaW50ZW50aW9uYWxseSBub3Qgc3R5bGluZ1xuICAncmVnZXhwJzogJ3JlZCdcbn07XG5cblxuZnVuY3Rpb24gc3R5bGl6ZVdpdGhDb2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICB2YXIgc3R5bGUgPSBpbnNwZWN0LnN0eWxlc1tzdHlsZVR5cGVdO1xuXG4gIGlmIChzdHlsZSkge1xuICAgIHJldHVybiAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzBdICsgJ20nICsgc3RyICtcbiAgICAgICAgICAgJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVsxXSArICdtJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59XG5cblxuZnVuY3Rpb24gc3R5bGl6ZU5vQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgcmV0dXJuIHN0cjtcbn1cblxuXG5mdW5jdGlvbiBhcnJheVRvSGFzaChhcnJheSkge1xuICB2YXIgaGFzaCA9IHt9O1xuXG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsLCBpZHgpIHtcbiAgICBoYXNoW3ZhbF0gPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaGFzaDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMpIHtcbiAgLy8gUHJvdmlkZSBhIGhvb2sgZm9yIHVzZXItc3BlY2lmaWVkIGluc3BlY3QgZnVuY3Rpb25zLlxuICAvLyBDaGVjayB0aGF0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFuIGluc3BlY3QgZnVuY3Rpb24gb24gaXRcbiAgaWYgKGN0eC5jdXN0b21JbnNwZWN0ICYmXG4gICAgICB2YWx1ZSAmJlxuICAgICAgaXNGdW5jdGlvbih2YWx1ZS5pbnNwZWN0KSAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcywgY3R4KTtcbiAgICBpZiAoIWlzU3RyaW5nKHJldCkpIHtcbiAgICAgIHJldCA9IGZvcm1hdFZhbHVlKGN0eCwgcmV0LCByZWN1cnNlVGltZXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gUHJpbWl0aXZlIHR5cGVzIGNhbm5vdCBoYXZlIHByb3BlcnRpZXNcbiAgdmFyIHByaW1pdGl2ZSA9IGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKTtcbiAgaWYgKHByaW1pdGl2ZSkge1xuICAgIHJldHVybiBwcmltaXRpdmU7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICB2YXIgdmlzaWJsZUtleXMgPSBhcnJheVRvSGFzaChrZXlzKTtcblxuICBpZiAoY3R4LnNob3dIaWRkZW4pIHtcbiAgICBrZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModmFsdWUpO1xuICB9XG5cbiAgLy8gSUUgZG9lc24ndCBtYWtlIGVycm9yIGZpZWxkcyBub24tZW51bWVyYWJsZVxuICAvLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvaWUvZHd3NTJzYnQodj12cy45NCkuYXNweFxuICBpZiAoaXNFcnJvcih2YWx1ZSlcbiAgICAgICYmIChrZXlzLmluZGV4T2YoJ21lc3NhZ2UnKSA+PSAwIHx8IGtleXMuaW5kZXhPZignZGVzY3JpcHRpb24nKSA+PSAwKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICAvLyBTb21lIHR5cGUgb2Ygb2JqZWN0IHdpdGhvdXQgcHJvcGVydGllcyBjYW4gYmUgc2hvcnRjdXR0ZWQuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgdmFyIG5hbWUgPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWUgKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgdmFyIG4gPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbiArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ3VuZGVmaW5lZCcsICd1bmRlZmluZWQnKTtcbiAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcbiAgfVxuICBpZiAoaXNOdW1iZXIodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG4gIGlmIChpc0Jvb2xlYW4odmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmIChpc051bGwodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0RXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuICdbJyArIEVycm9yLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSArICddJztcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB2YWx1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0ciwgZGVzYztcbiAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodmFsdWUsIGtleSkgfHwgeyB2YWx1ZTogdmFsdWVba2V5XSB9O1xuICBpZiAoZGVzYy5nZXQpIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICghaGFzT3duUHJvcGVydHkodmlzaWJsZUtleXMsIGtleSkpIHtcbiAgICBuYW1lID0gJ1snICsga2V5ICsgJ10nO1xuICB9XG4gIGlmICghc3RyKSB7XG4gICAgaWYgKGN0eC5zZWVuLmluZGV4T2YoZGVzYy52YWx1ZSkgPCAwKSB7XG4gICAgICBpZiAoaXNOdWxsKHJlY3Vyc2VUaW1lcykpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNVbmRlZmluZWQobmFtZSkpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIucmVwbGFjZSgvXFx1MDAxYlxcW1xcZFxcZD9tL2csICcnKS5sZW5ndGggKyAxO1xuICB9LCAwKTtcblxuICBpZiAobGVuZ3RoID4gNjApIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICtcbiAgICAgICAgICAgKGJhc2UgPT09ICcnID8gJycgOiBiYXNlICsgJ1xcbiAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIG91dHB1dC5qb2luKCcsXFxuICAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIGJyYWNlc1sxXTtcbiAgfVxuXG4gIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgJyAnICsgb3V0cHV0LmpvaW4oJywgJykgKyAnICcgKyBicmFjZXNbMV07XG59XG5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmV4cG9ydHMuaXNCdWZmZXIgPSByZXF1aXJlKCcuL3N1cHBvcnQvaXNCdWZmZXInKTtcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG5cbmZ1bmN0aW9uIHBhZChuKSB7XG4gIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuLnRvU3RyaW5nKDEwKSA6IG4udG9TdHJpbmcoMTApO1xufVxuXG5cbnZhciBtb250aHMgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJyxcbiAgICAgICAgICAgICAgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cbi8vIDI2IEZlYiAxNjoxOTozNFxuZnVuY3Rpb24gdGltZXN0YW1wKCkge1xuICB2YXIgZCA9IG5ldyBEYXRlKCk7XG4gIHZhciB0aW1lID0gW3BhZChkLmdldEhvdXJzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRNaW51dGVzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRTZWNvbmRzKCkpXS5qb2luKCc6Jyk7XG4gIHJldHVybiBbZC5nZXREYXRlKCksIG1vbnRoc1tkLmdldE1vbnRoKCldLCB0aW1lXS5qb2luKCcgJyk7XG59XG5cblxuLy8gbG9nIGlzIGp1c3QgYSB0aGluIHdyYXBwZXIgdG8gY29uc29sZS5sb2cgdGhhdCBwcmVwZW5kcyBhIHRpbWVzdGFtcFxuZXhwb3J0cy5sb2cgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJyVzIC0gJXMnLCB0aW1lc3RhbXAoKSwgZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSk7XG59O1xuXG5cbi8qKlxuICogSW5oZXJpdCB0aGUgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBvbmUgY29uc3RydWN0b3IgaW50byBhbm90aGVyLlxuICpcbiAqIFRoZSBGdW5jdGlvbi5wcm90b3R5cGUuaW5oZXJpdHMgZnJvbSBsYW5nLmpzIHJld3JpdHRlbiBhcyBhIHN0YW5kYWxvbmVcbiAqIGZ1bmN0aW9uIChub3Qgb24gRnVuY3Rpb24ucHJvdG90eXBlKS4gTk9URTogSWYgdGhpcyBmaWxlIGlzIHRvIGJlIGxvYWRlZFxuICogZHVyaW5nIGJvb3RzdHJhcHBpbmcgdGhpcyBmdW5jdGlvbiBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdXNpbmcgc29tZSBuYXRpdmVcbiAqIGZ1bmN0aW9ucyBhcyBwcm90b3R5cGUgc2V0dXAgdXNpbmcgbm9ybWFsIEphdmFTY3JpcHQgZG9lcyBub3Qgd29yayBhc1xuICogZXhwZWN0ZWQgZHVyaW5nIGJvb3RzdHJhcHBpbmcgKHNlZSBtaXJyb3IuanMgaW4gcjExNDkwMykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB3aGljaCBuZWVkcyB0byBpbmhlcml0IHRoZVxuICogICAgIHByb3RvdHlwZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IHN1cGVyQ3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBpbmhlcml0IHByb3RvdHlwZSBmcm9tLlxuICovXG5leHBvcnRzLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuZXhwb3J0cy5fZXh0ZW5kID0gZnVuY3Rpb24ob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCAhaXNPYmplY3QoYWRkKSkgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn07XG5cbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG4iLCIvKipcclxuICogSmF2YXNjcmlwdCBCQVNJQyBwYXJzZXIgYW5kIGVkaXRvclxyXG4gKi9cclxuXHJcbmV4cG9ydHMuZXhlY3V0b3IgPSByZXF1aXJlKCcuL2xpYi9leGVjdXRvcicpO1xyXG5leHBvcnRzLmZpbGVzeXN0ZW0gPSByZXF1aXJlKCcuL2xpYi9maWxlc3lzdGVtJyk7XHJcbmV4cG9ydHMuZnVuY3Rpb25zID0gcmVxdWlyZSgnLi9saWIvZnVuY3Rpb25zJyk7XHJcbmV4cG9ydHMucGFyc2VyID0gcmVxdWlyZSgnLi9saWIvcGFyc2VyJyk7XHJcbmV4cG9ydHMuSU9JbnRlcmZhY2UgPSByZXF1aXJlKCcuL2xpYi9JT0ludGVyZmFjZScpO1xyXG5leHBvcnRzLnJlcGwgPSByZXF1aXJlKCcuL2xpYi9yZXBsJyk7XHJcbmV4cG9ydHMudXRpbCA9IHJlcXVpcmUoJy4vbGliL3V0aWwnKTtcclxuXHJcbi8vIENyZWF0ZSBkdW1teSBJTyBpbnRlcmZhY2VcclxudmFyIElPSW50ZXJmYWNlID0gcmVxdWlyZSgnLi9saWIvSU9JbnRlcmZhY2UnKTtcclxudmFyIGRyYXdJbnRlcmZhY2UgPSBuZXcgSU9JbnRlcmZhY2UoKTtcclxuZHJhd0ludGVyZmFjZS5zZXRPdXRwdXQoZnVuY3Rpb24ob2JqKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGRyYXdpbmcgaW50ZXJmYWNlJyk7XHJcbn0pO1xyXG5kcmF3SW50ZXJmYWNlLnNldElucHV0KGZ1bmN0aW9uKCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBkcmF3aW5nIGludGVyZmFjZScpO1xyXG59KTtcclxuSU9JbnRlcmZhY2Uuc2V0KFwiZHJhd1wiLCBkcmF3SW50ZXJmYWNlKTtcclxuXHJcbi8qKlxyXG4gKiBRdWljay1ydW5zIGNvZGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGNvZGVcclxuICogQHBhcmFtIHtleHBvcnRzLkV4ZWN1dGlvbkNvbnRleHR8RnVuY3Rpb24/fSBjdHhcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRvbmVcclxuICogQHJldHVybnMge0V4ZWN1dGlvbkNvbnRleHR9XHJcbiAqL1xyXG5leHBvcnRzLnJ1biA9IGZ1bmN0aW9uKGNvZGUsIGN0eCwgZG9uZSkge1xyXG4gICAgaWYgKCFkb25lICYmICEoY3R4IGluc3RhbmNlb2YgZXhwb3J0cy5leGVjdXRvci5FeGVjdXRpb25Db250ZXh0KSkge1xyXG4gICAgICAgIGRvbmUgPSBjdHg7XHJcbiAgICAgICAgY3R4ID0gbmV3IGV4cG9ydHMuZXhlY3V0b3IuRXhlY3V0aW9uQ29udGV4dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBhc3QgPSBleHBvcnRzLnBhcnNlci5wYXJzZShjb2RlKTtcclxuICAgIGV4cG9ydHMuZXhlY3V0b3IuZXhlY3V0ZShhc3QsIGN0eCwgZG9uZSk7XHJcbiAgICByZXR1cm4gY3R4O1xyXG59OyIsInZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XHJcbnZhciBzdHJlYW0gPSByZXF1aXJlKCdzdHJlYW0nKTtcclxuXHJcbi8qKlxyXG4gKiBBbiBpbnRlcmZhY2UgZm9yIGN1c3RvbSBpbnB1dC9vdXRwdXRcclxuICpcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IG91dHB1dCBBbiBvdXRwdXQgZnVuY3Rpb25cclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGlucHV0IEFuIGlucHV0IGZ1bmN0aW9uXHJcbiAqIEBwYXJhbSB7T2JqZWN0P30gZGF0YSBEYXRhXHJcbiAqL1xyXG5mdW5jdGlvbiBJT0ludGVyZmFjZShvdXRwdXQsIGlucHV0LCBkYXRhKSB7XHJcbiAgICB0aGlzLl9vdXRwdXQgPSBvdXRwdXQgfHwgZnVuY3Rpb24oKSB7IH07XHJcbiAgICB0aGlzLl9pbnB1dCA9IGlucHV0IHx8IGZ1bmN0aW9uKGRvbmUpIHsgZG9uZSgnXFxuJyk7IH07XHJcbiAgICB0aGlzLl9kYXRhID0gZGF0YSB8fCB7fTtcclxufVxyXG5cclxuSU9JbnRlcmZhY2UuSU9JbnRlcmZhY2UgPSBJT0ludGVyZmFjZTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIHRoZSBvdXRwdXQgZnVuY3Rpb25cclxuICpcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gb3V0cHV0XHJcbiAqL1xyXG5JT0ludGVyZmFjZS5wcm90b3R5cGUuc2V0T3V0cHV0ID0gZnVuY3Rpb24ob3V0cHV0KSB7XHJcbiAgICB0aGlzLl9vdXRwdXQgPSBvdXRwdXQ7XHJcbn07XHJcblxyXG4vKipcclxuICogU2V0cyB0aGUgaW5wdXQgZnVuY3Rpb25cclxuICpcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gaW5wdXRcclxuICovXHJcbklPSW50ZXJmYWNlLnByb3RvdHlwZS5zZXRJbnB1dCA9IGZ1bmN0aW9uKGlucHV0KSB7XHJcbiAgICB0aGlzLl9pbnB1dCA9IGlucHV0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFdyaXRlcyBzb21ldGhpbmcgdG8gdGhlIGludGVyZmFjZVxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHRleHRcclxuICogQHRocm93cyBFcnJvciBpZiBvdXRwdXQgaXMgbm90IGEgZnVuY3Rpb25cclxuICovXHJcbklPSW50ZXJmYWNlLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uKHRleHQpIHtcclxuICAgIGlmICh0eXBlb2YgdGhpcy5fb3V0cHV0ICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcignb3V0cHV0IGlzIG5vdCBhIGZ1bmN0aW9uJyk7XHJcbiAgICB0aGlzLl9vdXRwdXQuY2FsbCh0aGlzLl9kYXRhLCB0ZXh0KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBXcml0ZXMgYSBsaW5lIHRvIHRoZSBpbnRlcmZhY2VcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHRleHRcclxuICogQHRocm93cyBFcnJvciBpZiBvdXRwdXQgaXMgbm90IGEgZnVuY3Rpb25cclxuICovXHJcbklPSW50ZXJmYWNlLnByb3RvdHlwZS53cml0ZWxuID0gZnVuY3Rpb24odGV4dCkge1xyXG4gICAgdGhpcy53cml0ZSh0ZXh0ICsgJ1xcbicpO1xyXG59O1xyXG5JT0ludGVyZmFjZS5wcm90b3R5cGUubG9nID0gSU9JbnRlcmZhY2UucHJvdG90eXBlLndyaXRlbG47XHJcblxyXG4vKipcclxuICogQ29udGludWVzIHJlYWRpbmcgY2hhcmFjdGVycyB1bnRpbCB0aGUgZnVuY3Rpb24gY2FsbHMgdGhlIGNhbmNlbCBhcmd1bWVudFxyXG4gKlxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBQYXNzZWQgY3VycmVudCBjaGFyYWN0ZXIsIHRvdGFsIHZhbHVlLCBhbmQgY2FuY2VsIGZ1bmN0aW9uXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgaW5wdXQgaXMgbm90IGEgZnVuY3Rpb25cclxuICovXHJcbklPSW50ZXJmYWNlLnByb3RvdHlwZS5yZWFkID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICAgIGlmICh0eXBlb2YgdGhpcy5faW5wdXQgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKCdpbnB1dCBpcyBub3QgYSBmdW5jdGlvbicpO1xyXG4gICAgdmFyIHZhbHVlID0gJycsIHNlbGYgPSB0aGlzLCBydW5uaW5nID0gdHJ1ZTtcclxuXHJcbiAgICBzZWxmLl9pbnB1dC5jYWxsKHNlbGYuX2RhdGEsIGZ1bmN0aW9uKGNoYXJzKSB7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGFycy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcclxuICAgICAgICAgICAgdmFsdWUgKz0gY2hhcnNbaV07XHJcblxyXG4gICAgICAgICAgICB2YXIgYXJncyA9IFtjaGFyc1tpXV07XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY2hhcnNbaV0gPT09ICdzdHJpbmcnKSBhcmdzLnB1c2godmFsdWUpO1xyXG4gICAgICAgICAgICBhcmdzLnB1c2goZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxmLl9pbnB1dC5jYWxsKHNlbGYuX2RhdGEsIGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIHJ1bm5pbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBjYWxsYmFjay5hcHBseSh7fSwgYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmVhZHMgdW50aWwgYSBuZXdsaW5lIGlzIGRldGVjdGVkXHJcbiAqXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFBhc3NlZCB0aGUgZmluYWwgdmFsdWVcclxuICogQHRocm93cyBFcnJvciBpZiBpbnB1dCBpcyBub3QgYSBmdW5jdGlvblxyXG4gKi9cclxuSU9JbnRlcmZhY2UucHJvdG90eXBlLnJlYWRsbiA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XHJcbiAgICB0aGlzLnJlYWQoZnVuY3Rpb24oY2hhciwgdmFsdWUsIGNhbmNlbCkge1xyXG4gICAgICAgIGlmIChjaGFyID09PSBcIlxcblwiKSB7XHJcbiAgICAgICAgICAgIGNhbmNlbCgpO1xyXG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gdmFsdWUuc3Vic3RyaW5nKDAsIHZhbHVlLmxlbmd0aCAtIDIpO1xyXG4gICAgICAgICAgICBjYWxsYmFjayhyZXN1bHQpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFdyaXRlcyB0aGUgdGV4dCBhbmQgdGhlbiByZWFkcyB1bnRpbCB0aGUgbmV3IGxpbmVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHRleHRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gcmVzcG9uc2UgQ2FsbGVkIHdpdGggdGhlIHJlc3BvbnNlXHJcbiAqL1xyXG5JT0ludGVyZmFjZS5wcm90b3R5cGUucXVlc3Rpb24gPSBmdW5jdGlvbih0ZXh0LCByZXNwb25zZSkge1xyXG4gICAgdGhpcy53cml0ZSh0ZXh0KTtcclxuICAgIHRoaXMucmVhZGxuKHJlc3BvbnNlKTtcclxufTtcclxuXHJcbnZhciBpbnRlcmZhY2VzID0ge307XHJcbnZhciBhZGRlZEhhbmRsZXJzID0ge307XHJcblxyXG4vKipcclxuICogU2V0cyBhbiBpbnRlcmZhY2VcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGludGVyZmFjZVxyXG4gKiBAcGFyYW0ge0lPSW50ZXJmYWNlfSBpbmYgVGhlIGludGVyZmFjZVxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIGluZiBpcyBub3QgYW4gaW5zdGFuY2Ugb2YgSU9JbnRlcmZhY2VcclxuICovXHJcbklPSW50ZXJmYWNlLnNldCA9IGZ1bmN0aW9uKG5hbWUsIGluZikge1xyXG4gICAgaWYgKCEoaW5mIGluc3RhbmNlb2YgSU9JbnRlcmZhY2UpKSB0aHJvdyBuZXcgRXJyb3IoXCJJbnRlcmZhY2UgaXMgbm90IGFuIGluc3RhbmNlIG9mIElPSW50ZXJmYWNlXCIpO1xyXG4gICAgbmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKTtcclxuICAgIGludGVyZmFjZXNbbmFtZV0gPSBpbmY7XHJcbiAgICBpZiAoYWRkZWRIYW5kbGVyc1tuYW1lXSAmJiBhZGRlZEhhbmRsZXJzW25hbWVdLmxlbmd0aCkge1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWRkZWRIYW5kbGVyc1tuYW1lXS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBhZGRlZEhhbmRsZXJzW25hbWVdW2ldKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgYW4gaW50ZXJmYWNlLiBJZiBhbiBpbnRlcmZhY2UgZG9lc24ndCBleGlzdCB0aGUgZGVmYXVsdCB3aWxsIGJlIHJldHVybmVkLlxyXG4gKiBJZiB0aGUgaW50ZXJmYWNlIGlzIGxhdGVyIGNoYW5nZWQgKGkuZSBhIG5ldyBpbnRlcmZhY2UgcmVwbGFjZXMgdGhlIGN1cnJlbnQgb25lKSxcclxuICogdGhlIGludGVyZmFjZSBvYmplY3Qgd2lsbCByZWZsZWN0IHRvIGNoYW5nZSB0aGF0LiBTZXQgdGhlIHNlY29uZCBwYXJhbWV0ZXIgdG9cclxuICogZmFsc2UgdG8gc3RvcCB0aGlzXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBpbnRlcmZhY2VcclxuICogQHBhcmFtIHtCb29sZWFuPXRydWV9IHVwZGF0ZSBVcGRhdGUgdGhlIGludGVyZmFjZSBpZiBhIG5ldyBvbmUgcmVwbGFjZXMgaXRcclxuICogQHJldHVybnMge0lPSW50ZXJmYWNlfSBUaGUgaW50ZXJmYWNlLCBvciB0aGUgZGVmYXVsdCBpZiB0aGUgcmVxdWlyZWQgb25lIGRvZXNuJ3QgZXhpc3RcclxuICovXHJcbklPSW50ZXJmYWNlLmdldCA9IGZ1bmN0aW9uKG5hbWUsIHVwZGF0ZSkge1xyXG4gICAgbmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgICB2YXIgcmVzdWx0O1xyXG4gICAgaWYgKCFpbnRlcmZhY2VzW25hbWVdKSByZXN1bHQgPSBJT0ludGVyZmFjZS5nZXREZWZhdWx0KCk7XHJcbiAgICBlbHNlIHtcclxuICAgICAgICB2YXIgaW5mID0gaW50ZXJmYWNlc1tuYW1lXTtcclxuICAgICAgICByZXN1bHQgPSBuZXcgSU9JbnRlcmZhY2UoaW5mLl9vdXRwdXQsIGluZi5faW5wdXQsIHV0aWwuc2hhbGxvd0Nsb25lKGluZi5fZGF0YSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh1cGRhdGUgIT09IGZhbHNlKSB7XHJcbiAgICAgICAgaWYgKCFhZGRlZEhhbmRsZXJzW25hbWVdKSBhZGRlZEhhbmRsZXJzW25hbWVdID0gW107XHJcbiAgICAgICAgYWRkZWRIYW5kbGVyc1tuYW1lXS5wdXNoKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgdmFyIGl0ZW0gPSBJT0ludGVyZmFjZS5nZXQobmFtZSwgZmFsc2UpO1xyXG4gICAgICAgICAgICByZXN1bHQuX291dHB1dCA9IGl0ZW0uX291dHB1dDtcclxuICAgICAgICAgICAgcmVzdWx0Ll9pbnB1dCA9IGl0ZW0uX2lucHV0O1xyXG4gICAgICAgICAgICByZXN1bHQuX2RhdGEgPSBpdGVtLl9kYXRhO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIGFuIGludGVyZmFjZSBhcyB0aGUgZGVmYXVsdFxyXG4gKlxyXG4gKiBAcGFyYW0ge0lPSW50ZXJmYWNlfSBpbmYgVGhlIGludGVyZmFjZVxyXG4gKi9cclxuSU9JbnRlcmZhY2Uuc2V0RGVmYXVsdCA9IGZ1bmN0aW9uKGluZikge1xyXG4gICAgSU9JbnRlcmZhY2Uuc2V0KFwiZGVmYXVsdFwiLCBpbmYpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIGRlZmF1bHQgaW50ZXJmYWNlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtJT0ludGVyZmFjZX1cclxuICovXHJcbklPSW50ZXJmYWNlLmdldERlZmF1bHQgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmdldChcImRlZmF1bHRcIik7XHJcbn07XHJcblxyXG4vLyBDcmVhdGUgdGhlIGRlZmF1bHQgaW50ZXJmYWNlXHJcbnZhciBkZWZhdWx0SW50ZXJmYWNlID0gbmV3IElPSW50ZXJmYWNlKCk7XHJcblxyXG5pZiAocHJvY2Vzcy5icm93c2VyKSB7XHJcbiAgICAvLyBJZiBydW5uaW5nIGluIGEgYnJvd3NlciAoZS5nLiB3aXRoIEJyb3dzZXJpZnkpIHVzZSBjb25zb2xlLmxvZ1xyXG4gICAgZGVmYXVsdEludGVyZmFjZS5fZGF0YS5hY2N1bXVsYXRvciA9ICcnO1xyXG5cclxuICAgIGRlZmF1bHRJbnRlcmZhY2Uuc2V0T3V0cHV0KGZ1bmN0aW9uKHRleHQpIHtcclxuICAgICAgICB0aGlzLmFjY3VtdWxhdG9yICs9IHRleHQ7XHJcbiAgICAgICAgdmFyIHNwbGl0TGluZXMgPSB0aGlzLmFjY3VtdWxhdG9yLnNwbGl0KCdcXG4nKTtcclxuICAgICAgICBpZiAoc3BsaXRMaW5lcy5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgICAgIGlmIChzcGxpdExpbmVzW3NwbGl0TGluZXMubGVuZ3RoIC0gMV0gPT09ICcnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFjY3VtdWxhdG9yID0gdGhpcy5hY2N1bXVsYXRvci5zdWJzdHJpbmcoMCwgdGhpcy5hY2N1bXVsYXRvci5sZW5ndGggLSAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyh0aGlzLmFjY3VtdWxhdG9yKTtcclxuICAgICAgICAgICAgdGhpcy5hY2N1bXVsYXRvciA9ICcnO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEJyb3dzZXIgaGFzIG5vIGlucHV0IG1ldGhvZFxyXG59IGVsc2Uge1xyXG4gICAgLy8gSWYgcnVubmluZyBpbiBOb2RlLCB1c2Ugc3RkaW4gYW5kIHN0ZG91dFxyXG4gICAgcHJvY2Vzcy5zdGRpbi5zZXRFbmNvZGluZygndXRmOCcpO1xyXG5cclxuICAgIGRlZmF1bHRJbnRlcmZhY2Uuc2V0T3V0cHV0KGZ1bmN0aW9uKHRleHQpIHtcclxuICAgICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSh0ZXh0KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGRlZmF1bHRJbnRlcmZhY2Uuc2V0SW5wdXQoZnVuY3Rpb24oY2IpIHtcclxuICAgICAgICBpZiAoY2IpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMucmVhZGVyKSBwcm9jZXNzLnN0ZGluLnJlbW92ZUxpc3RlbmVyKCdyZWFkYWJsZScsIHRoaXMucmVhZGVyKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVhZGVyID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGNodW5rID0gcHJvY2Vzcy5zdGRpbi5yZWFkKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoY2h1bmsgIT0gbnVsbCkgY2IoY2h1bmspO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBwcm9jZXNzLnN0ZGluLm9uKCdyZWFkYWJsZScsIHRoaXMucmVhZGVyKTtcclxuICAgICAgICB9IGVsc2UgcHJvY2Vzcy5zdGRpbi5yZW1vdmVMaXN0ZW5lcigncmVhZGFibGUnLCB0aGlzLnJlYWRlcik7XHJcbiAgICB9KTtcclxufVxyXG5cclxuSU9JbnRlcmZhY2Uuc2V0RGVmYXVsdChkZWZhdWx0SW50ZXJmYWNlKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gSU9JbnRlcmZhY2U7IiwidmFyIGZ1bmN0aW9ucyA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9ucycpO1xyXG52YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3BhcnNlci9zdGF0ZW1lbnRzJyk7XHJcbnZhciBkb21haW4gPSByZXF1aXJlKCdkb21haW4nKTtcclxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XHJcbnZhciBwVXRpbCA9IHJlcXVpcmUoJy4uL3V0aWwnKTtcclxuXHJcbi8qKlxyXG4gKiBBbiBvYmplY3QgdGhhdCBwcm92aWRlcyBtb2RpZmljYXRpb24gYW5kIHJlYWRpbmcgb2YgdGhlIGN1cnJlbnQgZXhlY3V0aW9uXHJcbiAqIGNvbnRleHQsIGFzIHdlbGwgYXMgdGhlIGFiaWxpdHkgdG8gZXhlY3V0ZSBhbiBBU1QgaW4gdGhlIGNvbnRleHRcclxuICpcclxuICogQHBhcmFtIHtPYmplY3Q/fSBvcHRpb25zIE9wdGlvbnMgZm9yIGV4ZWN1dGlvblxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIEV4ZWN1dGlvbkNvbnRleHQob3B0aW9ucykge1xyXG4gICAgdGhpcy5zdHJpbmdWYXJzID0ge307XHJcbiAgICB0aGlzLm51bWJlclZhcnMgPSB7fTtcclxuICAgIHRoaXMucG9pbnRlcnMgPSB7fTtcclxuICAgIHRoaXMuZ29zdWJzID0gW107XHJcbiAgICB0aGlzLnByaXZhdGUgPSB7XHJcbiAgICAgICAgcm5kX3NlZWQ6IE1hdGgucmFuZG9tKCksXHJcbiAgICAgICAgc3ByaXRlczogW11cclxuICAgIH07XHJcbiAgICB0aGlzLmNvbnN0YW50cyA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJyk7XHJcbiAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcclxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcclxuXHJcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMuZGVsYXkgPT09ICd1bmRlZmluZWQnKSBvcHRpb25zLmRlbGF5ID0gZmFsc2U7XHJcblxyXG4gICAgLy8gQ29weSBhbGwgZnVuY3Rpb25zIGFzIGNvbnN0YW50c1xyXG4gICAgZm9yICh2YXIgayBpbiBmdW5jdGlvbnMpIHtcclxuICAgICAgICBpZiAoIWZ1bmN0aW9ucy5oYXNPd25Qcm9wZXJ0eShrKSkgY29udGludWU7XHJcbiAgICAgICAgdGhpcy5jb25zdGFudHNba10gPSBmdW5jdGlvbnNba107XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU3RvcCBtdWx0aXBsZSBjb250ZXh0cyBjb25mbGljdGluZyB3aXRoIGNvbnN0YW50c1xyXG4gICAgdGhpcy5jb25zdGFudHMgPSBwVXRpbC5zaGFsbG93Q2xvbmUodGhpcy5jb25zdGFudHMpO1xyXG59XHJcblxyXG4vKipcclxuICogQmVnaW5zIGV4ZWN1dGlvbiBvZiB0aGUgQVNUXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXJyYXl9IHJvb3QgVGhlIHJvb3Qgbm9kZXMgaW4gdGhlIEFTVFxyXG4gKiBAcGFyYW0ge09iamVjdH0gbGFiZWxzIEEgbGlzdCBvZiBhbGwgbGFiZWxzIGFuZCBsaW5lc1xyXG4gKiBAcGFyYW0ge0Z1bmN0aW9uP30gZG9uZSBBIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiB0aGUgZXhlY3V0aW9uIGlzIHRlcm1pbmF0ZWRcclxuICovXHJcbkV4ZWN1dGlvbkNvbnRleHQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihyb290LCBsYWJlbHMsIGRvbmUpIHtcclxuICAgIHRoaXMucm9vdCA9IHJvb3Q7XHJcbiAgICB0aGlzLmxhYmVscyA9IGxhYmVscztcclxuICAgIHRoaXMuY3Vyc29yID0gdGhpcy5vcHRpb25zLmN1cnNvclN0YXJ0IHx8IDA7XHJcbiAgICB0aGlzLnJ1bm5pbmcgPSB0cnVlO1xyXG4gICAgdGhpcy5kb21haW4gPSBkb21haW4uY3JlYXRlKCk7XHJcblxyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgdGhpcy5kb25lID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgaWYgKGRvbmUpIGRvbmUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5lcnJvciA9IGZhbHNlO1xyXG5cclxuICAgIHRoaXMuZG9tYWluLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGVycikge1xyXG4gICAgICAgIHRocm93IGVycjtcclxuICAgICAgICAvL2NvbnNvbGUubG9nKCdFUlJPUjogJyArIGVyci5tZXNzYWdlKTtcclxuICAgICAgICAvL3NlbGYuZXJyb3IgPSBlcnI7XHJcbiAgICAgICAgLy9zZWxmLnJ1bm5pbmcgPSBmYWxzZTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuZG9tYWluLnJ1bihmdW5jdGlvbigpIHtcclxuICAgICAgICBzZWxmLm5leHRMaW5lKCk7XHJcbiAgICB9KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY3VycmVudCBjdXJzb3IgbGluZSBhbmQgaW5jcmVtZW50cyB0aGUgY3Vyc29yXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5uZXh0TGluZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdGhpcy5jdXJzb3IgPSB0aGlzLmN1cnNvci52YWx1ZU9mKCk7XHJcbiAgICBpZiAodGhpcy5yb290Lmxlbmd0aCA8PSB0aGlzLmN1cnNvcikge1xyXG4gICAgICAgIHRoaXMudGVybWluYXRlKCk7XHJcbiAgICB9XHJcbiAgICBpZiAoIXRoaXMucnVubmluZykge1xyXG4gICAgICAgIHRoaXMuZG9uZSh0aGlzLmVycm9yKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGN1cnJlbnRMaW5lID0gdGhpcy5yb290W3RoaXMuY3Vyc29yXTtcclxuICAgIHZhciBleGVjdXRpb25SZXN1bHQgPSBjdXJyZW50TGluZS5leGVjdXRlKHRoaXMpO1xyXG5cclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIHRoaXMuY3Vyc29yKys7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBleGVjdXRpb25SZXN1bHQgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBleGVjdXRpb25SZXN1bHQoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHNlbGYubmV4dExpbmUoKTtcclxuICAgICAgICB9KTtcclxuICAgIH0gZWxzZSB0aGlzLm5leHRMaW5lKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogVmFsaWRhdGVzIGEgdmFyaWFibGUgYWdhaW5zdCBhIHR5cGVcclxuICpcclxuICogQHBhcmFtIHsqfSB2IFRoZSB2YXJpYWJsZSB0byB2YWxpZGF0ZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBUaGUgdHlwZSB0byB2YWxpZGF0ZVxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIHZhbGlkYXRpb24gZmFpbHNcclxuICovXHJcbkV4ZWN1dGlvbkNvbnRleHQucHJvdG90eXBlLnZhbGlkYXRlID0gZnVuY3Rpb24odiwgdHlwZSkge1xyXG4gICAgaWYgKHR5cGVvZiB2ICE9PSB0eXBlKSB0aHJvdyBuZXcgRXJyb3IoJ1R5cGVzIG1pc21hdGNoJyk7XHJcbn07XHJcblxyXG4vKipcclxuICogU2V0cyBhIHZhcmlhYmxlXHJcbiAqXHJcbiAqIEBwYXJhbSB7VmFyaWFibGVTdGF0ZW1lbnR9IHZhcmlhYmxlIFRoZSB2YXJpYWJsZVxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR8TnVtYmVyfFN0cmluZ30gdmFsdWUgVGhlIG5ldyB2YWx1ZVxyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUuc2V0VmFyaWFibGUgPSBmdW5jdGlvbih2YXJpYWJsZSwgdmFsdWUpIHtcclxuICAgIHZhciBtYXAgPSB2YXJpYWJsZS50eXBlID09PSAnc3RyaW5nJyA/IHRoaXMuc3RyaW5nVmFycyA6IHRoaXMubnVtYmVyVmFycztcclxuXHJcbiAgICBpZiAodmFsdWUuZXJyb3IpIHRocm93IHZhbHVlLmVycm9yO1xyXG5cclxuICAgIHZhciByZWFsVmFsdWUgPSB2YWx1ZTtcclxuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIHN0YXRlbWVudHMuRXhwcmVzc2lvblN0YXRlbWVudCkgcmVhbFZhbHVlID0gdmFsdWUuZXhlY3V0ZSh0aGlzKTtcclxuXHJcbiAgICBpZiAodmFyaWFibGUudHlwZSA9PT0gJ3N0cmluZycpIHJlYWxWYWx1ZSA9IFN0cmluZyhyZWFsVmFsdWUpO1xyXG4gICAgZWxzZSB7XHJcbiAgICAgICAgcmVhbFZhbHVlID0gcGFyc2VGbG9hdChyZWFsVmFsdWUpO1xyXG4gICAgICAgIGlmIChpc05hTihyZWFsVmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ1R5cGVzIG1pc21hdGNoJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHZhcmlhYmxlLmlzQXJyYXkpIHNldEFycmF5SW5kZXhBdChtYXBbdmFyaWFibGUubmFtZV0sIHZhcmlhYmxlLmRpbWVuc2lvbnMsIHJlYWxWYWx1ZSwgdGhpcyk7XHJcbiAgICBlbHNlIG1hcFt2YXJpYWJsZS5uYW1lXSA9IHJlYWxWYWx1ZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIGEgdmFyaWFibGUsIGNvbnN0YW50IG9yIGZ1bmN0aW9uXHJcbiAqXHJcbiAqIEBwYXJhbSB7VmFyaWFibGVTdGF0ZW1lbnR9IHZhcmlhYmxlIFRoZSB2YXJpYWJsZSB0byBnZXRcclxuICogQHJldHVybnMge051bWJlcnxTdHJpbmd9IFRoZSB2YWx1ZSBvZiB0aGUgdmFyaWFibGUgb3IgY29uc3RhbnRcclxuICovXHJcbkV4ZWN1dGlvbkNvbnRleHQucHJvdG90eXBlLmdldFZhcmlhYmxlID0gZnVuY3Rpb24odmFyaWFibGUpIHtcclxuICAgIHZhciB2YWx1ZTtcclxuXHJcbiAgICBpZiAodmFyaWFibGUudHlwZSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHRoaXMuY29uc3RhbnRzW3ZhcmlhYmxlLm5hbWUgKyAnJCddICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgIHZhbHVlID0gdGhpcy5jb25zdGFudHNbdmFyaWFibGUubmFtZSArICckJ107XHJcbiAgICB9IGVsc2UgaWYgKHZhcmlhYmxlLnR5cGUgPT09ICdudW1iZXInICYmIHR5cGVvZiB0aGlzLmNvbnN0YW50c1t2YXJpYWJsZS5uYW1lXSAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICB2YWx1ZSA9IHRoaXMuY29uc3RhbnRzW3ZhcmlhYmxlLm5hbWVdO1xyXG4gICAgfSBlbHNlIGlmICh2YXJpYWJsZS50eXBlID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgdGhpcy5jb25zdGFudHNbdmFyaWFibGUubmFtZS50b0xvd2VyQ2FzZSgpICsgJyQnXSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHZhbHVlID0gdGhpcy5jb25zdGFudHNbdmFyaWFibGUubmFtZS50b0xvd2VyQ2FzZSgpICsgJyQnXTtcclxuICAgIH0gZWxzZSBpZiAodmFyaWFibGUudHlwZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHRoaXMuY29uc3RhbnRzW3ZhcmlhYmxlLm5hbWUudG9Mb3dlckNhc2UoKV0gPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICB2YWx1ZSA9IHRoaXMuY29uc3RhbnRzW3ZhcmlhYmxlLm5hbWUudG9Mb3dlckNhc2UoKV07XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBtYXAgPSB2YXJpYWJsZS50eXBlID09PSAnc3RyaW5nJyA/IHRoaXMuc3RyaW5nVmFycyA6IHRoaXMubnVtYmVyVmFycztcclxuXHJcbiAgICAgICAgLy8gVGhpcyByZWFsbHkgc2hvdWxkbid0IGhhcHBlbiAoaXQgc2hvdWxkIGJlIGRldGVjdGVkIGFzIGEgZnVuY3Rpb24gYnkgdGhlIHBhcnNlciksIGJ1dCB3ZSdsbCBjaGVjayB0b1xyXG4gICAgICAgIC8vIG1ha2Ugc3VyZSBhbnl3YXlcclxuICAgICAgICBpZiAodmFyaWFibGUuaXNBcnJheSkgcmV0dXJuIGdldEFycmF5SW5kZXhBdChtYXBbdmFyaWFibGUubmFtZV0sIHZhcmlhYmxlLmRpbWVuc2lvbnMsIHRoaXMpO1xyXG4gICAgICAgIGlmICh0eXBlb2YgbWFwW3ZhcmlhYmxlLm5hbWVdID09PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICBpZiAodmFyaWFibGUudHlwZSA9PT0gJ3N0cmluZycpIHJldHVybiAnJztcclxuICAgICAgICAgICAgZWxzZSByZXR1cm4gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFsdWUgPSBtYXBbdmFyaWFibGUubmFtZV07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIHZhbHVlLmNhbGwodGhpcyk7XHJcbiAgICBlbHNlIHJldHVybiB2YWx1ZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIHRoZSB2YWx1ZSBvZiBhIHBvaW50ZXJcclxuICpcclxuICogQHBhcmFtIHtQb2ludGVyU3RhdGVtZW50fSBwb2ludGVyXHJcbiAqIEByZXR1cm5zIHsqfVxyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUuZ2V0UG9pbnRlciA9IGZ1bmN0aW9uKHBvaW50ZXIpIHtcclxuICAgIHZhciB2YWx1ZSA9IHRoaXMucG9pbnRlcnNbcG9pbnRlci5pZF07XHJcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJykgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHBvaW50ZXInKTtcclxuICAgIHJldHVybiB2YWx1ZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIHRoZSB2YWx1ZSBvZiBhIHBvaW50ZXJcclxuICpcclxuICogQHBhcmFtIHtQb2ludGVyU3RhdGVtZW50fSBwb2ludGVyXHJcbiAqIEBwYXJhbSB7Kn0gdmFsdWVcclxuICovXHJcbkV4ZWN1dGlvbkNvbnRleHQucHJvdG90eXBlLnNldFBvaW50ZXIgPSBmdW5jdGlvbihwb2ludGVyLCB2YWx1ZSkge1xyXG4gICAgdGhpcy5wb2ludGVyc1twb2ludGVyLmlkXSA9IHZhbHVlO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFNldHMgdGhlIHZhbHVlIG9mIGEgY29uc3RhbnRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGNvbnN0YW50XHJcbiAqIEBwYXJhbSB7U3RyaW5nfE51bWJlcn0gdmFsdWUgVGhlIHZhbHVlIG9mIHRoZSBjb25zdGFudFxyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUuc2V0Q29uc3RhbnQgPSBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xyXG4gICAgdGhpcy5jb25zdGFudHNbbmFtZV0gPSB2YWx1ZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIGEgcHJpdmF0ZSB2YXJpYWJsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgcHJpdmF0ZSB2YXJpYWJsZVxyXG4gKiBAcmV0dXJucyB7Kn0gVGhlIHZhbHVlIG9mIHRoZSB2YXJpYWJsZVxyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUuZ2V0UHJpdmF0ZSA9IGZ1bmN0aW9uKG5hbWUpIHtcclxuICAgIHJldHVybiB0aGlzLnByaXZhdGVbbmFtZV07XHJcbn07XHJcblxyXG4vKipcclxuICogU2V0cyBhIHByaXZhdGUgdmFyaWFibGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIHByaXZhdGUgdmFyaWFibGVcclxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgb2YgdGhlIHZhcmlhYmxlXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5zZXRQcml2YXRlID0gZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcclxuICAgIHRoaXMucHJpdmF0ZVtuYW1lXSA9IHZhbHVlO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIERlZmluZXMgYW4gYXJyYXlcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGFycmF5XHJcbiAqIEBwYXJhbSB7QXJyYXk8TnVtYmVyPn0gbGVuZ3RocyBUaGUgbGVuZ3RocyBvZiBlYWNoIGRpbWVuc2lvblxyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUuZGVmaW5lQXJyYXkgPSBmdW5jdGlvbihuYW1lLCBsZW5ndGhzKSB7XHJcbiAgICB2YXIgdHlwZSA9ICdudW1iZXInO1xyXG4gICAgaWYgKG5hbWVbbmFtZS5sZW5ndGggLSAxXSA9PT0gJyQnKSB7XHJcbiAgICAgICAgdHlwZSA9ICdzdHJpbmcnO1xyXG4gICAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cmluZygwLCBuYW1lLmxlbmd0aCAtIDEpO1xyXG4gICAgfVxyXG4gICAgdmFyIGFycmF5ID0gY3JlYXRlQXJyYXlEZXB0aChsZW5ndGhzLCB0eXBlID09PSAnc3RyaW5nJyA/ICcnIDogMCk7XHJcblxyXG4gICAgdmFyIG1hcCA9IHR5cGUgPT09ICdzdHJpbmcnID8gdGhpcy5zdHJpbmdWYXJzIDogdGhpcy5udW1iZXJWYXJzO1xyXG4gICAgbWFwW25hbWVdID0gYXJyYXk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ2FsbHMgYSBmdW5jdGlvblxyXG4gKlxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9uU3RhdGVtZW50fSBmdW5jT2JqIFRoZSBmdW5jdGlvbiB0byBjYWxsXHJcbiAqIEBwYXJhbSB7QXJyYXl9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byBwcm92aWRlXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5jYWxsRnVuY3Rpb24gPSBmdW5jdGlvbihmdW5jT2JqLCBhcmdzKSB7XHJcbiAgICB2YXIgZnVuY05hbWUgPSBmdW5jT2JqLm5hbWUgKyAoZnVuY09iai50eXBlID09PSAnc3RyaW5nJyA/ICckJyA6ICcnKTtcclxuICAgIHZhciBmdW5jID0gdGhpcy5jb25zdGFudHNbZnVuY05hbWUudG9Mb3dlckNhc2UoKV07XHJcbiAgICBpZiAoIWZ1bmMpIHtcclxuICAgICAgICAvLyBJdCBjb3VsZCBiZSBhbiBhcnJheSBjYWxsXHJcbiAgICAgICAgdmFyIG1hcCA9IGZ1bmNPYmoudHlwZSA9PT0gJ3N0cmluZycgPyB0aGlzLnN0cmluZ1ZhcnMgOiB0aGlzLm51bWJlclZhcnM7XHJcbiAgICAgICAgdmFyIGFyciA9IG1hcFtmdW5jT2JqLm5hbWVdO1xyXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGFycikpIHJldHVybiBnZXRBcnJheUluZGV4QXQoYXJyLCBhcmdzLCB0aGlzKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZnVuY3Rpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzLCBhcmdzKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgc3BlY2lmaWVkIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IGNtZCBUaGUgY29tbWFuZCB0byBleGVjdXRlXHJcbiAqIEByZXR1cm5zIHtGdW5jdGlvbjxGdW5jdGlvbj59IHByb3ZpZGUgYSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gZXhlY3V0aW9uIGlzIGNvbXBsZXRlXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5jYWxsQ29tbWFuZCA9IGZ1bmN0aW9uKGNtZCkge1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuICAgIGZ1bmN0aW9uIGNhbGxGdW5jKG5ld0RvbmUpIHtcclxuICAgICAgICBjbWQuZXhlY3V0ZShzZWxmLCBuZXdEb25lKTtcclxuICAgIH1cclxuICAgIHZhciBjbWREZWxheSA9IHNlbGYub3B0aW9ucy5kZWxheTtcclxuICAgIGlmIChjbWREZWxheSAhPT0gZmFsc2UpIHtcclxuICAgICAgICBjYWxsRnVuYyA9IGZ1bmN0aW9uKG5ld0RvbmUpIHtcclxuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgIGNtZC5leGVjdXRlKHNlbGYsIG5ld0RvbmUpO1xyXG4gICAgICAgICAgICB9LCBjbWREZWxheSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjYWxsRnVuYztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHb2VzIHRvIGEgbGFiZWwsIGFuZCByZXR1cm5zIG9uIFJFVFVSTlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbGFiZWwgVGhlIG5hbWUgb2YgdGhlIGxhYmVsIHRvIGdvIHRvXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5nb3N1YkxhYmVsID0gZnVuY3Rpb24obGFiZWwpIHtcclxuICAgIGlmICh0eXBlb2YgdGhpcy5sYWJlbHNbbGFiZWxdID09PSAndW5kZWZpbmVkJykgdGhyb3cgbmV3IEVycm9yKCdVbmRlZmluZWQgbGFiZWwnKTtcclxuICAgIHRoaXMuZ29zdWJzLnB1c2godGhpcy5jdXJzb3IpO1xyXG4gICAgdGhpcy5jdXJzb3IgPSB0aGlzLmxhYmVsc1tsYWJlbF07XHJcbn07XHJcblxyXG4vKipcclxuICogR29lcyB0byBhIGxhYmVsXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBsYWJlbCBUaGUgbmFtZSBvZiB0aGUgbGFiZWwgdG8gZ28gdG9cclxuICovXHJcbkV4ZWN1dGlvbkNvbnRleHQucHJvdG90eXBlLmdvdG9MYWJlbCA9IGZ1bmN0aW9uKGxhYmVsKSB7XHJcbiAgICBpZiAodHlwZW9mIHRoaXMubGFiZWxzW2xhYmVsXSA9PT0gJ3VuZGVmaW5lZCcpIHRocm93IG5ldyBFcnJvcignVW5kZWZpbmVkIGxhYmVsJyk7XHJcbiAgICB0aGlzLmN1cnNvciA9IHRoaXMubGFiZWxzW2xhYmVsXTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRvIHRoZSBsYXN0IEdPU1VCIHBvc2l0aW9uXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5yZXR1cm5MYWJlbCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYgKCF0aGlzLmdvc3Vicy5sZW5ndGgpIHRocm93IG5ldyBFcnJvcignUkVUVVJOIHdpdGhvdXQgR09TVUInKTtcclxuICAgIHRoaXMuY3Vyc29yID0gdGhpcy5nb3N1YnMucG9wKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogRW5kcyB0aGUgcHJvZ3JhbVxyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUudGVybWluYXRlID0gZnVuY3Rpb24oKSB7XHJcbiAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcclxufTtcclxuXHJcblxyXG4vKipcclxuICogU2V0cyB0aGUgYXJyYXkgaXRlbSBhdCBhIGNlcnRhaW4gaW5kZXgsIGluY2x1ZGluZyBtdWx0aXBsZSBkaW1lbnNpb25zXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXJyYXl9IGFyciBUaGUgYXJyYXkgdG8gc2VhcmNoXHJcbiAqIEBwYXJhbSB7QXJyYXk8RXhwcmVzc2lvblN0YXRlbWVudD59IGRpbWVuc2lvbnMgQW4gYXJyYXkgb2YgaW5kZXhlc1xyXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHZhbCBUaGUgdmFsdWUgdG8gcHV0IGluIHRoZSBhcnJheVxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGEgVGhlIGV4ZWN1dGlvbiBkYXRhIGNvbnRleHRcclxuICogQHByaXZhdGVcclxuICovXHJcbmZ1bmN0aW9uIHNldEFycmF5SW5kZXhBdChhcnIsIGRpbWVuc2lvbnMsIHZhbCwgZGF0YSkge1xyXG4gICAgdmFyIGN1cnJlbnREaW1lbnNpb24gPSBkaW1lbnNpb25zWzBdLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKGN1cnJlbnREaW1lbnNpb24sICdudW1iZXInKTtcclxuICAgIGN1cnJlbnREaW1lbnNpb24gLT0gMTtcclxuXHJcbiAgICBpZiAoYXJyLmxlbmd0aCA8PSBjdXJyZW50RGltZW5zaW9uIHx8IGN1cnJlbnREaW1lbnNpb24gPCAwKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJyYXkgYm91bmRzJyk7XHJcbiAgICB2YXIgaXRlbSA9IGFycltjdXJyZW50RGltZW5zaW9uXTtcclxuICAgIGlmIChkaW1lbnNpb25zLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbSkpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcnJheSBkaW1lbnNpb25zJyk7XHJcbiAgICAgICAgcmV0dXJuIHNldEFycmF5SW5kZXhBdChhcnJbY3VycmVudERpbWVuc2lvbl0sIGRpbWVuc2lvbnMuc2xpY2UoMSksIHZhbCwgIGRhdGEpO1xyXG4gICAgfSBlbHNlIGFycltjdXJyZW50RGltZW5zaW9uXSA9IHZhbDtcclxufVxyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIGFycmF5IGl0ZW0gYXQgYSBjZXJ0YWluIGluZGV4LCBpbmNsdWRpbmcgbXVsdGlwbGUgZGltZW5zaW9uc1xyXG4gKlxyXG4gKiBAcGFyYW0ge0FycmF5fSBhcnIgVGhlIGFycmF5IHRvIHNlYXJjaFxyXG4gKiBAcGFyYW0ge0FycmF5PEV4cHJlc3Npb25TdGF0ZW1lbnQ+fSBkaW1lbnNpb25zIEFuIGFycmF5IG9mIGluZGV4ZXNcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhIFRoZSBleGVjdXRpb24gZGF0YSBjb250ZXh0XHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ8U3RyaW5nfVxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0QXJyYXlJbmRleEF0KGFyciwgZGltZW5zaW9ucywgZGF0YSkge1xyXG4gICAgdmFyIGN1cnJlbnREaW1lbnNpb24gPSBkaW1lbnNpb25zWzBdO1xyXG4gICAgZGF0YS52YWxpZGF0ZShjdXJyZW50RGltZW5zaW9uLCAnbnVtYmVyJyk7XHJcbiAgICBjdXJyZW50RGltZW5zaW9uID0gTWF0aC5mbG9vcihjdXJyZW50RGltZW5zaW9uIC0gMSk7XHJcblxyXG4gICAgaWYgKGFyci5sZW5ndGggPD0gY3VycmVudERpbWVuc2lvbiB8fCBjdXJyZW50RGltZW5zaW9uIDwgMCkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFycmF5IGJvdW5kcycpO1xyXG4gICAgdmFyIGl0ZW0gPSBhcnJbY3VycmVudERpbWVuc2lvbl07XHJcbiAgICBpZiAoZGltZW5zaW9ucy5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW0pKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJyYXkgZGltZW5zaW9ucycpO1xyXG4gICAgICAgIHJldHVybiBnZXRBcnJheUluZGV4QXQoYXJyW2N1cnJlbnREaW1lbnNpb25dLCBkaW1lbnNpb25zLnNsaWNlKDEpLCBkYXRhKTtcclxuICAgIH0gZWxzZSByZXR1cm4gaXRlbTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENyZWF0ZXMgYW4gYXJyYXkgd2l0aCB0aGUgc3BlY2lmaWVkIGxlbmd0aHMgb2YgZGltZW5zaW9uc1xyXG4gKlxyXG4gKiBAcGFyYW0ge0FycmF5PE51bWJlcj59IGRpbWVuc2lvbnMgVGhlIGFycmF5IGRpbWVuc2lvbnNcclxuICogQHBhcmFtIHsqfSBlbmRwb2ludCBUaGUgdmFsdWUgZm9yIHRoZSBhcnJheSBlbmRwb2ludFxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gY3JlYXRlQXJyYXlEZXB0aChkaW1lbnNpb25zLCBlbmRwb2ludCkge1xyXG4gICAgdmFyIGN1cnJlbnREaW1lbnNpb24gPSBkaW1lbnNpb25zWzBdO1xyXG5cclxuICAgIHZhciBuZXdBcnIgPSBuZXcgQXJyYXkoY3VycmVudERpbWVuc2lvbik7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGN1cnJlbnREaW1lbnNpb247IGkrKykge1xyXG4gICAgICAgIHZhciB2YWx1ZSA9IGVuZHBvaW50O1xyXG4gICAgICAgIGlmIChkaW1lbnNpb25zLmxlbmd0aCA+IDEpIHZhbHVlID0gY3JlYXRlQXJyYXlEZXB0aChkaW1lbnNpb25zLnNsaWNlKDEpLCBlbmRwb2ludCk7XHJcbiAgICAgICAgbmV3QXJyW2ldID0gdmFsdWU7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbmV3QXJyO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEV4ZWN1dGlvbkNvbnRleHQ7IiwiLyoqXHJcbiAqIERlZmF1bHQgY29uc3RhbnRzXHJcbiAqL1xyXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4uL3V0aWwnKTtcclxuXHJcbnZhciBtb250aHMgPSBbXHJcbiAgICAnSmFudWFyeScsXHJcbiAgICAnRmVicnVhcnknLFxyXG4gICAgJ01hcmNoJyxcclxuICAgICdBcHJpbCcsXHJcbiAgICAnTWF5JyxcclxuICAgICdKdW5lJyxcclxuICAgICdKdWx5JyxcclxuICAgICdBdWd1c3QnLFxyXG4gICAgJ1NlcHRlbWJlcicsXHJcbiAgICAnT2N0b2JlcicsXHJcbiAgICAnTm92ZW1iZXInLFxyXG4gICAgJ0RlY2VtYmVyJ1xyXG5dO1xyXG52YXIgZGF5cyA9IFtcclxuICAgICdTdW5kYXknLFxyXG4gICAgJ01vbmRheScsXHJcbiAgICAnVHVlc2RheScsXHJcbiAgICAnV2VkbmVzZGF5JyxcclxuICAgICdUaHVyc2RheScsXHJcbiAgICAnRnJpZGF5JyxcclxuICAgICdTYXR1cmRheSdcclxuXTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgJ1BJJzogTWF0aC5QSSxcclxuICAgICdUV09fUEknOiBNYXRoLlBJICogMixcclxuICAgICdIQUxGX1BJJzogTWF0aC5QSSAvIDIsXHJcblxyXG4gICAgJ0VPRic6IDAsXHJcblxyXG4gICAgJ0JDb2xvclInOiAwLFxyXG4gICAgJ0JDb2xvckcnOiAwLFxyXG4gICAgJ0JDb2xvckInOiAwLFxyXG4gICAgJ1RDb2xvclInOiAwLFxyXG4gICAgJ1RDb2xvckcnOiAxLFxyXG4gICAgJ1RDb2xvckInOiAwLFxyXG5cclxuICAgICdDb2xvclInOiAwLFxyXG4gICAgJ0NvbG9yRyc6IDEsXHJcbiAgICAnQ29sb3JCJzogMCxcclxuICAgICdDb2xvckEnOiAxLFxyXG5cclxuICAgICdJc1JldGluYSc6IDAsXHJcbiAgICAnSXNQaG9uZSc6IDAsXHJcbiAgICAnSXNQYWQnOiAwLFxyXG5cclxuICAgICdUaWNrQ291bnQnOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gdXRpbC5ub3coKTtcclxuICAgIH0sXHJcbiAgICAnREFURSQnOiBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgZGF0ZSA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgcmV0dXJuIGRhdGUuZ2V0RGF0ZSgpICsgJyAnICsgbW9udGhzW2RhdGUuZ2V0TW9udGgoKV0uc3Vic3RyaW5nKDAsIDMpICsgJyAnICsgZGF0ZS5nZXRGdWxsWWVhcigpO1xyXG4gICAgfSxcclxuICAgICdUSU1FJCc6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhciBkYXRlID0gbmV3IERhdGUoKTtcclxuICAgICAgICB2YXIgYW0gPSB0cnVlLCBob3VycyA9IGRhdGUuZ2V0SG91cnMoKTtcclxuICAgICAgICBpZiAoaG91cnMgPiAxMikge1xyXG4gICAgICAgICAgICBob3VycyAtPSAxMjtcclxuICAgICAgICAgICAgYW0gPSBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB1dGlsLnBhZChob3VycywgMiwgJzAnKSArICc6JyArXHJcbiAgICAgICAgICAgICAgICB1dGlsLnBhZChkYXRlLmdldE1pbnV0ZXMoKSwgMiwgJzAnKSArICc6JyArXHJcbiAgICAgICAgICAgICAgICB1dGlsLnBhZChkYXRlLmdldFNlY29uZHMoKSwgMiwgJzAnKSArXHJcbiAgICAgICAgICAgICAgICAoYW0gPyAnIGFtJyA6ICcgcG0nKTtcclxuICAgIH0sXHJcbiAgICAnRGF0ZVllYXInOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gKG5ldyBEYXRlKCkpLmdldEZ1bGxZZWFyKCk7XHJcbiAgICB9LFxyXG4gICAgJ0RhdGVNb250aCc6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiAobmV3IERhdGUoKSkuZ2V0TW9udGgoKSArIDE7XHJcbiAgICB9LFxyXG4gICAgJ0RhdGVNb250aCQnOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gbW9udGhzWyhuZXcgRGF0ZSgpKS5nZXRNb250aCgpXTtcclxuICAgIH0sXHJcbiAgICAnRGF0ZURheSc6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiAobmV3IERhdGUoKSkuZ2V0RGF0ZSgpO1xyXG4gICAgfSxcclxuICAgICdEYXRlV2Vla0RheSQnOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gZGF5c1sobmV3IERhdGUoKSkuZ2V0RGF5KCldO1xyXG4gICAgfSxcclxuICAgICdUaW1lSG91cnMnOiBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgaG91cnMgPSAobmV3IERhdGUoKSkuZ2V0SG91cnMoKTtcclxuICAgICAgICBpZiAoaG91cnMgPT09IDApIGhvdXJzID0gMjQ7XHJcbiAgICAgICAgcmV0dXJuIGhvdXJzO1xyXG4gICAgfSxcclxuICAgICdUaW1lTWludXRlcyc6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiAobmV3IERhdGUoKSkuZ2V0TWludXRlcygpO1xyXG4gICAgfSxcclxuICAgICdUaW1lU2Vjb25kcyc6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiAobmV3IERhdGUoKSkuZ2V0U2Vjb25kcygpO1xyXG4gICAgfVxyXG59OyIsInZhciBFeGVjdXRpb25Db250ZXh0ID0gcmVxdWlyZSgnLi9FeGVjdXRpb25Db250ZXh0Jyk7XHJcbnZhciBjb25zdGFudHMgPSByZXF1aXJlKCcuL2NvbnN0YW50cycpO1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBhYnN0cmFjdCBzeW50YXggdHJlZVxyXG4gKlxyXG4gKiBAcGFyYW0ge0Fic3RyYWN0U3ludGF4VHJlZX0gYXN0IFRoZSB0cmVlIHRvIGV4ZWN1dGVcclxuICogQHBhcmFtIHtleHBvcnRzLkV4ZWN1dGlvbkNvbnRleHR8RXhlY3V0aW9uQ29udGV4dHxGdW5jdGlvbj99IGN0eCBUaGUgY29udGV4dFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9uP30gZG9uZSBDYWxsZWQgd2hlbiBleGVjdXRpb24gaXMgY29tcGxldGVcclxuICovXHJcbmZ1bmN0aW9uIGV4ZWN1dGUoYXN0LCBjdHgsIGRvbmUpIHtcclxuICAgIGlmICghZG9uZSAmJiAhKGN0eCBpbnN0YW5jZW9mIEV4ZWN1dGlvbkNvbnRleHQpKSB7XHJcbiAgICAgICAgZG9uZSA9IGN0eDtcclxuICAgICAgICBjdHggPSBuZXcgRXhlY3V0aW9uQ29udGV4dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzdC5leGVjdXRlKGN0eCwgZG9uZSk7XHJcbn1cclxuXHJcbmV4cG9ydHMuZXhlY3V0ZSA9IGV4ZWN1dGU7XHJcblxyXG5leHBvcnRzLkV4ZWN1dGlvbkNvbnRleHQgPSBFeGVjdXRpb25Db250ZXh0O1xyXG5leHBvcnRzLmNvbnN0YW50cyA9IGNvbnN0YW50czsiLCJ2YXIgRmlsZSA9IHJlcXVpcmUoJy4vRmlsZScpO1xyXG52YXIgZmlsZXN5c3RlbSA9IHJlcXVpcmUoJy4vJyk7XHJcblxyXG4vKipcclxuICogQSBmaWxlc3lzdGVtIGRyaXZlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBkcml2ZVxyXG4gKiBAcGFyYW0ge09iamVjdH0gcm9vdCBUaGUgZHJpdmUgY29udGVudHNcclxuICovXHJcbmZ1bmN0aW9uIERyaXZlKG5hbWUsIHJvb3QpIHtcclxuICAgIHRoaXMubmFtZSA9IG5hbWU7XHJcbiAgICB0aGlzLnJvb3QgPSByb290O1xyXG59XHJcblxyXG4vKipcclxuICogT3BlbnMgYSBmaWxlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlIFRoZSBuYW1lIG9mIHRoZSBmaWxlXHJcbiAqL1xyXG5Ecml2ZS5wcm90b3R5cGUub3BlbiA9IGZ1bmN0aW9uKGZpbGUpIHtcclxuICAgIGlmICghdGhpcy5yb290W2ZpbGVdKSB0aGlzLnJvb3RbZmlsZV0gPSBbXTtcclxuICAgIHJldHVybiBuZXcgRmlsZShmaWxlLCB0aGlzLnJvb3RbZmlsZV0sIHRoaXMpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFNhdmVzIHRoZSBkcml2ZVxyXG4gKlxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9uP30gZG9uZSBBIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiBjb21wbGV0ZVxyXG4gKi9cclxuRHJpdmUucHJvdG90eXBlLnNhdmUgPSBmdW5jdGlvbihkb25lKSB7XHJcbiAgICBmaWxlc3lzdGVtLnNhdmUoZG9uZSk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IERyaXZlOyIsIi8qKlxyXG4gKiBSZXByZXNlbnRzIGEgZmlsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgZmlsZVxyXG4gKiBAcGFyYW0ge0FycmF5fSBmaWxlIFRoZSBmaWxlIGNvbnRlbnRzXHJcbiAqIEBwYXJhbSB7RHJpdmV9IHBhcmVudCBUaGUgcGFyZW50IGRyaXZlXHJcbiAqL1xyXG5mdW5jdGlvbiBGaWxlKG5hbWUsIGZpbGUsIHBhcmVudCkge1xyXG4gICAgdGhpcy5uYW1lID0gbmFtZTtcclxuICAgIHRoaXMuZmlsZSA9IGZpbGU7XHJcbiAgICB0aGlzLnBhcmVudCA9IHBhcmVudDtcclxuICAgIHRoaXMucmVhZEN1cnNvciA9IDA7XHJcbiAgICB0aGlzLmVvZiA9IGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogU2V0cyB0aGUgY29udGVudCBvZiB0aGUgZmlsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gY29udGVudHNcclxuICovXHJcbkZpbGUucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uKGNvbnRlbnRzKSB7XHJcbiAgICB0aGlzLnBhcmVudC5yb290W3RoaXMubmFtZV0gPSB0aGlzLmZpbGUgPSBTdHJpbmcoY29udGVudHMpLnNwbGl0KCdcXG4nKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDbGVhcnMgdGhlIGNvbnRlbnRzIG9mIHRoZSBmaWxlXHJcbiAqL1xyXG5GaWxlLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdGhpcy5wYXJlbnQucm9vdFt0aGlzLm5hbWVdID0gdGhpcy5maWxlID0gW107XHJcbn07XHJcblxyXG4vKipcclxuICogUmVhZHMgdGhlIG5leHQgbGluZSBmcm9tIHRoZSBmaWxlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtTdHJpbmd9XHJcbiAqL1xyXG5GaWxlLnByb3RvdHlwZS5uZXh0TGluZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYgKHRoaXMuZW9mIHx8IHRoaXMucmVhZEN1cnNvciA+PSB0aGlzLmZpbGUubGVuZ3RoKSB7XHJcbiAgICAgICAgdGhpcy5lb2YgPSB0cnVlO1xyXG4gICAgICAgIHJldHVybiAnJztcclxuICAgIH1cclxuICAgIHZhciB2YWx1ZSA9IHRoaXMuZmlsZVt0aGlzLnJlYWRDdXJzb3JdO1xyXG4gICAgdGhpcy5yZWFkQ3Vyc29yKys7XHJcbiAgICByZXR1cm4gdmFsdWU7XHJcbn07XHJcblxyXG4vKipcclxuICogTW92ZXMgdGhlIGN1cnNvciB0byBhIGNlcnRhaW4gcG9zaXRpb25cclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IHBvcyBOZXcgY3Vyc29yIHBvc2l0aW9uXHJcbiAqL1xyXG5GaWxlLnByb3RvdHlwZS5tb3ZlVG8gPSBmdW5jdGlvbihwb3MpIHtcclxuICAgIHRoaXMucmVhZEN1cnNvciA9IHBvcztcclxuICAgIHRoaXMuZW9mID0gdGhpcy5yZWFkQ3Vyc29yID49IHRoaXMuZmlsZS5sZW5ndGg7XHJcbn07XHJcblxyXG4vKipcclxuICogQXBwZW5kcyB0aGUgdGV4dCB0byB0aGUgZW5kIG9mIHRoZSBmaWxlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0XHJcbiAqL1xyXG5GaWxlLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uKHRleHQpIHtcclxuICAgIHZhciBzcGxpdCA9IFN0cmluZyh0ZXh0KS5zcGxpdCgnXFxuJyk7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNwbGl0Lmxlbmd0aDsgaSsrKSB0aGlzLmZpbGUucHVzaChzcGxpdFtpXSk7XHJcbn07XHJcblxyXG4vKipcclxuICogU2F2ZXMgdGhlIGZpbGVcclxuICpcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRvbmUgQSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gY29tcGxldGVcclxuICovXHJcbkZpbGUucHJvdG90eXBlLnNhdmUgPSBmdW5jdGlvbihkb25lKSB7XHJcbiAgICB0aGlzLnBhcmVudC5zYXZlKGRvbmUpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBGaWxlOyIsIi8qKlxyXG4gKiBCQVNJQyBGaWxlc3lzdGVtXHJcbiAqL1xyXG5cclxudmFyIGZzID0gcmVxdWlyZSgnZnMnKTtcclxudmFyIERyaXZlID0gcmVxdWlyZSgnLi9Ecml2ZScpO1xyXG5cclxudmFyIGFsbG93ZWREcml2ZXMgPSBbXCJhXCIsIFwiYlwiXTtcclxuXHJcbnZhciBmaWxlQ29udGVudHMgPSBwcm9jZXNzLmJyb3dzZXIgPyB7fSA6IGZhbHNlO1xyXG52YXIgZHJpdmVDYWNoZSA9IHt9O1xyXG5cclxuZXhwb3J0cy5Ecml2ZSA9IERyaXZlO1xyXG5leHBvcnRzLkZpbGUgPSByZXF1aXJlKCcuL0ZpbGUnKTtcclxuXHJcbi8qKlxyXG4gKiBJbml0aWFsaXplcyB0aGUgZmlsZSBzeXN0ZW1cclxuICpcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRvbmUgQSBjYWxsYmFjayBmb3Igd2hlbiBpbml0aWFsaXphdGlvbiBpcyBjb21wbGV0ZVxyXG4gKi9cclxuZnVuY3Rpb24gaW5pdGlhbGl6ZShkb25lKSB7XHJcbiAgICBkb25lID0gZG9uZSB8fCBmdW5jdGlvbigpIHsgfTtcclxuICAgIGlmIChmaWxlQ29udGVudHMpIGRvbmUoKTtcclxuXHJcbiAgICBmcy5yZWFkRmlsZShfX2Rpcm5hbWUgKyAnLy4uLy4uL2RhdGEvZmlsZXN5c3RlbS5qc29uJywge1xyXG4gICAgICAgIGVuY29kaW5nOiAndXRmOCdcclxuICAgIH0sIGZ1bmN0aW9uKGVyciwgZGF0YSkge1xyXG4gICAgICAgIGlmIChlcnIpIGZpbGVDb250ZW50cyA9IHt9O1xyXG4gICAgICAgIGVsc2UgZmlsZUNvbnRlbnRzID0gSlNPTi5wYXJzZShkYXRhKTtcclxuICAgICAgICBkb25lKCk7XHJcbiAgICB9KTtcclxufVxyXG5leHBvcnRzLmluaXRpYWxpemUgPSBpbml0aWFsaXplO1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgd2hldGhlciB0aGUgZmlsZXN5c3RlbSBpcyBpbml0aWFsaXplZFxyXG4gKlxyXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn1cclxuICovXHJcbmZ1bmN0aW9uIGluaXRpYWxpemVkKCkge1xyXG4gICAgcmV0dXJuIEJvb2xlYW4oZmlsZUNvbnRlbnRzKTtcclxufVxyXG5leHBvcnRzLmluaXRpYWxpemVkID0gaW5pdGlhbGl6ZWQ7XHJcblxyXG4vKipcclxuICogR2V0cyBhIGRyaXZlLiBVc2luZyB0aGUgJ2RvbmUnIHBhcmFtZXRlciBpcyByZWNvbW1lbmRlZCAodGhlIGZpbGVzeXN0ZW0gd2lsbCBiZSBpbml0aWFsaXplZCBpZiBpdCBoYXNuJ3QgYmVlbilcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGRyaXZlXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb248RHJpdmU+P30gZG9uZSBBIGNhbGxiYWNrIHRvIGNhbGwgd2hlbiB0aGUgZHJpdmUgaXMgYWNxdWlyZWRcclxuICogQHJldHVybnMge0RyaXZlfHVuZGVmaW5lZH0gVGhlIGRyaXZlLCBvciB1bmRlZmluZWQgaWYgbm90IHlldCBpbml0aWFsaXplZFxyXG4gKi9cclxuZnVuY3Rpb24gZHJpdmUobmFtZSwgZG9uZSkge1xyXG4gICAgbmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKTtcclxuICAgIGRvbmUgPSBkb25lIHx8IGZ1bmN0aW9uKCkgeyB9O1xyXG5cclxuICAgIGlmIChhbGxvd2VkRHJpdmVzLmluZGV4T2YobmFtZSkgPT09IC0xKSByZXR1cm4gZG9uZShuZXcgRXJyb3IoXCJVbmtub3duIGRyaXZlXCIpKTtcclxuICAgIGlmICghZmlsZUNvbnRlbnRzKSByZXR1cm4gaW5pdGlhbGl6ZShmdW5jdGlvbigpIHsgZHJpdmUobmFtZSwgZG9uZSk7IH0pO1xyXG5cclxuICAgIGlmICghZmlsZUNvbnRlbnRzW25hbWVdKSBmaWxlQ29udGVudHNbbmFtZV0gPSB7fTtcclxuICAgIGlmICghZHJpdmVDYWNoZVtuYW1lXSkgZHJpdmVDYWNoZVtuYW1lXSA9IG5ldyBEcml2ZShuYW1lLCBmaWxlQ29udGVudHNbbmFtZV0pO1xyXG5cclxuICAgIGRvbmUoZHJpdmVDYWNoZVtuYW1lXSk7XHJcbiAgICByZXR1cm4gZHJpdmVDYWNoZVtuYW1lXTtcclxufVxyXG5leHBvcnRzLmRyaXZlID0gZHJpdmU7XHJcblxyXG4vKipcclxuICogU2F2ZXMgdGhlIGZpbGVzeXN0ZW1cclxuICpcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRvbmUgQSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gY29tcGxldGVcclxuICovXHJcbmZ1bmN0aW9uIHNhdmUoZG9uZSkge1xyXG4gICAgaWYgKHByb2Nlc3MuYnJvd3NlcikgcmV0dXJuIGRvbmUoKTtcclxuXHJcbiAgICBmcy53cml0ZUZpbGUoX19kaXJuYW1lICsgJy8uLi8uLi9kYXRhL2ZpbGVzeXN0ZW0uanNvbicsIEpTT04uc3RyaW5naWZ5KGZpbGVDb250ZW50cyksIGZ1bmN0aW9uKGVycikge1xyXG4gICAgICAgIGlmIChkb25lKSBkb25lKGVycik7XHJcbiAgICB9KTtcclxufVxyXG5leHBvcnRzLnNhdmUgPSBzYXZlOyIsInZhciBjdHggPSByZXF1aXJlKCcuLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgaWYgdGhlIG1vdXNlIGlzIGN1cnJlbnRseSBwcmVzc2VkXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLnRvdWNoID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gMDtcclxuICAgIGN0eC5yZWFkKGZ1bmN0aW9uKHJlc3BvbnNlLCBjYW5jZWwpIHtcclxuICAgICAgICBpZiAocmVzcG9uc2UuY29tbWFuZCAhPT0gJ21vdXNlZG93bicpIHJldHVybjtcclxuICAgICAgICBjYW5jZWwoKTtcclxuICAgICAgICByZXN1bHQgPSByZXNwb25zZS5kYXRhO1xyXG4gICAgfSk7XHJcbiAgICBjdHgud3JpdGUoeyBjb21tYW5kOiBcIm1vdXNlZG93blwiIH0pO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBtb3VzZSBYIHBvc2l0aW9uXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLnRvdWNoeCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHJlc3VsdCA9IDA7XHJcbiAgICBjdHgucmVhZChmdW5jdGlvbihyZXNwb25zZSwgY2FuY2VsKSB7XHJcbiAgICAgICAgaWYgKHJlc3BvbnNlLmNvbW1hbmQgIT09ICdtb3VzZXBvcycpIHJldHVybjtcclxuICAgICAgICBjYW5jZWwoKTtcclxuICAgICAgICByZXN1bHQgPSByZXNwb25zZS5kYXRhLng7XHJcbiAgICB9KTtcclxuICAgIGN0eC53cml0ZSh7IGNvbW1hbmQ6ICdtb3VzZXBvcycgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIG1vdXNlIFkgcG9zaXRpb25cclxuICpcclxuICogQHJldHVybnMge251bWJlcn1cclxuICovXHJcbmV4cG9ydHMudG91Y2h5ID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gMDtcclxuICAgIGN0eC5yZWFkKGZ1bmN0aW9uKHJlc3BvbnNlLCBjYW5jZWwpIHtcclxuICAgICAgICBpZiAocmVzcG9uc2UuY29tbWFuZCAhPT0gJ21vdXNlcG9zJykgcmV0dXJuO1xyXG4gICAgICAgIGNhbmNlbCgpO1xyXG4gICAgICAgIHJlc3VsdCA9IHJlc3BvbnNlLmRhdGEueTtcclxuICAgIH0pO1xyXG4gICAgY3R4LndyaXRlKHsgY29tbWFuZDogJ21vdXNlcG9zJyB9KTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgY2FudmFzIHdpZHRoXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLnNjcmVlbndpZHRoID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gMDtcclxuICAgIGN0eC5yZWFkKGZ1bmN0aW9uKHJlc3BvbnNlLCBjYW5jZWwpIHtcclxuICAgICAgICBpZiAocmVzcG9uc2UuY29tbWFuZCAhPT0gJ3NjcmVlbnNpemUnKSByZXR1cm47XHJcbiAgICAgICAgY2FuY2VsKCk7XHJcbiAgICAgICAgcmVzdWx0ID0gcmVzcG9uc2UuZGF0YS53aWR0aDtcclxuICAgIH0pO1xyXG4gICAgY3R4LndyaXRlKHsgY29tbWFuZDogJ3NjcmVlbnNpemUnIH0pO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBjYW52YXMgaGVpZ2h0XHJcbiAqXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLnNjcmVlbmhlaWdodCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHJlc3VsdCA9IDA7XHJcbiAgICBjdHgucmVhZChmdW5jdGlvbihyZXNwb25zZSwgY2FuY2VsKSB7XHJcbiAgICAgICAgaWYgKHJlc3BvbnNlLmNvbW1hbmQgIT09ICdzY3JlZW5zaXplJykgcmV0dXJuO1xyXG4gICAgICAgIGNhbmNlbCgpO1xyXG4gICAgICAgIHJlc3VsdCA9IHJlc3BvbnNlLmRhdGEuaGVpZ2h0O1xyXG4gICAgfSk7XHJcbiAgICBjdHgud3JpdGUoeyBjb21tYW5kOiAnc2NyZWVuc2l6ZScgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgaWYgdGhlIGNhbnZhcyBoZWlnaHQgaXMgYmlnZ2VyIHRoYW4gd2lkdGhcclxuICpcclxuICogQHJldHVybnMge251bWJlcn1cclxuICovXHJcbmV4cG9ydHMuaXNwb3J0cmFpdCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHJlc3VsdCA9IDA7XHJcbiAgICBjdHgucmVhZChmdW5jdGlvbihyZXNwb25zZSwgY2FuY2VsKSB7XHJcbiAgICAgICAgaWYgKHJlc3BvbnNlLmNvbW1hbmQgIT09ICdzY3JlZW5zaXplJykgcmV0dXJuO1xyXG4gICAgICAgIGNhbmNlbCgpO1xyXG4gICAgICAgIHJlc3VsdCA9IHJlc3BvbnNlLmRhdGEuaGVpZ2h0ID4gcmVzcG9uc2UuZGF0YS53aWR0aCA/IDEgOiAwO1xyXG4gICAgfSk7XHJcbiAgICBjdHgud3JpdGUoeyBjb21tYW5kOiAnc2NyZWVuc2l6ZScgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgaWYgdGhlIGNhbnZhcyB3aWR0aCBpcyBiaWdnZXIgdGhhbiBoZWlnaHRcclxuICpcclxuICogQHJldHVybnMge251bWJlcn1cclxuICovXHJcbmV4cG9ydHMuaXNsYW5kc2NhcGUgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciByZXN1bHQgPSAwO1xyXG4gICAgY3R4LnJlYWQoZnVuY3Rpb24ocmVzcG9uc2UsIGNhbmNlbCkge1xyXG4gICAgICAgIGlmIChyZXNwb25zZS5jb21tYW5kICE9PSAnc2NyZWVuc2l6ZScpIHJldHVybjtcclxuICAgICAgICBjYW5jZWwoKTtcclxuICAgICAgICByZXN1bHQgPSByZXNwb25zZS5kYXRhLmhlaWdodCA8PSByZXNwb25zZS5kYXRhLndpZHRoID8gMSA6IDA7XHJcbiAgICB9KTtcclxuICAgIGN0eC53cml0ZSh7IGNvbW1hbmQ6ICdzY3JlZW5zaXplJyB9KTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgWCBtb3VzZSBvZmZzZXQgZnJvbSB0aGUgY2VudGVyLCBiZXR3ZWVuIC0xIGFuZCAxXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLmFjY2VseCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHJlc3VsdCA9IDA7XHJcbiAgICBjdHgucmVhZChmdW5jdGlvbihyZXNwb25zZSwgY2FuY2VsKSB7XHJcbiAgICAgICAgaWYgKHJlc3BvbnNlLmNvbW1hbmQgIT09ICdhY2NlbCcpIHJldHVybjtcclxuICAgICAgICBjYW5jZWwoKTtcclxuICAgICAgICByZXN1bHQgPSByZXNwb25zZS5kYXRhLng7XHJcbiAgICB9KTtcclxuICAgIGN0eC53cml0ZSh7IGNvbW1hbmQ6ICdhY2NlbCcgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIFkgbW91c2Ugb2Zmc2V0IGZyb20gdGhlIGNlbnRlciwgYmV0d2VlbiAtMSBhbmQgMVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy5hY2NlbHkgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciByZXN1bHQgPSAwO1xyXG4gICAgY3R4LnJlYWQoZnVuY3Rpb24ocmVzcG9uc2UsIGNhbmNlbCkge1xyXG4gICAgICAgIGlmIChyZXNwb25zZS5jb21tYW5kICE9PSAnYWNjZWwnKSByZXR1cm47XHJcbiAgICAgICAgY2FuY2VsKCk7XHJcbiAgICAgICAgcmVzdWx0ID0gcmVzcG9uc2UuZGF0YS55O1xyXG4gICAgfSk7XHJcbiAgICBjdHgud3JpdGUoeyBjb21tYW5kOiAnYWNjZWwnIH0pO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBtb3VzZSBzY3JvbGwgb2Zmc2V0IGZyb20gdGhlIGNlbnRlciAoZGVmYXVsdCksIGJldHdlZW4gLTEgYW5kIDFcclxuICpcclxuICogQHJldHVybnMge251bWJlcn1cclxuICovXHJcbmV4cG9ydHMuYWNjZWx6ID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gMDtcclxuICAgIGN0eC5yZWFkKGZ1bmN0aW9uKHJlc3BvbnNlLCBjYW5jZWwpIHtcclxuICAgICAgICBpZiAocmVzcG9uc2UuY29tbWFuZCAhPT0gJ2FjY2VsJykgcmV0dXJuO1xyXG4gICAgICAgIGNhbmNlbCgpO1xyXG4gICAgICAgIHJlc3VsdCA9IHJlc3BvbnNlLmRhdGEuejtcclxuICAgIH0pO1xyXG4gICAgY3R4LndyaXRlKHsgY29tbWFuZDogJ2FjY2VsJyB9KTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG4vKipcclxuICogR2V0cyB0aGUgd2lkdGggb2YgdGhlIHNwcml0ZVxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gaWRcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuc3ByaXRld2lkdGggPSBmdW5jdGlvbihpZCkge1xyXG4gICAgdmFyIHNwcml0ZSA9IHRoaXMucHJpdmF0ZS5zcHJpdGVzW2lkXTtcclxuICAgIGlmICghc3ByaXRlKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3ByaXRlIElEJyk7XHJcbiAgICByZXR1cm4gc3ByaXRlLndpZHRoO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIGhlaWdodCBvZiB0aGUgc3ByaXRlXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBpZFxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy5zcHJpdGVoZWlnaHQgPSBmdW5jdGlvbihpZCkge1xyXG4gICAgdmFyIHNwcml0ZSA9IHRoaXMucHJpdmF0ZS5zcHJpdGVzW2lkXTtcclxuICAgIGlmICghc3ByaXRlKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3ByaXRlIElEJyk7XHJcbiAgICByZXR1cm4gc3ByaXRlLmhlaWdodDtcclxufTsiLCIvKipcclxuICogRnVuY3Rpb24gTGlzdFxyXG4gKi9cclxuXHJcbmludG9FeHBvcnQocmVxdWlyZSgnLi9udW1iZXInKSk7XHJcbmludG9FeHBvcnQocmVxdWlyZSgnLi9zdHJpbmcnKSk7XHJcbmludG9FeHBvcnQocmVxdWlyZSgnLi9ncmFwaGljcycpKTtcclxuXHJcbi8qKlxyXG4gKiBDb3BpZXMgdGhlIHByb3BlcnRpZXMgb2YgYW4gb2JqZWN0IHRvIHRoZSBleHBvcnRzXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBjb3B5XHJcbiAqL1xyXG5mdW5jdGlvbiBpbnRvRXhwb3J0KG9iaikge1xyXG4gICAgZm9yICh2YXIgayBpbiBvYmopIHtcclxuICAgICAgICBpZiAoIW9iai5oYXNPd25Qcm9wZXJ0eShrKSkgY29udGludWU7XHJcbiAgICAgICAgZXhwb3J0c1trXSA9IG9ialtrXTtcclxuICAgIH1cclxufSIsIi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBzaW5lIG9mIGFuIGFuZ2xlXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIFJhZGlhbnNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuc2luID0gZnVuY3Rpb24oYSkge1xyXG4gICAgdGhpcy52YWxpZGF0ZShhLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5zaW4oYSk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgY29zaW5lIG9mIGFuIGFuZ2xlXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIFJhZGlhbnNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuY29zID0gZnVuY3Rpb24oYSkge1xyXG4gICAgdGhpcy52YWxpZGF0ZShhLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5jb3MoYSk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgdGFuZ2VudCBvZiBhbiBhbmdsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gYSBSYWRpYW5zXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLnRhbiA9IGZ1bmN0aW9uKGEpIHtcclxuICAgIHRoaXMudmFsaWRhdGUoYSwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGgudGFuKGEpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIGFyYyBzaW5lXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIFJhZGlhbnNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuYXNpbiA9IGZ1bmN0aW9uKGEpIHtcclxuICAgIHRoaXMudmFsaWRhdGUoYSwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGguYXNpbihhKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBhcmMgY29zaW5lXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIFJhZGlhbnNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuYWNvcyA9IGZ1bmN0aW9uKGEpIHtcclxuICAgIHRoaXMudmFsaWRhdGUoYSwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGguYWNvcyhhKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBhcmMgdGFuZ2VudFxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gYSBSYWRpYW5zXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLmF0biA9IGZ1bmN0aW9uKGEpIHtcclxuICAgIHRoaXMudmFsaWRhdGUoYSwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGguYXRuKGEpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIGFuIGFuZ2xlIGZyb20gZGVncmVlcyB0byByYWRpYW5zXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIERlZ3JlZXNcclxuICogQHJldHVybnMge051bWJlcn0gUmFkaWFuc1xyXG4gKi9cclxuZXhwb3J0cy5yYWQgPSBmdW5jdGlvbihhKSB7XHJcbiAgICB0aGlzLnZhbGlkYXRlKGEsICdudW1iZXInKTtcclxuICAgIHJldHVybiBNYXRoLnJhZChhKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyBhbiBhbmdsZSBmcm9tIHJhZGlhbnMgdG8gZGVncmVlc1xyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gYSBSYWRpYW5zXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IERlZ3JlZXNcclxuICovXHJcbmV4cG9ydHMuZGVnID0gZnVuY3Rpb24oYSkge1xyXG4gICAgdGhpcy52YWxpZGF0ZShhLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5kZWcoYSk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgc3F1YXJlIHJvb3Qgb2YgYSBudW1iZXJcclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IG5cclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuc3FyID0gZnVuY3Rpb24obikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShuLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5zcXJ0KG4pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIGFic29sdXRlIHZhbHVlIG9mIGEgbnVtYmVyXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLmFicyA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIHRoaXMudmFsaWRhdGUobiwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGguYWJzKG4pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIGludGVnZXIgcGFydCBvZiBhIGZsb2F0aW5nLXBvaW50IG51bWJlclxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gblxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy5pbnQgPSBmdW5jdGlvbihuKSB7XHJcbiAgICB0aGlzLnZhbGlkYXRlKG4sICdudW1iZXInKTtcclxuICAgIHJldHVybiBNYXRoLmZsb29yKG4pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIG5hdHVyYWwgbG9nYXJpdGhtXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLmxvZyA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIHRoaXMudmFsaWRhdGUobiwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGgubG9nKG4pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIGNvbW1vbiAoYmFzZS0xMCkgbG9nYXJpdGhtXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLmxvZzEwID0gZnVuY3Rpb24obikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShuLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5sb2cxMChuKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBiYXNlLWUgZXhwb25lbnRpYWwgZnVuY3Rpb25cclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IG5cclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuZXhwID0gZnVuY3Rpb24obikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShuLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5leHAobik7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgZmxvYXRpbmctcG9pbnQgcmVtYWluZGVyIG9mIGEgLyBiLlxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gYVxyXG4gKiBAcGFyYW0ge051bWJlcn0gYlxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy5tb2QgPSBmdW5jdGlvbihhLCBiKSB7XHJcbiAgICB0aGlzLnZhbGlkYXRlKGEsICdudW1iZXInKTtcclxuICAgIHRoaXMudmFsaWRhdGUoYiwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIGEgJSBiO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgYSByYW5kb20gbnVtYmVyIHVzaW5nIGEgc2VlZFxyXG4gKlxyXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0UmFuZG9tKGRhdGEpIHtcclxuICAgIHZhciB4ID0gTWF0aC5zaW4oZGF0YS5nZXRQcml2YXRlKCdybmRfc2VlZCcpKSAqIDEwMDAwO1xyXG4gICAgZGF0YS5zZXRQcml2YXRlKCdybmRfc2VlZCcsIGRhdGEuZ2V0UHJpdmF0ZSgncm5kX3NlZWQnKSArIDEpO1xyXG4gICAgcmV0dXJuIHggLSBNYXRoLmZsb29yKHgpO1xyXG59XHJcblxyXG4vKipcclxuICogR2VuZXJhdGVzIGFuZCByZXR1cm5zIGEgcmFuZG9tIG51bWJlciBmcm9tIDAgdG8gMVxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcj99IG1pblxyXG4gKiBAcGFyYW0ge051bWJlcj99IG1heFxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy5ybmQgPSBmdW5jdGlvbihtaW4sIG1heCkge1xyXG4gICAgaWYgKHR5cGVvZiBtaW4gIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBtYXggIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgdGhpcy52YWxpZGF0ZShtaW4sICdudW1iZXInKTtcclxuICAgICAgICB0aGlzLnZhbGlkYXRlKG1heCwgJ251bWJlcicpO1xyXG4gICAgICAgIHJldHVybiBNYXRoLmZsb29yKGdldFJhbmRvbSh0aGlzKSAqIChtYXggLSBtaW4gKyAxKSkgKyBtaW47XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZ2V0UmFuZG9tKHRoaXMpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFNldCByYW5kb20gbnVtYmVyIGdlbmVyYXRvciBzZWVkXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBzZWVkXHJcbiAqL1xyXG5leHBvcnRzLnJhbmRvbWl6ZSA9IGZ1bmN0aW9uKHNlZWQpIHtcclxuICAgIHRoaXMuc2V0UHJpdmF0ZSgncm5kX3NlZWQnLCBzZWVkKTtcclxufTsiLCIvKipcclxuICogTWFrZSBzdHJpbmcgdXBwZXJjYXNlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBzXHJcbiAqIEByZXR1cm5zIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzWyd1cHBlciQnXSA9IGZ1bmN0aW9uKHMpIHtcclxuICAgIHRoaXMudmFsaWRhdGUocywgJ3N0cmluZycpO1xyXG4gICAgcmV0dXJuIHMudG9VcHBlckNhc2UoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBNYWtlIHN0cmluZyBsb3dlcmNhc2VcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHNcclxuICogQHJldHVybnMge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHNbJ2xvd2VyJCddID0gZnVuY3Rpb24ocykge1xyXG4gICAgdGhpcy52YWxpZGF0ZShzLCAnc3RyaW5nJyk7XHJcbiAgICByZXR1cm4gcy50b0xvd2VyQ2FzZSgpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFRha2UgbiBjaGFyYWN0ZXJzIGZyb20gc3RyaW5nJ3MgbGVmdFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gc1xyXG4gKiBAcGFyYW0ge051bWJlcn0gblxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0c1snbGVmdCQnXSA9IGZ1bmN0aW9uKHMsIG4pIHtcclxuICAgIHRoaXMudmFsaWRhdGUocywgJ3N0cmluZycpO1xyXG4gICAgdGhpcy52YWxpZGF0ZShuLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gcy5zdWJzdHIoMCwgbik7XHJcbn07XHJcblxyXG4vKipcclxuICogVGFrZSBuIGNoYXJhY3RlcnMgZnJvbSBzdHJpbmcgc3RhcnRpbmcgd2l0aCBpJ3RoIGNoYXJhY3RlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gc1xyXG4gKiBAcGFyYW0ge051bWJlcn0gaVxyXG4gKiBAcGFyYW0ge051bWJlcn0gblxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0c1snbWlkJCddID0gZnVuY3Rpb24ocywgaSwgbikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShzLCAnc3RyaW5nJyk7XHJcbiAgICB0aGlzLnZhbGlkYXRlKGksICdudW1iZXInKTtcclxuICAgIHRoaXMudmFsaWRhdGUobiwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIHMuc3Vic3RyKGksIG4pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFRha2UgbiBjaGFyYWN0ZXJzIGZyb20gc3RyaW5nJ3MgcmlnaHRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHNcclxuICogQHBhcmFtIHtOdW1iZXJ9IG5cclxuICogQHJldHVybnMge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHNbJ3JpZ2h0JCddID0gZnVuY3Rpb24ocywgbikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShzLCAnc3RyaW5nJyk7XHJcbiAgICB0aGlzLnZhbGlkYXRlKG4sICdudW1iZXInKTtcclxuICAgIHJldHVybiBzLnN1YnN0cigtbik7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJuIHN0cmluZyBsZW5ndGhcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMubGVuID0gZnVuY3Rpb24ocykge1xyXG4gICAgdGhpcy52YWxpZGF0ZShzLCAnc3RyaW5nJyk7XHJcbiAgICByZXR1cm4gcy5sZW5ndGg7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydCBzdHJpbmcgaW50byBhIG51bWJlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gc1xyXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy52YWwgPSBmdW5jdGlvbihzKSB7XHJcbiAgICB0aGlzLnZhbGlkYXRlKHMsICdzdHJpbmcnKTtcclxuICAgIHZhciBudW0gPSBwYXJzZUZsb2F0KHMpO1xyXG4gICAgaWYgKGlzTmFOKG51bSkpIHRocm93IG5ldyBFcnJvcignU3RyaW5nIGlzIG5vdCBhIG51bWJlcicpO1xyXG4gICAgcmV0dXJuIG51bTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0IG51bWJlciBpbnRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXHJcbiAqIEByZXR1cm5zIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzWydzdHIkJ10gPSBmdW5jdGlvbihuKSB7XHJcbiAgICB0aGlzLnZhbGlkYXRlKG4sICdudW1iZXInKTtcclxuICAgIHJldHVybiBuLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJuIEFTQ0lJIGNvZGUgb2Ygc3RyaW5ncyBmaXJzdCBjaGFyYWN0ZXJcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuYXNjID0gZnVuY3Rpb24ocykge1xyXG4gICAgdGhpcy52YWxpZGF0ZShzLCAnc3RyaW5nJyk7XHJcbiAgICByZXR1cm4gcy5jaGFyQ29kZUF0KDApO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybiBzdHJpbmcgY29udGFpbmluZyBhIHNpbmdsZSBBU0NJSSBjaGFyYWN0ZXJcclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IG5cclxuICogQHJldHVybnMge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHNbJ2NociQnXSA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIHRoaXMudmFsaWRhdGUobiwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUobik7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJuIHN0cmluZyBjb250YWluaW5nIG4gc3BhY2UgY2hhcmFjdGVyc1xyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gblxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0c1snc3BjJCddID0gZnVuY3Rpb24obikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShuLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gKG5ldyBBcnJheShuICsgMSkpLmpvaW4oJyAnKTtcclxufTsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4vc3RhdGVtZW50cycpO1xyXG5cclxuLyoqXHJcbiAqIFJlcHJlc2VudHMgYSB0cmVlIHRoYXQgY2FuIGJlIGV4ZWN1dGVkXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXJyYXl9IHJvb3QgVGhlIHJvb3QtbGV2ZWwgbm9kZXNcclxuICogQHBhcmFtIHtPYmplY3R9IGxhYmVscyBBbiBvYmplY3Qgb2YgbGFiZWw6IGxpbmUgbWFwcGluZ3NcclxuICogQHBhcmFtIHtCbG9ja01hbmFnZXJ9IG1hbmFnZXIgVGhlIGJsb2NrIG1hbmFnZXJcclxuICovXHJcbmZ1bmN0aW9uIEFic3RyYWN0U3ludGF4VHJlZShyb290LCBsYWJlbHMsIG1hbmFnZXIpIHtcclxuICAgIHRoaXMucm9vdCA9IHJvb3Q7XHJcbiAgICB0aGlzLmxhYmVscyA9IGxhYmVscztcclxuICAgIHRoaXMubWFuYWdlciA9IG1hbmFnZXI7XHJcblxyXG4gICAgbWFuYWdlci5wYXJzZSh0aGlzKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSB0cmVlIHRvIGFuIGV4ZWN1dGFibGUgY29kZSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkFic3RyYWN0U3ludGF4VHJlZS5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBsaW5lcyA9IFtdO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvb3QubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBsaW5lcy5wdXNoKHRoaXMucm9vdFtpXS50b1N0cmluZygpKTtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKHZhciBuYW1lIGluIHRoaXMubGFiZWxzKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxhYmVscy5oYXNPd25Qcm9wZXJ0eShuYW1lKSkgY29udGludWU7XHJcblxyXG4gICAgICAgIHZhciBsaW5lTnVtYmVyID0gdGhpcy5sYWJlbHNbbmFtZV07XHJcbiAgICAgICAgaWYgKHRoaXMucm9vdFtsaW5lTnVtYmVyXSBpbnN0YW5jZW9mIHN0YXRlbWVudHMuRW1wdHlTdGF0ZW1lbnQpIGxpbmVzW2xpbmVOdW1iZXJdID0gbmFtZSArICc6JztcclxuICAgICAgICBlbHNlIGxpbmVzW2xpbmVOdW1iZXJdID0gbmFtZSArICcgJyArIGxpbmVzW2xpbmVOdW1iZXJdO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSB0cmVlIHRvIHNlcmlhbGl6YWJsZSBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5BYnN0cmFjdFN5bnRheFRyZWUucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHJvb3QgPSBbXTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb290Lmxlbmd0aDsgaSsrKSByb290LnB1c2godGhpcy5yb290W2ldLnRvSlNPTigpKTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcm9vdDogcm9vdCxcclxuICAgICAgICBsYWJlbHM6IHRoaXMubGFiZWxzXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIGl0ZW1zIGluIHRoZSB0cmVlXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YSBUaGUgZXhlY3V0aW9uIGNvbnRleHRcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRvbmUgQSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gdGhlIHByb2dyYW0gdGVybWluYXRlc1xyXG4gKi9cclxuQWJzdHJhY3RTeW50YXhUcmVlLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgZG9uZSkge1xyXG4gICAgZGF0YS5leGVjdXRlKHRoaXMucm9vdCwgdGhpcy5sYWJlbHMsIGRvbmUpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBYnN0cmFjdFN5bnRheFRyZWU7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcblxyXG4vKipcclxuICogQSBibG9jayBwYXJzZXJcclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IGxpbmUgVGhlIGN1cnJlbnQgbGluZSBudW1iZXJcclxuICogQHBhcmFtIHt7c3RhcnQ6IEFycmF5LCBlbmQ6IEFycmF5LCB0aGVuOiBBcnJheX19IGRlZiBQcm9wZXJ0aWVzIGZvciBibG9jayBkZWZpbml0aW9uXHJcbiAqIEBwYXJhbSB7QmxvY2tNYW5hZ2VyfSBwYXJlbnRcclxuICovXHJcbmZ1bmN0aW9uIEJsb2NrKGxpbmUsIGRlZiwgcGFyZW50KSB7XHJcbiAgICB0aGlzLnN0YXJ0TmFtZXMgPSBbXTtcclxuICAgIHRoaXMudGhlbk5hbWVzID0gW107XHJcbiAgICB0aGlzLmVuZE5hbWVzID0gW107XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRlZi5zdGFydC5sZW5ndGg7IGkrKykgdGhpcy5zdGFydE5hbWVzLnB1c2goZGVmLnN0YXJ0W2ldLnRvTG93ZXJDYXNlKCkpO1xyXG4gICAgZm9yICh2YXIgeCA9IDA7IHggPCBkZWYuZW5kLmxlbmd0aDsgeCsrKSB0aGlzLmVuZE5hbWVzLnB1c2goZGVmLmVuZFt4XS50b0xvd2VyQ2FzZSgpKTtcclxuICAgIGZvciAodmFyIHkgPSAwOyB5IDwgZGVmLnRoZW4ubGVuZ3RoOyB5KyspIHRoaXMudGhlbk5hbWVzLnB1c2goZGVmLnRoZW5beV0udG9Mb3dlckNhc2UoKSk7XHJcblxyXG4gICAgdGhpcy5saW5lID0gbGluZTtcclxuICAgIHRoaXMucGFyZW50ID0gcGFyZW50O1xyXG4gICAgdGhpcy5zZWFyY2hJbmRleCA9IGxpbmU7XHJcbiAgICB0aGlzLnN0YXJ0ID0gLTE7XHJcbiAgICB0aGlzLmludGVybWVkaWF0ZUluZGV4ZXMgPSB7fTtcclxuICAgIHRoaXMuaW50ZXJtZWRpYXRlQ3Vyc29ycyA9IHt9O1xyXG4gICAgdGhpcy5lbmQgPSAtMTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFBhcnNlcyB0aGUgYmxvY2tcclxuICpcclxuICogQHBhcmFtIHtBYnN0cmFjdFN5bnRheFRyZWV9IGFzdFxyXG4gKi9cclxuQmxvY2sucHJvdG90eXBlLnBhcnNlID0gZnVuY3Rpb24oYXN0KSB7XHJcbiAgICB2YXIgcm9vdCA9IGFzdC5yb290LCBkZXB0aCA9IDA7XHJcbiAgICB2YXIgaW50ZXJtZWRpYXRlRmluZHMgPSB0aGlzLmludGVybWVkaWF0ZUluZGV4ZXMgPSB7fTtcclxuXHJcbiAgICBmb3IgKHZhciBsbiA9IHRoaXMuc2VhcmNoSW5kZXg7IGxuIDwgcm9vdC5sZW5ndGg7IGxuKyspIHtcclxuICAgICAgICB2YXIgbGluZSA9IHJvb3RbbG5dO1xyXG4gICAgICAgIGlmICghKGxpbmUgaW5zdGFuY2VvZiBzdGF0ZW1lbnRzLkNvbW1hbmRTdGF0ZW1lbnQpKSBjb250aW51ZTtcclxuICAgICAgICB2YXIgbGluZU5hbWUgPSBsaW5lLm5hbWU7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnN0YXJ0TmFtZXMuaW5kZXhPZihsaW5lTmFtZSkgIT09IC0xKSB7XHJcbiAgICAgICAgICAgIGlmIChkZXB0aCA9PT0gMCkgdGhpcy5zdGFydCA9IGxuO1xyXG4gICAgICAgICAgICBkZXB0aCsrO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy50aGVuTmFtZXMuaW5kZXhPZihsaW5lTmFtZSkgIT09IC0xICYmIGRlcHRoID09PSAxKSB7XHJcbiAgICAgICAgICAgIGlmICghaW50ZXJtZWRpYXRlRmluZHNbbGluZU5hbWVdKSBpbnRlcm1lZGlhdGVGaW5kc1tsaW5lTmFtZV0gPSBbXTtcclxuICAgICAgICAgICAgaW50ZXJtZWRpYXRlRmluZHNbbGluZU5hbWVdLnB1c2gobG4pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5lbmROYW1lcy5pbmRleE9mKGxpbmVOYW1lKSAhPT0gLTEpIHtcclxuICAgICAgICAgICAgZGVwdGgtLTtcclxuICAgICAgICAgICAgaWYgKGRlcHRoIDwgMCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiVW5leHBlY3RlZCBcIiArIGxpbmVOYW1lLnRvVXBwZXJDYXNlKCkpO1xyXG4gICAgICAgICAgICBlbHNlIGlmIChkZXB0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbmQgPSBsbjtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoZGVwdGggIT09IDApIHRocm93IG5ldyBTeW50YXhFcnJvcih0aGlzLnN0YXJ0TmFtZXNbMF0udG9VcHBlckNhc2UoKSArIFwiIHdpdGhvdXQgXCIgKyB0aGlzLmVuZE5hbWVzWzBdLnRvVXBwZXJDYXNlKCkpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEZpbmRzIGlmIHRoZSBibG9jayBoYXMgdGhlIGludGVybWVkaWF0ZSBjb21tYW5kIHNwZWNpZmllZFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgY29tbWFuZFxyXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cclxuICovXHJcbkJsb2NrLnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbihuYW1lKSB7XHJcbiAgICBuYW1lID0gbmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKHRoaXMudGhlbk5hbWVzLmluZGV4T2YobmFtZSkgPT09IC0xKSByZXR1cm4gZmFsc2U7XHJcbiAgICBpZiAoIXRoaXMuaW50ZXJtZWRpYXRlSW5kZXhlc1tuYW1lXSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgcmV0dXJuIEJvb2xlYW4odGhpcy5pbnRlcm1lZGlhdGVJbmRleGVzW25hbWVdLmxlbmd0aCk7XHJcbn07XHJcblxyXG4vKipcclxuICogRmluZHMgdGhlIG5leHQgaW50ZXJtZWRpYXRlIGNvbW1hbmQgd2l0aCB0aGUgbmFtZSBzcGVjaWZpZWRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGNvbW1hbmRcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIGxpbmUgb3IgLTEgaWYgbm9uZSBmb3VuZFxyXG4gKi9cclxuQmxvY2sucHJvdG90eXBlLm5leHQgPSBmdW5jdGlvbihuYW1lKSB7XHJcbiAgICBuYW1lID0gbmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKCF0aGlzLmhhcyhuYW1lKSkgcmV0dXJuIC0xO1xyXG5cclxuICAgIGlmICghdGhpcy5pbnRlcm1lZGlhdGVDdXJzb3JzW25hbWVdKSB0aGlzLmludGVybWVkaWF0ZUN1cnNvcnNbbmFtZV0gPSAwO1xyXG4gICAgdmFyIGN1cnNvciA9IHRoaXMuaW50ZXJtZWRpYXRlQ3Vyc29yc1tuYW1lXTtcclxuICAgIGlmIChjdXJzb3IgPj0gdGhpcy5pbnRlcm1lZGlhdGVJbmRleGVzW25hbWVdLmxlbmd0aCkgY3Vyc29yID0gdGhpcy5pbnRlcm1lZGlhdGVDdXJzb3JzW25hbWVdID0gMDtcclxuXHJcbiAgICB2YXIgdmFsdWUgPSB0aGlzLmludGVybWVkaWF0ZUluZGV4ZXNbbmFtZV1bY3Vyc29yXTtcclxuICAgIHRoaXMuaW50ZXJtZWRpYXRlQ3Vyc29yc1tuYW1lXSsrO1xyXG4gICAgcmV0dXJuIHZhbHVlO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgYSBsaXN0IG9mIHJlZmVyZW5jZXNcclxuICpcclxuICogQHJldHVybnMge0FycmF5PEJsb2NrPn1cclxuICovXHJcbkJsb2NrLnByb3RvdHlwZS5yZWZlcmVuY2VzID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5wYXJlbnQuYnlMaW5lUmVmW3RoaXMubGluZV07XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuQmxvY2sucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXHJcbiAgICAgICAgc2VhcmNoSW5kZXg6IHRoaXMuc2VhcmNoSW5kZXgsXHJcbiAgICAgICAgc3RhcnQ6IHRoaXMuc3RhcnQsXHJcbiAgICAgICAgaW50ZXJtZWRpYXRlSW5kZXhlczogdGhpcy5pbnRlcm1lZGlhdGVJbmRleGVzLFxyXG4gICAgICAgIGludGVybWVkaWF0ZUN1cnNvcnM6IHRoaXMuaW50ZXJtZWRpYXRlQ3Vyc29ycyxcclxuICAgICAgICBlbmQ6IHRoaXMuZW5kXHJcbiAgICB9O1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBCbG9jazsiLCJ2YXIgQmxvY2sgPSByZXF1aXJlKCcuL0Jsb2NrJyk7XHJcblxyXG4vKipcclxuICogQ3JlYXRlcyBibG9jayBkZWZpbml0aW9uIGZ1bmN0aW9uc1xyXG4gKi9cclxuZnVuY3Rpb24gQmxvY2tNYW5hZ2VyKCkge1xyXG4gICAgdGhpcy5jaGlsZHJlbiA9IFtdO1xyXG4gICAgdGhpcy5ieUxpbmVSZWYgPSB7fTtcclxufVxyXG5cclxuQmxvY2tNYW5hZ2VyLkJsb2NrID0gQmxvY2s7XHJcbkJsb2NrTWFuYWdlci5CbG9ja01hbmFnZXIgPSBCbG9ja01hbmFnZXI7XHJcblxyXG4vKipcclxuICogUGFyc2VzIHRoZSBibG9ja3NcclxuICpcclxuICogQHBhcmFtIHtBYnN0cmFjdFN5bnRheFRyZWV9IGFzdFxyXG4gKi9cclxuQmxvY2tNYW5hZ2VyLnByb3RvdHlwZS5wYXJzZSA9IGZ1bmN0aW9uKGFzdCkge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXTtcclxuICAgICAgICBjaGlsZC5wYXJzZShhc3QpO1xyXG5cclxuICAgICAgICBpZiAoY2hpbGQuc3RhcnQgIT09IC0xKSBhZGRDaGlsZFRvKHRoaXMuYnlMaW5lUmVmLCBjaGlsZCwgY2hpbGQuc3RhcnQpO1xyXG4gICAgICAgIGlmIChjaGlsZC5lbmQgIT09IC0xKSBhZGRDaGlsZFRvKHRoaXMuYnlMaW5lUmVmLCBjaGlsZCwgY2hpbGQuZW5kKTtcclxuICAgICAgICBmb3IgKHZhciB0eXBlIGluIGNoaWxkLmludGVybWVkaWF0ZUluZGV4ZXMpIHtcclxuICAgICAgICAgICAgaWYgKCFjaGlsZC5pbnRlcm1lZGlhdGVJbmRleGVzLmhhc093blByb3BlcnR5KHR5cGUpKSBjb250aW51ZTtcclxuICAgICAgICAgICAgdmFyIGNoaWxkSW5kZXhlcyA9IGNoaWxkLmludGVybWVkaWF0ZUluZGV4ZXNbdHlwZV07XHJcbiAgICAgICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgY2hpbGRJbmRleGVzLmxlbmd0aDsgeCsrKSB7XHJcbiAgICAgICAgICAgICAgICBhZGRDaGlsZFRvKHRoaXMuYnlMaW5lUmVmLCBjaGlsZCwgY2hpbGRJbmRleGVzW3hdKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBDcmVhdGVzIGEgZnVuY3Rpb24gdG8gY3JlYXRlIGEgYmxvY2tcclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IGxpbmUgVGhlIGxpbmUgbnVtYmVyIGZvciB0aGUgYmxvY2tcclxuICogQHJldHVybnMge0Z1bmN0aW9ufSBUaGUgZnVuY3Rpb24gdG8gY3JlYXRlIHRoZSBibG9ja1xyXG4gKi9cclxuQmxvY2tNYW5hZ2VyLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihsaW5lKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgYmxvY2sgd2l0aCB0aGUgc3BlY2lmaWVkIGRlZmluaXRpb25cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZGVmIFRoZSBibG9jayBkZWZpbml0aW9uXHJcbiAgICAgKiBAcmV0dXJucyB7QmxvY2t9XHJcbiAgICAgKi9cclxuICAgIHZhciByZXMgPSBmdW5jdGlvbihkZWYpIHtcclxuICAgICAgICB2YXIgc3RhcnQgPSBBcnJheS5pc0FycmF5KGRlZi5zdGFydCkgPyBkZWYuc3RhcnQgOiBbZGVmLnN0YXJ0XTtcclxuICAgICAgICB2YXIgZW5kID0gQXJyYXkuaXNBcnJheShkZWYuZW5kKSA/IGRlZi5lbmQgOiBbZGVmLmVuZF07XHJcbiAgICAgICAgdmFyIHRoZW4gPSBkZWYudGhlbiA/IChBcnJheS5pc0FycmF5KGRlZi50aGVuKSA/IGRlZi50aGVuIDogW2RlZi50aGVuXSkgOiBbXTtcclxuXHJcbiAgICAgICAgdmFyIGNoaWxkID0gbmV3IEJsb2NrKGxpbmUsIHtcclxuICAgICAgICAgICAgc3RhcnQ6IHN0YXJ0LFxyXG4gICAgICAgICAgICBlbmQ6IGVuZCxcclxuICAgICAgICAgICAgdGhlbjogdGhlblxyXG4gICAgICAgIH0sIHNlbGYpO1xyXG4gICAgICAgIHNlbGYuY2hpbGRyZW4ucHVzaChjaGlsZCk7XHJcbiAgICAgICAgcmV0dXJuIGNoaWxkO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBsaXN0IG9mIGJsb2NrIHJlZmVyZW5jZXNcclxuICAgICAqXHJcbiAgICAgKiBAcmV0dXJucyB7QXJyYXk8QmxvY2s+fVxyXG4gICAgICovXHJcbiAgICByZXMucmVmZXJlbmNlcyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBzZWxmLmJ5TGluZVJlZltsaW5lXTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUaGUgY3VycmVudCBsaW5lXHJcbiAgICAgKlxyXG4gICAgICogQHR5cGUge051bWJlcn1cclxuICAgICAqL1xyXG4gICAgcmVzLmxpbmUgPSBsaW5lO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIGJsb2NrIGRlZmluaXRpb24gdG8gSlNPTlxyXG4gICAgICpcclxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAgICAgKi9cclxuICAgIHJlcy50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgbGluZVJlZiA9IFtdLCBpTGluZVJlZiA9IHNlbGYuYnlMaW5lUmVmW2xpbmVdO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaUxpbmVSZWYubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgbGluZVJlZi5wdXNoKGlMaW5lUmVmW2ldLnRvSlNPTigpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGxpbmU6IGxpbmUsXHJcbiAgICAgICAgICAgIGxpbmVSZWY6IGxpbmVSZWZcclxuICAgICAgICB9O1xyXG4gICAgfTtcclxuICAgIHJldHVybiByZXM7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEJsb2NrTWFuYWdlcjtcclxuXHJcbmZ1bmN0aW9uIGFkZENoaWxkVG8oYnlSZWYsIGNoaWxkLCBjaGlsZEluZGV4KSB7XHJcbiAgICBpZiAoIWJ5UmVmW2NoaWxkSW5kZXhdKSBieVJlZltjaGlsZEluZGV4XSA9IFtdO1xyXG4gICAgYnlSZWZbY2hpbGRJbmRleF0ucHVzaChjaGlsZCk7XHJcbn0iLCIvKipcclxuICogQW4gZXJyb3IgY2F1c2VkIGJ5IGludmFsaWQgc3ludGF4XHJcbiAqL1xyXG5mdW5jdGlvbiBTeW50YXhFcnJvcihtc2cpIHtcclxuICAgIHRoaXMubWVzc2FnZSA9ICdTeW50YXggRXJyb3I6ICcgKyBtc2c7XHJcbn1cclxuXHJcblN5bnRheEVycm9yLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oKSB7XHJcbiAgICBjb25zb2xlLmxvZyhcIkVSUk9SOiBcIiArIHRoaXMubWVzc2FnZSk7XHJcbn07XHJcblxyXG5TeW50YXhFcnJvci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLm1lc3NhZ2U7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFN5bnRheEVycm9yOyIsInZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIENhbGlicmF0ZXMgdGhlIGFjY2VsZXJvbWV0ZXIgKG1vdXNlKVxyXG4gKi9cclxuZnVuY3Rpb24gQWNjZWxjYWxpYnJhdGVDb21tYW5kKCkgeyB9XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkFjY2VsY2FsaWJyYXRlQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogJ2FjY2VsJyxcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIGNhbGlicmF0ZTogdHJ1ZVxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBY2NlbGNhbGlicmF0ZUNvbW1hbmQ7IiwiLyoqXHJcbiAqIERvZXMgbm90aGluZywgYXMgSmF2YXNjcmlwdCBkb2VzbnQgYWxsb3cgZGlzYWJsaW5nIG9mIGFudGlhbGlhc2luZ1xyXG4gKi9cclxuZnVuY3Rpb24gQW50aWFsaWFzQ29tbWFuZCgpIHt9XHJcblxyXG5BbnRpYWxpYXNDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkgeyBuZXh0KCk7IH07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFudGlhbGlhc0NvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIFNldHMgdGhlIGNvbG9yIG9mIHRoZSBiYWNrZ3JvdW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIEJjb2xvckNvbW1hbmQoYXJncykge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MpO1xyXG5cclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPCAzKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0JDT0xPUiBjb21tYW5kIHJlcXVpcmVzIDMgYXJndW1lbnRzJyk7XHJcbiAgICB0aGlzLnJlZCA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgdGhpcy5ncmVlbiA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgdGhpcy5ibHVlID0gcGFyc2VkLmFyZ3NbMl07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkJjb2xvckNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gW3RoaXMucmVkLCB0aGlzLmdyZWVuLCB0aGlzLmJsdWVdLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5CY29sb3JDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcjogdGhpcy5yZWQudG9KU09OKCksXHJcbiAgICAgICAgZzogdGhpcy5ncmVlbi50b0pTT04oKSxcclxuICAgICAgICBiOiB0aGlzLmJsdWUudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkJjb2xvckNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgcmVkID0gdGhpcy5yZWQuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBncmVlbiA9IHRoaXMuZ3JlZW4uZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBibHVlID0gdGhpcy5ibHVlLmV4ZWN1dGUoZGF0YSk7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZShyZWQsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoZ3JlZW4sICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoYmx1ZSwgJ251bWJlcicpO1xyXG5cclxuICAgIHZhciBvbGRSZWQgPSByZWQsIG9sZEdyZWVuID0gZ3JlZW4sIG9sZEJsdWUgPSBibHVlO1xyXG5cclxuICAgIGlmIChyZWQgPiAxKSByZWQgLz0gMjU1O1xyXG4gICAgaWYgKGdyZWVuID4gMSkgZ3JlZW4gLz0gMjU1O1xyXG4gICAgaWYgKGJsdWUgPiAxKSBibHVlIC89IDI1NTtcclxuXHJcbiAgICByZWQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihyZWQsIDEpKTtcclxuICAgIGdyZWVuID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oZ3JlZW4sIDEpKTtcclxuICAgIGJsdWUgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihibHVlLCAxKSk7XHJcblxyXG4gICAgZGF0YS5zZXRDb25zdGFudCgnQkNvbG9yUicsIG9sZFJlZCk7XHJcbiAgICBkYXRhLnNldENvbnN0YW50KCdCQ29sb3JHJywgb2xkR3JlZW4pO1xyXG4gICAgZGF0YS5zZXRDb25zdGFudCgnQkNvbG9yQicsIG9sZEJsdWUpO1xyXG5cclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgXCJjb21tYW5kXCI6IFwiYmNvbG9yXCIsXHJcbiAgICAgICAgXCJhcmdzXCI6IHtcclxuICAgICAgICAgICAgXCJyXCI6IHJlZCxcclxuICAgICAgICAgICAgXCJnXCI6IGdyZWVuLFxyXG4gICAgICAgICAgICBcImJcIjogYmx1ZVxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBCY29sb3JDb21tYW5kOyIsInZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIEJlZ2lucyBjYW52YXMgY2FjaGluZ1xyXG4gKlxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIEJlZ2luZHJhd0NvbW1hbmQoKSB7fVxyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5CZWdpbmRyYXdDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgY3R4LndyaXRlKHtcclxuICAgICAgICBjb21tYW5kOiBcInN0YXJ0Q2FjaGVcIlxyXG4gICAgfSk7XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEJlZ2luZHJhd0NvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIERyYXdzIGEgZmlsbGVkIG9yIHN0cm9rZWQgY2lyY2xlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIENpcmNsZUNvbW1hbmQoYXJncykge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MpO1xyXG5cclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPCAzKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0NJUkNMRSBjb21tYW5kIHJlcXVpcmVzIDMgYXJndW1lbnRzJyk7XHJcbiAgICB0aGlzLnggPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueSA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgdGhpcy5yYWRpdXMgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIHRoaXMuc3Ryb2tlID0gcGFyc2VkLmFyZ3MubGVuZ3RoID4gMyA/IHBhcnNlZC5hcmdzWzNdIDogZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkNpcmNsZUNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFt0aGlzLngsIHRoaXMueSwgdGhpcy5yYWRpdXNdO1xyXG4gICAgaWYgKHRoaXMuc3Ryb2tlKSBhcmdzLnB1c2godGhpcy5zdHJva2UpO1xyXG4gICAgcmV0dXJuIGFyZ3Muam9pbihcIiwgXCIpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkNpcmNsZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4OiB0aGlzLngudG9KU09OKCksXHJcbiAgICAgICAgeTogdGhpcy55LnRvSlNPTigpLFxyXG4gICAgICAgIHJhZGl1czogdGhpcy5yYWRpdXMudG9KU09OKCksXHJcbiAgICAgICAgc3Ryb2tlOiB0aGlzLnN0cm9rZSA/IHRoaXMuc3Ryb2tlLnRvSlNPTigpIDogZmFsc2VcclxuICAgIH07XHJcbn07XHJcblxyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5DaXJjbGVDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHggPSB0aGlzLnguZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciB5ID0gdGhpcy55LmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgcmFkaXVzID0gdGhpcy5yYWRpdXMuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBzdHJva2UgPSB0aGlzLnN0cm9rZSA/IHRoaXMuc3Ryb2tlLmV4ZWN1dGUoZGF0YSkgOiAwO1xyXG5cclxuICAgIGRhdGEudmFsaWRhdGUoeCwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5LCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHJhZGl1cywgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShzdHJva2UsICdudW1iZXInKTtcclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6IFwiY2lyY2xlXCIsXHJcbiAgICAgICAgYXJnczoge1xyXG4gICAgICAgICAgICB4OiB4LFxyXG4gICAgICAgICAgICB5OiB5LFxyXG4gICAgICAgICAgICByYWRpdXM6IHJhZGl1cyxcclxuICAgICAgICAgICAgc3Ryb2tlOiBzdHJva2VcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IENpcmNsZUNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBmaWxlc3lzdGVtID0gcmVxdWlyZSgnLi4vLi4vZmlsZXN5c3RlbScpO1xyXG5cclxuLyoqXHJcbiAqIENsb3NlcyBhIGZpbGUgaW4gYSBwb2ludGVyXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5lXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gQ2xvc2VDb21tYW5kKGFyZ3MsIGRlZmluZSkge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkV4cHJlc3Npb25TdGF0ZW1lbnQoYXJncywgZGVmaW5lKTtcclxuICAgIGlmICghKHBhcnNlZC5jaGlsZCBpbnN0YW5jZW9mIHN0YXRlbWVudHMuUG9pbnRlclN0YXRlbWVudCkpIHRocm93IG5ldyBTeW50YXhFcnJvcignRXhwZWN0ZWQgcG9pbnRlcicpO1xyXG5cclxuICAgIHRoaXMucG9pbnRlciA9IHBhcnNlZDtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuQ2xvc2VDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMucG9pbnRlci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkNsb3NlQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHBvaW50ZXI6IHRoaXMucG9pbnRlci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuQ2xvc2VDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIGZpbGUgPSB0aGlzLnBvaW50ZXIuZXhlY3V0ZShkYXRhKTtcclxuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBmaWxlc3lzdGVtLkZpbGUpKSB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIGZpbGUnKTtcclxuICAgIGRhdGEuc2V0UG9pbnRlcih0aGlzLnBvaW50ZXIuY2hpbGQsIGZhbHNlKTtcclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IENsb3NlQ29tbWFuZDsiLCJ2YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBDbGVhcnMgdGhlIHNjcmVlblxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqL1xyXG5mdW5jdGlvbiBDbHNDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBsb3dlckFyZ3MgPSBhcmdzLnRvTG93ZXJDYXNlKCk7XHJcbiAgICB0aGlzLnR0eSA9IGxvd2VyQXJncyAhPT0gJ2dmeCc7XHJcbiAgICB0aGlzLmdmeCA9IGxvd2VyQXJncyAhPT0gJ3R0eSc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkNsc0NvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICBpZiAodGhpcy50dHkgJiYgIXRoaXMuZ2Z4KSByZXR1cm4gJ1RUWSc7XHJcbiAgICBpZiAodGhpcy5nZnggJiYgIXRoaXMudHR5KSByZXR1cm4gJ0dGWCc7XHJcbiAgICByZXR1cm4gJyc7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuQ2xzQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR0eTogdGhpcy50dHksXHJcbiAgICAgICAgZ2Z4OiB0aGlzLmdmeFxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuQ2xzQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIGlmICh0aGlzLnR0eSkge1xyXG4gICAgICAgIGlmIChwcm9jZXNzLmJyb3dzZXIpIHtcclxuICAgICAgICAgICAgY3R4LndyaXRlKHtcclxuICAgICAgICAgICAgICAgIGNvbW1hbmQ6IFwiY2xlYXJcIixcclxuICAgICAgICAgICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcInR0eVwiXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSBjb25zb2xlLmxvZygobmV3IEFycmF5KHByb2Nlc3Muc3Rkb3V0LnJvd3MgKyAxKSkuam9pbihcIlxcblwiKSk7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5nZnggJiYgcHJvY2Vzcy5icm93c2VyKSB7XHJcbiAgICAgICAgY3R4LndyaXRlKHtcclxuICAgICAgICAgICAgY29tbWFuZDogXCJjbGVhclwiLFxyXG4gICAgICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiBcImdmeFwiXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IENsc0NvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIFNldHMgdGhlIGRyYXcgY29sb3Igb2YgdGhlIGNhbnZhc1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gQ29sb3JDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgMykgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdDT0xPUiBjb21tYW5kIHJlcXVpcmVzIDMgYXJndW1lbnRzJyk7XHJcbiAgICB0aGlzLnJlZCA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgdGhpcy5ncmVlbiA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgdGhpcy5ibHVlID0gcGFyc2VkLmFyZ3NbMl07XHJcbiAgICB0aGlzLmFscGhhID0gcGFyc2VkLmFyZ3MubGVuZ3RoID4gMyA/IHBhcnNlZC5hcmdzWzNdIDogZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkNvbG9yQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBhcmdzID0gW3RoaXMucmVkLCB0aGlzLmdyZWVuLCB0aGlzLmJsdWVdO1xyXG4gICAgaWYgKHRoaXMuYWxwaGEpIGFyZ3MucHVzaCh0aGlzLmFscGhhKTtcclxuICAgIHJldHVybiBhcmdzLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5Db2xvckNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICByOiB0aGlzLnJlZC50b0pTT04oKSxcclxuICAgICAgICBnOiB0aGlzLmdyZWVuLnRvSlNPTigpLFxyXG4gICAgICAgIGI6IHRoaXMuYmx1ZS50b0pTT04oKSxcclxuICAgICAgICBhOiB0aGlzLmFscGhhID8gdGhpcy5hbHBoYS50b0pTT04oKSA6IGZhbHNlXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5Db2xvckNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgcmVkID0gdGhpcy5yZWQuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBncmVlbiA9IHRoaXMuZ3JlZW4uZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBibHVlID0gdGhpcy5ibHVlLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgYWxwaGEgPSB0aGlzLmFscGhhID8gdGhpcy5hbHBoYS5leGVjdXRlKGRhdGEpIDogZmFsc2U7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZShyZWQsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoZ3JlZW4sICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoYmx1ZSwgJ251bWJlcicpO1xyXG4gICAgaWYgKGFscGhhICE9PSBmYWxzZSkgZGF0YS52YWxpZGF0ZShhbHBoYSwgJ251bWJlcicpO1xyXG4gICAgZWxzZSBhbHBoYSA9IGRhdGEuY29uc3RhbnRzWydDb2xvckEnXTtcclxuXHJcbiAgICB2YXIgb2xkUmVkID0gcmVkLCBvbGRHcmVlbiA9IGdyZWVuLCBvbGRCbHVlID0gYmx1ZSwgb2xkQWxwaGEgPSBhbHBoYTtcclxuXHJcbiAgICBpZiAocmVkID4gMSkgcmVkIC89IDI1NTtcclxuICAgIGlmIChncmVlbiA+IDEpIGdyZWVuIC89IDI1NTtcclxuICAgIGlmIChibHVlID4gMSkgYmx1ZSAvPSAyNTU7XHJcbiAgICBpZiAoYWxwaGEgPiAxKSBhbHBoYSAvPSAyNTU7XHJcblxyXG4gICAgcmVkID0gTWF0aC5tYXgoMCwgTWF0aC5taW4ocmVkLCAxKSk7XHJcbiAgICBncmVlbiA9IE1hdGgubWF4KDAsIE1hdGgubWluKGdyZWVuLCAxKSk7XHJcbiAgICBibHVlID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oYmx1ZSwgMSkpO1xyXG4gICAgYWxwaGEgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihhbHBoYSwgMSkpO1xyXG5cclxuICAgIGRhdGEuc2V0Q29uc3RhbnQoJ0NvbG9yUicsIG9sZFJlZCk7XHJcbiAgICBkYXRhLnNldENvbnN0YW50KCdDb2xvckcnLCBvbGRHcmVlbik7XHJcbiAgICBkYXRhLnNldENvbnN0YW50KCdDb2xvckInLCBvbGRCbHVlKTtcclxuICAgIGRhdGEuc2V0Q29uc3RhbnQoJ0NvbG9yQScsIG9sZEFscGhhKTtcclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgIFwiclwiOiByZWQsXHJcbiAgICAgICAgICAgIFwiZ1wiOiBncmVlbixcclxuICAgICAgICAgICAgXCJiXCI6IGJsdWUsXHJcbiAgICAgICAgICAgIFwiYVwiOiBhbHBoYVxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBDb2xvckNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcblxyXG4vKipcclxuICogRGVjbGFyZXMgb25lIG9yIG1vcmUgYXJyYXlzXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBEaW1Db21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzLCB7XHJcbiAgICAgICAgcGFyc2VBcmdzOiBmYWxzZVxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5jcmVhdGVzID0gW107XHJcblxyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJzZWQuYXJncy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBkaW1EZWYgPSBwYXJzZWQuYXJnc1tpXTtcclxuICAgICAgICB2YXIgc3RhcnRCcmFja2V0ID0gZGltRGVmLmluZGV4T2YoJygnKTtcclxuICAgICAgICB2YXIgZW5kQnJhY2tldCA9IGRpbURlZi5pbmRleE9mKCcpJyk7XHJcblxyXG4gICAgICAgIGlmIChzdGFydEJyYWNrZXQgPT09IC0xKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0V4cGVjdGVkIHN0YXJ0IGJyYWNrZXQnKTtcclxuICAgICAgICBpZiAoZW5kQnJhY2tldCA9PT0gLTEpIHRocm93IG5ldyBTeW50YXhFcnJvcignRXhwZWN0ZWQgZW5kIGJyYWNrZXQnKTtcclxuXHJcbiAgICAgICAgdmFyIGFycmF5TmFtZSA9IGRpbURlZi5zdWJzdHJpbmcoMCwgc3RhcnRCcmFja2V0KS50cmltKCk7XHJcbiAgICAgICAgdmFyIGFycmF5TGVuZ3RoTmFtZSA9IGRpbURlZi5zdWJzdHJpbmcoc3RhcnRCcmFja2V0ICsgMSwgZW5kQnJhY2tldCk7XHJcbiAgICAgICAgdmFyIGFycmF5TGVuZ3RoQXJnID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJyYXlMZW5ndGhOYW1lKTtcclxuXHJcbiAgICAgICAgdGhpcy5jcmVhdGVzLnB1c2goe1xyXG4gICAgICAgICAgICBuYW1lOiBhcnJheU5hbWUsXHJcbiAgICAgICAgICAgIGxlbmd0aHM6IGFycmF5TGVuZ3RoQXJnLmFyZ3NcclxuICAgICAgICB9KVxyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5EaW1Db21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGNyZWF0ZXMgPSBbXTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jcmVhdGVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGNyZWF0ZSA9IHRoaXMuY3JlYXRlc1tpXTtcclxuICAgICAgICBjcmVhdGVzLnB1c2goY3JlYXRlLm5hbWUgKyAnKCcgKyBjcmVhdGUubGVuZ3Rocy5qb2luKCcsICcpICsgJyknKTtcclxuICAgIH1cclxuICAgIHJldHVybiBjcmVhdGVzLmpvaW4oJywgJyk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuRGltQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgY3JlYXRlcyA9IFtdO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNyZWF0ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgbGVuZ3RocyA9IFtdLCBjcmVhdGUgPSB0aGlzLmNyZWF0ZXNbaV07XHJcbiAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCBjcmVhdGUubGVuZ3Rocy5sZW5ndGg7IHgrKykge1xyXG4gICAgICAgICAgICBsZW5ndGhzLnB1c2goY3JlYXRlLmxlbmd0aHNbeF0udG9KU09OKCkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY3JlYXRlcy5wdXNoKHtcclxuICAgICAgICAgICAgbmFtZTogY3JlYXRlLm5hbWUudG9KU09OKCksXHJcbiAgICAgICAgICAgIGxlbmd0aHM6IGxlbmd0aHNcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGNyZWF0ZXM6IGNyZWF0ZXNcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkRpbUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY3JlYXRlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBkaW1EZWYgPSB0aGlzLmNyZWF0ZXNbaV07XHJcblxyXG4gICAgICAgIHZhciBsZW5ndGhzID0gW107XHJcbiAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCBkaW1EZWYubGVuZ3Rocy5sZW5ndGg7IHgrKykge1xyXG4gICAgICAgICAgICB2YXIgbGVuZ3RoID0gZGltRGVmLmxlbmd0aHNbeF0uZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICAgICAgZGF0YS52YWxpZGF0ZShsZW5ndGgsICdudW1iZXInKTtcclxuICAgICAgICAgICAgbGVuZ3Rocy5wdXNoKGxlbmd0aCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkYXRhLmRlZmluZUFycmF5KGRpbURlZi5uYW1lLCBsZW5ndGhzKTtcclxuICAgIH1cclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRGltQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogRHJhd3MgYSBzcHJpdGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIERyYXdzcHJpdGVDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgMykgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdEUkFXU1BSSVRFIGNvbW1hbmQgcmVxdWlyZXMgMyBhcmd1bWVudHMnKTtcclxuICAgIHRoaXMuaWQgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueCA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgdGhpcy55ID0gcGFyc2VkLmFyZ3NbMl07XHJcbiAgICB0aGlzLnNjYWxlID0gcGFyc2VkLmFyZ3MubGVuZ3RoID09PSA0ID8gcGFyc2VkLmFyZ3NbM10gOiBmYWxzZTtcclxuICAgIHRoaXMucm90YXRpb24gPSBwYXJzZWQuYXJncy5sZW5ndGggPT09IDUgPyBwYXJzZWQuYXJnc1s0XSA6IGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5EcmF3c3ByaXRlQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBhcmdzID0gW3RoaXMuaWQsIHRoaXMueCwgdGhpcy55XTtcclxuICAgIGlmICh0aGlzLnNjYWxlKSBhcmdzLnB1c2godGhpcy5zY2FsZSk7XHJcbiAgICBpZiAodGhpcy5yb3RhdGlvbikgYXJncy5wdXNoKHRoaXMucm90YXRpb24pO1xyXG4gICAgcmV0dXJuIGFyZ3Muam9pbihcIiwgXCIpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkRyYXdzcHJpdGVDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgaWQ6IHRoaXMuaWQudG9KU09OKCksXHJcbiAgICAgICAgeDogdGhpcy54LnRvSlNPTigpLFxyXG4gICAgICAgIHk6IHRoaXMueS50b0pTT04oKSxcclxuICAgICAgICBzY2FsZTogdGhpcy5zY2FsZSA/IHRoaXMuc2NhbGUudG9KU09OKCkgOiBmYWxzZSxcclxuICAgICAgICByb3RhdGlvbjogdGhpcy5yb3RhdGlvbiA/IHRoaXMucm90YXRpb24udG9KU09OKCkgOiBmYWxzZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuRHJhd3Nwcml0ZUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgaWQgPSB0aGlzLmlkLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeCA9IHRoaXMueC5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkgPSB0aGlzLnkuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBzY2FsZSA9IHRoaXMuc2NhbGUgPyB0aGlzLnNjYWxlLmV4ZWN1dGUoZGF0YSkgOiAxO1xyXG4gICAgdmFyIHJvdGF0aW9uID0gdGhpcy5yb3RhdGlvbiA/IHRoaXMucm90YXRpb24uZXhlY3V0ZShkYXRhKSA6IDA7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZShpZCwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh4LCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHksICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoc2NhbGUsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUocm90YXRpb24sICdudW1iZXInKTtcclxuXHJcbiAgICBpZiAoIWRhdGEucHJpdmF0ZS5zcHJpdGVzW2lkXSkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHNwcml0ZSBJRCcpO1xyXG4gICAgdmFyIGltZyA9IGRhdGEucHJpdmF0ZS5zcHJpdGVzW2lkXTtcclxuXHJcbiAgICBjdHgucHJpbnQoe1xyXG4gICAgICAgIGNvbW1hbmQ6ICdzcHJpdGUnLFxyXG4gICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgeDogeCxcclxuICAgICAgICAgICAgeTogeSxcclxuICAgICAgICAgICAgc2NhbGU6IHNjYWxlLFxyXG4gICAgICAgICAgICByb3RhdGlvbjogcm90YXRpb24sXHJcbiAgICAgICAgICAgIHNwcml0ZTogaW1nXHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBEcmF3c3ByaXRlQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogRHJhd3MgdGV4dCBlaXRoZXIgYXQgYSBwb2ludCBvciBpbnNpZGUgYSByZWN0YW5nbGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKi9cclxuZnVuY3Rpb24gRHJhd3RleHRDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgMykgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdEUkFXVEVYVCBjb21tYW5kIHJlcXVpcmVzIDMgYXJndW1lbnRzJyk7XHJcbiAgICBlbHNlIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPiAzKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0RSQVdURVhUIGNvbW1hbmQgcmVxdWlyZXMgNSBhcmd1bWVudHMnKTtcclxuXHJcbiAgICB0aGlzLnRleHQgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueDEgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMueTEgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPiAzKSB7XHJcbiAgICAgICAgdGhpcy54MiA9IHBhcnNlZC5hcmdzWzNdO1xyXG4gICAgICAgIHRoaXMueTIgPSBwYXJzZWQuYXJnc1s0XTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy54MiA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMueTIgPSBmYWxzZTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuRHJhd3RleHRDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGFyZ3MgPSBbdGhpcy50ZXh0LCB0aGlzLngxLCB0aGlzLnkxXTtcclxuICAgIGlmICh0aGlzLngyKSBhcmdzLnB1c2godGhpcy54MiwgdGhpcy55Mik7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuRHJhd3RleHRDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdGV4dDogdGhpcy50ZXh0LnRvSlNPTigpLFxyXG4gICAgICAgIHgxOiB0aGlzLngxLnRvSlNPTigpLFxyXG4gICAgICAgIHkxOiB0aGlzLnkxLnRvSlNPTigpLFxyXG4gICAgICAgIHgyOiB0aGlzLngyID8gdGhpcy54Mi50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIHkyOiB0aGlzLnkyID8gdGhpcy55Mi50b0pTT04oKSA6IGZhbHNlXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5EcmF3dGV4dENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgdGV4dCA9IHRoaXMudGV4dC5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHgxID0gdGhpcy54MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkxID0gdGhpcy55MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh0ZXh0LCAnc3RyaW5nJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHgxLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHkxLCAnbnVtYmVyJyk7XHJcblxyXG4gICAgdmFyIHgyLCB5MiA9IGZhbHNlO1xyXG4gICAgaWYgKHRoaXMueDIpIHtcclxuICAgICAgICB4MiA9IHRoaXMueDIuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICB5MiA9IHRoaXMueTIuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKHgyLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZSh5MiwgJ251bWJlcicpO1xyXG4gICAgfVxyXG5cclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogXCJ0ZXh0XCIsXHJcbiAgICAgICAgYXJnczoge1xyXG4gICAgICAgICAgICB0ZXh0OiB0ZXh0LFxyXG4gICAgICAgICAgICB4MTogeDEsXHJcbiAgICAgICAgICAgIHkxOiB5MSxcclxuICAgICAgICAgICAgeDI6IHgyLFxyXG4gICAgICAgICAgICB5MjogeTJcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IERyYXd0ZXh0Q29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogRHJhd3MgYSBmaWxsZWQgb3Igc3Ryb2tlZCBlbGxpcHNlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIEVsbGlwc2VDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgNCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdFTExJUFNFIGNvbW1hbmQgcmVxdWlyZXMgNCBhcmd1bWVudHMnKTtcclxuICAgIHRoaXMueDEgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueTEgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMueDIgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIHRoaXMueTIgPSBwYXJzZWQuYXJnc1szXTtcclxuICAgIHRoaXMuc3Ryb2tlID0gcGFyc2VkLmFyZ3MubGVuZ3RoID4gNCA/IHBhcnNlZC5hcmdzWzRdIDogZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkVsbGlwc2VDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGFyZ3MgPSBbdGhpcy54MSwgdGhpcy55MSwgdGhpcy54MiwgdGhpcy55Ml07XHJcbiAgICBpZiAodGhpcy5zdHJva2UpIGFyZ3MucHVzaCh0aGlzLnN0cm9rZSk7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuRWxsaXBzZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4MSA6IHRoaXMueDEudG9KU09OKCksXHJcbiAgICAgICAgeTE6IHRoaXMueTEudG9KU09OKCksXHJcbiAgICAgICAgeDI6IHRoaXMueDIudG9KU09OKCksXHJcbiAgICAgICAgeTI6IHRoaXMueTIudG9KU09OKCksXHJcbiAgICAgICAgc3Ryb2tlOiB0aGlzLnN0cm9rZSA/IHRoaXMuc3Ryb2tlLnRvSlNPTigpIDogZmFsc2VcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkVsbGlwc2VDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHgxID0gdGhpcy54MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkxID0gdGhpcy55MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHgyID0gdGhpcy54Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkyID0gdGhpcy55Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHN0cm9rZSA9IHRoaXMuc3Ryb2tlID8gdGhpcy5zdHJva2UuZXhlY3V0ZShkYXRhKSA6IDA7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZSh4MSwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5MSwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh4MiwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5MiwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShzdHJva2UsICdudW1iZXInKTtcclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6IFwiZWxsaXBzZVwiLFxyXG4gICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgeDE6IHgxLFxyXG4gICAgICAgICAgICB5MTogeTEsXHJcbiAgICAgICAgICAgIHgyOiB4MixcclxuICAgICAgICAgICAgeTI6IHkyLFxyXG4gICAgICAgICAgICBzdHJva2U6IHN0cm9rZVxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRWxsaXBzZUNvbW1hbmQ7IiwiLyoqXHJcbiAqIFNraXBzIHRvIHRoZSBuZXh0IG1hdGNoaW5nIEVORElGIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBkZWZpbmVcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBFbHNlQ29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIHRoaXMuYmxvY2sgPSBkZWZpbmU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5FbHNlQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGJsb2NrOiB0aGlzLmJsb2NrLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5FbHNlQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciByZWZzID0gdGhpcy5ibG9jay5yZWZlcmVuY2VzKCk7XHJcbiAgICBpZiAoIXJlZnMubGVuZ3RoKSB0aHJvdyBuZXcgRXJyb3IoJ0VMU0Ugd2l0aG91dCBJRicpO1xyXG5cclxuICAgIGRhdGEuY3Vyc29yID0gcmVmc1swXS5lbmQ7XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEVsc2VDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG5cclxuLyoqXHJcbiAqIFRlcm1pbmF0ZXMgdGhlIHByb2dyYW1cclxuICpcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBFbmRDb21tYW5kKCkge31cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuRW5kQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIGRhdGEudGVybWluYXRlKCk7XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEVuZENvbW1hbmQ7IiwidmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogQmVnaW5zIGNhbnZhcyBjYWNoaW5nXHJcbiAqXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gRW5kZHJhd0NvbW1hbmQoKSB7fVxyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5FbmRkcmF3Q29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogXCJmbHVzaENhY2hlXCJcclxuICAgIH0pO1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBFbmRkcmF3Q29tbWFuZDsiLCIvKipcclxuICogRW5kIG9mIGFuIElGIGJsb2NrXHJcbiAqXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gRW5kaWZDb21tYW5kKCkge31cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuRW5kaWZDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBFbmRpZkNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciB1dGlsID0gcmVxdWlyZSgnLi4vLi4vdXRpbCcpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgc2V0SW1tZWRpYXRlID0gdXRpbC5zZXRJbW1lZGlhdGU7XHJcblxyXG4vKipcclxuICogSXRlcmF0ZXMgb3ZlciB0aGUgYm9keSBhIGNlcnRhaW4gYW1vdW50IG9mIHRpbWVzXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5lXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gRm9yQ29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIHZhciBsb3dlckFyZ3MgPSBhcmdzLnRvTG93ZXJDYXNlKCk7XHJcbiAgICB2YXIgdG9JbmRleCA9IGxvd2VyQXJncy5pbmRleE9mKCcgdG8gJyk7XHJcbiAgICBpZiAodG9JbmRleCA9PT0gLTEpIHRocm93IG5ldyBTeW50YXhFcnJvcignRk9SIGhhcyBubyBUTycpO1xyXG4gICAgdmFyIGFzc2lnbm1lbnRUZXh0ID0gYXJncy5zdWJzdHJpbmcoMCwgdG9JbmRleCkudHJpbSgpO1xyXG5cclxuICAgIHZhciBzdGVwSW5kZXggPSBsb3dlckFyZ3MuaW5kZXhPZignIHN0ZXAgJyk7XHJcbiAgICB2YXIgdXBwZXJMaW1pdFRleHQsIHN0ZXBUZXh0O1xyXG4gICAgaWYgKHN0ZXBJbmRleCA9PT0gLTEpIHtcclxuICAgICAgICB1cHBlckxpbWl0VGV4dCA9IGFyZ3Muc3Vic3RyaW5nKHRvSW5kZXggKyA0KS50cmltKCk7XHJcbiAgICAgICAgc3RlcFRleHQgPSAnMSc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHVwcGVyTGltaXRUZXh0ID0gYXJncy5zdWJzdHJpbmcodG9JbmRleCArIDQsIHN0ZXBJbmRleCkudHJpbSgpO1xyXG4gICAgICAgIHN0ZXBUZXh0ID0gYXJncy5zdWJzdHJpbmcoc3RlcEluZGV4ICsgNikudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBhc3NpZ25tZW50RXF1YWxzID0gYXNzaWdubWVudFRleHQuaW5kZXhPZignPScpO1xyXG4gICAgaWYgKGFzc2lnbm1lbnRFcXVhbHMgPT09IC0xKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0V4cGVjdGVkIGFzc2lnbm1lbnQnKTtcclxuICAgIHZhciB2YXJpYWJsZU5hbWUgPSBhc3NpZ25tZW50VGV4dC5zdWJzdHJpbmcoMCwgYXNzaWdubWVudEVxdWFscykudHJpbSgpO1xyXG4gICAgdmFyIGVxdWFsc0V4cHJlc3Npb24gPSBhc3NpZ25tZW50VGV4dC5zdWJzdHJpbmcoYXNzaWdubWVudEVxdWFscyArIDEpLnRyaW0oKTtcclxuICAgIHZhciBhc3NpZ25tZW50RXhwciA9IG5ldyBzdGF0ZW1lbnRzLkFzc2lnbm1lbnRTdGF0ZW1lbnQoXHJcbiAgICAgICAgICAgIG5ldyBzdGF0ZW1lbnRzLlZhcmlhYmxlU3RhdGVtZW50KHZhcmlhYmxlTmFtZSksXHJcbiAgICAgICAgICAgIG5ldyBzdGF0ZW1lbnRzLkV4cHJlc3Npb25TdGF0ZW1lbnQoZXF1YWxzRXhwcmVzc2lvbiwgZGVmaW5lKVxyXG4gICAgKTtcclxuXHJcbiAgICB2YXIgdXBwZXJMaW1pdEV4cHIgPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KHVwcGVyTGltaXRUZXh0LCBkZWZpbmUpO1xyXG4gICAgaWYgKHVwcGVyTGltaXRFeHByLmVycm9yKSB0aHJvdyB1cHBlckxpbWl0RXhwci5lcnJvcjtcclxuXHJcbiAgICB2YXIgc3RlcEV4cHIgPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KHN0ZXBUZXh0LCBkZWZpbmUpO1xyXG4gICAgaWYgKHN0ZXBFeHByLmVycm9yKSB0aHJvdyBzdGVwRXhwci5lcnJvcjtcclxuXHJcbiAgICB0aGlzLmFzc2lnbm1lbnRFeHByID0gYXNzaWdubWVudEV4cHI7XHJcbiAgICB0aGlzLnVwcGVyTGltaXRFeHByID0gdXBwZXJMaW1pdEV4cHI7XHJcbiAgICB0aGlzLnN0ZXBFeHByID0gc3RlcEV4cHI7XHJcblxyXG4gICAgdGhpcy5ibG9jayA9IGRlZmluZSh7XHJcbiAgICAgICAgc3RhcnQ6ICdGT1InLFxyXG4gICAgICAgIGVuZDogJ05FWFQnXHJcbiAgICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuRm9yQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmFzc2lnbm1lbnRFeHByLnRvU3RyaW5nKCkgKyAnIFRPICcgKyB0aGlzLnVwcGVyTGltaXRFeHByLnRvU3RyaW5nKCkgKyAnIFNURVAgJyArIHRoaXMuc3RlcEV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5Gb3JDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgYXNzaWdubWVudDogdGhpcy5hc3NpZ25tZW50RXhwci50b0pTT04oKSxcclxuICAgICAgICB1cHBlckxpbWl0OiB0aGlzLnVwcGVyTGltaXRFeHByLnRvSlNPTigpLFxyXG4gICAgICAgIHN0ZXA6IHRoaXMuc3RlcEV4cHIudG9KU09OKCksXHJcbiAgICAgICAgYmxvY2s6IHRoaXMuYmxvY2sudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkZvckNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgdHJhY2tWYWx1ZTtcclxuXHJcbiAgICBpZiAoIXRoaXMuaGFzUnVuKSB7XHJcbiAgICAgICAgdGhpcy5oYXNSdW4gPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuYXNzaWdubWVudEV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICB0aGlzLnRyYWNrVmFyID0gdGhpcy5hc3NpZ25tZW50RXhwci52YXJpYWJsZTtcclxuICAgICAgICB0cmFja1ZhbHVlID0gZGF0YS5nZXRWYXJpYWJsZSh0aGlzLnRyYWNrVmFyKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIGluY3JlbWVudCA9IHRoaXMuc3RlcEV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKGluY3JlbWVudCwgJ251bWJlcicpO1xyXG4gICAgICAgIHRyYWNrVmFsdWUgPSBkYXRhLmdldFZhcmlhYmxlKHRoaXMudHJhY2tWYXIpO1xyXG4gICAgICAgIGRhdGEudmFsaWRhdGUodHJhY2tWYWx1ZSwgJ251bWJlcicpO1xyXG4gICAgICAgIHRyYWNrVmFsdWUgKz0gaW5jcmVtZW50O1xyXG4gICAgICAgIGRhdGEuc2V0VmFyaWFibGUodGhpcy50cmFja1ZhciwgdHJhY2tWYWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIG1heFZhbHVlID0gdGhpcy51cHBlckxpbWl0RXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShtYXhWYWx1ZSwgJ251bWJlcicpO1xyXG4gICAgaWYgKChtYXhWYWx1ZSA+IDAgJiYgdHJhY2tWYWx1ZSA+IG1heFZhbHVlKSB8fCAobWF4VmFsdWUgPCAwICYmIHRyYWNrVmFsdWUgPCBtYXhWYWx1ZSkpIHtcclxuICAgICAgICB0aGlzLmhhc1J1biA9IGZhbHNlO1xyXG4gICAgICAgIGRhdGEuY3Vyc29yID0gdGhpcy5ibG9jay5lbmQgKyAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8vc2V0SW1tZWRpYXRlKG5leHQpO1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBGb3JDb21tYW5kOyIsInZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciB1dGlsID0gcmVxdWlyZSgnLi4vLi4vdXRpbCcpO1xyXG52YXIgc2V0SW1tZWRpYXRlID0gdXRpbC5zZXRJbW1lZGlhdGU7XHJcblxyXG4vKipcclxuICogR29lcyB0byBhIGxhYmVsIGFuZCByZXR1cm5zIG9uIFJFVFVSTlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyB0aGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gR29zdWJDb21tYW5kKGFyZ3MpIHtcclxuICAgIGlmICghYXJncy5sZW5ndGgpIHRocm93IG5ldyBTeW50YXhFcnJvcignTGFiZWwgcmVxdWlyZWQnKTtcclxuICAgIHRoaXMubGFiZWwgPSBhcmdzO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Hb3N1YkNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sYWJlbDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5Hb3N1YkNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBsYWJlbDogdGhpcy5sYWJlbFxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuR29zdWJDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgZGF0YS5nb3N1YkxhYmVsKHRoaXMubGFiZWwpO1xyXG4gICAgc2V0SW1tZWRpYXRlKG5leHQpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBHb3N1YkNvbW1hbmQ7IiwidmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIHV0aWwgPSByZXF1aXJlKCcuLi8uLi91dGlsJyk7XHJcbnZhciBzZXRJbW1lZGlhdGUgPSB1dGlsLnNldEltbWVkaWF0ZTtcclxuXHJcbi8qKlxyXG4gKiBHb2VzIHRvIGEgbGFiZWxcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIEdvdG9Db21tYW5kKGFyZ3MpIHtcclxuICAgIGlmICghYXJncy5sZW5ndGgpIHRocm93IG5ldyBTeW50YXhFcnJvcignTGFiZWwgcmVxdWlyZWQnKTtcclxuICAgIHRoaXMubGFiZWwgPSBhcmdzO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Hb3RvQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmxhYmVsO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkdvdG9Db21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgbGFiZWw6IHRoaXMubGFiZWxcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkdvdG9Db21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgZGF0YS5nb3RvTGFiZWwodGhpcy5sYWJlbCk7XHJcbiAgICBzZXRJbW1lZGlhdGUobmV4dCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEdvdG9Db21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4uLy4uL3V0aWwnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBib2R5IGlmIHRoZSBjb25kaXRpb24gaXMgdHJ1ZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluZVxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIElmQ29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIGlmICh1dGlsLmVuZHNXaXRoKGFyZ3MudG9Mb3dlckNhc2UoKSwgJyB0aGVuJykpIGFyZ3MgPSBhcmdzLnNsaWNlKDAsIGFyZ3MubGVuZ3RoIC0gNSkudHJpbSgpO1xyXG4gICAgZWxzZSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0lGIGhhcyBubyBUSEVOJyk7XHJcblxyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MsIHtcclxuICAgICAgICBzZXBhcmF0b3I6IGZhbHNlXHJcbiAgICB9LCBkZWZpbmUpO1xyXG5cclxuICAgIHRoaXMuY29uZGl0aW9uID0gcGFyc2VkLmFyZ3NbMF07XHJcbiAgICB0aGlzLmJsb2NrID0gZGVmaW5lKHtcclxuICAgICAgICBzdGFydDogJ0lGJyxcclxuICAgICAgICB0aGVuOiAnRUxTRScsXHJcbiAgICAgICAgZW5kOiAnRU5ESUYnXHJcbiAgICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuSWZDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuY29uZGl0aW9uLnRvU3RyaW5nKCkgKyBcIiBUSEVOXCI7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuSWZDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgY29uZGl0aW9uOiB0aGlzLmNvbmRpdGlvbi50b0pTT04oKSxcclxuICAgICAgICBibG9jazogdGhpcy5ibG9jay50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuSWZDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHNob3VsZFJ1biA9IHRoaXMuY29uZGl0aW9uLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBpZiAoIXNob3VsZFJ1bikge1xyXG4gICAgICAgIGlmICh0aGlzLmJsb2NrLmhhcygnRUxTRScpKSBkYXRhLmN1cnNvciA9IHRoaXMuYmxvY2submV4dCgnRUxTRScpICsgMTtcclxuICAgICAgICBlbHNlIGRhdGEuY3Vyc29yID0gdGhpcy5ibG9jay5lbmQ7XHJcbiAgICB9XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IElmQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGZpbGVzeXN0ZW0gPSByZXF1aXJlKCcuLi8uLi9maWxlc3lzdGVtJyk7XHJcbnZhciBybCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0RGVmYXVsdCgpO1xyXG5cclxuLyoqXHJcbiAqIElucHV0cyBhIGxpbmUgZnJvbSB0aGUgdXNlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gSW5wdXRDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuICAgIGlmICghcGFyc2VkLmFyZ3MubGVuZ3RoKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0lOUFVUIHJlcXVpcmVzIGF0IGxlYXN0IG9uZSBhcmd1bWVudCcpO1xyXG5cclxuICAgIHZhciBxdWVzdGlvbiA9IFwiXCIsIHBsYWNlVmFyLCBmaWxlO1xyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA9PT0gMSkgcGxhY2VWYXIgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIGVsc2Uge1xyXG4gICAgICAgIGlmIChwYXJzZWQuYXJnc1swXS5jaGlsZCBpbnN0YW5jZW9mIHN0YXRlbWVudHMuUG9pbnRlclN0YXRlbWVudCkgZmlsZSA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgICAgIGVsc2UgcXVlc3Rpb24gPSBwYXJzZWQuYXJnc1swXTtcclxuXHJcbiAgICAgICAgcGxhY2VWYXIgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIShwbGFjZVZhci5jaGlsZCBpbnN0YW5jZW9mIHN0YXRlbWVudHMuVmFyaWFibGVTdGF0ZW1lbnQpKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0V4cGVjdGVkIHZhcmlhYmxlJyk7XHJcblxyXG4gICAgdGhpcy5maWxlID0gZmlsZTtcclxuICAgIHRoaXMucXVlc3Rpb24gPSBxdWVzdGlvbjtcclxuICAgIHRoaXMucGxhY2VWYXIgPSBwbGFjZVZhcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuSW5wdXRDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuICAodGhpcy5maWxlID8gdGhpcy5maWxlLnRvU3RyaW5nKCkgKyAnLCAnIDogJycpICtcclxuICAgICAgICAgICAgKHRoaXMucXVlc3Rpb24gPyB0aGlzLnF1ZXN0aW9uLnRvU3RyaW5nKCkgKyAnLCAnIDogJycpICtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZVZhci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbklucHV0Q29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGZpbGU6IHRoaXMuZmlsZSA/IHRoaXMuZmlsZS50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIHF1ZXN0aW9uOiB0aGlzLnF1ZXN0aW9uID8gdGhpcy5xdWVzdGlvbi50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIHZhcmlhYmxlOiB0aGlzLnBsYWNlVmFyLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5JbnB1dENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgcGxhY2VWYXIgPSB0aGlzLnBsYWNlVmFyO1xyXG5cclxuICAgIGlmICh0aGlzLmZpbGUpIHtcclxuICAgICAgICB2YXIgZmlsZSA9IHRoaXMuZmlsZS5leGVjdXRlKGRhdGEpO1xyXG4gICAgICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBmaWxlc3lzdGVtLkZpbGUpKSB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIGZpbGUnKTtcclxuXHJcbiAgICAgICAgaWYgKGZpbGUubW9kZSAhPT0gJ2lucHV0JykgdGhyb3cgbmV3IEVycm9yKCdGaWxlIG5vdCByZWFkYWJsZScpO1xyXG5cclxuICAgICAgICB2YXIgdmFsdWUgPSBmaWxlLm5leHRMaW5lKCk7XHJcbiAgICAgICAgaWYgKGZpbGUuZW9mICYmIHBsYWNlVmFyLmNoaWxkLnR5cGUgPT09IFwibnVtYmVyXCIpIHZhbHVlID0gMDtcclxuXHJcbiAgICAgICAgZGF0YS5zZXRWYXJpYWJsZShwbGFjZVZhci5jaGlsZCwgdmFsdWUpO1xyXG4gICAgICAgIGRhdGEuc2V0Q29uc3RhbnQoJ0VPRicsIGZpbGUuZW9mID8gMSA6IDApO1xyXG4gICAgICAgIG5leHQoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIHF1ZXN0aW9uID0gdGhpcy5xdWVzdGlvbiA/IHRoaXMucXVlc3Rpb24uZXhlY3V0ZShkYXRhKSA6ICcnO1xyXG5cclxuICAgICAgICBybC5xdWVzdGlvbihxdWVzdGlvbiArIFwiPiBcIiwgZnVuY3Rpb24gKGFuc3dlcikge1xyXG4gICAgICAgICAgICBkYXRhLnNldFZhcmlhYmxlKHBsYWNlVmFyLmNoaWxkLCBhbnN3ZXIpO1xyXG4gICAgICAgICAgICBuZXh0KCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IElucHV0Q29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogRHJhd3MgYSBsaW5lXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIExpbmVDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgNCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdMSU5FIGNvbW1hbmQgcmVxdWlyZXMgNCBhcmd1bWVudHMnKTtcclxuICAgIHRoaXMueDEgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueTEgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMueDIgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIHRoaXMueTIgPSBwYXJzZWQuYXJnc1szXTtcclxuICAgIHRoaXMud2lkdGggPSBwYXJzZWQuYXJncy5sZW5ndGggPiA0ID8gcGFyc2VkLmFyZ3NbNF0gOiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuTGluZUNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFt0aGlzLngxLCB0aGlzLnkxLCB0aGlzLngyLCB0aGlzLnkyXTtcclxuICAgIGlmICh0aGlzLndpZHRoKSBhcmdzLnB1c2godGhpcy53aWR0aCk7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuTGluZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4MTogdGhpcy54MS50b0pTT04oKSxcclxuICAgICAgICB5MTogdGhpcy55MS50b0pTT04oKSxcclxuICAgICAgICB4MjogdGhpcy54Mi50b0pTT04oKSxcclxuICAgICAgICB5MjogdGhpcy55Mi50b0pTT04oKSxcclxuICAgICAgICB3aWR0aDogdGhpcy53aWR0aCA/IHRoaXMud2lkdGgudG9KU09OKCkgOiBmYWxzZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuTGluZUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgeDEgPSB0aGlzLngxLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeTEgPSB0aGlzLnkxLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeDIgPSB0aGlzLngyLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeTIgPSB0aGlzLnkyLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgd2lkdGggPSB0aGlzLndpZHRoID8gdGhpcy53aWR0aC5leGVjdXRlKGRhdGEpIDogMTtcclxuXHJcbiAgICBkYXRhLnZhbGlkYXRlKHgxLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHkxLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHgyLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHkyLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHdpZHRoLCAnbnVtYmVyJyk7XHJcblxyXG4gICAgaWYgKHdpZHRoIDwgMSkgdGhyb3cgbmV3IEVycm9yKCdXaWR0aCBvdXQgb2YgYm91bmRzJyk7XHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6IFwibGluZVwiLFxyXG4gICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgeDE6IHgxLFxyXG4gICAgICAgICAgICB5MTogeTEsXHJcbiAgICAgICAgICAgIHgyOiB4MixcclxuICAgICAgICAgICAgeTI6IHkyLFxyXG4gICAgICAgICAgICB3aWR0aDogd2lkdGhcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IExpbmVDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgZmlsZXN5c3RlbSA9IHJlcXVpcmUoJy4uLy4uL2ZpbGVzeXN0ZW0nKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogTG9hZHMgYSBzcHJpdGUgZnJvbSBhIGZpbGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIExvYWRzcHJpdGVDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgMikgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdMT0FEU1BSSVRFIGNvbW1hbmQgcmVxdWlyZXMgMiBhcmd1bWVudHMnKTtcclxuICAgIGVsc2UgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA+IDIgJiYgcGFyc2VkLmFyZ3MubGVuZ3RoIDwgNSkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdMT0FEU1BSSVRFIGNvbW1hbmQgcmVxdWlyZXMgNSBhcmd1bWVudHMnKTtcclxuXHJcbiAgICB0aGlzLmlkID0gcGFyc2VkLmFyZ3NbMF07XHJcblxyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA+IDIpIHtcclxuICAgICAgICB0aGlzLngxID0gcGFyc2VkLmFyZ3NbMV07XHJcbiAgICAgICAgdGhpcy55MSA9IHBhcnNlZC5hcmdzWzJdO1xyXG4gICAgICAgIHRoaXMueDIgPSBwYXJzZWQuYXJnc1szXTtcclxuICAgICAgICB0aGlzLnkyID0gcGFyc2VkLmFyZ3NbNF07XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuZmlsZU5hbWUgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuTG9hZHNwcml0ZUNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICBpZiAodGhpcy54MSkge1xyXG4gICAgICAgIHZhciBhcmdzID0gW3RoaXMuaWQsIHRoaXMueDEsIHRoaXMueTEsIHRoaXMueDIsIHRoaXMueTJdO1xyXG4gICAgICAgIHJldHVybiBhcmdzLmpvaW4oXCIsIFwiKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzLmlkICsgXCIsIFwiICsgdGhpcy5maWxlTmFtZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5Mb2Fkc3ByaXRlQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGlkOiB0aGlzLmlkLnRvSlNPTigpLFxyXG4gICAgICAgIHgxOiB0aGlzLngxID8gdGhpcy54MS50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIHkxOiB0aGlzLnkxID8gdGhpcy55MS50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIHgyOiB0aGlzLngyID8gdGhpcy54Mi50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIHkyOiB0aGlzLnkyID8gdGhpcy55Mi50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIGZpbGVOYW1lOiB0aGlzLmZpbGVOYW1lID8gdGhpcy5maWxlTmFtZS50b0pTT04oKSA6IGZhbHNlXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5Mb2Fkc3ByaXRlQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciBpZCA9IHRoaXMuaWQuZXhlY3V0ZShkYXRhKTtcclxuICAgIGRhdGEudmFsaWRhdGUoaWQsICdudW1iZXInKTtcclxuXHJcbiAgICBpZiAodGhpcy54MSkge1xyXG4gICAgICAgIHZhciB4MSA9IHRoaXMueDEuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICB2YXIgeTEgPSB0aGlzLnkxLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICAgICAgdmFyIHgyID0gdGhpcy54Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgICAgIHZhciB5MiA9IHRoaXMueTIuZXhlY3V0ZShkYXRhKTtcclxuXHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZSh4MSwgJ251bWJlcicpO1xyXG4gICAgICAgIGRhdGEudmFsaWRhdGUoeTEsICdudW1iZXInKTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKHgyLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZSh5MiwgJ251bWJlcicpO1xyXG5cclxuICAgICAgICBjdHgucmVhZChmdW5jdGlvbihyZXNwb25zZSwgY2FuY2VsKSB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwb25zZS5jb21tYW5kICE9PSAnY2FwdHVyZScpIHJldHVybjtcclxuICAgICAgICAgICAgY2FuY2VsKCk7XHJcblxyXG4gICAgICAgICAgICBkYXRhLnByaXZhdGUuc3ByaXRlc1tpZF0gPSByZXNwb25zZS5kYXRhO1xyXG4gICAgICAgICAgICBuZXh0KCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY3R4LndyaXRlKHtcclxuICAgICAgICAgICAgY29tbWFuZDogJ2NhcHR1cmUnLFxyXG4gICAgICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgICAgICB4MTogeDEsXHJcbiAgICAgICAgICAgICAgICB5MTogeTEsXHJcbiAgICAgICAgICAgICAgICB4MjogeDIsXHJcbiAgICAgICAgICAgICAgICB5MjogeTJcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgZmlsZW5hbWUgPSB0aGlzLmZpbGVOYW1lLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZShmaWxlbmFtZSwgJ3N0cmluZycpO1xyXG5cclxuICAgICAgICB2YXIgZHJpdmVJbmRleCA9IGZpbGVuYW1lLmluZGV4T2YoJzonKTtcclxuICAgICAgICB2YXIgZHJpdmUgPSAnQSc7XHJcbiAgICAgICAgaWYgKGRyaXZlSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgIGRyaXZlID0gZmlsZW5hbWUuc3Vic3RyaW5nKDAsIGRyaXZlSW5kZXgpO1xyXG4gICAgICAgICAgICBmaWxlbmFtZSA9IGZpbGVuYW1lLnN1YnN0cmluZyhkcml2ZUluZGV4ICsgMSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmaWxlc3lzdGVtLmRyaXZlKGRyaXZlLCBmdW5jdGlvbiAoZnMpIHtcclxuICAgICAgICAgICAgdmFyIGZpbGUgPSBmcy5vcGVuKGZpbGVuYW1lKTtcclxuICAgICAgICAgICAgdmFyIGltYWdlTGluZSA9IGZpbGUubmV4dExpbmUoKTtcclxuICAgICAgICAgICAgaWYgKGZpbGUuZW9mIHx8ICFpbWFnZUxpbmUubGVuZ3RoKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaW1hZ2UgZmlsZScpO1xyXG5cclxuICAgICAgICAgICAgdmFyIGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gaW1hZ2VMaW5lO1xyXG5cclxuICAgICAgICAgICAgZGF0YS5wcml2YXRlLnNwcml0ZXNbaWRdID0gaW1nO1xyXG4gICAgICAgICAgICBuZXh0KCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IExvYWRzcHJpdGVDb21tYW5kOyIsInZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIExvY2tzIHRoZSBzaXplIG9mIHRoZSBjYW52YXNcclxuICovXHJcbmZ1bmN0aW9uIExvY2tvcmllbnRhdGlvbkNvbW1hbmQoKSB7IH1cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuTG9ja29yaWVudGF0aW9uQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogJ2xvY2tzaXplJ1xyXG4gICAgfSk7XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IExvY2tvcmllbnRhdGlvbkNvbW1hbmQ7IiwiLyoqXHJcbiAqIEVuZCBvZiBhIEZPUiBibG9ja1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluZVxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIE5leHRDb21tYW5kKGFyZ3MsIGRlZmluZSkge1xyXG4gICAgdGhpcy5ibG9jayA9IGRlZmluZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbk5leHRDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgYmxvY2s6IHRoaXMuYmxvY2sudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbk5leHRDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHJlZnMgPSB0aGlzLmJsb2NrLnJlZmVyZW5jZXMoKTtcclxuICAgIGlmICghcmVmcy5sZW5ndGgpIHRocm93IG5ldyBFcnJvcignTkVYVCB3aXRob3V0IEZPUicpO1xyXG5cclxuICAgIGRhdGEuY3Vyc29yID0gcmVmc1swXS5zdGFydDtcclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTmV4dENvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBmaWxlc3lzdGVtID0gcmVxdWlyZSgnLi4vLi4vZmlsZXN5c3RlbScpO1xyXG5cclxuLyoqXHJcbiAqIE9wZW5zIGEgZmlsZSBpbiBhIHBvaW50ZXJcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBkZWZpbmVcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBPcGVuQ29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIHZhciBsb3dlckFyZ3MgPSBhcmdzLnRvTG93ZXJDYXNlKCk7XHJcbiAgICB2YXIgZm9ySW5kZXggPSBsb3dlckFyZ3MuaW5kZXhPZignIGZvciAnKTtcclxuICAgIGlmIChmb3JJbmRleCA9PT0gLTEpIHRocm93IG5ldyBTeW50YXhFcnJvcignT1BFTiB3aXRob3V0IEZPUicpO1xyXG4gICAgdmFyIGZpbGVuYW1lID0gbmV3IHN0YXRlbWVudHMuRXhwcmVzc2lvblN0YXRlbWVudChhcmdzLnN1YnN0cmluZygwLCBmb3JJbmRleCkudHJpbSgpLCBkZWZpbmUpO1xyXG5cclxuICAgIHZhciBhc0luZGV4ID0gbG93ZXJBcmdzLmluZGV4T2YoJyBhcyAnKTtcclxuICAgIGlmIChhc0luZGV4ID09PSAtMSkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdPUEVOIHdpdGhvdXQgQVMnKTtcclxuICAgIHZhciB0eXBlID0gYXJncy5zdWJzdHJpbmcoZm9ySW5kZXggKyA1LCBhc0luZGV4KS50cmltKCkudG9Mb3dlckNhc2UoKTtcclxuICAgIGlmICh0eXBlICE9PSAnaW5wdXQnICYmIHR5cGUgIT09ICdvdXRwdXQnICYmIHR5cGUgIT09ICdhcHBlbmQnKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0ludmFsaWQgbW9kZScpO1xyXG5cclxuICAgIHZhciBwb2ludGVyID0gbmV3IHN0YXRlbWVudHMuRXhwcmVzc2lvblN0YXRlbWVudChhcmdzLnN1YnN0cmluZyhhc0luZGV4ICsgNCkudHJpbSgpLCBkZWZpbmUpO1xyXG4gICAgaWYgKCEocG9pbnRlci5jaGlsZCBpbnN0YW5jZW9mIHN0YXRlbWVudHMuUG9pbnRlclN0YXRlbWVudCkpIHRocm93IG5ldyBTeW50YXhFcnJvcignRXhwZWN0ZWQgcG9pbnRlcicpO1xyXG5cclxuICAgIHRoaXMuZmlsZW5hbWUgPSBmaWxlbmFtZTtcclxuICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcbiAgICB0aGlzLnBvaW50ZXIgPSBwb2ludGVyO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5PcGVuQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmZpbGVuYW1lLnRvU3RyaW5nKCkgKyBcIiBGT1IgXCIgKyB0aGlzLnR5cGUudG9VcHBlckNhc2UoKSArIFwiIEFTIFwiICsgdGhpcy5wb2ludGVyLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuT3BlbkNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBmaWxlbmFtZTogdGhpcy5maWxlbmFtZS50b0pTT04oKSxcclxuICAgICAgICB0eXBlOiB0aGlzLnR5cGUsXHJcbiAgICAgICAgcG9pbnRlcjogdGhpcy5wb2ludGVyLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5PcGVuQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciBmaWxlbmFtZSA9IHRoaXMuZmlsZW5hbWUuZXhlY3V0ZShkYXRhKTtcclxuICAgIGRhdGEudmFsaWRhdGUoZmlsZW5hbWUsICdzdHJpbmcnKTtcclxuXHJcbiAgICB2YXIgZHJpdmVJbmRleCA9IGZpbGVuYW1lLmluZGV4T2YoJzonKTtcclxuICAgIHZhciBkcml2ZSA9ICdBJztcclxuICAgIGlmIChkcml2ZUluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgIGRyaXZlID0gZmlsZW5hbWUuc3Vic3RyaW5nKDAsIGRyaXZlSW5kZXgpO1xyXG4gICAgICAgIGZpbGVuYW1lID0gZmlsZW5hbWUuc3Vic3RyaW5nKGRyaXZlSW5kZXggKyAxKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgcG9pbnRlciA9IHRoaXMucG9pbnRlci5jaGlsZCwgbW9kZSA9IHRoaXMudHlwZTtcclxuICAgIGZpbGVzeXN0ZW0uZHJpdmUoZHJpdmUsIGZ1bmN0aW9uKGZzKSB7XHJcbiAgICAgICAgdmFyIGZpbGUgPSBmcy5vcGVuKGZpbGVuYW1lKTtcclxuICAgICAgICBmaWxlLm1vZGUgPSBtb2RlO1xyXG4gICAgICAgIGlmIChtb2RlID09PSAnb3V0cHV0JykgZmlsZS5jbGVhcigpO1xyXG4gICAgICAgIGRhdGEuc2V0UG9pbnRlcihwb2ludGVyLCBmaWxlKTtcclxuICAgICAgICBuZXh0KCk7XHJcbiAgICB9KTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gT3BlbkNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBybCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0RGVmYXVsdCgpO1xyXG5cclxuLyoqXHJcbiAqIFBhdXNlcyBleGVjdXRpb24gdW50aWwgUkVUVVJOIGlzIHByZXNzZWRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBkZWZpbmVcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBQYXVzZUNvbW1hbmQoYXJncywgZGVmaW5lKSB7XHJcbiAgICBpZiAoYXJncy5sZW5ndGgpIHtcclxuICAgICAgICB0aGlzLm1lc3NhZ2UgPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KGFyZ3MsIGRlZmluZSk7XHJcbiAgICAgICAgaWYgKHRoaXMubWVzc2FnZS5lcnJvcikgdGhyb3cgdGhpcy5tZXNzYWdlLmVycm9yO1xyXG4gICAgfSBlbHNlIHRoaXMubWVzc2FnZSA9IG5ldyBzdGF0ZW1lbnRzLlN0cmluZ1N0YXRlbWVudChcIls8PCBQYXVzZWQsIFByZXNzIFJFVFVSTiB0byBDb250aW51ZSA+Pl1cIik7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblBhdXNlQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLm1lc3NhZ2UudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5QYXVzZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBtZXNzYWdlOiB0aGlzLm1lc3NhZ2UudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcblBhdXNlQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciBtZXNzYWdlID0gdGhpcy5tZXNzYWdlLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKG1lc3NhZ2UsICdzdHJpbmcnKTtcclxuXHJcbiAgICBybC5xdWVzdGlvbihtZXNzYWdlLCBmdW5jdGlvbihhbnN3ZXIpIHtcclxuICAgICAgICBuZXh0KCk7XHJcbiAgICB9KTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUGF1c2VDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBEcmF3cyBhIHBpZWNoYXJ0XHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIFBpZWNoYXJ0Q29tbWFuZChhcmdzKSB7XHJcbiAgICB2YXIgcGFyc2VkID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJncyk7XHJcblxyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA8IDgpIHRocm93IG5ldyBTeW50YXhFcnJvcignUElFQ0hBUlQgY29tbWFuZCByZXF1aXJlcyA4IGFyZ3VtZW50cycpO1xyXG4gICAgdGhpcy54ID0gcGFyc2VkLmFyZ3NbMF07XHJcbiAgICB0aGlzLnkgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMuciA9IHBhcnNlZC5hcmdzWzJdO1xyXG4gICAgdGhpcy5pdGVtc0xlbmd0aCA9IHBhcnNlZC5hcmdzWzNdO1xyXG4gICAgdGhpcy5wZXJjZW50YWdlcyA9IHBhcnNlZC5hcmdzWzRdO1xyXG4gICAgdGhpcy5pdGVtc1JlZCA9IHBhcnNlZC5hcmdzWzVdO1xyXG4gICAgdGhpcy5pdGVtc0dyZWVuID0gcGFyc2VkLmFyZ3NbNl07XHJcbiAgICB0aGlzLml0ZW1zQmx1ZSA9IHBhcnNlZC5hcmdzWzddO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5QaWVjaGFydENvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFt0aGlzLngsIHRoaXMueSwgdGhpcy5yLCB0aGlzLml0ZW1zTGVuZ3RoLCB0aGlzLnBlcmNlbnRhZ2VzLCB0aGlzLml0ZW1zUmVkLCB0aGlzLml0ZW1zR3JlZW4sIHRoaXMuaXRlbXNCbHVlXTtcclxuICAgIHJldHVybiBhcmdzLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5QaWVjaGFydENvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4OiB0aGlzLngudG9KU09OKCksXHJcbiAgICAgICAgeTogdGhpcy55LnRvSlNPTigpLFxyXG4gICAgICAgIHI6IHRoaXMuci50b0pTT04oKSxcclxuICAgICAgICBpdGVtc0xlbmd0aDogdGhpcy5pdGVtc0xlbmd0aC50b0pTT04oKSxcclxuICAgICAgICBwZXJjZW50YWdlczogdGhpcy5wZXJjZW50YWdlcy50b0pTT04oKSxcclxuICAgICAgICBpdGVtc1JlZDogdGhpcy5pdGVtc1JlZC50b0pTT04oKSxcclxuICAgICAgICBpdGVtc0dyZWVuOiB0aGlzLml0ZW1zR3JlZW4udG9KU09OKCksXHJcbiAgICAgICAgaXRlbXNCbHVlOiB0aGlzLml0ZW1zQmx1ZS50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuUGllY2hhcnRDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHggPSB0aGlzLnguZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciB5ID0gdGhpcy55LmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgciA9IHRoaXMuci5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIGl0ZW1zTGVuZ3RoID0gdGhpcy5pdGVtc0xlbmd0aC5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHBlcmNlbnRhZ2VzID0gdGhpcy5wZXJjZW50YWdlcy5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIGl0ZW1zUmVkID0gdGhpcy5pdGVtc1JlZC5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIGl0ZW1zR3JlZW4gPSB0aGlzLml0ZW1zR3JlZW4uZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBpdGVtc0JsdWUgPSB0aGlzLml0ZW1zQmx1ZS5leGVjdXRlKGRhdGEpO1xyXG5cclxuICAgIGRhdGEudmFsaWRhdGUoeCwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5LCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHIsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoaXRlbXNMZW5ndGgsICdudW1iZXInKTtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShwZXJjZW50YWdlcykpIHRocm93IG5ldyBFcnJvcignVHlwZXMgbWlzbWF0Y2gnKTtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShpdGVtc1JlZCkpIHRocm93IG5ldyBFcnJvcignVHlwZXMgbWlzbWF0Y2gnKTtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShpdGVtc0dyZWVuKSkgdGhyb3cgbmV3IEVycm9yKCdUeXBlcyBtaXNtYXRjaCcpO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zQmx1ZSkpIHRocm93IG5ldyBFcnJvcignVHlwZXMgbWlzbWF0Y2gnKTtcclxuXHJcbiAgICBpZiAoaXRlbXNMZW5ndGggPiBwZXJjZW50YWdlcy5sZW5ndGggfHxcclxuICAgICAgICAgICAgaXRlbXNMZW5ndGggPiBpdGVtc1JlZC5sZW5ndGggfHxcclxuICAgICAgICAgICAgaXRlbXNMZW5ndGggPiBpdGVtc0dyZWVuLmxlbmd0aCB8fFxyXG4gICAgICAgICAgICBpdGVtc0xlbmd0aCA+IGl0ZW1zQmx1ZS5sZW5ndGgpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJyYXkgYm91bmRzJyk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGl0ZW1zID0gW107XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGl0ZW1zTGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgc2l6ZSA9IHBlcmNlbnRhZ2VzW2ldO1xyXG4gICAgICAgIHZhciByZWQgPSBpdGVtc1JlZFtpXTtcclxuICAgICAgICB2YXIgZ3JlZW4gPSBpdGVtc0dyZWVuW2ldO1xyXG4gICAgICAgIHZhciBibHVlID0gaXRlbXNCbHVlW2ldO1xyXG4gICAgICAgIGRhdGEudmFsaWRhdGUoc2l6ZSwgJ251bWJlcicpO1xyXG4gICAgICAgIGRhdGEudmFsaWRhdGUocmVkLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZShncmVlbiwgJ251bWJlcicpO1xyXG4gICAgICAgIGRhdGEudmFsaWRhdGUoYmx1ZSwgJ251bWJlcicpO1xyXG4gICAgICAgIGl0ZW1zLnB1c2goe1xyXG4gICAgICAgICAgICBzaXplOiBzaXplLFxyXG4gICAgICAgICAgICByOiByZWQsXHJcbiAgICAgICAgICAgIGc6IGdyZWVuLFxyXG4gICAgICAgICAgICBiOiBibHVlXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgY3R4LndyaXRlKHtcclxuICAgICAgICBjb21tYW5kOiBcInBpZWNoYXJ0XCIsXHJcbiAgICAgICAgYXJnczoge1xyXG4gICAgICAgICAgICBpdGVtczogaXRlbXMsXHJcbiAgICAgICAgICAgIHg6IHgsXHJcbiAgICAgICAgICAgIHk6IHksXHJcbiAgICAgICAgICAgIHI6IHJcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFBpZWNoYXJ0Q29tbWFuZDsiLCIvKipcclxuICogVE9ET1xyXG4gKi9cclxuZnVuY3Rpb24gUGxheUNvbW1hbmQoKSB7fVxyXG5cclxuUGxheUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7IG5leHQoKTsgfTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUGxheUNvbW1hbmQ7IiwiLyoqXHJcbiAqIFRPRE9cclxuICovXHJcbmZ1bmN0aW9uIFBsYXlzcGVlZENvbW1hbmQoKSB7fVxyXG5cclxuUGxheXNwZWVkQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHsgbmV4dCgpOyB9O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBQbGF5c3BlZWRDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBEcmF3cyBhIHBvaW50XHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIFBvaW50Q29tbWFuZChhcmdzKSB7XHJcbiAgICB2YXIgcGFyc2VkID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJncyk7XHJcblxyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA8IDIpIHRocm93IG5ldyBTeW50YXhFcnJvcignUE9JTlQgY29tbWFuZCByZXF1aXJlcyAyIGFyZ3VtZW50cycpO1xyXG4gICAgdGhpcy54ID0gcGFyc2VkLmFyZ3NbMF07XHJcbiAgICB0aGlzLnkgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPiAyKSB0aGlzLnNpemUgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIGVsc2UgdGhpcy5zaXplID0gZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblBvaW50Q29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBhcmdzID0gW3RoaXMueCwgdGhpcy55XTtcclxuICAgIGlmICh0aGlzLnNpemUpIGFyZ3MucHVzaCh0aGlzLnNpemUpO1xyXG4gICAgcmV0dXJuIGFyZ3Muam9pbihcIiwgXCIpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcblBvaW50Q29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHg6IHRoaXMueC50b0pTT04oKSxcclxuICAgICAgICB5OiB0aGlzLnkudG9KU09OKCksXHJcbiAgICAgICAgc2l6ZTogdGhpcy5zaXplID8gdGhpcy5zaXplLnRvSlNPTigpIDogZmFsc2VcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcblBvaW50Q29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciB4ID0gdGhpcy54LmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeSA9IHRoaXMueS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHNpemUgPSB0aGlzLnNpemUgPyB0aGlzLnNpemUuZXhlY3V0ZShkYXRhKSA6IDE7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZSh4LCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHksICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoc2l6ZSwgJ251bWJlcicpO1xyXG5cclxuICAgIGlmIChzaXplIDwgMSkgdGhyb3cgbmV3IEVycm9yKCdTaXplIG91dCBvZiBib3VuZHMnKTtcclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogXCJwb2ludFwiLFxyXG4gICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgXCJ4XCI6IHgsXHJcbiAgICAgICAgICAgIFwieVwiOiB5LFxyXG4gICAgICAgICAgICBcInNpemVcIjogc2l6ZVxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUG9pbnRDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgZmlsZXN5c3RlbSA9IHJlcXVpcmUoJy4uLy4uL2ZpbGVzeXN0ZW0nKTtcclxudmFyIHJsID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXREZWZhdWx0KCk7XHJcblxyXG4vKipcclxuICogT3V0cHV0cyBvciBmb3JtYXRzIGFuZCBvdXRwdXRzIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5lXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gUHJpbnRDb21tYW5kKGFyZ3MsIGRlZmluZSkge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MsIHtcclxuICAgICAgICBmbGFnczogWydVU0lORyddLFxyXG4gICAgICAgIHBhcnNlQXJnczogZmFsc2VcclxuICAgIH0pO1xyXG5cclxuICAgIGlmIChwYXJzZWQuZmxhZ3MuVVNJTkcpIHtcclxuICAgICAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoICE9PSAxKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ1BSSU5UIFVTSU5HIGNvbW1hbmQgcmVxdWlyZXMgMSBhcmd1bWVudCcpO1xyXG4gICAgICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPiAxKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ1VuZXhwZWN0ZWQgY29tbWEnKTtcclxuXHJcbiAgICAgICAgdmFyIHNlbWljb2xvbkluZGV4ID0gcGFyc2VkLmFyZ3NbMF0uaW5kZXhPZignOycpO1xyXG4gICAgICAgIGlmIChzZW1pY29sb25JbmRleCA9PT0gLTEpIHRocm93IG5ldyBTeW50YXhFcnJvcignRXhwZWN0ZWQgc2VtaWNvbG9uJyk7XHJcblxyXG4gICAgICAgIHZhciBmb3JtYXRFeHByZXNzaW9uID0gbmV3IHN0YXRlbWVudHMuRXhwcmVzc2lvblN0YXRlbWVudChwYXJzZWQuYXJnc1swXS5zdWJzdHJpbmcoMCwgc2VtaWNvbG9uSW5kZXgpLnRyaW0oKSwgZGVmaW5lKTtcclxuICAgICAgICB2YXIgbnVtYmVyRXhwcmVzc2lvbiA9IG5ldyBzdGF0ZW1lbnRzLkV4cHJlc3Npb25TdGF0ZW1lbnQocGFyc2VkLmFyZ3NbMF0uc3Vic3RyaW5nKHNlbWljb2xvbkluZGV4ICsgMSkudHJpbSgpLCBkZWZpbmUpO1xyXG4gICAgICAgIGlmIChmb3JtYXRFeHByZXNzaW9uLmVycm9yIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHRocm93IGZvcm1hdEV4cHJlc3Npb24uZXJyb3I7XHJcbiAgICAgICAgaWYgKG51bWJlckV4cHJlc3Npb24uZXJyb3IgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikgdGhyb3cgbnVtYmVyRXhwcmVzc2lvbi5lcnJvcjtcclxuXHJcbiAgICAgICAgdGhpcy5mb3JtYXRFeHByID0gZm9ybWF0RXhwcmVzc2lvbjtcclxuICAgICAgICB0aGlzLm51bWJlckV4cHIgPSBudW1iZXJFeHByZXNzaW9uO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgaXRlbXMgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBhcnNlZC5hcmdzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBleHByID0gbmV3IHN0YXRlbWVudHMuRXhwcmVzc2lvblN0YXRlbWVudChwYXJzZWQuYXJnc1tpXSwgZGVmaW5lKTtcclxuICAgICAgICAgICAgaWYgKGV4cHIuZXJyb3IgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikgdGhyb3cgZXhwci5lcnJvcjtcclxuICAgICAgICAgICAgaXRlbXMucHVzaChleHByKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5pdGVtcyA9IGl0ZW1zO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5QcmludENvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICBpZiAodGhpcy5mb3JtYXRFeHByKSB7XHJcbiAgICAgICAgcmV0dXJuICdVU0lORyAnICsgdGhpcy5mb3JtYXRFeHByLnRvU3RyaW5nKCkgKyAnOyAnICsgdGhpcy5udW1iZXJFeHByLnRvU3RyaW5nKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiB0aGlzLml0ZW1zLmpvaW4oJywgJyk7XHJcbiAgICB9XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuUHJpbnRDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBpdGVtcyA9IFtdO1xyXG4gICAgaWYgKHRoaXMuaXRlbXMpIHtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuaXRlbXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaXRlbXMucHVzaCh0aGlzLml0ZW1zW2ldLnRvSlNPTigpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBmb3JtYXQ6IHRoaXMuZm9ybWF0RXhwciA/IHRoaXMuZm9ybWF0RXhwci50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIG51bWJlcjogdGhpcy5udW1iZXJFeHByID8gdGhpcy5udW1iZXJFeHByLnRvSlNPTigpIDogZmFsc2UsXHJcbiAgICAgICAgaXRlbXM6IGl0ZW1zXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5QcmludENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICBpZiAodGhpcy5mb3JtYXRFeHByKSB7XHJcbiAgICAgICAgdmFyIGZvcm1hdCA9IHRoaXMuZm9ybWF0RXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgICAgIHZhciBudW1iZXIgPSB0aGlzLm51bWJlckV4cHIuZXhlY3V0ZShkYXRhKTtcclxuXHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZShmb3JtYXQsICdzdHJpbmcnKTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKG51bWJlciwgJ251bWJlcicpO1xyXG5cclxuICAgICAgICB2YXIgc3RyaW5nTnVtYmVyID0gbnVtYmVyLnRvU3RyaW5nKCkuc3BsaXQoJy4nKTtcclxuICAgICAgICB2YXIgcHJlRGVjaW1hbCA9IHN0cmluZ051bWJlclswXTtcclxuICAgICAgICB2YXIgcG9zdERlY2ltYWwgPSBzdHJpbmdOdW1iZXIubGVuZ3RoID4gMSA/IHN0cmluZ051bWJlclsxXSA6ICcnO1xyXG5cclxuICAgICAgICB2YXIgZm9ybWF0U3BsaXQgPSBmb3JtYXQuc3BsaXQoJy4nKTtcclxuICAgICAgICB2YXIgcHJlRGVjaW1hbEZvcm1hdCA9IGZvcm1hdFNwbGl0WzBdO1xyXG4gICAgICAgIHZhciBwb3N0RGVjaW1hbEZvcm1hdCA9IGZvcm1hdFNwbGl0Lmxlbmd0aCA+IDEgPyBmb3JtYXRTcGxpdFsxXSA6ICcnO1xyXG5cclxuICAgICAgICB2YXIgcHJlRGVjaW1hbFJlc3VsdCA9ICcnLCBwb3N0RGVjaW1hbFJlc3VsdCA9ICcnO1xyXG5cclxuICAgICAgICB2YXIgcHJlRGVjaW1hbFN0YXJ0ID0gcHJlRGVjaW1hbC5sZW5ndGggLSBwcmVEZWNpbWFsRm9ybWF0Lmxlbmd0aDtcclxuICAgICAgICB2YXIgcHJlRGVjaW1hbFRleHQgPSBwcmVEZWNpbWFsLnN1YnN0cmluZyhwcmVEZWNpbWFsU3RhcnQgPCAwID8gMCA6IHByZURlY2ltYWxTdGFydCk7XHJcbiAgICAgICAgaWYgKHByZURlY2ltYWxTdGFydCA8IDApIHtcclxuICAgICAgICAgICAgdmFyIHByZURlY2ltYWxEaWZmID0gcHJlRGVjaW1hbFN0YXJ0ICogLTE7XHJcbiAgICAgICAgICAgIHByZURlY2ltYWxUZXh0ID0gKG5ldyBBcnJheShwcmVEZWNpbWFsRGlmZiArIDEpKS5qb2luKFwiIFwiKSArIHByZURlY2ltYWxUZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IgKHZhciBwcmUgPSAwOyBwcmUgPCBwcmVEZWNpbWFsRm9ybWF0Lmxlbmd0aDsgcHJlKyspIHtcclxuICAgICAgICAgICAgdmFyIHByZUNoYXIgPSBwcmVEZWNpbWFsRm9ybWF0W3ByZV07XHJcbiAgICAgICAgICAgIGlmIChwcmVDaGFyICE9PSAnIycpIHByZURlY2ltYWxSZXN1bHQgKz0gcHJlQ2hhcjtcclxuICAgICAgICAgICAgZWxzZSBwcmVEZWNpbWFsUmVzdWx0ICs9IHByZURlY2ltYWxUZXh0W3ByZV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgcG9zdERlY2ltYWxUZXh0ID0gcG9zdERlY2ltYWwuc3Vic3RyaW5nKDAsIHBvc3REZWNpbWFsRm9ybWF0Lmxlbmd0aCk7XHJcbiAgICAgICAgaWYgKHBvc3REZWNpbWFsVGV4dC5sZW5ndGggPCBwb3N0RGVjaW1hbEZvcm1hdC5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdmFyIHBvc3REZWNpbWFsRGlmZiA9IHBvc3REZWNpbWFsRm9ybWF0Lmxlbmd0aCAtIHBvc3REZWNpbWFsVGV4dC5sZW5ndGg7XHJcbiAgICAgICAgICAgIHBvc3REZWNpbWFsVGV4dCArPSAobmV3IEFycmF5KHBvc3REZWNpbWFsRGlmZiArIDEpKS5qb2luKFwiIFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yICh2YXIgcG9zdCA9IDA7IHBvc3QgPCBwb3N0RGVjaW1hbEZvcm1hdC5sZW5ndGg7IHBvc3QrKykge1xyXG4gICAgICAgICAgICB2YXIgcG9zdENoYXIgPSBwb3N0RGVjaW1hbEZvcm1hdFtwb3N0XTtcclxuICAgICAgICAgICAgaWYgKHBvc3RDaGFyICE9PSAnIycpIHBvc3REZWNpbWFsUmVzdWx0ICs9IHBvc3RDaGFyO1xyXG4gICAgICAgICAgICBlbHNlIHBvc3REZWNpbWFsUmVzdWx0ICs9IHBvc3REZWNpbWFsVGV4dFtwb3N0XTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJsLndyaXRlKHByZURlY2ltYWxSZXN1bHQgKyAocG9zdERlY2ltYWxSZXN1bHQubGVuZ3RoID8gJy4nICsgcG9zdERlY2ltYWxSZXN1bHQgOiAnJykgKyAnXFxuJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBpdGVtcyA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5pdGVtcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gdGhpcy5pdGVtc1tpXS5leGVjdXRlKGRhdGEpO1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCAhPT0gJ3N0cmluZycgJiYgdHlwZW9mIHJlc3VsdCAhPT0gJ251bWJlcicgJiYgIShyZXN1bHQgaW5zdGFuY2VvZiBmaWxlc3lzdGVtLkZpbGUgJiYgaSA9PT0gMCkpIHRocm93IG5ldyBFcnJvcignVHlwZXMgbWlzbWF0Y2gnKTtcclxuICAgICAgICAgICAgaXRlbXMucHVzaChyZXN1bHQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoaXRlbXNbMF0gaW5zdGFuY2VvZiBmaWxlc3lzdGVtLkZpbGUpIHtcclxuICAgICAgICAgICAgdmFyIGZpbGUgPSBpdGVtc1swXTtcclxuICAgICAgICAgICAgaWYgKGZpbGUubW9kZSAhPT0gJ291dHB1dCcgJiYgZmlsZS5tb2RlICE9PSAnYXBwZW5kJykgdGhyb3cgbmV3IEVycm9yKCdGaWxlIG5vdCB3cml0YWJsZScpO1xyXG4gICAgICAgICAgICBmaWxlLndyaXRlKGl0ZW1zLnNsaWNlKDEpLmpvaW4oJyAnKSk7XHJcbiAgICAgICAgICAgIGZpbGUuc2F2ZShmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgIG5leHQoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9IGVsc2Ugcmwud3JpdGUoaXRlbXMuam9pbignICcpICsgJ1xcbicpO1xyXG4gICAgfVxyXG5cclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUHJpbnRDb21tYW5kOyIsIi8qKlxyXG4gKiBTZXRzIGEgcmFuZG9tIHNlZWRcclxuICpcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBSYW5kb21pemVDb21tYW5kKCkge31cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuUmFuZG9taXplQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIGRhdGEuc2V0UHJpdmF0ZSgncm5kX3NlZWQnLCBNYXRoLnJhbmRvbSgpKTtcclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUmFuZG9taXplQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogRHJhd3MgYSBmaWxsZWQgb3Igc3Ryb2tlZCByZWN0YW5nbGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKi9cclxuZnVuY3Rpb24gUmVjdENvbW1hbmQoYXJncykge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MpO1xyXG5cclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPCA0KSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ1JFQ1QgY29tbWFuZCByZXF1aXJlcyA0IGFyZ3VtZW50cycpO1xyXG4gICAgdGhpcy54MSA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgdGhpcy55MSA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgdGhpcy54MiA9IHBhcnNlZC5hcmdzWzJdO1xyXG4gICAgdGhpcy55MiA9IHBhcnNlZC5hcmdzWzNdO1xyXG4gICAgdGhpcy5zdHJva2UgPSBwYXJzZWQuYXJncy5sZW5ndGggPiA0ID8gcGFyc2VkLmFyZ3NbNF0gOiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuUmVjdENvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFt0aGlzLngxLCB0aGlzLnkxLCB0aGlzLngyLCB0aGlzLnkyXTtcclxuICAgIGlmICh0aGlzLnN0cm9rZSkgYXJncy5wdXNoKHRoaXMuc3Ryb2tlKTtcclxuICAgIHJldHVybiBhcmdzLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5SZWN0Q29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHgxOiB0aGlzLngxLnRvSlNPTigpLFxyXG4gICAgICAgIHkxOiB0aGlzLnkxLnRvSlNPTigpLFxyXG4gICAgICAgIHgyOiB0aGlzLngyLnRvSlNPTigpLFxyXG4gICAgICAgIHkyOiB0aGlzLnkyLnRvSlNPTigpLFxyXG4gICAgICAgIHN0cm9rZTogdGhpcy5zdHJva2UgPyB0aGlzLnN0cm9rZS50b0pTT04oKSA6IGZhbHNlXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5SZWN0Q29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciB4MSA9IHRoaXMueDEuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciB5MSA9IHRoaXMueTEuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciB4MiA9IHRoaXMueDIuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciB5MiA9IHRoaXMueTIuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBzdHJva2UgPSB0aGlzLnN0cm9rZSA/IHRoaXMuc3Ryb2tlLmV4ZWN1dGUoZGF0YSkgOiAwO1xyXG5cclxuICAgIGRhdGEudmFsaWRhdGUoeDEsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoeTEsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoeDIsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoeTIsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoc3Ryb2tlLCAnbnVtYmVyJyk7XHJcblxyXG4gICAgY3R4LndyaXRlKHtcclxuICAgICAgICBjb21tYW5kOiBcInJlY3RcIixcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIHgxOiB4MSxcclxuICAgICAgICAgICAgeTE6IHkxLFxyXG4gICAgICAgICAgICB4MjogeDIsXHJcbiAgICAgICAgICAgIHkyOiB5MixcclxuICAgICAgICAgICAgc3Ryb2tlOiBzdHJva2VcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFJlY3RDb21tYW5kOyIsInZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIFNldHMgdGhlIGNhbnZhcyB0byBsYW5kc2NhcGUgYW5kIGxvY2tzIGl0XHJcbiAqL1xyXG5mdW5jdGlvbiBSZXF1aXJlbGFuZHNjYXBlQ29tbWFuZCgpIHsgfVxyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5SZXF1aXJlbGFuZHNjYXBlQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciB3aWR0aCA9IGRhdGEuY29uc3RhbnRzWydTY3JlZW5XaWR0aCddKCk7XHJcbiAgICB2YXIgaGVpZ2h0ID0gZGF0YS5jb25zdGFudHNbJ1NjcmVlbkhlaWdodCddKCk7XHJcblxyXG4gICAgaWYgKGhlaWdodCA+IHdpZHRoKSB7XHJcbiAgICAgICAgdmFyIHN3YXBwZWQgPSB3aWR0aDtcclxuICAgICAgICB3aWR0aCA9IGhlaWdodDtcclxuICAgICAgICBoZWlnaHQgPSBzd2FwcGVkO1xyXG4gICAgfVxyXG5cclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogJ3NldHNpemUnLFxyXG4gICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgY3R4LndyaXRlKHtcclxuICAgICAgICBjb21tYW5kOiAnbG9ja3NpemUnXHJcbiAgICB9KTtcclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUmVxdWlyZWxhbmRzY2FwZUNvbW1hbmQ7IiwidmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogU2V0cyB0aGUgY2FudmFzIHRvIHBvcnRyYWl0IGFuZCBsb2NrcyBpdFxyXG4gKi9cclxuZnVuY3Rpb24gUmVxdWlyZXBvcnRyYWl0Q29tbWFuZCgpIHsgfVxyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5SZXF1aXJlcG9ydHJhaXRDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHdpZHRoID0gZGF0YS5jb25zdGFudHNbJ1NjcmVlbldpZHRoJ10oKTtcclxuICAgIHZhciBoZWlnaHQgPSBkYXRhLmNvbnN0YW50c1snU2NyZWVuSGVpZ2h0J10oKTtcclxuXHJcbiAgICBpZiAod2lkdGggPiBoZWlnaHQpIHtcclxuICAgICAgICB2YXIgc3dhcHBlZCA9IHdpZHRoO1xyXG4gICAgICAgIHdpZHRoID0gaGVpZ2h0O1xyXG4gICAgICAgIGhlaWdodCA9IHN3YXBwZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgY3R4LndyaXRlKHtcclxuICAgICAgICBjb21tYW5kOiAnc2V0c2l6ZScsXHJcbiAgICAgICAgYXJnczoge1xyXG4gICAgICAgICAgICB3aWR0aDogd2lkdGgsXHJcbiAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6ICdsb2Nrc2l6ZSdcclxuICAgIH0pO1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBSZXF1aXJlcG9ydHJhaXRDb21tYW5kOyIsIi8qKlxyXG4gKiBEb2VzIG5vdGhpbmcsIGFzIHJldGluYSBpcyBub3QgcG9zc2libGUgb24gZGVza3RvcFxyXG4gKi9cclxuZnVuY3Rpb24gUmV0aW5hQ29tbWFuZCgpIHt9XHJcblxyXG5SZXRpbmFDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkgeyBuZXh0KCk7IH07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFJldGluYUNvbW1hbmQ7IiwiLyoqXHJcbiAqIFJldHVybnMgdG8gYSBHT1NVQlxyXG4gKlxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIFJldHVybkNvbW1hbmQoKSB7fVxyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5SZXR1cm5Db21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgZGF0YS5yZXR1cm5MYWJlbCgpO1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBSZXR1cm5Db21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBEcmF3cyBhIGZpbGxlZCBvciBzdHJva2VkIHJvdW5kZWQgcmVjdGFuZ2xlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIFJyZWN0Q29tbWFuZChhcmdzKSB7XHJcbiAgICB2YXIgcGFyc2VkID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJncyk7XHJcblxyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA8IDUpIHRocm93IG5ldyBTeW50YXhFcnJvcignUlJFQ1QgY29tbWFuZCByZXF1aXJlcyA1IGFyZ3VtZW50cycpO1xyXG4gICAgdGhpcy54MSA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgdGhpcy55MSA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgdGhpcy54MiA9IHBhcnNlZC5hcmdzWzJdO1xyXG4gICAgdGhpcy55MiA9IHBhcnNlZC5hcmdzWzNdO1xyXG4gICAgdGhpcy5yYWRpdXMgPSBwYXJzZWQuYXJnc1s0XTtcclxuICAgIHRoaXMuc3Ryb2tlID0gcGFyc2VkLmFyZ3MubGVuZ3RoID4gNSA/IHBhcnNlZC5hcmdzWzVdIDogZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblJyZWN0Q29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBhcmdzID0gW3RoaXMueDEsIHRoaXMueTEsIHRoaXMueDIsIHRoaXMueTIsIHRoaXMucmFkaXVzXTtcclxuICAgIGlmICh0aGlzLnN0cm9rZSkgYXJncy5wdXNoKHRoaXMuc3Ryb2tlKTtcclxuICAgIHJldHVybiBhcmdzLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5ScmVjdENvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4MTogdGhpcy54MS50b0pTT04oKSxcclxuICAgICAgICB5MTogdGhpcy55MS50b0pTT04oKSxcclxuICAgICAgICB4MjogdGhpcy54Mi50b0pTT04oKSxcclxuICAgICAgICB5MjogdGhpcy55Mi50b0pTT04oKSxcclxuICAgICAgICByYWRpdXM6IHRoaXMucmFkaXVzLnRvSlNPTigpLFxyXG4gICAgICAgIHN0cm9rZTogdGhpcy5zdHJva2UgPyB0aGlzLnN0cm9rZS50b0pTT04oKSA6IGZhbHNlXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5ScmVjdENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgeDEgPSB0aGlzLngxLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeTEgPSB0aGlzLnkxLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeDIgPSB0aGlzLngyLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeTIgPSB0aGlzLnkyLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgcmFkaXVzID0gdGhpcy5yYWRpdXMuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBzdHJva2UgPSB0aGlzLnN0cm9rZSA/IHRoaXMuc3Ryb2tlLmV4ZWN1dGUoZGF0YSkgOiAwO1xyXG5cclxuICAgIGRhdGEudmFsaWRhdGUoeDEsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoeTEsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoeDIsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoeTIsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUocmFkaXVzLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHN0cm9rZSwgJ251bWJlcicpO1xyXG5cclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogXCJycmVjdFwiLFxyXG4gICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgeDE6IHgxLFxyXG4gICAgICAgICAgICB5MTogeTEsXHJcbiAgICAgICAgICAgIHgyOiB4MixcclxuICAgICAgICAgICAgeTI6IHkyLFxyXG4gICAgICAgICAgICByYWRpdXM6IHJhZGl1cyxcclxuICAgICAgICAgICAgc3Ryb2tlOiBzdHJva2VcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFJyZWN0Q29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGZpbGVzeXN0ZW0gPSByZXF1aXJlKCcuLi8uLi9maWxlc3lzdGVtJyk7XHJcblxyXG4vKipcclxuICogU2F2ZXMgYSBzcHJpdGUgdG8gYSBmaWxlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBTYXZlc3ByaXRlQ29tbWFuZChhcmdzKSB7XHJcbiAgICB2YXIgcGFyc2VkID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJncyk7XHJcblxyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA8IDIpIHRocm93IG5ldyBTeW50YXhFcnJvcignU0FWRVNQUklURSBjb21tYW5kIHJlcXVpcmVzIDIgYXJndW1lbnRzJyk7XHJcblxyXG4gICAgdGhpcy5pZCA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgdGhpcy5maWxlTmFtZSA9IHBhcnNlZC5hcmdzWzFdO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5TYXZlc3ByaXRlQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmlkICsgXCIsIFwiICsgdGhpcy5maWxlTmFtZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5TYXZlc3ByaXRlQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGlkOiB0aGlzLmlkLnRvSlNPTigpLFxyXG4gICAgICAgIGZpbGVOYW1lOiB0aGlzLmZpbGVOYW1lLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5TYXZlc3ByaXRlQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciBpZCA9IHRoaXMuaWQuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBmaWxlbmFtZSA9IHRoaXMuZmlsZU5hbWUuZXhlY3V0ZShkYXRhKTtcclxuXHJcbiAgICBkYXRhLnZhbGlkYXRlKGlkLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKGZpbGVuYW1lLCAnc3RyaW5nJyk7XHJcblxyXG4gICAgaWYgKCFkYXRhLnByaXZhdGUuc3ByaXRlc1tpZF0pIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzcHJpdGUgSUQnKTtcclxuICAgIHZhciBpbWcgPSBkYXRhLnByaXZhdGUuc3ByaXRlc1tpZF07XHJcbiAgICB2YXIgZGF0YUNvZGUgPSBpbWcudG9EYXRhVXJsKCk7XHJcblxyXG4gICAgdmFyIGRyaXZlSW5kZXggPSBmaWxlbmFtZS5pbmRleE9mKCc6Jyk7XHJcbiAgICB2YXIgZHJpdmUgPSAnQSc7XHJcbiAgICBpZiAoZHJpdmVJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICBkcml2ZSA9IGZpbGVuYW1lLnN1YnN0cmluZygwLCBkcml2ZUluZGV4KTtcclxuICAgICAgICBmaWxlbmFtZSA9IGZpbGVuYW1lLnN1YnN0cmluZyhkcml2ZUluZGV4ICsgMSk7XHJcbiAgICB9XHJcblxyXG4gICAgZmlsZXN5c3RlbS5kcml2ZShkcml2ZSwgZnVuY3Rpb24oZnMpIHtcclxuICAgICAgICB2YXIgZmlsZSA9IGZzLm9wZW4oZmlsZW5hbWUpO1xyXG4gICAgICAgIGZpbGUuY2xlYXIoKTtcclxuICAgICAgICBmaWxlLndyaXRlKGRhdGFDb2RlKTtcclxuICAgICAgICBmaWxlLnNhdmUoKTtcclxuXHJcbiAgICAgICAgbmV4dCgpO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNhdmVzcHJpdGVDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBEcmF3cyBhIGN1c3RvbSBzaGFwZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqL1xyXG5mdW5jdGlvbiBTaGFwZUNvbW1hbmQoYXJncykge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MpO1xyXG5cclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPCAzKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ1NIQVBFIGNvbW1hbmQgcmVxdWlyZXMgMyBhcmd1bWVudHMnKTtcclxuICAgIHRoaXMucG9pbnRzTGVuZ3RoID0gcGFyc2VkLmFyZ3NbMF07XHJcbiAgICB0aGlzLnBvaW50c1ggPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMucG9pbnRzWSA9IHBhcnNlZC5hcmdzWzJdO1xyXG4gICAgdGhpcy5zdHJva2UgPSBwYXJzZWQuYXJncy5sZW5ndGggPiAzID8gcGFyc2VkLmFyZ3NbM10gOiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuU2hhcGVDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGFyZ3MgPSBbdGhpcy5wb2ludHNMZW5ndGgsIHRoaXMucG9pbnRzWCwgdGhpcy5wb2ludHNZXTtcclxuICAgIGlmICh0aGlzLnN0cm9rZSkgYXJncy5wdXNoKHRoaXMuc3Ryb2tlKTtcclxuICAgIHJldHVybiBhcmdzLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5TaGFwZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBwb2ludHNMZW5ndGg6IHRoaXMucG9pbnRzTGVuZ3RoLnRvSlNPTigpLFxyXG4gICAgICAgIHBvaW50c1g6IHRoaXMucG9pbnRzWC50b0pTT04oKSxcclxuICAgICAgICBwb2ludHNZOiB0aGlzLnBvaW50c1kudG9KU09OKCksXHJcbiAgICAgICAgc3Ryb2tlOiB0aGlzLnN0cm9rZSA/IHRoaXMuc3Ryb2tlLnRvSlNPTigpIDogZmFsc2VcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcblNoYXBlQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciBwb2ludHNMZW5ndGggPSB0aGlzLnBvaW50c0xlbmd0aC5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHBvaW50c1ggPSB0aGlzLnBvaW50c1guZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBwb2ludHNZID0gdGhpcy5wb2ludHNZLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgc3Ryb2tlID0gdGhpcy5zdHJva2UgPyB0aGlzLnN0cm9rZS5leGVjdXRlKGRhdGEpIDogMDtcclxuXHJcbiAgICBkYXRhLnZhbGlkYXRlKHBvaW50c0xlbmd0aCwgJ251bWJlcicpO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHBvaW50c1gpKSB0aHJvdyBuZXcgRXJyb3IoJ1R5cGVzIG1pc21hdGNoJyk7XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocG9pbnRzWSkpIHRocm93IG5ldyBFcnJvcignVHlwZXMgbWlzbWF0Y2gnKTtcclxuXHJcbiAgICBpZiAocG9pbnRzTGVuZ3RoID4gcG9pbnRzWC5sZW5ndGggfHwgcG9pbnRzTGVuZ3RoID4gcG9pbnRzWS5sZW5ndGgpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcnJheSBib3VuZHMnKTtcclxuXHJcbiAgICB2YXIgcG9pbnRzID0gW107XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBvaW50c0xlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIHggPSBwb2ludHNYW2ldO1xyXG4gICAgICAgIHZhciB5ID0gcG9pbnRzWVtpXTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKHgsICdudW1iZXInKTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKHksICdudW1iZXInKTtcclxuICAgICAgICBwb2ludHMucHVzaCh7IHg6IHgsIHk6IHkgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgY3R4LndyaXRlKHtcclxuICAgICAgICBjb21tYW5kOiBcInNoYXBlXCIsXHJcbiAgICAgICAgYXJnczoge1xyXG4gICAgICAgICAgICBwb2ludHM6IHBvaW50cyxcclxuICAgICAgICAgICAgc3Ryb2tlOiBzdHJva2VcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNoYXBlQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxuXHJcbi8qKlxyXG4gKiBTbGVlcHMgZm9yIGEgY2VydGFpbiBhbW91bnQgb2Ygc2Vjb25kc1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluZVxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIFNsZWVwQ29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIHRoaXMuZHVyYXRpb24gPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KGFyZ3MsIGRlZmluZSk7XHJcbiAgICBpZiAodGhpcy5kdXJhdGlvbi5lcnJvcikgdGhyb3cgdGhpcy5kdXJhdGlvbi5lcnJvcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuU2xlZXBDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuZHVyYXRpb24udG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5TbGVlcENvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBkdXJhdGlvbjogdGhpcy5kdXJhdGlvbi50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuU2xlZXBDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIGR1cmF0aW9uID0gdGhpcy5kdXJhdGlvbi5leGVjdXRlKGRhdGEpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShkdXJhdGlvbiwgJ251bWJlcicpO1xyXG5cclxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgbmV4dCgpO1xyXG4gICAgfSwgZHVyYXRpb24gKiAxMDAwKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU2xlZXBDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIHRoZSBjb2xvciBvZiB0ZXh0XHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIFRjb2xvckNvbW1hbmQoYXJncykge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MpO1xyXG5cclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPCAzKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ1RDT0xPUiBjb21tYW5kIHJlcXVpcmVzIDMgYXJndW1lbnRzJyk7XHJcbiAgICB0aGlzLnJlZCA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgdGhpcy5ncmVlbiA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgdGhpcy5ibHVlID0gcGFyc2VkLmFyZ3NbMl07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblRjb2xvckNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gW3RoaXMucmVkLCB0aGlzLmdyZWVuLCB0aGlzLmJsdWVdLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5UY29sb3JDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcjogdGhpcy5yZWQudG9KU09OKCksXHJcbiAgICAgICAgZzogdGhpcy5ncmVlbi50b0pTT04oKSxcclxuICAgICAgICBiOiB0aGlzLmJsdWUudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcblRjb2xvckNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgcmVkID0gdGhpcy5yZWQuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBncmVlbiA9IHRoaXMuZ3JlZW4uZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBibHVlID0gdGhpcy5ibHVlLmV4ZWN1dGUoZGF0YSk7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZShyZWQsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoZ3JlZW4sICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoYmx1ZSwgJ251bWJlcicpO1xyXG5cclxuICAgIHZhciBvbGRSZWQgPSByZWQsIG9sZEdyZWVuID0gZ3JlZW4sIG9sZEJsdWUgPSBibHVlO1xyXG5cclxuICAgIGlmIChyZWQgPiAxKSByZWQgLz0gMjU1O1xyXG4gICAgaWYgKGdyZWVuID4gMSkgZ3JlZW4gLz0gMjU1O1xyXG4gICAgaWYgKGJsdWUgPiAxKSBibHVlIC89IDI1NTtcclxuXHJcbiAgICByZWQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihyZWQsIDEpKTtcclxuICAgIGdyZWVuID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oZ3JlZW4sIDEpKTtcclxuICAgIGJsdWUgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihibHVlLCAxKSk7XHJcblxyXG4gICAgZGF0YS5zZXRDb25zdGFudCgnVENvbG9yUicsIG9sZFJlZCk7XHJcbiAgICBkYXRhLnNldENvbnN0YW50KCdUQ29sb3JHJywgb2xkR3JlZW4pO1xyXG4gICAgZGF0YS5zZXRDb25zdGFudCgnVENvbG9yQicsIG9sZEJsdWUpO1xyXG5cclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgXCJjb21tYW5kXCI6IFwidGNvbG9yXCIsXHJcbiAgICAgICAgXCJhcmdzXCI6IHtcclxuICAgICAgICAgICAgXCJyXCI6IHJlZCxcclxuICAgICAgICAgICAgXCJnXCI6IGdyZWVuLFxyXG4gICAgICAgICAgICBcImJcIjogYmx1ZVxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBUY29sb3JDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbnZhciBzdHlsZU5hbWVzID0gW1xyXG4gICAgXCJsaWdodFwiLFxyXG4gICAgXCJib2xkXCIsXHJcbiAgICBcIml0YWxpY1wiXHJcbl07XHJcbnZhciBmb250TmFtZXMgPSBbXHJcbiAgICBcIkFtZXJpY2FuIFR5cGV3cml0ZXJcIixcclxuICAgIFwiQXBwbGVHb3RoaWNcIixcclxuICAgIFwiQXJpYWxcIixcclxuICAgIFwiQXJpYWwgUm91bmRlZFwiLFxyXG4gICAgXCJDb3VyaWVyXCIsXHJcbiAgICBcIkNvdXJpZXIgTmV3XCIsXHJcbiAgICBcIkdlb3JnaWFcIixcclxuICAgIFwiSGVsdmV0aWNhXCIsXHJcbiAgICBcIk1hcmtlciBGZWx0XCIsXHJcbiAgICBcIlRpbWVzXCIsXHJcbiAgICBcIlRyZWJ1Y2hldFwiLFxyXG4gICAgXCJWZXJkYW5hXCIsXHJcbiAgICBcIlphcGZpbm9cIlxyXG5dO1xyXG5cclxuLyoqXHJcbiAqIE1vZGlmaWVzIHRoZSBEUkFXVEVYVCBmb250XHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIFRleHRmb250Q29tbWFuZChhcmdzKSB7XHJcbiAgICB2YXIgcGFyc2VkID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJncyk7XHJcblxyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA+IDIpIHtcclxuICAgICAgICB0aGlzLmZhbWlseSA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgICAgIHRoaXMuc3R5bGUgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgICAgICB0aGlzLnNpemUgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIH0gZWxzZSBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoID4gMSkge1xyXG4gICAgICAgIHRoaXMuZmFtaWx5T3JTdHlsZSA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgICAgIHRoaXMuc2l6ZSA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgfSBlbHNlIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdmFyIGFyZyA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgICAgIGlmIChhcmcuY2hpbGQudHlwZSA9PT0gJ3N0cmluZycgfHwgYXJnLmNoaWxkIGluc3RhbmNlb2Ygc3RhdGVtZW50cy5TdHJpbmdTdGF0ZW1lbnQpIHRoaXMuZmFtaWx5T3JTdHlsZSA9IGFyZztcclxuICAgICAgICBlbHNlIHRoaXMuc2l6ZSA9IGFyZztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5yZXNldCA9IHRydWU7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblRleHRmb250Q29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciByZXN1bHQgPSBbXTtcclxuICAgIGlmICh0aGlzLmZhbWlseSkgcmVzdWx0LnB1c2godGhpcy5mYW1pbHksIHRoaXMuc3R5bGUpO1xyXG4gICAgZWxzZSBpZiAodGhpcy5mYW1pbHlPclN0eWxlKSByZXN1bHQucHVzaCh0aGlzLmZhbWlseU9yU3R5bGUpO1xyXG4gICAgaWYgKHRoaXMuc2l6ZSkgcmVzdWx0LnB1c2godGhpcy5zaXplKTtcclxuXHJcbiAgICByZXR1cm4gcmVzdWx0LmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5UZXh0Zm9udENvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICByZXNldDogdGhpcy5yZXNldCxcclxuICAgICAgICBmYW1pbHk6IHRoaXMuZmFtaWx5ID8gdGhpcy5mYW1pbHkudG9KU09OKCkgOiBmYWxzZSxcclxuICAgICAgICBzdHlsZTogdGhpcy5zdHlsZSA/IHRoaXMuc3R5bGUudG9KU09OKCkgOiBmYWxzZSxcclxuICAgICAgICBzaXplOiB0aGlzLnNpemUgPyB0aGlzLnNpemUudG9KU09OKCkgOiBmYWxzZSxcclxuICAgICAgICBmYW1pbHlPclN0eWxlOiB0aGlzLmZhbWlseU9yU3R5bGUgPyB0aGlzLmZhbWlseU9yU3R5bGUudG9KU09OKCkgOiBmYWxzZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuVGV4dGZvbnRDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIGZhbWlseSA9IGZhbHNlLCBzdHlsZSA9IGZhbHNlLCBoZWlnaHQgPSBmYWxzZTtcclxuXHJcbiAgICBpZiAodGhpcy5yZXNldCkge1xyXG4gICAgICAgIGZhbWlseSA9IFwiWmFwZmlub1wiO1xyXG4gICAgICAgIHN0eWxlID0gXCJcIjtcclxuICAgICAgICBoZWlnaHQgPSAxNDtcclxuICAgIH0gZWxzZSBpZiAodGhpcy5mYW1pbHkpIHtcclxuICAgICAgICBmYW1pbHkgPSB0aGlzLmZhbWlseS5leGVjdXRlKGRhdGEpO1xyXG4gICAgICAgIHN0eWxlID0gdGhpcy5zdHlsZS5leGVjdXRlKGRhdGEpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICB9IGVsc2UgaWYgKHRoaXMuZmFtaWx5T3JTdHlsZSkge1xyXG4gICAgICAgIHZhciBmYW1pbHlPclN0eWxlID0gdGhpcy5mYW1pbHlPclN0eWxlLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICAgICAgdmFyIGxvd2VyU3R5bGUgPSBmYW1pbHlPclN0eWxlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgdmFyIHNwbGl0U3R5bGUgPSBsb3dlclN0eWxlLnNwbGl0KFwiIFwiKTtcclxuXHJcbiAgICAgICAgdmFyIGlzU3R5bGUgPSB0cnVlO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3BsaXRTdHlsZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoc3R5bGVOYW1lcy5pbmRleE9mKHNwbGl0U3R5bGVbaV0pID09PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgaXNTdHlsZSA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChpc1N0eWxlKSBzdHlsZSA9IGxvd2VyU3R5bGU7XHJcbiAgICAgICAgZWxzZSBmYW1pbHkgPSBmYW1pbHlPclN0eWxlO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuc2l6ZSkge1xyXG4gICAgICAgIGhlaWdodCA9IHRoaXMuc2l6ZS5leGVjdXRlKGRhdGEpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChmYW1pbHkgIT09IGZhbHNlKSB7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZShmYW1pbHksICdzdHJpbmcnKTtcclxuICAgICAgICBpZiAoZm9udE5hbWVzLmluZGV4T2YoZmFtaWx5KSA9PT0gLTEpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBmb250IG5hbWUnKTtcclxuICAgIH1cclxuICAgIGlmIChzdHlsZSAhPT0gZmFsc2UpIHtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKHN0eWxlLCAnc3RyaW5nJyk7XHJcbiAgICAgICAgc3R5bGUgPSBzdHlsZS50cmltKCk7XHJcbiAgICAgICAgdmFyIHN0eWxlcyA9IHN0eWxlLnNwbGl0KFwiIFwiKTtcclxuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHN0eWxlcy5sZW5ndGg7IHgrKykge1xyXG4gICAgICAgICAgICB2YXIgc3RsID0gc3R5bGVzW3hdLnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKHN0bC5sZW5ndGggJiYgc3R5bGVOYW1lcy5pbmRleE9mKHN0bCkgPT09IC0xKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZm9udCBzdHlsZScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChoZWlnaHQgIT09IGZhbHNlKSB7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZShoZWlnaHQsICdudW1iZXInKTtcclxuICAgICAgICBpZiAoaGVpZ2h0IDw9IDApIHRocm93IG5ldyBFcnJvcignSGVpZ2h0IG91dCBvZiBib3VuZHMnKTtcclxuICAgIH1cclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6ICdmb250JyxcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIGZhbWlseTogZmFtaWx5LFxyXG4gICAgICAgICAgICBzdHlsZTogc3R5bGUsXHJcbiAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBUZXh0Zm9udENvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIERyYXdzIGEgZmlsbGVkIG9yIHN0cm9rZWQgdHJpYW5nbGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKi9cclxuZnVuY3Rpb24gVHJpYW5nbGVDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgNikgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdUUklBTkdMRSBjb21tYW5kIHJlcXVpcmVzIDYgYXJndW1lbnRzJyk7XHJcbiAgICB0aGlzLngxID0gcGFyc2VkLmFyZ3NbMF07XHJcbiAgICB0aGlzLnkxID0gcGFyc2VkLmFyZ3NbMV07XHJcbiAgICB0aGlzLngyID0gcGFyc2VkLmFyZ3NbMl07XHJcbiAgICB0aGlzLnkyID0gcGFyc2VkLmFyZ3NbM107XHJcbiAgICB0aGlzLngzID0gcGFyc2VkLmFyZ3NbNF07XHJcbiAgICB0aGlzLnkzID0gcGFyc2VkLmFyZ3NbNV07XHJcbiAgICB0aGlzLnN0cm9rZSA9IHBhcnNlZC5hcmdzLmxlbmd0aCA+IDYgPyBwYXJzZWQuYXJnc1s2XSA6IGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5UcmlhbmdsZUNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFt0aGlzLngxLCB0aGlzLnkxLCB0aGlzLngyLCB0aGlzLnkyLCB0aGlzLngzLCB0aGlzLnkzXTtcclxuICAgIGlmICh0aGlzLnN0cm9rZSkgYXJncy5wdXNoKHRoaXMuc3Ryb2tlKTtcclxuICAgIHJldHVybiBhcmdzLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5UcmlhbmdsZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4MTogdGhpcy54MS50b0pTT04oKSxcclxuICAgICAgICB5MTogdGhpcy55MS50b0pTT04oKSxcclxuICAgICAgICB4MjogdGhpcy54Mi50b0pTT04oKSxcclxuICAgICAgICB5MjogdGhpcy55Mi50b0pTT04oKSxcclxuICAgICAgICB4MzogdGhpcy54My50b0pTT04oKSxcclxuICAgICAgICB5MzogdGhpcy55My50b0pTT04oKSxcclxuICAgICAgICBzdHJva2U6IHRoaXMuc3Ryb2tlID8gdGhpcy5zdHJva2UudG9KU09OKCkgOiBmYWxzZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuVHJpYW5nbGVDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHgxID0gdGhpcy54MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkxID0gdGhpcy55MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHgyID0gdGhpcy54Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkyID0gdGhpcy55Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHgzID0gdGhpcy54My5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkzID0gdGhpcy55My5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHN0cm9rZSA9IHRoaXMuc3Ryb2tlID8gdGhpcy5zdHJva2UuZXhlY3V0ZShkYXRhKSA6IDA7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZSh4MSwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5MSwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh4MiwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5MiwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh4MywgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5MywgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShzdHJva2UsICdudW1iZXInKTtcclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6IFwidHJpYW5nbGVcIixcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIHgxOiB4MSxcclxuICAgICAgICAgICAgeTE6IHkxLFxyXG4gICAgICAgICAgICB4MjogeDIsXHJcbiAgICAgICAgICAgIHkyOiB5MixcclxuICAgICAgICAgICAgeDM6IHgzLFxyXG4gICAgICAgICAgICB5MzogeTMsXHJcbiAgICAgICAgICAgIHN0cm9rZTogc3Ryb2tlXHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBUcmlhbmdsZUNvbW1hbmQ7IiwiLyoqXHJcbiAqIFRPRE9cclxuICovXHJcbmZ1bmN0aW9uIFZvbHVtZUNvbW1hbmQoKSB7fVxyXG5cclxuVm9sdW1lQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHsgbmV4dCgpOyB9O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBWb2x1bWVDb21tYW5kOyIsIi8qKlxyXG4gKiBSZXR1cm5zIHRvIHRoZSBtYXRjaGluZyBXSElMRSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5lXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gV2VuZENvbW1hbmQoYXJncywgZGVmaW5lKSB7XHJcbiAgICB0aGlzLmJsb2NrID0gZGVmaW5lO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuV2VuZENvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBibG9jazogdGhpcy5ibG9jay50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuV2VuZENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgcmVmcyA9IHRoaXMuYmxvY2sucmVmZXJlbmNlcygpO1xyXG4gICAgaWYgKCFyZWZzLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdXRU5EIHdpdGhvdXQgV0hJTEUnKTtcclxuXHJcbiAgICBkYXRhLmN1cnNvciA9IHJlZnNbMF0uc3RhcnQ7XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFdlbmRDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4uLy4uL3V0aWwnKTtcclxudmFyIHNldEltbWVkaWF0ZSA9IHV0aWwuc2V0SW1tZWRpYXRlO1xyXG5cclxuLyoqXHJcbiAqIEl0ZXJhdGVzIG92ZXIgdGhlIGNvbW1hbmRzIGJvZHkgdW50aWwgdGhlIGNvbmRpdGlvbiBpcyB0cnVlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5lXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gV2hpbGVDb21tYW5kKGFyZ3MsIGRlZmluZSkge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MsIHtcclxuICAgICAgICBzZXBhcmF0b3I6IGZhbHNlXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmNvbmRpdGlvbiA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgdGhpcy5ibG9jayA9IGRlZmluZSh7XHJcbiAgICAgICAgc3RhcnQ6ICdXSElMRScsXHJcbiAgICAgICAgZW5kOiAnV0VORCdcclxuICAgIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5XaGlsZUNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5jb25kaXRpb24udG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5XaGlsZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBjb25kaXRpb246IHRoaXMuY29uZGl0aW9uLnRvSlNPTigpLFxyXG4gICAgICAgIGJsb2NrOiB0aGlzLmJsb2NrLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5XaGlsZUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgc2hvdWxkUnVuID0gdGhpcy5jb25kaXRpb24uZXhlY3V0ZShkYXRhKTtcclxuICAgIGlmICghc2hvdWxkUnVuKSB7XHJcbiAgICAgICAgZGF0YS5jdXJzb3IgPSB0aGlzLmJsb2NrLmVuZCArIDE7XHJcbiAgICAgICAgbmV4dCgpO1xyXG4gICAgfSBlbHNlIHNldEltbWVkaWF0ZShuZXh0KTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gV2hpbGVDb21tYW5kOyIsIi8qKlxyXG4gKiBDb21tYW5kIGxpc3RcclxuICovXHJcblxyXG5leHBvcnRzLmRpbSAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0RpbUNvbW1hbmQnKTtcclxuZXhwb3J0cy5lbmQgICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9FbmRDb21tYW5kJyk7XHJcbmV4cG9ydHMuZ29zdWIgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vR29zdWJDb21tYW5kJyk7XHJcbmV4cG9ydHMuZ290byAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vR290b0NvbW1hbmQnKTtcclxuZXhwb3J0cy5pbnB1dCAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9JbnB1dENvbW1hbmQnKTtcclxuZXhwb3J0cy5wcmludCAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9QcmludENvbW1hbmQnKTtcclxuZXhwb3J0cy5yYW5kb21pemUgICAgICAgICAgID0gcmVxdWlyZSgnLi9SYW5kb21pemVDb21tYW5kJyk7XHJcbmV4cG9ydHMucmV0dXJuICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vUmV0dXJuQ29tbWFuZCcpO1xyXG5leHBvcnRzLnBhdXNlICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL1BhdXNlQ29tbWFuZCcpO1xyXG5leHBvcnRzLnNsZWVwICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL1NsZWVwQ29tbWFuZCcpO1xyXG5leHBvcnRzLmNscyAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0Nsc0NvbW1hbmQnKTtcclxuZXhwb3J0cy5wbGF5ICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9QbGF5Q29tbWFuZCcpO1xyXG5leHBvcnRzLnZvbHVtZSAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL1ZvbHVtZUNvbW1hbmQnKTtcclxuZXhwb3J0cy5wbGF5c3BlZWQgICAgICAgICAgID0gcmVxdWlyZSgnLi9QbGF5c3BlZWRDb21tYW5kJyk7XHJcblxyXG4vLyBHcmFwaGljIGNvbW1hbmRzXHJcbmV4cG9ydHMuY29sb3IgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vQ29sb3JDb21tYW5kJyk7XHJcbmV4cG9ydHMudGNvbG9yICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vVGNvbG9yQ29tbWFuZCcpO1xyXG5leHBvcnRzLmJjb2xvciAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0Jjb2xvckNvbW1hbmQnKTtcclxuZXhwb3J0cy5iZWdpbmRyYXcgICAgICAgICAgID0gcmVxdWlyZSgnLi9CZWdpbmRyYXdDb21tYW5kJyk7XHJcbmV4cG9ydHMuZW5kZHJhdyAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vRW5kZHJhd0NvbW1hbmQnKTtcclxuZXhwb3J0cy5wb2ludCAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9Qb2ludENvbW1hbmQnKTtcclxuZXhwb3J0cy5saW5lICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9MaW5lQ29tbWFuZCcpO1xyXG5leHBvcnRzLnJlY3QgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL1JlY3RDb21tYW5kJyk7XHJcbmV4cG9ydHMucnJlY3QgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vUnJlY3RDb21tYW5kJyk7XHJcbmV4cG9ydHMuY2lyY2xlICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vQ2lyY2xlQ29tbWFuZCcpO1xyXG5leHBvcnRzLmVsbGlwc2UgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0VsbGlwc2VDb21tYW5kJyk7XHJcbmV4cG9ydHMuc2hhcGUgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vU2hhcGVDb21tYW5kJyk7XHJcbmV4cG9ydHMudHJpYW5nbGUgICAgICAgICAgICA9IHJlcXVpcmUoJy4vVHJpYW5nbGVDb21tYW5kJyk7XHJcbmV4cG9ydHMucGllY2hhcnQgICAgICAgICAgICA9IHJlcXVpcmUoJy4vUGllY2hhcnRDb21tYW5kJyk7XHJcbmV4cG9ydHMuZHJhd3RleHQgICAgICAgICAgICA9IHJlcXVpcmUoJy4vRHJhd3RleHRDb21tYW5kJyk7XHJcbmV4cG9ydHMudGV4dGZvbnQgICAgICAgICAgICA9IHJlcXVpcmUoJy4vVGV4dGZvbnRDb21tYW5kJyk7XHJcbmV4cG9ydHMubG9hZHNwcml0ZSAgICAgICAgICA9IHJlcXVpcmUoJy4vTG9hZHNwcml0ZUNvbW1hbmQnKTtcclxuZXhwb3J0cy5kcmF3c3ByaXRlICAgICAgICAgID0gcmVxdWlyZSgnLi9EcmF3c3ByaXRlQ29tbWFuZCcpO1xyXG5leHBvcnRzLnNhdmVzcHJpdGUgICAgICAgICAgPSByZXF1aXJlKCcuL1NhdmVzcHJpdGVDb21tYW5kJyk7XHJcbmV4cG9ydHMucmV0aW5hICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vUmV0aW5hQ29tbWFuZCcpO1xyXG5leHBvcnRzLmFudGlhbGlhcyAgICAgICAgICAgPSByZXF1aXJlKCcuL0FudGlhbGlhc0NvbW1hbmQnKTtcclxuXHJcbmV4cG9ydHMubG9ja29yaWVudGF0aW9uICAgICA9IHJlcXVpcmUoJy4vTG9ja29yaWVudGF0aW9uQ29tbWFuZCcpO1xyXG5leHBvcnRzLnJlcXVpcmVwb3J0cmFpdCAgICAgPSByZXF1aXJlKCcuL1JlcXVpcmVwb3J0cmFpdENvbW1hbmQnKTtcclxuZXhwb3J0cy5yZXF1aXJlbGFuZHNjYXBlICAgID0gcmVxdWlyZSgnLi9SZXF1aXJlbGFuZHNjYXBlQ29tbWFuZCcpO1xyXG5leHBvcnRzLmFjY2VsY2FsaWJyYXRlICAgICAgPSByZXF1aXJlKCcuL0FjY2VsY2FsaWJyYXRlQ29tbWFuZCcpO1xyXG5cclxuLy8gRmlsZSBjb21tYW5kc1xyXG5leHBvcnRzLm9wZW4gICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL09wZW5Db21tYW5kJyk7XHJcbmV4cG9ydHMuY2xvc2UgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vQ2xvc2VDb21tYW5kJyk7XHJcblxyXG4vLyBDb250cm9sIHN0YXRlbWVudHNcclxuZXhwb3J0cy53aGlsZSAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9XaGlsZUNvbW1hbmQnKTtcclxuZXhwb3J0cy53ZW5kICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9XZW5kQ29tbWFuZCcpO1xyXG5leHBvcnRzLmlmICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0lmQ29tbWFuZCcpO1xyXG5leHBvcnRzLmVsc2UgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0Vsc2VDb21tYW5kJyk7XHJcbmV4cG9ydHMuZW5kaWYgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vRW5kaWZDb21tYW5kJyk7XHJcbmV4cG9ydHMuZm9yICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vRm9yQ29tbWFuZCcpO1xyXG5leHBvcnRzLm5leHQgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL05leHRDb21tYW5kJyk7IiwiLyoqXHJcbiAqIFBhcnNlcyBCQVNJQyBjb2RlIGFuZCBjcmVhdGVzIGFuIGFic3RyYWN0IHN5bnRheCB0cmVlXHJcbiAqL1xyXG5cclxudmFyIEFic3RyYWN0U3ludGF4VHJlZSA9IHJlcXVpcmUoJy4vQWJzdHJhY3RTeW50YXhUcmVlJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4vU3ludGF4RXJyb3InKTtcclxudmFyIEJsb2NrTWFuYWdlciA9IHJlcXVpcmUoJy4vQmxvY2snKTtcclxudmFyIHV0aWwgPSByZXF1aXJlKCcuLi91dGlsJyk7XHJcblxyXG52YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4vc3RhdGVtZW50cycpO1xyXG52YXIgQXNzaWdubWVudFN0YXRlbWVudCA9IHN0YXRlbWVudHMuQXNzaWdubWVudFN0YXRlbWVudDtcclxudmFyIENvbW1lbnRTdGF0ZW1lbnQgPSBzdGF0ZW1lbnRzLkNvbW1lbnRTdGF0ZW1lbnQ7XHJcbnZhciBDb21tYW5kU3RhdGVtZW50ID0gc3RhdGVtZW50cy5Db21tYW5kU3RhdGVtZW50O1xyXG52YXIgVmFyaWFibGVTdGF0ZW1lbnQgPSBzdGF0ZW1lbnRzLlZhcmlhYmxlU3RhdGVtZW50O1xyXG52YXIgRXhwcmVzc2lvblN0YXRlbWVudCA9IHN0YXRlbWVudHMuRXhwcmVzc2lvblN0YXRlbWVudDtcclxudmFyIEVtcHR5U3RhdGVtZW50ID0gc3RhdGVtZW50cy5FbXB0eVN0YXRlbWVudDtcclxudmFyIEZ1bmN0aW9uU3RhdGVtZW50ID0gc3RhdGVtZW50cy5GdW5jdGlvblN0YXRlbWVudDtcclxuXHJcbmV4cG9ydHMuQmxvY2sgPSBCbG9ja01hbmFnZXI7XHJcbmV4cG9ydHMuY29tbWFuZHMgPSByZXF1aXJlKCcuL2NvbW1hbmRzJyk7XHJcbmV4cG9ydHMuc3RhdGVtZW50cyA9IHN0YXRlbWVudHM7XHJcbmV4cG9ydHMuQWJzdHJhY3RTeW50YXhUcmVlID0gcmVxdWlyZSgnLi9BYnN0cmFjdFN5bnRheFRyZWUnKTtcclxuZXhwb3J0cy5TeW50YXhFcnJvciA9IHJlcXVpcmUoJy4vU3ludGF4RXJyb3InKTtcclxuXHJcbi8qKlxyXG4gKiBQYXJzZXMgQkFTSUMgY29kZSBhbmQgcmV0dXJucyBhbiBhYnN0cmFjdCBzeW50YXggdHJlZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gY29kZVxyXG4gKiBAcmV0dXJucyB7QWJzdHJhY3RTeW50YXhUcmVlfHtlcnJvcjogU3RyaW5nfX0gVGhlIHJlc3VsdGluZyBBU1RcclxuICovXHJcbmZ1bmN0aW9uIHBhcnNlKGNvZGUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgdmFyIGxhYmVscyA9IHt9O1xyXG4gICAgICAgIHZhciByb290ID0gW107XHJcbiAgICAgICAgdmFyIG1hbmFnZXIgPSBuZXcgQmxvY2tNYW5hZ2VyKCk7XHJcblxyXG4gICAgICAgIHZhciBsaW5lcyA9IGNvZGUuc3BsaXQoJ1xcbicpO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIGxpbmUgPSBwYXJzZUxpbmUobGluZXNbaV0udHJpbSgpLCBpLCBsYWJlbHMsIGZhbHNlLCBtYW5hZ2VyKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChsaW5lIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHJldHVybiB7IFwiZXJyb3JcIjogbGluZSB9O1xyXG4gICAgICAgICAgICBpZiAobGluZS5lcnJvciBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSByZXR1cm4geyBcImVycm9yXCI6IGxpbmUuZXJyb3IgfTtcclxuICAgICAgICAgICAgcm9vdFtpXSA9IGxpbmU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gbmV3IEFic3RyYWN0U3ludGF4VHJlZShyb290LCBsYWJlbHMsIG1hbmFnZXIpO1xyXG4gICAgfSBjYXRjaCAoZXgpIHtcclxuICAgICAgICByZXR1cm4geyBcImVycm9yXCI6IGV4IH07XHJcbiAgICB9XHJcbn1cclxuZXhwb3J0cy5wYXJzZSA9IHBhcnNlO1xyXG5cclxuLyoqXHJcbiAqIFBhcnNlcyBhIGxpbmUgYW5kIHJldHVybnMgdGhlIHN0YXRlbWVudFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbGluZSBUaGUgbGluZSB0byBwYXJzZVxyXG4gKiBAcGFyYW0ge051bWJlcn0gaSBUaGUgbGluZSBpbmRleFxyXG4gKiBAcGFyYW0ge09iamVjdH0gbGFiZWxzIFRoZSBsaXN0IG9mIGxhYmVsc1xyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG5vdExpbmVOdW1iZXIgSWYgdHJ1ZSwgd29udCBzZWUgaWYgaXQgc3RhcnRzIHdpdGggYSBsaW5lIG51bWJlclxyXG4gKiBAcGFyYW0ge0Jsb2NrTWFuYWdlcn0gbWFuYWdlciBUaGUgYmxvY2sgbWFuYWdlclxyXG4gKiBAcmV0dXJucyB7QXNzaWdubWVudFN0YXRlbWVudHxDb21tZW50U3RhdGVtZW50fENvbW1hbmRTdGF0ZW1lbnR8RW1wdHlTdGF0ZW1lbnR8RnVuY3Rpb25TdGF0ZW1lbnR8U3ludGF4RXJyb3J9XHJcbiAqL1xyXG5mdW5jdGlvbiBwYXJzZUxpbmUobGluZSwgaSwgbGFiZWxzLCBub3RMaW5lTnVtYmVyLCBtYW5hZ2VyKSB7XHJcbiAgICBsaW5lID0gbGluZS50cmltKCk7XHJcblxyXG4gICAgLy8gSXMgaXQgYW4gZW1wdHkgbGluZT9cclxuICAgIGlmIChsaW5lID09PSBcIlwiKSByZXR1cm4gbmV3IEVtcHR5U3RhdGVtZW50KCk7XHJcblxyXG4gICAgaWYgKGxpbmUuaW5kZXhPZihcIidcIikgPT09IDAgfHwgbGluZS50b1VwcGVyQ2FzZSgpID09PSBcIlJFTVwiIHx8IGxpbmUudG9VcHBlckNhc2UoKS5pbmRleE9mKFwiUkVNIFwiKSA9PT0gMCkge1xyXG4gICAgICAgIHJldHVybiBuZXcgQ29tbWVudFN0YXRlbWVudChsaW5lLnN1YnN0cmluZyhsaW5lLmluZGV4T2YoXCIgXCIpKS50cmltKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIElzIGl0IGEgbGFiZWw/XHJcbiAgICBpZiAobGluZVtsaW5lLmxlbmd0aCAtIDFdID09PSAnOicpIHtcclxuICAgICAgICB2YXIgbGFiZWxOYW1lID0gbGluZS5zdWJzdHJpbmcoMCwgbGluZS5sZW5ndGggLSAxKTtcclxuICAgICAgICBsYWJlbHNbbGFiZWxOYW1lXSA9IGk7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBFbXB0eVN0YXRlbWVudCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChsaW5lLmluZGV4T2YoJ0VORCBJRicpID09PSAwKSBsaW5lID0gJ0VORElGJztcclxuXHJcbiAgICAvLyBGaW5kIGZpcnN0IHNwYWNlLCBidXQgb25seSBvdXRzaWRlIG9mIGJyYWNrZXRzXHJcbiAgICB2YXIgYnJhY2tldFBvc2l0aW9ucyA9IHV0aWwuZmluZFBvc2l0aW9ucyhsaW5lLCBbXHJcbiAgICAgICAgeyBzdGFydDogJygnLCBlbmQ6ICcpJyB9XHJcbiAgICBdKTtcclxuICAgIHZhciBzcGFjZUluZGV4ID0gdXRpbC5pbmRleE9mT3V0c2lkZShsaW5lLCAnICcsIDAsIGJyYWNrZXRQb3NpdGlvbnMpO1xyXG5cclxuICAgIHZhciBjb21tYW5kU2VjdGlvbiwgYXJndW1lbnRTZWN0aW9uO1xyXG4gICAgaWYgKHNwYWNlSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgY29tbWFuZFNlY3Rpb24gPSBsaW5lLnN1YnN0cmluZygwLCBzcGFjZUluZGV4KS50cmltKCk7XHJcbiAgICAgICAgYXJndW1lbnRTZWN0aW9uID0gbGluZS5zdWJzdHJpbmcoc3BhY2VJbmRleCkudHJpbSgpO1xyXG5cclxuICAgICAgICAvLyBJcyBpdCBhIGxpbmUgbnVtYmVyP1xyXG4gICAgICAgIGlmICghbm90TGluZU51bWJlciAmJiAhaXNOYU4ocGFyc2VJbnQoY29tbWFuZFNlY3Rpb24pKSkge1xyXG4gICAgICAgICAgICBsYWJlbHNbY29tbWFuZFNlY3Rpb25dID0gaTtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcnNlTGluZShhcmd1bWVudFNlY3Rpb24sIGksIGxhYmVscywgdHJ1ZSwgbWFuYWdlcik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiBpdCBmb2xsb3dzIHRoZSBwYXR0ZXJuIHggPSB5IG9yIHggPXksIGl0IG11c3QgYmUgYW4gYXNzaWdubWVudFxyXG4gICAgICAgIGlmIChhcmd1bWVudFNlY3Rpb25bMF0gPT09ICc9Jykge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IEFzc2lnbm1lbnRTdGF0ZW1lbnQobmV3IFZhcmlhYmxlU3RhdGVtZW50KGNvbW1hbmRTZWN0aW9uKSwgbmV3IEV4cHJlc3Npb25TdGF0ZW1lbnQoYXJndW1lbnRTZWN0aW9uLnN1YnN0cmluZygxKS50cmltKCkpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIGFuIGVxdWFsIHNpZ24gaW4gdGhlIGNvbW1hbmQsIGl0IG11c3QgYmUgYW4gYXNzaWdubWVudFxyXG4gICAgICAgIHZhciBjbWRFcXVhbEluZGV4ID0gY29tbWFuZFNlY3Rpb24uaW5kZXhPZignPScpO1xyXG4gICAgICAgIGlmIChjbWRFcXVhbEluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICB2YXIgZXF1YWxMaW5lID0gY29tbWFuZFNlY3Rpb24gKyAnICcgKyBhcmd1bWVudFNlY3Rpb247XHJcbiAgICAgICAgICAgIHZhciB2YXJOYW1lID0gZXF1YWxMaW5lLnN1YnN0cmluZygwLCBjbWRFcXVhbEluZGV4KS50cmltKCk7XHJcbiAgICAgICAgICAgIHZhciB2YXJFeHByID0gZXF1YWxMaW5lLnN1YnN0cmluZyhjbWRFcXVhbEluZGV4ICsgMSkudHJpbSgpO1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IEFzc2lnbm1lbnRTdGF0ZW1lbnQobmV3IFZhcmlhYmxlU3RhdGVtZW50KHZhck5hbWUpLCBuZXcgRXhwcmVzc2lvblN0YXRlbWVudCh2YXJFeHByKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb21tYW5kU2VjdGlvbiA9IGxpbmU7XHJcbiAgICAgICAgYXJndW1lbnRTZWN0aW9uID0gJyc7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIGFuIGVxdWFsIHNpZ24sIGl0IG11c3QgYmUgYW4gYXNzaWdubWVudCAod2l0aCBubyBzcGFjZSwgZS5nLiB4PXkpXHJcbiAgICAgICAgdmFyIGVxdWFsSW5kZXggPSBjb21tYW5kU2VjdGlvbi5pbmRleE9mKCc9Jyk7XHJcbiAgICAgICAgaWYgKGVxdWFsSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgIHZhciB2YXJpYWJsZU5hbWUgPSBjb21tYW5kU2VjdGlvbi5zdWJzdHJpbmcoMCwgZXF1YWxJbmRleCk7XHJcbiAgICAgICAgICAgIHZhciB2YXJpYWJsZUV4cHIgPSBjb21tYW5kU2VjdGlvbi5zdWJzdHJpbmcoZXF1YWxJbmRleCArIDEpO1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IEFzc2lnbm1lbnRTdGF0ZW1lbnQobmV3IFZhcmlhYmxlU3RhdGVtZW50KHZhcmlhYmxlTmFtZSksIG5ldyBFeHByZXNzaW9uU3RhdGVtZW50KHZhcmlhYmxlRXhwcikpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSXMgaXQgYSByb290LWxldmVsIGZ1bmN0aW9uIGNhbGw/XHJcbiAgICAgICAgdmFyIGJyYWNrZXRJbmRleCA9IGNvbW1hbmRTZWN0aW9uLmluZGV4T2YoJygnKTtcclxuICAgICAgICBpZiAoYnJhY2tldEluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICB2YXIgZW5kQnJhY2tldEluZGV4ID0gY29tbWFuZFNlY3Rpb24uaW5kZXhPZignKScpO1xyXG4gICAgICAgICAgICBpZiAoZW5kQnJhY2tldEluZGV4ID09PSAtMSkgcmV0dXJuIG5ldyBTeW50YXhFcnJvcignVW5leHBlY3RlZCBvcGVuIGJyYWNrZXQnKTtcclxuICAgICAgICAgICAgdmFyIGZ1bmN0aW9uTmFtZSA9IGNvbW1hbmRTZWN0aW9uLnN1YnN0cmluZygwLCBicmFja2V0SW5kZXgpO1xyXG4gICAgICAgICAgICBpZiAoIWlzTmFOKHBhcnNlSW50KGZ1bmN0aW9uTmFtZSkpKSByZXR1cm4gbmV3IFN5bnRheEVycm9yKCdFeHBlY3RlZCBmdW5jdGlvbiBuYW1lJyk7XHJcbiAgICAgICAgICAgIHZhciBhcmdzID0gY29tbWFuZFNlY3Rpb24uc3Vic3RyaW5nKGJyYWNrZXRJbmRleCArIDEsIGVuZEJyYWNrZXRJbmRleCk7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgRnVuY3Rpb25TdGF0ZW1lbnQoZnVuY3Rpb25OYW1lLCBhcmdzKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29tbWFuZFNlY3Rpb24gPSBjb21tYW5kU2VjdGlvbi50b1VwcGVyQ2FzZSgpO1xyXG4gICAgcmV0dXJuIG5ldyBDb21tYW5kU3RhdGVtZW50KGNvbW1hbmRTZWN0aW9uLnRvTG93ZXJDYXNlKCksIGFyZ3VtZW50U2VjdGlvbiwgbWFuYWdlciwgaSk7XHJcbn1cclxuXHJcbmV4cG9ydHMucGFyc2VMaW5lID0gcGFyc2VMaW5lOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi8nKTtcclxudmFyIHV0aWwgPSByZXF1aXJlKCcuLi8uLi91dGlsJyk7XHJcblxyXG4vKipcclxuICogUmVwcmVzZW50cyBhIHNldCBvZiBhcmd1bWVudHMgdG8gYSBjb21tYW5kIGNhbGxcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byBwYXJzZVxyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBDb21tYW5kIG9wdGlvbnNcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRlZmluZVxyXG4gKi9cclxuZnVuY3Rpb24gQXJndW1lbnRTdGF0ZW1lbnQoYXJncywgb3B0aW9ucywgZGVmaW5lKSB7XHJcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcclxuICAgIHRoaXMudmFsdWUgPSBhcmdzO1xyXG4gICAgdGhpcy5mbGFncyA9IHt9O1xyXG4gICAgdGhpcy5hcmdzID0gW107XHJcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xyXG5cclxuICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5wYXJzZSA9PT0gJ3VuZGVmaW5lZCcpIG9wdGlvbnMucGFyc2UgPSB0cnVlO1xyXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zLnNlcGFyYXRvciA9PT0gJ3VuZGVmaW5lZCcpIG9wdGlvbnMuc2VwYXJhdG9yID0gJywnO1xyXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zLnBhcnNlQXJncyA9PT0gJ3VuZGVmaW5lZCcpIG9wdGlvbnMucGFyc2VBcmdzID0gdHJ1ZTtcclxuXHJcbiAgICBpZiAob3B0aW9ucy5wYXJzZSkge1xyXG4gICAgICAgIGlmIChvcHRpb25zLmZsYWdzKSB7XHJcbiAgICAgICAgICAgIHZhciBpc0ZsYWcgPSB0cnVlO1xyXG5cclxuICAgICAgICAgICAgLy8gRmluZCBhbGwgbWF0Y2hpbmcgZmxhZ3MgIHVudGlsIG5vIGZsYWcgaXMgZm91bmRcclxuICAgICAgICAgICAgd2hpbGUoaXNGbGFnKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZmlyc3RGbGFnRW5kID0gYXJncy5pbmRleE9mKCcgJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZmlyc3RGbGFnRW5kID09PSAtMSkgZmlyc3RGbGFnRW5kID0gYXJncy5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICB2YXIgZmlyc3RGbGFnID0gYXJncy5zdWJzdHJpbmcoMCwgZmlyc3RGbGFnRW5kKS50cmltKCkudG9VcHBlckNhc2UoKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5mbGFncy5pbmRleE9mKGZpcnN0RmxhZykgIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mbGFnc1tmaXJzdEZsYWddID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJncy5zdWJzdHJpbmcoZmlyc3RGbGFnRW5kKS50cmltKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlzRmxhZyA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJhd0FyZ3MgPSBhcmdzO1xyXG5cclxuICAgICAgICBhcmdzID0gYXJncy50cmltKCk7XHJcbiAgICAgICAgdmFyIGFyZ0xpc3QgPSBbYXJnc107XHJcbiAgICAgICAgaWYgKG9wdGlvbnMuc2VwYXJhdG9yKSB7XHJcbiAgICAgICAgICAgIGlmICghYXJncy5sZW5ndGgpIGFyZ0xpc3QgPSBbXTtcclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgcG9zaXRpb25zID0gdXRpbC5maW5kUG9zaXRpb25zKGFyZ3MsIFtcclxuICAgICAgICAgICAgICAgICAgICB7J3N0YXJ0JzogJ1wiJywgJ2VuZCc6ICdcIid9LFxyXG4gICAgICAgICAgICAgICAgICAgIHsnc3RhcnQnOiAnKCcsICdlbmQnOiAnKSd9XHJcbiAgICAgICAgICAgICAgICBdKTtcclxuICAgICAgICAgICAgICAgIGFyZ0xpc3QgPSB1dGlsLnNwbGl0T3V0c2lkZShhcmdzLCBvcHRpb25zLnNlcGFyYXRvciwgcG9zaXRpb25zKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ0xpc3QubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIGFyZyA9IGFyZ0xpc3RbaV0udHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5wYXJzZUFyZ3MpIGFyZyA9IG5ldyBzdGF0ZW1lbnRzLkV4cHJlc3Npb25TdGF0ZW1lbnQoYXJnLCBkZWZpbmUpO1xyXG4gICAgICAgICAgICB0aGlzLmFyZ3MucHVzaChhcmcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBzdGF0ZW1lbnQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuQXJndW1lbnRTdGF0ZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiAnQXJndW1lbnRTdGF0ZW1lbnQnLFxyXG4gICAgICAgIHZhbHVlOiB0aGlzLnZhbHVlLFxyXG4gICAgICAgIGZsYWdzOiB0aGlzLmZsYWdzLFxyXG4gICAgICAgIGFyZ3M6IHRoaXMuYXJncyxcclxuICAgICAgICBvcHRpb25zOiB0aGlzLm9wdGlvbnNcclxuICAgIH07XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFyZ3VtZW50U3RhdGVtZW50OyIsIi8qKlxyXG4gKiBSZXByZXNlbnRzIGFuIGFzc2lnbm1lbnQgb2YgYSB2YWx1ZSB0byBhIHZhcmlhYmxlXHJcbiAqXHJcbiAqIEBwYXJhbSB7VmFyaWFibGVTdGF0ZW1lbnR9IHZhcmlhYmxlIFRoZSB2YXJpYWJsZSB0byBhc3NpZ25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBleHByZXNzaW9uIFRoZSBleHByZXNzaW9uIHRvIGV2YWx1YXRlXHJcbiAqL1xyXG5mdW5jdGlvbiBBc3NpZ25tZW50U3RhdGVtZW50KHZhcmlhYmxlLCBleHByZXNzaW9uKSB7XHJcbiAgICB0aGlzLnZhcmlhYmxlID0gdmFyaWFibGU7XHJcbiAgICB0aGlzLmV4cHJlc3Npb24gPSBleHByZXNzaW9uO1xyXG59XHJcblxyXG4vKipcclxuICogT3V0cHV0cyBleGVjdXRhYmxlIGNvZGUgdGhhdCByZXByZXNlbnRzIHRoZSBhc3NpZ25tZW50XHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Bc3NpZ25tZW50U3RhdGVtZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMudmFyaWFibGUudG9TdHJpbmcoKSArIFwiID0gXCIgKyB0aGlzLmV4cHJlc3Npb24udG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgYXNzaWdubWVudCB0byBzZXJpYWxpemFibGUgSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuQXNzaWdubWVudFN0YXRlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiQXNzaWdubWVudFN0YXRlbWVudFwiLFxyXG4gICAgICAgIHZhcmlhYmxlOiB0aGlzLnZhcmlhYmxlLnRvSlNPTigpLFxyXG4gICAgICAgIGV4cHJlc3Npb246IHRoaXMuZXhwcmVzc2lvbi50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgYXNzaWdubWVudFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGEgVGhlIGV4ZWN1dGlvbiBkYXRhIGNvbnRleHRcclxuICovXHJcbkFzc2lnbm1lbnRTdGF0ZW1lbnQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICBkYXRhLnNldFZhcmlhYmxlKHRoaXMudmFyaWFibGUsIHRoaXMuZXhwcmVzc2lvbik7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFzc2lnbm1lbnRTdGF0ZW1lbnQ7IiwidmFyIGNvbW1hbmRzID0gcmVxdWlyZSgnLi4vY29tbWFuZHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxuXHJcbi8qKlxyXG4gKiBSZXByZXNlbnRzIGEgY29tbWFuZCBjYWxsXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBjb21tYW5kXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQHBhcmFtIHtCbG9ja01hbmFnZXJ9IG1hbmFnZXIgVGhlIGJsb2NrIG1hbmFnZXJcclxuICogQHBhcmFtIHtOdW1iZXJ9IGxpbmUgVGhlIGxpbmUgbnVtYmVyXHJcbiAqL1xyXG5mdW5jdGlvbiBDb21tYW5kU3RhdGVtZW50KG5hbWUsIGFyZ3MsIG1hbmFnZXIsIGxpbmUpIHtcclxuICAgIHRoaXMubmFtZSA9IG5hbWU7XHJcbiAgICB0aGlzLmFyZ3MgPSBhcmdzO1xyXG5cclxuICAgIGlmICghY29tbWFuZHNbbmFtZV0pIHRocm93IG5ldyBTeW50YXhFcnJvcignVW5rbm93biBjb21tYW5kOiAnICsgbmFtZSk7XHJcbiAgICB0aGlzLmNvbW1hbmQgPSBuZXcgY29tbWFuZHNbbmFtZV0oYXJncywgbWFuYWdlci5jcmVhdGUobGluZSkpO1xyXG59XHJcblxyXG4vKipcclxuICogT3V0cHV0cyBleGVjdXRhYmxlIGNkZSB0aGF0IHJlcHJlc2VudHMgdGhlIGNvbW1hbmQgY2FsbFxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuQ29tbWFuZFN0YXRlbWVudC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBzdHJpbmdBcmdzID0gdGhpcy5jb21tYW5kLnRvU3RyaW5nKCk7XHJcbiAgICByZXR1cm4gdGhpcy5uYW1lLnRvVXBwZXJDYXNlKCkgKyAoc3RyaW5nQXJncyA9PT0gJ1tvYmplY3QgT2JqZWN0XScgPyAnJyA6ICcgJyArIHN0cmluZ0FyZ3MpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBhc3NpZ25tZW50IHRvIHNlcmlhbGl6YWJsZSBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5Db21tYW5kU3RhdGVtZW50LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCJDb21tYW5kU3RhdGVtZW50XCIsXHJcbiAgICAgICAgbmFtZTogdGhpcy5uYW1lLFxyXG4gICAgICAgIGNvbW1hbmQ6IHRoaXMuY29tbWFuZC50b0pTT04gPyB0aGlzLmNvbW1hbmQudG9KU09OKCkgOiB7fVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZCBjYWxsXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YSBUaGUgZXhlY3V0aW9uIGRhdGEgY29udGV4dFxyXG4gKi9cclxuQ29tbWFuZFN0YXRlbWVudC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHJldHVybiBkYXRhLmNhbGxDb21tYW5kKHRoaXMuY29tbWFuZCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IENvbW1hbmRTdGF0ZW1lbnQ7IiwiLyoqXHJcbiAqIFJlcHJlc2VudHMgYSBjb21tZW50LCB3aGljaCBkb2VzIG5vdGhpbmdcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIGNvbW1lbnQgdGV4dFxyXG4gKi9cclxuZnVuY3Rpb24gQ29tbWVudFN0YXRlbWVudCh0ZXh0KSB7XHJcbiAgICB0aGlzLnRleHQgPSB0ZXh0O1xyXG59XHJcblxyXG4vKipcclxuICogT3V0cHV0cyBleGVjdXRhYmxlIGNvZGUgcmVwcmVzZW50aW5nIHRoZSBzdGF0ZW1lbnRcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkNvbW1lbnRTdGF0ZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gXCInIFwiICsgdGhpcy50ZXh0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBzdGF0ZW1lbnQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuQ29tbWVudFN0YXRlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6ICdDb21tZW50U3RhdGVtZW50JyxcclxuICAgICAgICB0ZXh0OiB0aGlzLnRleHRcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1lbnQgKGkuZSBkb2VzIG5vdGhpbmcpXHJcbiAqL1xyXG5Db21tZW50U3RhdGVtZW50LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oKSB7IH07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IENvbW1lbnRTdGF0ZW1lbnQ7IiwiLyoqXHJcbiAqIEFuIGVtcHR5IHN0YXRlbWVudCB0aGF0IGRvZXMgbm90aGluZ1xyXG4gKlxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIEVtcHR5U3RhdGVtZW50KCkgeyB9XHJcblxyXG4vKipcclxuICogT3V0cHV0cyBleGVjdXRhYmxlIGNvZGUgcmVwcmVzZW50aW5nIHRoZSBzdGF0ZW1lbnRcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkVtcHR5U3RhdGVtZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIFwiXCI7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIHN0YXRlbWVudCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5FbXB0eVN0YXRlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4geyB0eXBlOiAnRW1wdHlTdGF0ZW1lbnQnIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1lbnQgKGkuZSBkb2VzIG5vdGhpbmcpXHJcbiAqL1xyXG5FbXB0eVN0YXRlbWVudC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKCkgeyB9O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBFbXB0eVN0YXRlbWVudDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4vJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBvcGVyYXRvcnMgPSByZXF1aXJlKCcuL29wZXJhdG9ycycpO1xyXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4uLy4uL3V0aWwnKTtcclxuXHJcbnZhciBhbGxPcGVyYXRvcnMgPSBbXTtcclxuZm9yICh2YXIgaSA9IDA7IGkgPCBvcGVyYXRvcnMubGVuZ3RoOyBpKyspIGFsbE9wZXJhdG9ycyA9IGFsbE9wZXJhdG9ycy5jb25jYXQoT2JqZWN0LmtleXMob3BlcmF0b3JzW2ldKSk7XHJcblxyXG4vKipcclxuICogUmVwcmVzZW50cyBzb21lIGZvcm0gb2YgZXhwcmVzc2lvbiB0byBmaW5kIGEgdmFsdWVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgVGhlIGNvZGUgdG8gcGFyc2VcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5lXHJcbiAqL1xyXG5mdW5jdGlvbiBFeHByZXNzaW9uU3RhdGVtZW50KGRhdGEsIGRlZmluZSkge1xyXG4gICAgdGhpcy5jaGlsZCA9IHBhcnNlRXhwcmVzc2lvbihkYXRhLCBkZWZpbmUgPyBkZWZpbmUubGluZSA6ICd1bmtub3duJyk7XHJcblxyXG4gICAgaWYgKHRoaXMuY2hpbGQgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikgdGhyb3cgdGhpcy5jaGlsZDtcclxuICAgIGVsc2UgaWYgKHRoaXMuY2hpbGQuZXJyb3IpIHRocm93IHRoaXMuY2hpbGQuZXJyb3I7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPdXRwdXRzIGV4ZWN1dGFibGUgY29kZSB0aGF0IHJlcHJlc2VudHMgdGhlIGV4cHJlc3Npb25cclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkV4cHJlc3Npb25TdGF0ZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5jaGlsZC50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBzdGF0ZW1lbnQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuRXhwcmVzc2lvblN0YXRlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiRXhwcmVzc2lvblN0YXRlbWVudFwiLFxyXG4gICAgICAgIGNoaWxkOiB0aGlzLmNoaWxkLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBleHByZXNzaW9uXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YSBUaGUgZXhlY3V0aW9uIGRhdGEgY29udGV4dFxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfE51bWJlcn0gVGhlIHZhbHVlIG9mIHRoZSBleHByZXNzaW9uXHJcbiAqL1xyXG5FeHByZXNzaW9uU3RhdGVtZW50LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgaWYgKHRoaXMuZXJyb3IpIHRocm93IHRoaXMuZXJyb3I7XHJcblxyXG4gICAgcmV0dXJuIHRoaXMuY2hpbGQuZXhlY3V0ZShkYXRhKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBQYXJzZXMgYSBnaXZlbiBleHByZXNzaW9uLCBmb2xsb3dpbmcgQk9DTURBU1xyXG4gKiAoQnJhY2tldHMsIENvbXBhcmF0b3JzLCBNdWx0aXBsaWNhdGlvbi9EaXZpc2lvbiwgQWRkaXRpb24vU3VidHJhY3Rpb24vYmluYXJ5IG9wZXJhdG9ycylcclxuICogVG8gY29uZmlndXJlIHRoZSBvcmRlciBAc2VlIG9wZXJhdG9ycy9pbmRleC5qc1xyXG4gKlxyXG4gKiBUd28gb3BlcmF0b3JzIG9mIHRoZSBzYW1lIHByZWNlZGVuY2Ugd2lsbCBleGVjdXRlIGxlZnQgdG8gcmlnaHQsIGp1c3QgYXMgZXhwZWN0ZWRcclxuICpcclxuICogQHBhcmFtIGRhdGFcclxuICogQHBhcmFtIGxpbmVcclxuICovXHJcbmZ1bmN0aW9uIHBhcnNlRXhwcmVzc2lvbihkYXRhLCBsaW5lKSB7XHJcbiAgICBkYXRhID0gZGF0YS50cmltKCk7XHJcblxyXG4gICAgdmFyIGxvd2VyRGF0YSA9IGRhdGEudG9Mb3dlckNhc2UoKTtcclxuICAgIHZhciBwb3NpdGlvbnMgPSB1dGlsLmZpbmRQb3NpdGlvbnMobG93ZXJEYXRhLCBbXHJcbiAgICAgICAgeyAnc3RhcnQnOiAnXCInLCAnZW5kJzogJ1wiJyB9LFxyXG4gICAgICAgIHsgJ3N0YXJ0JzogJygnLCAnZW5kJzogJyknIH1cclxuICAgIF0pO1xyXG5cclxuICAgIC8vIFRyeSB0byBmaW5kIGFuIG9wZXJhdG9yIGluIHRoZSByb290IG9mIHRoZSBkYXRhXHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG9wZXJhdG9ycy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBvcGVyYXRvckxpc3QgPSBvcGVyYXRvcnNbaV07XHJcbiAgICAgICAgdmFyIG9wZXJhdG9yTmFtZXMgPSBPYmplY3Qua2V5cyhvcGVyYXRvckxpc3QpO1xyXG5cclxuICAgICAgICAvLyBXZSBnbyBiYWNrd2FyZHMgc28gdGhhdCB0aGUgcmVzdWx0aW5nIG9iamVjdCBuZXN0aW5nIGdvZXMgZnJvbSBsZWZ0IHRvIHJpZ2h0XHJcbiAgICAgICAgLy8gaW4gdGhlIGNhc2Ugb2YgdHdvIG9wZXJhdG9ycyB3aXRoIHRoZSBzYW1lIHByZWNlZGVuY2UgYXJlIGJlc2lkZSBlYWNoIG90aGVyLlxyXG4gICAgICAgIC8vIEZvciBleGFtcGxlLCB3aXRoIHRoZSBleHByZXNzaW9uICcxICogMiAvIDMnIHlvdSB3b3VsZCBleHBlY3QgaXQgdG8gZG8gdGhlXHJcbiAgICAgICAgLy8gJzEgKiAyJyBwYXJ0IGZpcnN0LCBzbyB3ZSBoYXZlIHRvIGdvIHRoaXMgd2F5IHNvIHRoYXQgaXQgcGFyc2VzIGFzXHJcbiAgICAgICAgLy8gRGl2aXNpb25PcGVyYXRvcignMSAqIDInLCAnMycpIGluc3RlYWQgb2YgTXVsdGlwbGljYXRpb25PcGVyYXRvcignMScsICcyIC8gMycpXHJcbiAgICAgICAgdmFyIGZvdW5kID0gdXRpbC5maW5kTGFzdE91dHNpZGUobG93ZXJEYXRhLCBvcGVyYXRvck5hbWVzLCBsb3dlckRhdGEubGVuZ3RoLCBwb3NpdGlvbnMpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBhbiBvcGVyYXRvciwgcGFyc2UgdGhlIHR3byBzaWRlcyBhbmQgdGhlbiByZXR1cm4gdGhlIG9wZXJhdG9yXHJcbiAgICAgICAgaWYgKGZvdW5kLmluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBudW1iZXIgYmVmb3JlIGFuZCB0aGUgY2hhcmFjdGVyIGlzICctJyBvciAnKycsIGlnbm9yZVxyXG4gICAgICAgICAgICB2YXIgYmVmb3JlVGV4dCA9IGRhdGEuc3Vic3RyaW5nKDAsIGZvdW5kLmluZGV4KS50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICgoZm91bmQuZm91bmQgPT09ICctJyB8fCBmb3VuZC5mb3VuZCA9PT0gJysnKSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIHByZXZpb3VzT3BlcmF0b3IgPSB1dGlsLmZpbmRMYXN0KGJlZm9yZVRleHQsIGFsbE9wZXJhdG9ycyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocHJldmlvdXNPcGVyYXRvci5pbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgbWlkZGxlQ29udGVudCA9IGJlZm9yZVRleHQuc3Vic3RyaW5nKHByZXZpb3VzT3BlcmF0b3IuaW5kZXggKyBwcmV2aW91c09wZXJhdG9yLmZvdW5kLmxlbmd0aCkudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghbWlkZGxlQ29udGVudC5sZW5ndGgpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB2YXIgYmVmb3JlID0gcGFyc2VFeHByZXNzaW9uKGJlZm9yZVRleHQpO1xyXG4gICAgICAgICAgICB2YXIgYWZ0ZXIgPSBwYXJzZUV4cHJlc3Npb24oZGF0YS5zdWJzdHJpbmcoZm91bmQuaW5kZXggKyBmb3VuZC5mb3VuZC5sZW5ndGgpKTtcclxuXHJcbiAgICAgICAgICAgIHZhciBvcGVyYXRvckNvbnN0cnVjdG9yID0gb3BlcmF0b3JMaXN0W2ZvdW5kLmZvdW5kXTtcclxuICAgICAgICAgICAgaWYgKCFvcGVyYXRvckNvbnN0cnVjdG9yKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ1Vua25vd24gb3BlcmF0b3InKTtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBvcGVyYXRvckNvbnN0cnVjdG9yKGJlZm9yZSwgYWZ0ZXIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBub25lIGFyZSBmb3VuZCwgaXRzIGVpdGhlciBhIHN5bnRheCBlcnJvciwgZnVuY3Rpb24gY2FsbCwgYnJhY2tldCwgb3Igc2luZ3VsYXIgZXhwcmVzc2lvblxyXG4gICAgdmFyIHN0YXJ0QnJhY2tldEluZGV4ID0gZGF0YS5pbmRleE9mKCcoJyk7XHJcbiAgICBpZiAoc3RhcnRCcmFja2V0SW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgdmFyIGVuZEJyYWNrZXRJbmRleCA9IGRhdGEuaW5kZXhPZignKScsIHN0YXJ0QnJhY2tldEluZGV4KTtcclxuICAgICAgICBpZiAoZW5kQnJhY2tldEluZGV4ID09PSAtMSkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdFeHBlY3RlZCBlbmQgYnJhY2tldCBpbiAnICsgZGF0YSArICcgb24gbGluZSAnICsgbGluZSk7XHJcbiAgICAgICAgdmFyIGJyYWNrZXRDb250ZW50ID0gZGF0YS5zdWJzdHJpbmcoc3RhcnRCcmFja2V0SW5kZXggKyAxLCBlbmRCcmFja2V0SW5kZXgpLnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgc29tZXRoaW5nIGJlZm9yZSB0aGUgYnJhY2tldCwgaXRzIGEgZnVuY3Rpb24gY2FsbFxyXG4gICAgICAgIHZhciBiZWZvcmVCcmFja2V0ID0gZGF0YS5zdWJzdHJpbmcoMCwgc3RhcnRCcmFja2V0SW5kZXgpLnRyaW0oKTtcclxuICAgICAgICBpZiAoYmVmb3JlQnJhY2tldC5sZW5ndGgpIHJldHVybiBuZXcgc3RhdGVtZW50cy5GdW5jdGlvblN0YXRlbWVudChiZWZvcmVCcmFja2V0LCBicmFja2V0Q29udGVudCk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIHNvbWV0aGluZyBhZnRlciB0aGUgYnJhY2tldCwgaXRzIGEgc3ludGF4IGVycm9yXHJcbiAgICAgICAgdmFyIGFmdGVyQnJhY2tldCA9IGRhdGEuc3Vic3RyaW5nKGVuZEJyYWNrZXRJbmRleCArIDEpLnRyaW0oKTtcclxuICAgICAgICBpZiAoYWZ0ZXJCcmFja2V0Lmxlbmd0aCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiVW5leHBlY3RlZCBleHByZXNzaW9uXCIpO1xyXG5cclxuICAgICAgICAvLyBJZiB3ZSd2ZSBnb3R0ZW4gdG8gaGVyZSwgaXRzIGp1c3QgYW4gZXhwcmVzc2lvbiBpbiBicmFja2V0c1xyXG4gICAgICAgIHJldHVybiBwYXJzZUV4cHJlc3Npb24oYnJhY2tldENvbnRlbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEl0IG11c3QgYmUgYSBzaW5ndWxhciBleHByZXNzaW9uXHJcbiAgICByZXR1cm4gcGFyc2VTaW5ndWxhckV4cHJlc3Npb24oZGF0YSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQYXJzZXMgYSBzaW5nbGUgZXhwcmVzc2lvbiAob25lIHdpdGhvdXQgYW55IG9wZXJhdG9ycykgYW5kIHJldHVybnMgYSB2YXJpYWJsZSwgc3RyaW5nLCBvciBudW1iZXJcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgVGhlIGV4cHJlc3Npb24gZGF0YVxyXG4gKiBAcmV0dXJucyB7U3ludGF4RXJyb3J8ZXhwb3J0cy5TdHJpbmdTdGF0ZW1lbnR8ZXhwb3J0cy5OdW1iZXJTdGF0ZW1lbnR8ZXhwb3J0cy5WYXJpYWJsZVN0YXRlbWVudHxleHBvcnRzLlBvaW50ZXJTdGF0ZW1lbnR9XHJcbiAqIEBwcml2YXRlXHJcbiAqL1xyXG5mdW5jdGlvbiBwYXJzZVNpbmd1bGFyRXhwcmVzc2lvbihkYXRhKSB7XHJcbiAgICAvLyBBIGhhc2ggc2lnbmlmaWVzIGEgcG9pbnRlclxyXG4gICAgaWYgKGRhdGFbMF0gPT09ICcjJykge1xyXG4gICAgICAgIHZhciBwb2ludGVySWQgPSBkYXRhLnN1YnN0cmluZygxKTtcclxuICAgICAgICBpZiAoaXNOYU4ocGFyc2VJbnQocG9pbnRlcklkKSkpIHJldHVybiBuZXcgU3ludGF4RXJyb3IoJ1VuZXhwZWN0ZWQgaGFzaCcpO1xyXG4gICAgICAgIHJldHVybiBuZXcgc3RhdGVtZW50cy5Qb2ludGVyU3RhdGVtZW50KHBvaW50ZXJJZCk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGlzU3RyaW5nID0gZGF0YS5pbmRleE9mKCdcIicpICE9PSAtMTtcclxuXHJcbiAgICAvLyBJZiB0aGVyZSBpcyBhbnkgcXVvdGUsIGl0cyBlaXRoZXIgYSBzdHJpbmcgb3Igc3ludGF4IGVycm9yXHJcbiAgICBpZiAoaXNTdHJpbmcpIHtcclxuICAgICAgICBpZiAoZGF0YVswXSAhPT0gJ1wiJyB8fCBkYXRhW2RhdGEubGVuZ3RoIC0gMV0gIT09ICdcIicpIHJldHVybiBuZXcgU3ludGF4RXJyb3IoJ1VuZXhwZWN0ZWQgcXVvdGUnKTtcclxuICAgICAgICB2YXIgc3RyaW5nQ29udGVudCA9IGRhdGEuc2xpY2UoMSwgZGF0YS5sZW5ndGggLSAxKTtcclxuICAgICAgICByZXR1cm4gbmV3IHN0YXRlbWVudHMuU3RyaW5nU3RhdGVtZW50KHN0cmluZ0NvbnRlbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIGl0IGlzIG5vdCBub3QgYSBudW1iZXIsIGl0IG11c3QgYmUgYSBudW1iZXIgKHNlZSBteSBsb2dpYz8pXHJcbiAgICB2YXIgbnVtYmVyVmFsdWUgPSBwYXJzZUZsb2F0KGRhdGEpO1xyXG4gICAgaWYgKCFpc05hTihudW1iZXJWYWx1ZSkpIHtcclxuICAgICAgICByZXR1cm4gbmV3IHN0YXRlbWVudHMuTnVtYmVyU3RhdGVtZW50KG51bWJlclZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBPdGhlcndpc2UsIGl0IG11c3QgYmUgYSB2YXJpYWJsZVxyXG4gICAgLy8gVE9ETzogdmFsaWRhdGUgdmFyaWFibGUgbmFtZSAodGhpcyBzaG91bGQgYWN0dWFsbHkgZ28gaW4gdGhlIHZhcmlhYmxlIGNvbnN0cnVjdG9yLi4pXHJcbiAgICByZXR1cm4gbmV3IHN0YXRlbWVudHMuVmFyaWFibGVTdGF0ZW1lbnQoZGF0YSk7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRXhwcmVzc2lvblN0YXRlbWVudDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4vJyk7XHJcbnZhciB1dGlsID0gcmVxdWlyZSgnLi4vLi4vdXRpbCcpO1xyXG5cclxuLyoqXHJcbiAqIFJlcHJlc2VudHMgYSBmdW5jdGlvbiBjYWxsXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBmdW5jdGlvblxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBmdW5jdGlvblxyXG4gKi9cclxuZnVuY3Rpb24gRnVuY3Rpb25TdGF0ZW1lbnQobmFtZSwgYXJncykge1xyXG4gICAgaWYgKG5hbWVbbmFtZS5sZW5ndGggLSAxXSA9PT0gJyQnKSB7XHJcbiAgICAgICAgdGhpcy50eXBlID0gJ3N0cmluZyc7XHJcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZS5zdWJzdHJpbmcoMCwgbmFtZS5sZW5ndGggLSAxKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy50eXBlID0gJ251bWJlcic7XHJcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgcG9zaXRpb25zID0gdXRpbC5maW5kUG9zaXRpb25zKGFyZ3MsIFtcclxuICAgICAgICB7ICdzdGFydCc6ICdcIicsICdlbmQnOiAnXCInIH0sXHJcbiAgICAgICAgeyAnc3RhcnQnOiAnKCcsICdlbmQnOiAnKScgfVxyXG4gICAgXSk7XHJcbiAgICB2YXIgYXJnTGlzdCA9IHV0aWwuc3BsaXRPdXRzaWRlKGFyZ3MsIFwiLFwiLCBwb3NpdGlvbnMpO1xyXG5cclxuICAgIHRoaXMuYXJncyA9IFtdO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmdMaXN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5hcmdzLnB1c2gobmV3IHN0YXRlbWVudHMuRXhwcmVzc2lvblN0YXRlbWVudChhcmdMaXN0W2ldLnRyaW0oKSkpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogT3V0cHV0cyBleGVjdXRhYmxlIGNvZGUgdGhhdCByZXByZXNlbnRzIHRoZSBmdW5jdGlvbiBjYWxsXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5GdW5jdGlvblN0YXRlbWVudC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBhcmdzID0gW107XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuYXJncy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGFyZ3MucHVzaCh0aGlzLmFyZ3NbaV0udG9TdHJpbmcoKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXMubmFtZSArICh0aGlzLnR5cGUgPT09ICdzdHJpbmcnID8gJyQnIDogJycpICsgJygnICsgYXJncy5qb2luKCcsICcpICsgJyknO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBzdGF0ZW1lbnQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuRnVuY3Rpb25TdGF0ZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIkZ1bmN0aW9uU3RhdGVtZW50XCIsXHJcbiAgICAgICAgbmFtZTogdGhpcy5uYW1lLFxyXG4gICAgICAgIHZhclR5cGU6IHRoaXMudHlwZSxcclxuICAgICAgICBhcmdzOiB0aGlzLmFyZ3NcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogR2V0cyB0aGUgdmFsdWUgb2YgdGhlIGZ1bmN0aW9uXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YSBUaGUgZXhlY3V0aW9uIGRhdGEgY29udGV4dFxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfE51bWJlcn0gVGhlIHZhbHVlIG9mIHRoZSBmdW5jdGlvblxyXG4gKi9cclxuRnVuY3Rpb25TdGF0ZW1lbnQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICB2YXIgYXJncyA9IFtdO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmFyZ3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgYXJnID0gdGhpcy5hcmdzW2ldO1xyXG4gICAgICAgIGlmIChhcmcuZXJyb3IpIHRocm93IGFyZy5lcnJvcjtcclxuXHJcbiAgICAgICAgYXJncy5wdXNoKGFyZy5leGVjdXRlKGRhdGEpKTtcclxuICAgIH1cclxuICAgIHJldHVybiBkYXRhLmNhbGxGdW5jdGlvbih0aGlzLCBhcmdzKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRnVuY3Rpb25TdGF0ZW1lbnQ7IiwiLyoqXHJcbiAqIFJlcHJlc2VudHMgYSBudW1iZXIgdmFsdWVcclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IG51bWJlciBUaGUgbnVtYmVyIHRvIGFzc2lnblxyXG4gKi9cclxuZnVuY3Rpb24gTnVtYmVyU3RhdGVtZW50KG51bWJlcikge1xyXG4gICAgdGhpcy52YWx1ZSA9IG51bWJlcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIE91dHB1dHMgZXhlY3V0YWJsZSBjb2RlIHRoYXQgcmVwcmVzZW50cyB0aGUgbnVtYmVyXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5OdW1iZXJTdGF0ZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy52YWx1ZS50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBzdGF0ZW1lbnQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuTnVtYmVyU3RhdGVtZW50LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCJOdW1iZXJTdGF0ZW1lbnRcIixcclxuICAgICAgICB2YWx1ZTogdGhpcy52YWx1ZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIHRoZSBudW1iZXJcclxuICpcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIG51bWJlclxyXG4gKi9cclxuTnVtYmVyU3RhdGVtZW50LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy52YWx1ZTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTnVtYmVyU3RhdGVtZW50OyIsIi8qKlxyXG4gKiBSZXByZXNlbnRzIGEgcG9pbnRlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gaWQgVGhlIGlkIG9mIHRoZSBwb2ludGVyXHJcbiAqL1xyXG5mdW5jdGlvbiBQb2ludGVyU3RhdGVtZW50KGlkKSB7XHJcbiAgICB0aGlzLmlkID0gaWQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPdXRwdXRzIGV4ZWN1dGFibGUgY29kZSB0aGF0IHJlcHJlc2VudHMgdGhlIHBvaW50ZXJcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblBvaW50ZXJTdGF0ZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gJyMnICsgdGhpcy5pZDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgc3RhdGVtZW50IHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcblBvaW50ZXJTdGF0ZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIlBvaW50ZXJTdGF0ZW1lbnRcIixcclxuICAgICAgICBpZDogdGhpcy5pZFxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIHRoZSBwb2ludGVyIHZhbHVlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHsqfSBUaGUgdmFsdWUgb2YgdGhlIHBvaW50ZXJcclxuICovXHJcblBvaW50ZXJTdGF0ZW1lbnQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICByZXR1cm4gZGF0YS5nZXRQb2ludGVyKHRoaXMpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBQb2ludGVyU3RhdGVtZW50OyIsIi8qKlxyXG4gKiBSZXByZXNlbnRzIGEgc3RyaW5nIHZhbHVlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB2YWx1ZSBUaGUgdmFsdWUgdG8gYXNzaWduXHJcbiAqL1xyXG5mdW5jdGlvbiBTdHJpbmdTdGF0ZW1lbnQodmFsdWUpIHtcclxuICAgIHRoaXMudmFsdWUgPSB2YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE91dHB1dHMgZXhlY3V0YWJsZSBjb2RlIHRoYXQgcmVwcmVzZW50cyB0aGUgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5TdHJpbmdTdGF0ZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gJ1wiJyArIHRoaXMudmFsdWUgKyAnXCInO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBzdGF0ZW1lbnQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuU3RyaW5nU3RhdGVtZW50LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCJTdHJpbmdTdGF0ZW1lbnRcIixcclxuICAgICAgICB2YWx1ZTogdGhpcy52YWx1ZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIHRoZSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge1N0cmluZ30gVGhlIHN0cmluZ1xyXG4gKi9cclxuU3RyaW5nU3RhdGVtZW50LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy52YWx1ZTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU3RyaW5nU3RhdGVtZW50OyIsInZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi8nKTtcclxuXHJcbi8qKlxyXG4gKiBSZXByZXNlbnRzIGEgdmFyaWFibGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIHZhcmlhYmxlXHJcbiAqL1xyXG5mdW5jdGlvbiBWYXJpYWJsZVN0YXRlbWVudChuYW1lKSB7XHJcbiAgICB2YXIgYnJhY2tldEluZGV4ID0gbmFtZS5pbmRleE9mKCcoJyk7XHJcbiAgICBpZiAoYnJhY2tldEluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgIHZhciBlbmRCcmFja2V0SW5kZXggPSBuYW1lLmluZGV4T2YoJyknKTtcclxuICAgICAgICBpZiAoZW5kQnJhY2tldEluZGV4ID09PSAtMSkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdFeHBlY3RlZCBlbmQgYnJhY2tldCcpO1xyXG5cclxuICAgICAgICB2YXIgYXJyYXlOYW1lID0gbmFtZS5zdWJzdHJpbmcoMCwgYnJhY2tldEluZGV4KTtcclxuICAgICAgICB2YXIgYXJyYXlEaW1lbnNpb25zVGV4dCA9IG5hbWUuc3Vic3RyaW5nKGJyYWNrZXRJbmRleCArIDEsIGVuZEJyYWNrZXRJbmRleCkudHJpbSgpO1xyXG4gICAgICAgIHZhciBhcnJheURpbWVuc2lvbnMgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcnJheURpbWVuc2lvbnNUZXh0KTtcclxuXHJcbiAgICAgICAgbmFtZSA9IGFycmF5TmFtZTtcclxuICAgICAgICB0aGlzLmlzQXJyYXkgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuZGltZW5zaW9ucyA9IGFycmF5RGltZW5zaW9ucy5hcmdzO1xyXG4gICAgfSBlbHNlIHRoaXMuaXNBcnJheSA9IGZhbHNlO1xyXG5cclxuICAgIGlmIChuYW1lW25hbWUubGVuZ3RoIC0gMV0gPT09ICckJykge1xyXG4gICAgICAgIHRoaXMudHlwZSA9ICdzdHJpbmcnO1xyXG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWUuc3Vic3RyaW5nKDAsIG5hbWUubGVuZ3RoIC0gMSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMudHlwZSA9ICdudW1iZXInO1xyXG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPdXRwdXRzIGV4ZWN1dGFibGUgY29kZSB0aGF0IHJlcHJlc2VudHMgdGhlIHZhcmlhYmxlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5WYXJpYWJsZVN0YXRlbWVudC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBuYW1lID0gdGhpcy5uYW1lICsgKHRoaXMudHlwZSA9PT0gJ3N0cmluZycgPyAnJCcgOiAnJyk7XHJcbiAgICBpZiAodGhpcy5pc0FycmF5KSBuYW1lICs9ICcoJyArIHRoaXMuZGltZW5zaW9ucy5qb2luKCcsICcpICsgJyknO1xyXG4gICAgcmV0dXJuIG5hbWU7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIHN0YXRlbWVudCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5WYXJpYWJsZVN0YXRlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiVmFyaWFibGVTdGF0ZW1lbnRcIixcclxuICAgICAgICBuYW1lOiB0aGlzLm5hbWUsXHJcbiAgICAgICAgdmFyVHlwZTogdGhpcy50eXBlLFxyXG4gICAgICAgIGRpbWVuc2lvbnM6IHRoaXMuZGltZW5zaW9uc1xyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIHRoZSB2YWx1ZSBvZiB0aGUgdmFyaWFibGVcclxuICogU2luY2UgdGhlIHBhcnNlciBpcyBnb2luZyB0byB0aGluayB0aGF0IGdldHRpbmcgdGhlIHZhbHVlIG9mIGFuIGFycmF5IGlzIGEgZnVuY3Rpb24gY2FsbCxcclxuICogd2UgZG9uJ3QgbmVlZCB0byBpbXBsZW1lbnQgZ2V0dGluZyBvZiB0aGUgdmFsdWUgaGVyZVxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGEgVGhlIGV4ZWN1dGlvbiBkYXRhIGNvbnRleHRcclxuICogQHJldHVybnMge1N0cmluZ3xOdW1iZXJ9IFRoZSB2YWx1ZSBvZiB0aGUgdmFyaWFibGVcclxuICovXHJcblZhcmlhYmxlU3RhdGVtZW50LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgcmV0dXJuIGRhdGEuZ2V0VmFyaWFibGUodGhpcyk7XHJcbn07XHJcblxyXG5cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gVmFyaWFibGVTdGF0ZW1lbnQ7IiwiLyoqXHJcbiAqICdTdGF0ZW1lbnRzJyBhcmUgdGhlIG5vZGVzIGluIHRoZSBhYnN0cmFjdCBzeW50YXggdHJlZS5cclxuICogRWFjaCBzdGF0ZW1lbnQgZWl0aGVyIGhvbGRzIG90aGVyIHN0YXRlbWVudHMgb3IgYSBKYXZhc2NyaXB0IHByaW1pdGl2ZSwgYW5kIGhhc1xyXG4gKiB0aGUgYWJpbGl0eSB0byBwYXJzZSB0aGUgaW5wdXQgYW5kIGV4ZWN1dGUgaXQgbGF0ZXIuXHJcbiAqL1xyXG5cclxuZXhwb3J0cy5vcGVyYXRvcnMgPSByZXF1aXJlKCcuL29wZXJhdG9ycycpO1xyXG5leHBvcnRzLkFyZ3VtZW50U3RhdGVtZW50ID0gcmVxdWlyZSgnLi9Bcmd1bWVudFN0YXRlbWVudCcpO1xyXG5leHBvcnRzLkFzc2lnbm1lbnRTdGF0ZW1lbnQgPSByZXF1aXJlKCcuL0Fzc2lnbm1lbnRTdGF0ZW1lbnQnKTtcclxuZXhwb3J0cy5Db21tYW5kU3RhdGVtZW50ID0gcmVxdWlyZSgnLi9Db21tYW5kU3RhdGVtZW50Jyk7XHJcbmV4cG9ydHMuQ29tbWVudFN0YXRlbWVudCA9IHJlcXVpcmUoJy4vQ29tbWVudFN0YXRlbWVudCcpO1xyXG5leHBvcnRzLkVtcHR5U3RhdGVtZW50ID0gcmVxdWlyZSgnLi9FbXB0eVN0YXRlbWVudCcpO1xyXG5leHBvcnRzLkV4cHJlc3Npb25TdGF0ZW1lbnQgPSByZXF1aXJlKCcuL0V4cHJlc3Npb25TdGF0ZW1lbnQnKTtcclxuZXhwb3J0cy5GdW5jdGlvblN0YXRlbWVudCA9IHJlcXVpcmUoJy4vRnVuY3Rpb25TdGF0ZW1lbnQnKTtcclxuZXhwb3J0cy5OdW1iZXJTdGF0ZW1lbnQgPSByZXF1aXJlKCcuL051bWJlclN0YXRlbWVudCcpO1xyXG5leHBvcnRzLlBvaW50ZXJTdGF0ZW1lbnQgPSByZXF1aXJlKCcuL1BvaW50ZXJTdGF0ZW1lbnQnKTtcclxuZXhwb3J0cy5TdHJpbmdTdGF0ZW1lbnQgPSByZXF1aXJlKCcuL1N0cmluZ1N0YXRlbWVudCcpO1xyXG5leHBvcnRzLlZhcmlhYmxlU3RhdGVtZW50ID0gcmVxdWlyZSgnLi9WYXJpYWJsZVN0YXRlbWVudCcpOyIsIi8qKlxyXG4gKiBBZGRzIHR3byBudW1iZXJzIG9yIHN0cmluZ3MgdG9nZXRoZXJcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gQWRkaXRpb25PcGVyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkFkZGl0aW9uT3BlcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyArICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkFkZGl0aW9uT3BlcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIitcIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ8U3RyaW5nfSBUaGUgcmVzdWx0aW5nIHZhbHVlXHJcbiAqL1xyXG5BZGRpdGlvbk9wZXJhdG9yLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgdmFyIGx2YWwgPSB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgcnZhbCA9IHRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgIGlmICghbHZhbCkgcmV0dXJuIHJ2YWw7XHJcbiAgICByZXR1cm4gbHZhbCArIHJ2YWw7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFkZGl0aW9uT3BlcmF0b3I7IiwiLyoqXHJcbiAqIFJlcXVpcmVzIGJvdGggdmFsdWVzIHRvIGJlIHRydXRoeVxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBBbmRDb21wYXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuQW5kQ29tcGFyYXRvci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLnRvU3RyaW5nKCkgKyAnIEFORCAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5BbmRDb21wYXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCIgYW5kIFwiLFxyXG4gICAgICAgIGxleHByOiB0aGlzLmxleHByLnRvSlNPTigpLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKi9cclxuQW5kQ29tcGFyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSkgJiYgdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpID8gMSA6IDA7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFuZENvbXBhcmF0b3I7IiwiLyoqXHJcbiAqIEJpdHdpc2UgQU5EIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gbGV4cHIgTGVmdCBleHByZXNzaW9uXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gcmV4cHIgUmlnaHQgZXhwcmVzc2lvblxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIEFuZE9wZXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuQW5kT3BlcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyBCQU5EICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkFuZE9wZXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCIgYmFuZCBcIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICogQHRocm93cyBFcnJvciBpZiBlaXRoZXIgdmFsdWUgaXMgbm90IGEgbnVtYmVyXHJcbiAqL1xyXG5BbmRPcGVyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHZhciBsdmFsID0gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHJ2YWwgPSB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSk7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZShsdmFsLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHJ2YWwsICdudW1iZXInKTtcclxuICAgIHJldHVybiBsdmFsICYgcnZhbDtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQW5kT3BlcmF0b3I7IiwiLyoqXHJcbiAqIERpdmlkZXMgdHdvIG51bWJlcnNcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gRGl2aXNpb25PcGVyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkRpdmlzaW9uT3BlcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyAvICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkRpdmlzaW9uT3BlcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIi9cIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICogQHRocm93cyBFcnJvciBpZiBlaXRoZXIgZXhwcmVzc2lvbiBkb2VzIG5vdCBldmFsdWF0ZSB0byBhIG51bWJlclxyXG4gKi9cclxuRGl2aXNpb25PcGVyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHZhciBsdmFsID0gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHJ2YWwgPSB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBpZiAodHlwZW9mIGx2YWwgIT09ICdudW1iZXInIHx8IHR5cGVvZiBydmFsICE9PSAnbnVtYmVyJykgdGhyb3cgbmV3IEVycm9yKCdUeXBlcyBtaXNtYXRjaCcpO1xyXG4gICAgcmV0dXJuIGx2YWwgLyBydmFsO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBEaXZpc2lvbk9wZXJhdG9yOyIsIi8qKlxyXG4gKiBSZXF1aXJlcyBib3RoIHZhbHVlcyB0byBiZSBlcXVhbFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBFcXVhbENvbXBhcmF0b3IobGV4cHIsIHJleHByKSB7XHJcbiAgICB0aGlzLmxleHByID0gbGV4cHI7XHJcbiAgICB0aGlzLnJleHByID0gcmV4cHI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gZXhlY3V0YWJsZSBjb2RlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5FcXVhbENvbXBhcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyA9ICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkVxdWFsQ29tcGFyYXRvci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiPVwiLFxyXG4gICAgICAgIGxleHByOiB0aGlzLmxleHByLnRvSlNPTigpLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKi9cclxuRXF1YWxDb21wYXJhdG9yLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIuZXhlY3V0ZShkYXRhKSA9PSB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSkgPyAxIDogMDtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRXF1YWxDb21wYXJhdG9yOyIsIi8qKlxyXG4gKiBSZXF1aXJlcyB0aGUgbGVmdCBleHByZXNzaW9uIHRvIGJlIGdyZWF0ZXIgdGhhbiB0aGUgcmlnaHRcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gR3RDb21wYXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuR3RDb21wYXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIudG9TdHJpbmcoKSArICcgPiAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5HdENvbXBhcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIj5cIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICovXHJcbkd0Q29tcGFyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSkgPiB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSkgPyAxIDogMDtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gR3RDb21wYXJhdG9yOyIsIi8qKlxyXG4gKiBSZXF1aXJlcyB0aGUgbGVmdCBleHByZXNzaW9uIHRvIGJlIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byB0aGUgcmlnaHRcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gR3RlQ29tcGFyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkd0ZUNvbXBhcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyA+PSAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5HdGVDb21wYXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCI+PVwiLFxyXG4gICAgICAgIGxleHByOiB0aGlzLmxleHByLnRvSlNPTigpLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKi9cclxuR3RlQ29tcGFyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSkgPj0gdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpID8gMSA6IDA7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEd0ZUNvbXBhcmF0b3I7IiwiLyoqXHJcbiAqIFJlcXVpcmVzIHRoZSBsZWZ0IGV4cHJlc3Npb24gdG8gYmUgbGVzcyB0aGFuIHRoZSByaWdodFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBMdENvbXBhcmF0b3IobGV4cHIsIHJleHByKSB7XHJcbiAgICB0aGlzLmxleHByID0gbGV4cHI7XHJcbiAgICB0aGlzLnJleHByID0gcmV4cHI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gZXhlY3V0YWJsZSBjb2RlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5MdENvbXBhcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyA8ICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkx0Q29tcGFyYXRvci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiPFwiLFxyXG4gICAgICAgIGxleHByOiB0aGlzLmxleHByLnRvSlNPTigpLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKi9cclxuTHRDb21wYXJhdG9yLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIuZXhlY3V0ZShkYXRhKSA8IHRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKSA/IDEgOiAwO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBMdENvbXBhcmF0b3I7IiwiLyoqXHJcbiAqIFJlcXVpcmVzIHRoZSBsZWZ0IGV4cHJlc3Npb24gdG8gYmUgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIHRoZSByaWdodFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBMdGVDb21wYXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuTHRlQ29tcGFyYXRvci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLnRvU3RyaW5nKCkgKyAnIDw9ICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkx0ZUNvbXBhcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIjw9XCIsXHJcbiAgICAgICAgbGV4cHI6IHRoaXMubGV4cHIudG9KU09OKCksXHJcbiAgICAgICAgcmV4cHI6IHRoaXMucmV4cHIudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgcmVzdWx0aW5nIHZhbHVlXHJcbiAqL1xyXG5MdGVDb21wYXJhdG9yLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIuZXhlY3V0ZShkYXRhKSA8PSB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSkgPyAxIDogMDtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTHRlQ29tcGFyYXRvcjsiLCIvKipcclxuICogTXVsdGlwbGllcyB0d28gbnVtYmVyc1xyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxyXG4gKi9cclxuTXVsdGlwbGljYXRpb25PcGVyYXRvci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLnRvU3RyaW5nKCkgKyAnICogJyArIHRoaXMucmV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuTXVsdGlwbGljYXRpb25PcGVyYXRvci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiKlwiLFxyXG4gICAgICAgIGxleHByOiB0aGlzLmxleHByLnRvSlNPTigpLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIGVpdGhlciBleHByZXNzaW9uIGRvZXMgbm90IGV2YWx1YXRlIHRvIGEgbnVtYmVyXHJcbiAqL1xyXG5NdWx0aXBsaWNhdGlvbk9wZXJhdG9yLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgdmFyIGx2YWwgPSB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgcnZhbCA9IHRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgIGlmICh0eXBlb2YgbHZhbCAhPT0gJ251bWJlcicgfHwgdHlwZW9mIHJ2YWwgIT09ICdudW1iZXInKSB0aHJvdyBuZXcgRXJyb3IoJ1R5cGVzIG1pc21hdGNoJyk7XHJcbiAgICByZXR1cm4gbHZhbCAqIHJ2YWw7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE11bHRpcGxpY2F0aW9uT3BlcmF0b3I7IiwiLyoqXHJcbiAqIEludmVydHMgdGhlIHJpZ2h0IHZhbHVlXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gbGV4cHIgTGVmdCBleHByZXNzaW9uXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gcmV4cHIgUmlnaHQgZXhwcmVzc2lvblxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIE5vdENvbXBhcmF0b3IobGV4cHIsIHJleHByKSB7XHJcbiAgICB0aGlzLmxleHByID0gbGV4cHI7XHJcbiAgICB0aGlzLnJleHByID0gcmV4cHI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gZXhlY3V0YWJsZSBjb2RlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Ob3RDb21wYXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuICdOT1QgJyArIHRoaXMucmV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuTm90Q29tcGFyYXRvci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwibm90IFwiLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKi9cclxuTm90Q29tcGFyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHJldHVybiAhdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpID8gMSA6IDA7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE5vdENvbXBhcmF0b3I7IiwiLyoqXHJcbiAqIEJpdHdpc2UgTk9UIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gbGV4cHIgTGVmdCBleHByZXNzaW9uXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gcmV4cHIgUmlnaHQgZXhwcmVzc2lvblxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIE5vdE9wZXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuTm90T3BlcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gJ0JOT1QgJyArIHRoaXMucmV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuTm90T3BlcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcImJub3QgXCIsXHJcbiAgICAgICAgcmV4cHI6IHRoaXMucmV4cHIudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgcmVzdWx0aW5nIHZhbHVlXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgZWl0aGVyIHZhbHVlIGlzIG5vdCBhIG51bWJlclxyXG4gKi9cclxuTm90T3BlcmF0b3IucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICB2YXIgcnZhbCA9IHRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgIGRhdGEudmFsaWRhdGUocnZhbCwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIH5ydmFsO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBOb3RPcGVyYXRvcjsiLCIvKipcclxuICogUmVxdWlyZXMgZWl0aGVyIHZhbHVlIHRvIGJlIHRydXRoeVxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBPckNvbXBhcmF0b3IobGV4cHIsIHJleHByKSB7XHJcbiAgICB0aGlzLmxleHByID0gbGV4cHI7XHJcbiAgICB0aGlzLnJleHByID0gcmV4cHI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gZXhlY3V0YWJsZSBjb2RlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5PckNvbXBhcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyBPUiAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5PckNvbXBhcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIiBvciBcIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICovXHJcbk9yQ29tcGFyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSkgfHwgdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpID8gMSA6IDA7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE9yQ29tcGFyYXRvcjsiLCIvKipcclxuICogQml0d2lzZSBPUiBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBPck9wZXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuT3JPcGVyYXRvci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLnRvU3RyaW5nKCkgKyAnIEJPUiAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5Pck9wZXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCIgYm9yIFwiLFxyXG4gICAgICAgIGxleHByOiB0aGlzLmxleHByLnRvSlNPTigpLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIGVpdGhlciB2YWx1ZSBpcyBub3QgYSBudW1iZXJcclxuICovXHJcbk9yT3BlcmF0b3IucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICB2YXIgbHZhbCA9IHRoaXMubGV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBydmFsID0gdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpO1xyXG5cclxuICAgIGRhdGEudmFsaWRhdGUobHZhbCwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShydmFsLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gbHZhbCB8IHJ2YWw7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE9yT3BlcmF0b3I7IiwiLyoqXHJcbiAqIFJhaXNlcyBvbmUgbnVtYmVyIHRvIHRoZSBwb3dlciBvZiB0aGUgb3RoZXJcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gUG93ZXJPcGVyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblBvd2VyT3BlcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyBeICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcblBvd2VyT3BlcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIl5cIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICogQHRocm93cyBFcnJvciBpZiBlaXRoZXIgZXhwcmVzc2lvbiBkb2VzIG5vdCBldmFsdWF0ZSB0byBhIG51bWJlclxyXG4gKi9cclxuUG93ZXJPcGVyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHZhciBsdmFsID0gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHJ2YWwgPSB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBpZiAodHlwZW9mIGx2YWwgIT09ICdudW1iZXInIHx8IHR5cGVvZiBydmFsICE9PSAnbnVtYmVyJykgdGhyb3cgbmV3IEVycm9yKCdUeXBlcyBtaXNtYXRjaCcpO1xyXG4gICAgcmV0dXJuIE1hdGgucG93KGx2YWwsIHJ2YWwpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBQb3dlck9wZXJhdG9yO1xyXG4iLCIvKipcclxuICogU3VidHJhY3RzIGEgbnVtYmVyIGZyb20gYW5vdGhlclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBTdWJ0cmFjdGlvbk9wZXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxyXG4gKi9cclxuU3VidHJhY3Rpb25PcGVyYXRvci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLnRvU3RyaW5nKCkgKyAnIC0gJyArIHRoaXMucmV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuU3VidHJhY3Rpb25PcGVyYXRvci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiLVwiLFxyXG4gICAgICAgIGxleHByOiB0aGlzLmxleHByLnRvSlNPTigpLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIGVpdGhlciBleHByZXNzaW9uIGRvZXMgbm90IGV2YWx1YXRlIHRvIGEgbnVtYmVyXHJcbiAqL1xyXG5TdWJ0cmFjdGlvbk9wZXJhdG9yLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgdmFyIGx2YWwgPSB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgcnZhbCA9IHRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgIGlmICghbHZhbCAmJiB0eXBlb2YgcnZhbCA9PT0gJ251bWJlcicpIHJldHVybiBydmFsICogLTE7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBsdmFsICE9PSAnbnVtYmVyJyB8fCB0eXBlb2YgcnZhbCAhPT0gJ251bWJlcicpIHRocm93IG5ldyBFcnJvcignVHlwZXMgbWlzbWF0Y2gnKTtcclxuICAgIHJldHVybiBsdmFsIC0gcnZhbDtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU3VidHJhY3Rpb25PcGVyYXRvcjsiLCIvKipcclxuICogQml0d2lzZSBYT1Igb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gWG9yT3BlcmF0b3IobGV4cHIsIHJleHByKSB7XHJcbiAgICB0aGlzLmxleHByID0gbGV4cHI7XHJcbiAgICB0aGlzLnJleHByID0gcmV4cHI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gZXhlY3V0YWJsZSBjb2RlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Yb3JPcGVyYXRvci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLnRvU3RyaW5nKCkgKyAnIEJYT1IgJyArIHRoaXMucmV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuWG9yT3BlcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIiBieG9yIFwiLFxyXG4gICAgICAgIGxleHByOiB0aGlzLmxleHByLnRvSlNPTigpLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIGVpdGhlciB2YWx1ZSBpcyBub3QgYSBudW1iZXJcclxuICovXHJcblhvck9wZXJhdG9yLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgdmFyIGx2YWwgPSB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgcnZhbCA9IHRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKTtcclxuXHJcbiAgICBkYXRhLnZhbGlkYXRlKGx2YWwsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUocnZhbCwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIGx2YWwgXiBydmFsO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBYb3JPcGVyYXRvcjsiLCIvKipcclxuICogUHJvdmlkZXMgdGhlIG9yZGVyIG9mIG9wZXJhdGlvbnMsIGFuZCB0aGUgbWFwcGluZyBvZiBvcGVyYXRvciB0byBjbGFzc1xyXG4gKlxyXG4gKiBOT1RFOiBUaGlzICpzaG91bGQqIGJlIGluIHRoZSByZXZlcnNlIG9yZGVyIG9mIG9wZXJhdGlvbnNcclxuICovXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFtcclxuICAgIHtcclxuICAgICAgICAnIGFuZCAnOiByZXF1aXJlKCcuL0FuZENvbXBhcmF0b3InKSxcclxuICAgICAgICAnIG9yICc6IHJlcXVpcmUoJy4vT3JDb21wYXJhdG9yJylcclxuICAgIH0sXHJcbiAgICB7XHJcbiAgICAgICAgJ25vdCAnOiByZXF1aXJlKCcuL05vdENvbXBhcmF0b3InKSxcclxuICAgICAgICAnPSc6IHJlcXVpcmUoJy4vRXF1YWxDb21wYXJhdG9yJyksXHJcbiAgICAgICAgJz4nOiByZXF1aXJlKCcuL0d0Q29tcGFyYXRvcicpLFxyXG4gICAgICAgICc+PSc6IHJlcXVpcmUoJy4vR3RlQ29tcGFyYXRvcicpLFxyXG4gICAgICAgICc8JzogcmVxdWlyZSgnLi9MdENvbXBhcmF0b3InKSxcclxuICAgICAgICAnPD0nOiByZXF1aXJlKCcuL0x0ZUNvbXBhcmF0b3InKVxyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgICAnKyc6IHJlcXVpcmUoJy4vQWRkaXRpb25PcGVyYXRvcicpLFxyXG4gICAgICAgICctJzogcmVxdWlyZSgnLi9TdWJ0cmFjdGlvbk9wZXJhdG9yJyksXHJcblxyXG4gICAgICAgICcgYmFuZCAnOiByZXF1aXJlKCcuL0FuZE9wZXJhdG9yJyksXHJcbiAgICAgICAgJyBib3IgJzogcmVxdWlyZSgnLi9Pck9wZXJhdG9yJyksXHJcbiAgICAgICAgJyBieG9yICc6IHJlcXVpcmUoJy4vWG9yT3BlcmF0b3InKSxcclxuICAgICAgICAnIHhvciAnOiByZXF1aXJlKCcuL1hvck9wZXJhdG9yJyksXHJcbiAgICAgICAgJ2Jub3QgJzogcmVxdWlyZSgnLi9Ob3RPcGVyYXRvcicpXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICAgICcvJzogcmVxdWlyZSgnLi9EaXZpc2lvbk9wZXJhdG9yJyksXHJcbiAgICAgICAgJyonOiByZXF1aXJlKCcuL011bHRpcGxpY2F0aW9uT3BlcmF0b3InKVxyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgICAnXic6IHJlcXVpcmUoJy4vUG93ZXJPcGVyYXRvcicpXHJcbiAgICB9XHJcbl07IiwiLyoqXHJcbiAqIEJBU0lDIFJFUExcclxuICpcclxuICogSW1wbGVtZW50cyBhIHNpbWlsYXIgaW50ZXJmYWNlIHRvIE5vZGUncyBSRVBMIHBhY2thZ2VcclxuICovXHJcbnZhciBJT0ludGVyZmFjZSA9IHJlcXVpcmUoJy4vSU9JbnRlcmZhY2UnKTtcclxudmFyIHJsID0gSU9JbnRlcmZhY2UuZ2V0RGVmYXVsdCgpO1xyXG52YXIgZnMgPSByZXF1aXJlKCdmcycpO1xyXG52YXIgRXhlY3V0aW9uQ29udGV4dCA9IHJlcXVpcmUoJy4vZXhlY3V0b3IvRXhlY3V0aW9uQ29udGV4dCcpO1xyXG52YXIgQWJzdHJhY3RTeW50YXhUcmVlID0gcmVxdWlyZSgnLi9wYXJzZXIvQWJzdHJhY3RTeW50YXhUcmVlJyk7XHJcbnZhciBCbG9ja01hbmFnZXIgPSByZXF1aXJlKCcuL3BhcnNlci9CbG9jay9pbmRleCcpO1xyXG52YXIgcGFyc2VyID0gcmVxdWlyZSgnLi9wYXJzZXIvaW5kZXgnKTtcclxudmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuL3BhcnNlci9zdGF0ZW1lbnRzL2luZGV4Jyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4vcGFyc2VyL1N5bnRheEVycm9yJyk7XHJcbnZhciBjb21tYW5kcyA9IHJlcXVpcmUoJy4vcGFyc2VyL2NvbW1hbmRzL2luZGV4Jyk7XHJcbnZhciBjb21tYW5kTmFtZXMgPSBPYmplY3Qua2V5cyhjb21tYW5kcyk7XHJcbnZhciB1cHBlckNvbW1hbmROYW1lcyA9IFtdO1xyXG5mb3IgKHZhciBpID0gMDsgaSA8IGNvbW1hbmROYW1lcy5sZW5ndGg7IGkrKykgdXBwZXJDb21tYW5kTmFtZXMucHVzaChjb21tYW5kTmFtZXNbaV0udG9VcHBlckNhc2UoKSk7XHJcblxyXG4vKipcclxuICogU3RhcnRzIHRoZSBSRVBMLiBPcHRpb25zIGNhbiBiZTpcclxuICpcclxuICogIC0gYHByb21wdGAgLSB0aGUgcHJvbXB0IGFuZCBgc3RyZWFtYCBmb3IgYWxsIEkvTy4gRGVmYXVsdHMgdG8gYD4gYC5cclxuICogIC0gYGV2YWxgIC0gZnVuY3Rpb24gdGhhdCB3aWxsIGJlIHVzZWQgdG8gZXZhbCBlYWNoIGdpdmVuIGxpbmUuIERlZmF1bHRzIHRvIGFuIGFzeW5jIHdyYXBwZXIgZm9yIGBleGVjdXRvci5leGVjdXRlYC5cclxuICogIC0gYGNvbXBsZXRlcmAgLSBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgdXNlZCBmb3IgYXV0by1jb21wbGV0aW5nLlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBPcHRpb25zIGZvciB0aGUgUkVQTFxyXG4gKi9cclxuZnVuY3Rpb24gc3RhcnQob3B0aW9ucykge1xyXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcblxyXG4gICAgdmFyIHByb21wdCA9IG9wdGlvbnMucHJvbXB0IHx8ICc+ICc7XHJcblxyXG4gICAgdmFyIGV2YWwgPSBvcHRpb25zLmV2YWwgfHwgcnVuO1xyXG5cclxuICAgIHZhciBjb250ZXh0ID0gbmV3IEV4ZWN1dGlvbkNvbnRleHQoKTtcclxuICAgIHZhciBtYW5hZ2VyID0gbmV3IEJsb2NrTWFuYWdlcigpO1xyXG4gICAgdmFyIGFzdCA9IG5ldyBBYnN0cmFjdFN5bnRheFRyZWUoW10sIHt9LCBtYW5hZ2VyKTtcclxuICAgIG5leHRMaW5lKGNvbnRleHQsIGFzdCwgcHJvbXB0LCBwcm9tcHQsIC0xLCBldmFsKTtcclxufVxyXG5cclxuZXhwb3J0cy5zdGFydCA9IHN0YXJ0O1xyXG5cclxuLyoqXHJcbiAqIFRoZSBkZWZhdWx0IGV2YWwgZnVuY3Rpb25cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGNtZCBUaGUgY29tbWFuZCB0byBiZSBleGVjdXRlZFxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGNvbnRleHQgVGhlIGN1cnJlbnQgZXhlY3V0aW9uIGNvbnRleHRcclxuICogQHBhcmFtIHtBYnN0cmFjdFN5bnRheFRyZWV9IGFzdCBUaGUgY3VycmVudCBhYnN0cmFjdCBzeW50YXggdHJlZVxyXG4gKiBAcGFyYW0ge051bWJlcn0gY3Vyc29yIFRoZSBwb3NpdGlvbiBmb3IgdGhlIGN1cnNvclxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0IEEgZnVuY3Rpb24gdG8gY2FsbCB3aGVuIGNvbXBsZXRlXHJcbiAqIEBwcml2YXRlXHJcbiAqL1xyXG5mdW5jdGlvbiBydW4oY21kLCBjb250ZXh0LCBhc3QsIGN1cnNvciwgbmV4dCkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICAvLyBNdXN0IGJlIGEgY29tbWFuZFxyXG4gICAgICAgIGlmIChjbWRbMF0gPT09IFwiLlwiKSB7XHJcbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gY21kLnN1YnN0cmluZygxKTtcclxuICAgICAgICAgICAgdmFyIHNwYWNlSW5kZXggPSBjb21tYW5kLmluZGV4T2YoXCIgXCIpO1xyXG5cclxuICAgICAgICAgICAgdmFyIGFyZ3MgPSBcIlwiO1xyXG4gICAgICAgICAgICBpZiAoc3BhY2VJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgICAgIGFyZ3MgPSBjb21tYW5kLnN1YnN0cmluZyhzcGFjZUluZGV4ICsgMSkudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgY29tbWFuZCA9IGNvbW1hbmQuc3Vic3RyaW5nKDAsIHNwYWNlSW5kZXgpLnRyaW0oKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgc3dpdGNoIChjb21tYW5kKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiYnJlYWtcIjpcclxuICAgICAgICAgICAgICAgICAgICBhc3Qucm9vdC5zcGxpY2UoY29udGV4dC5fYmxvY2tTdGFydCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5fYmxvY2tTdGFydCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIG5leHQoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcImNsZWFyXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5fYmxvY2tTdGFydCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQucm9vdCA9IGFzdC5yb290ID0gW107XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5sYWJlbHMgPSBhc3QubGFiZWxzID0ge307XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5vcHRpb25zLmN1cnNvclN0YXJ0ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0Lmdvc3VicyA9IFtdO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQuc3RyaW5nVmFycyA9IHt9O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQubnVtYmVyVmFycyA9IHt9O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQucG9pbnRlcnMgPSB7fTtcclxuICAgICAgICAgICAgICAgICAgICBuZXh0KCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJleGl0XCI6XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ET1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiaGVscFwiOlxyXG4gICAgICAgICAgICAgICAgICAgIHJsLndyaXRlKFwiLmJyZWFrICAgICAgIC0gQ2xlYXIgdGhlIGN1cnJlbnQgbXVsdGktbGluZSBleHByZXNzaW9uXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJsLndyaXRlKFwiLmNsZWFyICAgICAgIC0gUmVzZXQgdGhlIGN1cnJlbnQgY29udGV4dCBhbmQgY2xlYXIgdGhlIGN1cnJlbnQgbXVsdGktbGluZSBleHByZXNzaW9uXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJsLndyaXRlKFwiLmV4aXQgICAgICAgIC0gQ2xvc2UgdGhlIEkvTyBzdHJlYW0sIGNhdXNpbmcgdGhlIFJFUEwgdG8gZXhpdFxcblwiKTtcclxuICAgICAgICAgICAgICAgICAgICBybC53cml0ZShcIi5oZWxwICAgICAgICAtIFNob3cgdGhpcyBsaXN0IG9mIHNwZWNpYWwgY29tbWFuZHNcXG5cIik7XHJcbiAgICAgICAgICAgICAgICAgICAgcmwud3JpdGUoXCIubG9hZCA8ZmlsZT4gLSBMb2FkIGEgZmlsZSBpbnRvIHRoZSBzZXNzaW9uXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJsLndyaXRlKFwiLnNhdmUgPGZpbGU+IC0gU2F2ZSB0aGUgY3VycmVudCBzZXNzaW9uXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIG5leHQoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcImxvYWRcIjpcclxuICAgICAgICAgICAgICAgICAgICBmcy5yZWFkRmlsZShhcmdzLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuY29kaW5nOiAndXRmOCdcclxuICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbihlcnIsIGRhdGEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHRocm93IGVycjtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGluZXMgPSBkYXRhLnNwbGl0KFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBsaW5lID0gbGluZXNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBhcnNlZExpbmUgPSBwYXJzZXIucGFyc2VMaW5lKGxpbmUsIGFzdC5yb290Lmxlbmd0aCwgYXN0LmxhYmVscywgZmFsc2UsIGFzdC5tYW5hZ2VyKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocGFyc2VkTGluZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB0aHJvdyBwYXJzZWRMaW5lO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwYXJzZWRMaW5lLmVycm9yKSB0aHJvdyBwYXJzZWRMaW5lLmVycm9yO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzdC5yb290LnB1c2gocGFyc2VkTGluZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhc3QubWFuYWdlci5wYXJzZShhc3QpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXN0LmV4ZWN1dGUoY29udGV4dCwgbmV4dCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmwud3JpdGUoZXJyICsgXCJcXG5cIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXh0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcInNhdmVcIjpcclxuICAgICAgICAgICAgICAgICAgICB2YXIgY29kZSA9IGFzdC50b1N0cmluZygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGZzLndyaXRlRmlsZShhcmdzLCBjb2RlLCBmdW5jdGlvbihlcnIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmwud3JpdGUoZXJyICsgXCJcXG5cIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgbmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBSRVBMIGNvbW1hbmQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgbGluZSA9IHBhcnNlci5wYXJzZUxpbmUoY21kLCBhc3Qucm9vdC5sZW5ndGgsIGFzdC5sYWJlbHMsIGZhbHNlLCBhc3QubWFuYWdlcik7XHJcbiAgICAgICAgaWYgKGxpbmUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikgdGhyb3cgbGluZTtcclxuICAgICAgICBpZiAobGluZS5lcnJvcikgdGhyb3cgbGluZS5lcnJvcjtcclxuXHJcbiAgICAgICAgYXN0LnJvb3QucHVzaChsaW5lKTtcclxuICAgICAgICBhc3QubWFuYWdlci5wYXJzZShhc3QpO1xyXG4gICAgICAgIGlmICh0eXBlb2YgY29udGV4dC5fYmxvY2tTdGFydCA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgY29udGV4dC5vcHRpb25zLmN1cnNvclN0YXJ0ID0gY29udGV4dC5fYmxvY2tTdGFydDtcclxuICAgICAgICAgICAgY29udGV4dC5fYmxvY2tTdGFydCA9IGZhbHNlO1xyXG4gICAgICAgIH0gZWxzZSBjb250ZXh0Lm9wdGlvbnMuY3Vyc29yU3RhcnQgPSBjdXJzb3I7XHJcbiAgICAgICAgYXN0LmV4ZWN1dGUoY29udGV4dCwgbmV4dCk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICB2YXIgbWVzc2FnZSA9IGVyci5tZXNzYWdlO1xyXG5cclxuICAgICAgICAvLyBEZXRlY3QgeCB3aXRob3V0IHkgYW5kIGFkZCBhIGxheWVyXHJcbiAgICAgICAgaWYgKGVyciBpbnN0YW5jZW9mIFN5bnRheEVycm9yICYmIG1lc3NhZ2UuaW5kZXhPZignd2l0aG91dCcpICE9PSAtMSkge1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRleHQuX2Jsb2NrU3RhcnQgIT09ICdudW1iZXInKSBjb250ZXh0Ll9ibG9ja1N0YXJ0ID0gYXN0LnJvb3QubGVuZ3RoIC0gMTtcclxuICAgICAgICAgICAgbmV4dCgnLi4uICcpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJsLndyaXRlKGVyciArIFwiXFxuXCIpO1xyXG4gICAgICAgICAgICBhc3Qucm9vdC5wb3AoKTtcclxuICAgICAgICAgICAgYXN0LnJvb3QucHVzaChuZXcgc3RhdGVtZW50cy5FbXB0eVN0YXRlbWVudCgpKTtcclxuICAgICAgICAgICAgbmV4dCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIElucHV0cyBhbmQgZXhlY3V0ZXMgdGhlIG5leHQgbGluZVxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGNvbnRleHQgVGhlIGN1cnJlbnQgZXhlY3V0aW9uIGNvbnRleHRcclxuICogQHBhcmFtIHtBYnN0cmFjdFN5bnRheFRyZWV9IGFzdCBUaGUgY3VycmVudCBhYnN0cmFjdCBzeW50YXggdHJlZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gcHJvbXB0XHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBvbGRQcm9tcHRcclxuICogQHBhcmFtIHtOdW1iZXJ9IGZvcmNlQ3Vyc29yXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGV2YWwgVGhlIGZ1bmN0aW9uIHRvIGV2YWx1YXRlXHJcbiAqIEBwcml2YXRlXHJcbiAqL1xyXG5mdW5jdGlvbiBuZXh0TGluZShjb250ZXh0LCBhc3QsIHByb21wdCwgb2xkUHJvbXB0LCBmb3JjZUN1cnNvciwgZXZhbCkge1xyXG4gICAgcmwucXVlc3Rpb24ocHJvbXB0LCBmdW5jdGlvbihhbnN3ZXIpIHtcclxuICAgICAgICBldmFsKGFuc3dlciwgY29udGV4dCwgYXN0LCBmb3JjZUN1cnNvciA9PT0gLTEgPyBhc3Qucm9vdC5sZW5ndGggOiBmb3JjZUN1cnNvciwgZnVuY3Rpb24obmV3UHJvbXB0LCBuZXdDdXJzb3IpIHtcclxuICAgICAgICAgICAgbmV4dExpbmUoY29udGV4dCwgYXN0LCBuZXdQcm9tcHQgfHwgb2xkUHJvbXB0LCBvbGRQcm9tcHQsIHR5cGVvZiBuZXdDdXJzb3IgPT09ICd1bmRlZmluZWQnID8gLTEgOiBuZXdDdXJzb3IsIGV2YWwpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcbn0iLCIvKipcclxuICogRmluZHMgdGhlIG5leHQgb25lIG9mIHRoZSBpdGVtc1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZGF0YSBUaGUgc3RyaW5nIHRvIHNlYXJjaFxyXG4gKiBAcGFyYW0ge0FycmF5PFN0cmluZz59IGl0ZW1zIFRoZSBpdGVtcyB0byBmaW5kXHJcbiAqIEBwYXJhbSB7TnVtYmVyPTB9IGluZGV4IFRoZSBzdGFydCBpbmRleFxyXG4gKiBAcmV0dXJucyB7e2luZGV4OiBOdW1iZXIsIGZvdW5kOiBTdHJpbmd9fSBUaGUgZm91bmQgaW5kZXggYW5kIHRoZSBmb3VuZCBpdGVtXHJcbiAqL1xyXG5mdW5jdGlvbiBmaW5kTmV4dChkYXRhLCBpdGVtcywgaW5kZXgpIHtcclxuICAgIHZhciBjdXJyZW50SW5kZXggPSBkYXRhLmxlbmd0aCArIDEsIGZvdW5kID0gJyc7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGl0ZW0gPSBpdGVtc1tpXTtcclxuICAgICAgICB2YXIgbG9jYXRpb24gPSBkYXRhLmluZGV4T2YoaXRlbSwgaW5kZXgpO1xyXG4gICAgICAgIGlmIChsb2NhdGlvbiAhPT0gLTEgJiYgbG9jYXRpb24gPCBjdXJyZW50SW5kZXgpIHtcclxuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbG9jYXRpb247XHJcbiAgICAgICAgICAgIGZvdW5kID0gaXRlbTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoY3VycmVudEluZGV4ID09PSBkYXRhLmxlbmd0aCArIDEpIHJldHVybiB7IGluZGV4OiAtMSwgZm91bmQ6ICcnIH07XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGluZGV4OiBjdXJyZW50SW5kZXgsXHJcbiAgICAgICAgZm91bmQ6IGZvdW5kXHJcbiAgICB9O1xyXG59XHJcblxyXG5leHBvcnRzLmZpbmROZXh0ID0gZmluZE5leHQ7XHJcblxyXG4vKipcclxuICogRmluZHMgdGhlIGxhc3Qgb25lIG9mIHRoZSBpdGVtc1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZGF0YSBUaGUgc3RyaW5nIHRvIHNlYXJjaFxyXG4gKiBAcGFyYW0ge0FycmF5PFN0cmluZz59IGl0ZW1zIFRoZSBpdGVtcyB0byBmaW5kXHJcbiAqIEBwYXJhbSB7TnVtYmVyPTB9IGluZGV4IFRoZSBlbmQgaW5kZXhcclxuICogQHJldHVybnMge3tpbmRleDogbnVtYmVyLCBmb3VuZDogc3RyaW5nfX0gVGhlIGZvdW5kIGluZGV4IGFuZCB0aGUgZm91bmQgaXRlbVxyXG4gKi9cclxuZnVuY3Rpb24gZmluZExhc3QoZGF0YSwgaXRlbXMsIGluZGV4KSB7XHJcbiAgICB2YXIgY3VycmVudEluZGV4ID0gLTEsIGZvdW5kID0gJyc7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGl0ZW0gPSBpdGVtc1tpXTtcclxuICAgICAgICB2YXIgbG9jYXRpb24gPSBkYXRhLmxhc3RJbmRleE9mKGl0ZW0sIGluZGV4KTtcclxuICAgICAgICBpZiAobG9jYXRpb24gPiBjdXJyZW50SW5kZXgpIHtcclxuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbG9jYXRpb247XHJcbiAgICAgICAgICAgIGZvdW5kID0gaXRlbTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGluZGV4OiBjdXJyZW50SW5kZXgsXHJcbiAgICAgICAgZm91bmQ6IGZvdW5kXHJcbiAgICB9O1xyXG59XHJcblxyXG5leHBvcnRzLmZpbmRMYXN0ID0gZmluZExhc3Q7XHJcblxyXG4vKipcclxuICogRmluZHMgdGhlIG5leHQgb25lIG9mIHRoZSBpdGVtcyBvdXRzaWRlIG9mIHRoZSBnaXZlbiBwb3NpdGlvbnNcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgVGhlIHN0cmluZyB0byBzZWFyY2hcclxuICogQHBhcmFtIHtBcnJheTxTdHJpbmc+fSBpdGVtcyBUaGUgaXRlbXMgdG8gZmluZFxyXG4gKiBAcGFyYW0ge051bWJlcj0wfSBpbmRleCBUaGUgc3RhcnQgaW5kZXhcclxuICogQHBhcmFtIHtBcnJheTx7c3RhcnQ6IE51bWJlciwgZW5kOiBOdW1iZXJ9Pn0gZXhjbHVkZSBUaGUgYm91bmRhcmllcyB0byBleGNsdWRlXHJcbiAqIEByZXR1cm5zIHt7aW5kZXg6IE51bWJlciwgZm91bmQ6IFN0cmluZ319IFRoZSBmb3VuZCBpbmRleCBhbmQgdGhlIGZvdW5kIGl0ZW1cclxuICovXHJcbmZ1bmN0aW9uIGZpbmROZXh0T3V0c2lkZShkYXRhLCBpdGVtcywgaW5kZXgsIGV4Y2x1ZGUpIHtcclxuICAgIHZhciByZXN1bHQsIHBvc2l0aW9uUmVzdWx0ID0ge3N0YXJ0OiAwLCBlbmQ6IGluZGV4ID8gaW5kZXggLSAxIDogLTF9O1xyXG5cclxuICAgIGRvIHtcclxuICAgICAgICByZXN1bHQgPSBmaW5kTmV4dChkYXRhLCBpdGVtcywgcG9zaXRpb25SZXN1bHQuZW5kICsgMSk7XHJcbiAgICB9IHdoaWxlIChyZXN1bHQuaW5kZXggIT09IC0xICYmIChwb3NpdGlvblJlc3VsdCA9IGluUG9zaXRpb24ocmVzdWx0LmluZGV4LCBleGNsdWRlKSkpO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZXhwb3J0cy5maW5kTmV4dE91dHNpZGUgPSBmaW5kTmV4dE91dHNpZGU7XHJcblxyXG4vKipcclxuICogRmluZHMgdGhlIGxhc3Qgb25lIG9mIHRoZSBpdGVtcyBvdXRzaWRlIG9mIHRoZSBnaXZlbiBwb3NpdGlvbnNcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgVGhlIHN0cmluZyB0byBzZWFyY2hcclxuICogQHBhcmFtIHtBcnJheTxTdHJpbmc+fSBpdGVtcyBUaGUgaXRlbXMgdG8gZmluZFxyXG4gKiBAcGFyYW0ge051bWJlcj99IGluZGV4IFRoZSBlbmQgaW5kZXhcclxuICogQHBhcmFtIHtBcnJheTx7c3RhcnQ6IE51bWJlciwgZW5kOiBOdW1iZXJ9Pn0gZXhjbHVkZSBUaGUgYm91bmRhcmllcyB0byBleGNsdWRlXHJcbiAqIEByZXR1cm5zIHt7aW5kZXg6IE51bWJlciwgZm91bmQ6IFN0cmluZ319IFRoZSBmb3VuZCBpbmRleCBhbmQgdGhlIGZvdW5kIGl0ZW1cclxuICovXHJcbmZ1bmN0aW9uIGZpbmRMYXN0T3V0c2lkZShkYXRhLCBpdGVtcywgaW5kZXgsIGV4Y2x1ZGUpIHtcclxuICAgIHZhciByZXN1bHQsIHBvc2l0aW9uUmVzdWx0ID0ge3N0YXJ0OiBpbmRleCA/IGluZGV4ICsgMSA6IGRhdGEubGVuZ3RoICsgMSwgZW5kOiAwfTtcclxuXHJcbiAgICBkbyB7XHJcbiAgICAgICAgcmVzdWx0ID0gZmluZExhc3QoZGF0YSwgaXRlbXMsIHBvc2l0aW9uUmVzdWx0LnN0YXJ0IC0gMSk7XHJcbiAgICB9IHdoaWxlIChyZXN1bHQuaW5kZXggIT09IC0xICYmIChwb3NpdGlvblJlc3VsdCA9IGluUG9zaXRpb24ocmVzdWx0LmluZGV4LCBleGNsdWRlKSkpO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZXhwb3J0cy5maW5kTGFzdE91dHNpZGUgPSBmaW5kTGFzdE91dHNpZGU7XHJcblxyXG4vKipcclxuICogRmluZHMgdGhlIG5leHQgaW5kZXggb2YgdGhlIGl0ZW0gb3V0c2lkZSBvZiB0aGUgZ2l2ZW4gcG9zaXRpb25zXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhIFRoZSBzdHJpbmcgdG8gc2VhcmNoXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBpdGVtIFRoZSBpdGVtIHRvIGZpbmRcclxuICogQHBhcmFtIHtOdW1iZXI9MH0gaW5kZXggVGhlIHN0YXJ0IGluZGV4XHJcbiAqIEBwYXJhbSB7QXJyYXk8e3N0YXJ0OiBOdW1iZXIsIGVuZDogTnVtYmVyfT59IGV4Y2x1ZGUgVGhlIGJvdW5kYXJpZXMgdG8gZXhjbHVkZVxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgZm91bmQgaW5kZXgsIG9yIC0xIGlmIG5vbmUgZm91bmRcclxuICovXHJcbmZ1bmN0aW9uIGluZGV4T2ZPdXRzaWRlKGRhdGEsIGl0ZW0sIGluZGV4LCBleGNsdWRlKSB7XHJcbiAgICB2YXIgcmVzdWx0LCBwb3NpdGlvblJlc3VsdCA9IHtzdGFydDogMCwgZW5kOiBpbmRleCA/IGluZGV4IC0gMSA6IC0xfTtcclxuXHJcbiAgICBkbyB7XHJcbiAgICAgICAgcmVzdWx0ID0gZGF0YS5pbmRleE9mKGl0ZW0sIHBvc2l0aW9uUmVzdWx0LmVuZCArIDEpO1xyXG4gICAgfSB3aGlsZSAocmVzdWx0ICE9PSAtMSAmJiAocG9zaXRpb25SZXN1bHQgPSBpblBvc2l0aW9uKHJlc3VsdCwgZXhjbHVkZSkpKTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmV4cG9ydHMuaW5kZXhPZk91dHNpZGUgPSBpbmRleE9mT3V0c2lkZTtcclxuXHJcbi8qKlxyXG4gKiBTcGxpdHMgZGF0YSBpbnRvIGFuIGFycmF5IGJ5IHRoZSBzZXBhcmF0b3IsIGV4Y2VwdCBpZiBpbiB0aGUgZXhjbHVkZSByZWdpb25zXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhIFRoZSBzdHJpbmcgdG8gc3BsaXRcclxuICogQHBhcmFtIHtTdHJpbmd9IHNlcGFyYXRvciBUaGUgc2VwYXJhdG9yXHJcbiAqIEBwYXJhbSB7QXJyYXk8e3N0YXJ0OiBOdW1iZXIsIGVuZDogTnVtYmVyfT59IGV4Y2x1ZGUgVGhlIGJvdW5kYXJpZXMgdG8gZXhjbHVkZVxyXG4gKiBAcmV0dXJucyB7QXJyYXk8U3RyaW5nPn0gVGhlIHNlcGFyYXRlZCBhcnJheVxyXG4gKi9cclxuZnVuY3Rpb24gc3BsaXRPdXRzaWRlKGRhdGEsIHNlcGFyYXRvciwgZXhjbHVkZSkge1xyXG4gICAgdmFyIHJlc3VsdCA9IFtdO1xyXG5cclxuICAgIHZhciBhY2N1bXVsYXRvciA9IFwiXCI7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBhY2N1bXVsYXRvciArPSBkYXRhW2ldO1xyXG5cclxuICAgICAgICB2YXIgaXNJbkV4Y2x1c2lvbiA9IGluUG9zaXRpb24oaSwgZXhjbHVkZSk7XHJcbiAgICAgICAgaWYgKCFpc0luRXhjbHVzaW9uICYmIGVuZHNXaXRoKGFjY3VtdWxhdG9yLCBzZXBhcmF0b3IpKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGFjY3VtdWxhdG9yLnN1YnN0cmluZygwLCBhY2N1bXVsYXRvci5sZW5ndGggLSBzZXBhcmF0b3IubGVuZ3RoKSk7XHJcbiAgICAgICAgICAgIGFjY3VtdWxhdG9yID0gJyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmVzdWx0LnB1c2goYWNjdW11bGF0b3IpO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZXhwb3J0cy5zcGxpdE91dHNpZGUgPSBzcGxpdE91dHNpZGU7XHJcblxyXG4vKipcclxuICogRmluZHMgdGhlIHN0YXJ0L2VuZCBwb3NpdGlvbiBvZiBlYWNoIGl0ZW1cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgVGhlIHN0cmluZyB0byBzZWFyY2hcclxuICogQHBhcmFtIHtBcnJheTx7c3RhcnQ6IFN0cmluZywgZW5kOiBTdHJpbmd9Pn0gaXRlbXMgVGhlIGFycmF5IG9mIGl0ZW1zIHRvIGZpbmRcclxuICogQHJldHVybnMge0FycmF5PHtzdGFydENoYXI6IFN0cmluZywgZW5kQ2hhcjogU3RyaW5nLCBzdGFydDogTnVtYmVyLCBlbmQ6IE51bWJlcn0+fSBUaGUgZm91bmQgaXRlbXMgYW5kIGxvY2F0aW9uc1xyXG4gKi9cclxuZnVuY3Rpb24gZmluZFBvc2l0aW9ucyhkYXRhLCBpdGVtcykge1xyXG4gICAgdmFyIGRlcHRoID0gMDtcclxuICAgIHZhciBjdXJyZW50SXRlbSA9IHt9O1xyXG4gICAgdmFyIGN1cnJlbnRJZCA9IC0xO1xyXG4gICAgdmFyIHJlc3VsdCA9IFtdO1xyXG5cclxuICAgIHZhciBhY2N1bXVsYXRvciA9ICcnO1xyXG4gICAgZm9yICh2YXIgY2kgPSAwOyBjaSA8IGRhdGEubGVuZ3RoOyBjaSsrKSB7XHJcbiAgICAgICAgYWNjdW11bGF0b3IgKz0gZGF0YVtjaV07XHJcblxyXG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgaXRlbXMubGVuZ3RoOyB4KyspIHtcclxuICAgICAgICAgICAgdmFyIGl0bSA9IGl0ZW1zW3hdO1xyXG4gICAgICAgICAgICBpZiAoZW5kc1dpdGgoYWNjdW11bGF0b3IsIGl0bS5zdGFydCkgJiYgZGVwdGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGRlcHRoID0gMTtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRJdGVtID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0Q2hhcjogaXRtLnN0YXJ0LFxyXG4gICAgICAgICAgICAgICAgICAgIGVuZENoYXI6IGl0bS5lbmQsXHJcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IGNpLyogKyAxKi9cclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50SWQgPSB4O1xyXG4gICAgICAgICAgICAgICAgYWNjdW11bGF0b3IgPSAnJztcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChlbmRzV2l0aChhY2N1bXVsYXRvciwgaXRtLmVuZCkgJiYgZGVwdGggPT09IDEgJiYgY3VycmVudElkID09PSB4KSB7XHJcbiAgICAgICAgICAgICAgICBkZXB0aCA9IDA7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50SXRlbS5lbmQgPSBjaSAtIGl0bS5lbmQubGVuZ3RoICsgMTtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRJZCA9IC0xO1xyXG4gICAgICAgICAgICAgICAgYWNjdW11bGF0b3IgPSAnJztcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGN1cnJlbnRJdGVtKTtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRJdGVtID0ge307XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5leHBvcnRzLmZpbmRQb3NpdGlvbnMgPSBmaW5kUG9zaXRpb25zO1xyXG5cclxuLyoqXHJcbiAqIEZpbmRzIGlmIHRoZSBpbmRleCBpcyBpbnNpZGUgb25lIG9mIHRoZSBpdGVtc1xyXG4gKiBJdGVtcyBzaG91bGQgYmUgaW4gdGhlIHNhbWUgZm9ybWF0IGFzIHJldHVybmVkIGZyb20gdXRpbC5maW5kUG9zaXRpb25zXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBpbmRleCBUaGUgaW5kZXggdG8gY2hlY2tcclxuICogQHBhcmFtIHtBcnJheTx7c3RhcnQ6IE51bWJlciwgZW5kOiBOdW1iZXJ9Pn0gaXRlbXMgVGhlIGl0ZW1zIHRvIHNlYXJjaFxyXG4gKiBAcmV0dXJucyB7Kn0gVGhlIHN0YXJ0L2VuZCBwb3NpdGlvbiBpZiBpbmRleCBpcyBpbnNpZGUgYW4gaXRlbSwgZWxzZSBmYWxzZVxyXG4gKi9cclxuZnVuY3Rpb24gaW5Qb3NpdGlvbihpbmRleCwgaXRlbXMpIHtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgaXRlbSA9IGl0ZW1zW2ldO1xyXG4gICAgICAgIGlmIChpbmRleCA+PSBpdGVtLnN0YXJ0ICYmIGluZGV4IDw9IGl0ZW0uZW5kKSByZXR1cm4gaXRlbTtcclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0cy5pblBvc2l0aW9uID0gaW5Qb3NpdGlvbjtcclxuXHJcbi8qKlxyXG4gKiBGaW5kcyBpZiBkYXRhIGVuZHMgd2l0aCBzdHJcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgVGhlIHRleHQgdG8gc2VhcmNoXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHRleHQgdG8gZmluZFxyXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0gd2hldGhlciBkYXRhIGVuZHMgd2l0aCBzdHJcclxuICovXHJcbmZ1bmN0aW9uIGVuZHNXaXRoKGRhdGEsIHN0cikge1xyXG4gICAgaWYgKGRhdGEubGVuZ3RoIDwgc3RyLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgaWYgKGRhdGEgPT09IHN0cikgcmV0dXJuIHRydWU7XHJcbiAgICByZXR1cm4gZGF0YS5sYXN0SW5kZXhPZihzdHIpID09PSBkYXRhLmxlbmd0aCAtIHN0ci5sZW5ndGg7XHJcbn1cclxuXHJcbmV4cG9ydHMuZW5kc1dpdGggPSBlbmRzV2l0aDtcclxuXHJcbi8qKlxyXG4gKiBQYWRzIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gZGF0YSBUaGUgdGV4dCB0byBwYWRcclxuICogQHBhcmFtIHtOdW1iZXJ9IGxlbmd0aCBUaGUgcGFkZGVkIGxlbmd0aFxyXG4gKiBAcGFyYW0ge1N0cmluZz99IHBhZCBUaGUgdGV4dCB0byBwYWQgd2l0aCwgZGVmYXVsdCBpcyBzcGFjZVxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxyXG4gKi9cclxuZnVuY3Rpb24gcGFkKGRhdGEsIGxlbmd0aCwgcGFkKSB7XHJcbiAgICBkYXRhID0gU3RyaW5nKGRhdGEpO1xyXG4gICAgcGFkID0gcGFkIHx8ICcgJztcclxuICAgIHdoaWxlIChkYXRhLmxlbmd0aCA8IGxlbmd0aCkgZGF0YSArPSBwYWQ7XHJcbiAgICByZXR1cm4gZGF0YTtcclxufVxyXG5cclxuZXhwb3J0cy5wYWQgPSBwYWQ7XHJcblxyXG4vKipcclxuICogU2hhbGxvd2x5IGNsb25lcyB0aGUgb2JqZWN0IGludG8gdGhlIHNvdXJjZSBvYmplY3RcclxuICpcclxuICogQHBhcmFtIHtPYmplY3Q/fSBzb3VyY2UgVGhlIHNvdXJjZSBvYmplY3RcclxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIGNsb25lXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBzb3VyY2Ugb2JqZWN0XHJcbiAqL1xyXG5mdW5jdGlvbiBzaGFsbG93Q2xvbmUoc291cmNlLCBvYmopIHtcclxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgMikge1xyXG4gICAgICAgIG9iaiA9IHNvdXJjZTtcclxuICAgICAgICBzb3VyY2UgPSB7fTtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XHJcbiAgICAgICAgaWYgKCFvYmouaGFzT3duUHJvcGVydHkoa2V5KSkgY29udGludWU7XHJcbiAgICAgICAgc291cmNlW2tleV0gPSBvYmpba2V5XTtcclxuICAgIH1cclxuICAgIHJldHVybiBzb3VyY2U7XHJcbn1cclxuXHJcbmV4cG9ydHMuc2hhbGxvd0Nsb25lID0gc2hhbGxvd0Nsb25lO1xyXG5cclxuLyoqXHJcbiAqIFVzZXMgc2V0SW1tZWRpYXRlIG9yIHNldFRpbWVvdXQgaWYgdW5hdmFpbGFibGVcclxuICovXHJcbmV4cG9ydHMuc2V0SW1tZWRpYXRlID0gKGZ1bmN0aW9uKCkge1xyXG4gICAgaWYgKHR5cGVvZiBzZXRJbW1lZGlhdGUgIT09ICd1bmRlZmluZWQnKSByZXR1cm4gc2V0SW1tZWRpYXRlO1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGZ1bmMpIHtcclxuICAgICAgICBzZXRUaW1lb3V0KGZ1bmMsIDApO1xyXG4gICAgfTtcclxufSgpKTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIHRoZSBjdXJyZW50IGhpZ2gtcmVzb2x1dGlvbiB0aW1lIGluIHNlY29uZHMsIHVzaW5nIHByb2Nlc3MuaHJ0aW1lIG9yIHBlcmZvcm1hbmNlLm5vd1xyXG4gKi9cclxuZXhwb3J0cy5ub3cgPSAoZnVuY3Rpb24oKSB7XHJcbiAgICBpZiAocHJvY2Vzcy5ocnRpbWUpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHZhciB0aW1lID0gcHJvY2Vzcy5ocnRpbWUoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRpbWVbMF0gKyAodGltZVsxXSAvIDFlOSk7XHJcbiAgICAgICAgfTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICB2YXIgbm93ID0gd2luZG93LnBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgICAgICByZXR1cm4gbm93IC8gMTAwMDtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG59KCkpO1xyXG5cclxuLyoqXHJcbiAqIEEgZGVmZXJyZWQgdmFsdWVcclxuICpcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBEZWZlcnJlZFZhbHVlKCkge31cclxuXHJcbi8qKlxyXG4gKiBHZXRzIHRoZSB2YWx1ZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7Kn1cclxuICovXHJcbkRlZmVycmVkVmFsdWUucHJvdG90eXBlLnZhbHVlT2YgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLnZhbHVlO1xyXG59O1xyXG5cclxuZXhwb3J0cy5EZWZlcnJlZFZhbHVlID0gRGVmZXJyZWRWYWx1ZTsiXX0=
