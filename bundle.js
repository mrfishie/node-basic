(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
arguments[4][1][0].apply(exports,arguments)
},{"dup":1}],3:[function(require,module,exports){
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
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff
var rootParent = {}

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
    return arr.foo() === 42 && // typed array instances can be augmented
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
function Buffer (subject, encoding) {
  var self = this
  if (!(self instanceof Buffer)) return new Buffer(subject, encoding)

  var type = typeof subject
  var length

  if (type === 'number') {
    length = +subject
  } else if (type === 'string') {
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) {
    // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data)) subject = subject.data
    length = +subject.length
  } else {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (length > kMaxLength) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum size: 0x' +
      kMaxLength.toString(16) + ' bytes')
  }

  if (length < 0) length = 0
  else length >>>= 0 // coerce to uint32

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    self = Buffer._augment(new Uint8Array(length)) // eslint-disable-line consistent-this
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    self.length = length
    self._isBuffer = true
  }

  var i
  if (Buffer.TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    self._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++) {
        self[i] = subject.readUInt8(i)
      }
    } else {
      for (i = 0; i < length; i++) {
        self[i] = ((subject[i] % 256) + 256) % 256
      }
    }
  } else if (type === 'string') {
    self.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer.TYPED_ARRAY_SUPPORT) {
    for (i = 0; i < length; i++) {
      self[i] = 0
    }
  }

  if (length > 0 && length <= Buffer.poolSize) self.parent = rootParent

  return self
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

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

Buffer.isEncoding = function isEncoding (encoding) {
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

Buffer.concat = function concat (list, totalLength) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

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

Buffer.byteLength = function byteLength (str, encoding) {
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
Buffer.prototype.toString = function toString (encoding, start, end) {
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
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function set (v, offset) {
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
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
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
  var charsWritten = blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
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

  if (length < 0 || offset < 0 || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

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

Buffer.prototype.toJSON = function toJSON () {
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
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
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

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) >>> 0 & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) >>> 0 & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
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

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkInt(
      this, value, offset, byteLength,
      Math.pow(2, 8 * byteLength - 1) - 1,
      -Math.pow(2, 8 * byteLength - 1)
    )
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkInt(
      this, value, offset, byteLength,
      Math.pow(2, 8 * byteLength - 1) - 1,
      -Math.pow(2, 8 * byteLength - 1)
    )
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, target_start, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (target_start >= target.length) target_start = target.length
  if (!target_start) target_start = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (target_start < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - target_start < end - start) {
    end = target.length - target_start + start
  }

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

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
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
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
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
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
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
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
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
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

var INVALID_BASE64_RE = /[^+\/0-9A-z\-]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
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

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []
  var i = 0

  for (; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (leadSurrogate) {
        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          leadSurrogate = codePoint
          continue
        } else {
          // valid surrogate pair
          codePoint = leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00 | 0x10000
          leadSurrogate = null
        }
      } else {
        // no lead yet

        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else {
          // valid lead
          leadSurrogate = codePoint
          continue
        }
      }
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
      leadSurrogate = null
    }

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x200000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
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

},{"base64-js":4,"ieee754":5,"is-array":6}],4:[function(require,module,exports){
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
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
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

},{}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){

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

},{}],7:[function(require,module,exports){
/*global define:false require:false */
module.exports = (function(){
	// Import Events
	var events = require('events')

	// Export Domain
	var domain = {}
	domain.createDomain = domain.create = function(){
		var d = new events.EventEmitter()

		function emitError(e) {
			d.emit('error', e)
		}

		d.add = function(emitter){
			emitter.on('error', emitError)
		}
		d.remove = function(emitter){
			emitter.removeListener('error', emitError)
		}
		d.bind = function(fn){
			return function(){
				var args = Array.prototype.slice.call(arguments)
				try {
					fn.apply(null, args)
				}
				catch (err){
					emitError(err)
				}
			}
		}
		d.intercept = function(fn){
			return function(err){
				if ( err ) {
					emitError(err)
				}
				else {
					var args = Array.prototype.slice.call(arguments, 1)
					try {
						fn.apply(null, args)
					}
					catch (err){
						emitError(err)
					}
				}
			}
		}
		d.run = function(fn){
			try {
				fn()
			}
			catch (err) {
				emitError(err)
			}
			return this
		};
		d.dispose = function(){
			this.removeAllListeners()
			return this
		};
		d.enter = d.exit = function(){
			return this
		}
		return d
	};
	return domain
}).call(this)
},{"events":8}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],11:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;

function drainQueue() {
    if (draining) {
        return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        var i = -1;
        while (++i < len) {
            currentQueue[i]();
        }
        len = queue.length;
    }
    draining = false;
}
process.nextTick = function (fun) {
    queue.push(fun);
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

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
process.umask = function() { return 0; };

},{}],12:[function(require,module,exports){
module.exports = require("./lib/_stream_duplex.js")

},{"./lib/_stream_duplex.js":13}],13:[function(require,module,exports){
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
},{"./_stream_readable":15,"./_stream_writable":17,"_process":11,"core-util-is":18,"inherits":9}],14:[function(require,module,exports){
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

},{"./_stream_transform":16,"core-util-is":18,"inherits":9}],15:[function(require,module,exports){
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


/*<replacement>*/
var debug = require('util');
if (debug && debug.debuglog) {
  debug = debug.debuglog('stream');
} else {
  debug = function () {};
}
/*</replacement>*/


util.inherits(Readable, Stream);

function ReadableState(options, stream) {
  var Duplex = require('./_stream_duplex');

  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var defaultHwm = options.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
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

  if (stream instanceof Duplex)
    this.objectMode = this.objectMode || !!options.readableObjectMode;

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
  var Duplex = require('./_stream_duplex');

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

  if (util.isString(chunk) && !state.objectMode) {
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
  } else if (util.isNullOrUndefined(chunk)) {
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

      if (!addToFront)
        state.reading = false;

      // if we want the data now, just emit it.
      if (state.flowing && state.length === 0 && !state.sync) {
        stream.emit('data', chunk);
        stream.read(0);
      } else {
        // update the buffer info.
        state.length += state.objectMode ? 1 : chunk.length;
        if (addToFront)
          state.buffer.unshift(chunk);
        else
          state.buffer.push(chunk);

        if (state.needReadable)
          emitReadable(stream);
      }

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
  return this;
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

  if (isNaN(n) || util.isNull(n)) {
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
  debug('read', n);
  var state = this._readableState;
  var nOrig = n;

  if (!util.isNumber(n) || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended)
      endReadable(this);
    else
      emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
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
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  }

  if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read pushed data synchronously, then `reading` will be false,
  // and we need to re-evaluate how much data we can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (util.isNull(ret)) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we tried to read() past the EOF, then emit end on the next tick.
  if (nOrig !== n && state.ended && state.length === 0)
    endReadable(this);

  if (!util.isNull(ret))
    this.emit('data', ret);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!util.isBuffer(chunk) &&
      !util.isString(chunk) &&
      !util.isNullOrUndefined(chunk) &&
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

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync)
      process.nextTick(function() {
        emitReadable_(stream);
      });
    else
      emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
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
    debug('maybeReadMore read 0');
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
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

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
    debug('onunpipe');
    if (readable === src) {
      cleanup();
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);
    src.removeListener('data', ondata);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain &&
        (!dest._writableState || dest._writableState.needDrain))
      ondrain();
  }

  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    var ret = dest.write(chunk);
    if (false === ret) {
      debug('false write response, pause',
            src._readableState.awaitDrain);
      src._readableState.awaitDrain++;
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
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
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain)
      state.awaitDrain--;
    if (state.awaitDrain === 0 && EE.listenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
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

  // If listening to data, and it has not explicitly been paused,
  // then call resume to start the flow of data on the next tick.
  if (ev === 'data' && false !== this._readableState.flowing) {
    this.resume();
  }

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        var self = this;
        process.nextTick(function() {
          debug('readable nexttick read 0');
          self.read(0);
        });
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
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    if (!state.reading) {
      debug('resume read 0');
      this.read(0);
    }
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    process.nextTick(function() {
      resume_(stream, state);
    });
  }
}

function resume_(stream, state) {
  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading)
    stream.read(0);
}

Readable.prototype.pause = function() {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  if (state.flowing) {
    do {
      var chunk = stream.read();
    } while (null !== chunk && state.flowing);
  }
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    debug('wrapped data');
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
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
    if (util.isFunction(stream[i]) && util.isUndefined(this[i])) {
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
    debug('wrapped _read', n);
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

  if (!state.endEmitted) {
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
},{"./_stream_duplex":13,"_process":11,"buffer":3,"core-util-is":18,"events":8,"inherits":9,"isarray":10,"stream":23,"string_decoder/":24,"util":2}],16:[function(require,module,exports){
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

  if (!util.isNullOrUndefined(data))
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

  this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('prefinish', function() {
    if (util.isFunction(this._flush))
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

  if (!util.isNull(ts.writechunk) && ts.writecb && !ts.transforming) {
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
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./_stream_duplex":13,"core-util-is":18,"inherits":9}],17:[function(require,module,exports){
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
  var Duplex = require('./_stream_duplex');

  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var defaultHwm = options.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : defaultHwm;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex)
    this.objectMode = this.objectMode || !!options.writableObjectMode;

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

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
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

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

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
  if (!util.isBuffer(chunk) &&
      !util.isString(chunk) &&
      !util.isNullOrUndefined(chunk) &&
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

  if (util.isFunction(encoding)) {
    cb = encoding;
    encoding = null;
  }

  if (util.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (!util.isFunction(cb))
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function() {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function() {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing &&
        !state.corked &&
        !state.finished &&
        !state.bufferProcessing &&
        state.buffer.length)
      clearBuffer(this, state);
  }
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      util.isString(chunk)) {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  if (util.isBuffer(chunk))
    encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret)
    state.needDrain = true;

  if (state.writing || state.corked)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, false, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev)
    stream._writev(chunk, state.onwrite);
  else
    stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    process.nextTick(function() {
      state.pendingcb--;
      cb(er);
    });
  else {
    state.pendingcb--;
    cb(er);
  }

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

    if (!finished &&
        !state.corked &&
        !state.bufferProcessing &&
        state.buffer.length) {
      clearBuffer(stream, state);
    }

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
  state.pendingcb--;
  cb();
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

  if (stream._writev && state.buffer.length > 1) {
    // Fast case, write everything using _writev()
    var cbs = [];
    for (var c = 0; c < state.buffer.length; c++)
      cbs.push(state.buffer[c].callback);

    // count the one we are adding, as well.
    // TODO(isaacs) clean this up
    state.pendingcb++;
    doWrite(stream, state, true, state.length, state.buffer, '', function(err) {
      for (var i = 0; i < cbs.length; i++) {
        state.pendingcb--;
        cbs[i](err);
      }
    });

    // Clear buffer
    state.buffer = [];
  } else {
    // Slow case, write chunks one-by-one
    for (var c = 0; c < state.buffer.length; c++) {
      var entry = state.buffer[c];
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);

      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        c++;
        break;
      }
    }

    if (c < state.buffer.length)
      state.buffer = state.buffer.slice(c);
    else
      state.buffer.length = 0;
  }

  state.bufferProcessing = false;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));

};

Writable.prototype._writev = null;

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (util.isFunction(chunk)) {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (util.isFunction(encoding)) {
    cb = encoding;
    encoding = null;
  }

  if (!util.isNullOrUndefined(chunk))
    this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

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

function prefinish(stream, state) {
  if (!state.prefinished) {
    state.prefinished = true;
    stream.emit('prefinish');
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    if (state.pendingcb === 0) {
      prefinish(stream, state);
      state.finished = true;
      stream.emit('finish');
    } else
      prefinish(stream, state);
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
},{"./_stream_duplex":13,"_process":11,"buffer":3,"core-util-is":18,"inherits":9,"stream":23}],18:[function(require,module,exports){
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
},{"buffer":3}],19:[function(require,module,exports){
module.exports = require("./lib/_stream_passthrough.js")

},{"./lib/_stream_passthrough.js":14}],20:[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = require('stream');
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":13,"./lib/_stream_passthrough.js":14,"./lib/_stream_readable.js":15,"./lib/_stream_transform.js":16,"./lib/_stream_writable.js":17,"stream":23}],21:[function(require,module,exports){
module.exports = require("./lib/_stream_transform.js")

},{"./lib/_stream_transform.js":16}],22:[function(require,module,exports){
module.exports = require("./lib/_stream_writable.js")

},{"./lib/_stream_writable.js":17}],23:[function(require,module,exports){
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

},{"events":8,"inherits":9,"readable-stream/duplex.js":12,"readable-stream/passthrough.js":19,"readable-stream/readable.js":20,"readable-stream/transform.js":21,"readable-stream/writable.js":22}],24:[function(require,module,exports){
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

},{"buffer":3}],25:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],26:[function(require,module,exports){
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
},{"./support/isBuffer":25,"_process":11,"inherits":9}],27:[function(require,module,exports){
(function (process){
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
    if (ast.error) {
        if (done) {
            process.nextTick(function() {
                done(ast.error);
            });
        }
        return ctx;
    }
    try {
        exports.executor.execute(ast, ctx, done);
    } catch (err) {
        done(err);
        return ctx;
    }
    return ctx;
};
}).call(this,require('_process'))
},{"./lib/IOInterface":28,"./lib/executor":31,"./lib/filesystem":34,"./lib/functions":36,"./lib/parser":95,"./lib/repl":127,"./lib/util":128,"_process":11}],28:[function(require,module,exports){
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

    function sendInput(chars, override) {
        if (!running) return;

        if (override) value = chars + ' ';

        for (var i = 0; i < chars.length; i++) {
            var args = [chars[i]];
            if (typeof chars[i] === 'string') {
                if (!override) value += chars[i];
                args.push(value);
            }
            args.push(function() {
                self._input.call(self._data, false);
                running = false;
            });

            callback.apply({}, args);
        }
    }
    sendInput.cancel = function() {
        self._input.call(self._data, false);
        running = false;
    };

    self._input.call(self._data, sendInput);
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
},{"./util":128,"_process":11,"stream":23}],29:[function(require,module,exports){
(function (process){
var functions = require('../functions');
var statements = require('../parser/statements');
var domain = require('domain');
var util = require('util');
var pUtil = require('../util');
var EventEmitter = require('events').EventEmitter;


/**
 * An object that provides modification and reading of the current execution
 * context, as well as the ability to execute an AST in the context
 *
 * @param {Object?} options Options for execution
 * @constructor
 */
function ExecutionContext(options) {
    EventEmitter.call(this);

    this.stringVars = {};
    this.numberVars = {};
    this.pointers = {};
    this.gosubs = [];
    this.private = {
        rnd_seed: Math.random(),
        sprites: [],
        data: []
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

util.inherits(ExecutionContext, EventEmitter);


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
    this.done = function(err) {
        console.log('done!');
        self.emit('terminated', err);
        if (done) done.apply(this, arguments);
    };

    this.error = false;

    this.domain.on('error', function(err) {
        self.error = err;
        self.emit('error', err);
        self.running = false;
        done(err);
    });

    this.domain.run(function() {
        process.nextTick(function() {
            self.nextLine();
        });
    });
};

/**
 * Executes the current cursor line and increments the cursor
 */
ExecutionContext.prototype.nextLine = function() {
    this.emit('beforeLine');
    this.cursor = this.cursor.valueOf();
    if (this.root.length <= this.cursor) this.terminate();
    if (!this.running) {
        this.done(this.error);
        return;
    }

    this.emit('line', this.root[this.cursor]);
    if (this.root.length <= this.cursor) {
        this.terminate();
        this.done();
        return;
    }

    var currentLine = this.root[this.cursor];
    var executionResult = currentLine.execute(this);

    var self = this;
    this.cursor++;

    if (typeof executionResult === 'function') {
        executionResult(function(err) {
            if (err) {
                self.error = new Error(err.message + " on line " + self.cursor);
                self.terminate();
            }
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
 * @param {VariableStatement|FunctionStatement} variable The variable
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

    var isArray, dimensions;

    // Handle an array passed as an argument to a command
    if (variable instanceof statements.FunctionStatement) {
        if (!Array.isArray(map[variable.name])) throw new Error('Invalid operation');
        isArray = true;
        dimensions = variable.args;
    } else {
        isArray = variable.isArray;
        dimensions = variable.dimensions;
    }

    if (isArray) setArrayIndexAt(map[variable.name], dimensions, realValue, this);
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
        if (variable.isArray) {
            return getArrayIndexAt(map[variable.name], variable.dimensions, this);
        }
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
        throw new Error('Unknown function ' + funcName);
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
        try {
            cmd.execute(self, newDone);
        } catch (ex) {
            newDone(ex);
        }
    }
    var cmdDelay = self.options.delay;
    if (cmdDelay !== false) {
        var oldCallFunc = callFunc;
        callFunc = function(newDone) {
            setTimeout(function() {
                oldCallFunc(newDone);
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
    label = label.toLowerCase();
    if (typeof this.labels[label] === 'undefined') throw new Error('Undefined label "' + label + '"');
    this.gosubs.push(this.cursor);
    this.cursor = this.labels[label];
};

/**
 * Goes to a label
 *
 * @param {String} label The name of the label to go to
 */
ExecutionContext.prototype.gotoLabel = function(label) {
    label = label.toLowerCase();
    if (typeof this.labels[label] === 'undefined') throw new Error('Undefined label "' + label + '"');
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
    if (currentDimension < 0) currentDimension = 0;

    if (arr.length <= currentDimension) throw new Error('Invalid array bounds');
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
    currentDimension = Math.max(0, Math.floor(currentDimension - 1));

    if (arr.length <= currentDimension) throw new Error('Invalid array bounds');
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
}).call(this,require('_process'))
},{"../functions":36,"../parser/statements":107,"../util":128,"./constants":30,"_process":11,"domain":7,"events":8,"util":26}],30:[function(require,module,exports){
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
},{"../util":128}],31:[function(require,module,exports){
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
},{"./ExecutionContext":29,"./constants":30}],32:[function(require,module,exports){
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
},{"./":34,"./File":33}],33:[function(require,module,exports){
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
},{}],34:[function(require,module,exports){
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
},{"./Drive":32,"./File":33,"_process":11,"fs":1}],35:[function(require,module,exports){
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
},{"../IOInterface":28}],36:[function(require,module,exports){
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
},{"./graphics":35,"./number":37,"./string":38}],37:[function(require,module,exports){
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
    return Math.atan(a);
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
},{}],38:[function(require,module,exports){
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
},{}],39:[function(require,module,exports){
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
},{"./statements":107}],40:[function(require,module,exports){
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

    if (depth !== 0) {
        throw new SyntaxError(this.startNames[0].toUpperCase() + " without " + this.endNames[0].toUpperCase() + " on line " + (this.start + 1));
    }
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
},{"../SyntaxError":42,"../statements":107}],41:[function(require,module,exports){
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
},{"./Block":40}],42:[function(require,module,exports){
/**
 * An error caused by invalid syntax
 */
function SyntaxError(msg) {
    this.message = msg;
}

SyntaxError.prototype.toString = function() {
    return this.message;
};

module.exports = SyntaxError;
},{}],43:[function(require,module,exports){
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
},{"../../IOInterface":28}],44:[function(require,module,exports){
/**
 * Does nothing, as Javascript doesnt allow disabling of antialiasing
 */
function AntialiasCommand() {}

AntialiasCommand.prototype.execute = function(data, next) { next(); };

module.exports = AntialiasCommand;
},{}],45:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],46:[function(require,module,exports){
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
},{"../../IOInterface":28}],47:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],48:[function(require,module,exports){
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
},{"../../filesystem":34,"../SyntaxError":42,"../statements":107}],49:[function(require,module,exports){
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
},{"../../IOInterface":28,"_process":11}],50:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],51:[function(require,module,exports){
var statements = require('../statements');

/**
 * Pushes data to the stack
 *
 * @param {String} args The arguments to the command
 */
function DataCommand(args) {
    this.items = new statements.ArgumentStatement(args).args;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
DataCommand.prototype.toString = function() {
    return this.items.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
DataCommand.prototype.toJSON = function() {
    return {
        items: this.items
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
DataCommand.prototype.execute = function(data, next) {
    for (var i = 0; i < this.items.length; i++) {
        data.private.data.push(this.items[i].execute(data));
    }
    next();
};

module.exports = DataCommand;
},{"../statements":107}],52:[function(require,module,exports){
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
},{"../SyntaxError":42,"../statements":107}],53:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],54:[function(require,module,exports){
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
    else if (parsed.args.length > 3 && parsed.args.length < 5) throw new SyntaxError('DRAWTEXT command requires 5 arguments');

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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],55:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],56:[function(require,module,exports){
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
},{}],57:[function(require,module,exports){
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
},{"../SyntaxError":42,"../statements":107}],58:[function(require,module,exports){
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
},{"../../IOInterface":28}],59:[function(require,module,exports){
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
},{}],60:[function(require,module,exports){
var statements = require('../statements');
var util = require('../../util');
var SyntaxError = require('../SyntaxError');
var setImmediate = util.setImmediate;

var maxSingleIterations = 200;

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

    this.loopCount = 0;
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

    // To avoid a 'too much recursion' error
    this.loopCount++;
    if (this.loopCount > maxSingleIterations) {
        this.loopCount = 0;
        setImmediate(next);
    } else next();
};

module.exports = ForCommand;
},{"../../util":128,"../SyntaxError":42,"../statements":107}],61:[function(require,module,exports){
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
},{"../../util":128,"../SyntaxError":42}],62:[function(require,module,exports){
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
},{"../../util":128,"../SyntaxError":42}],63:[function(require,module,exports){
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
        end: ['ENDIF', 'RETURN']
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
},{"../../util":128,"../SyntaxError":42,"../statements":107}],64:[function(require,module,exports){
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

    if (!(placeVar.child instanceof statements.VariableStatement || placeVar.child instanceof statements.FunctionStatement))
        throw new SyntaxError('Expected variable');

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
},{"../../IOInterface":28,"../../filesystem":34,"../SyntaxError":42,"../statements":107}],65:[function(require,module,exports){
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

    //if (width < 1) throw new Error('Width out of bounds');
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],66:[function(require,module,exports){
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
},{"../../IOInterface":28,"../../filesystem":34,"../SyntaxError":42,"../statements":107}],67:[function(require,module,exports){
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
},{"../../IOInterface":28}],68:[function(require,module,exports){
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
},{}],69:[function(require,module,exports){
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
},{"../../filesystem":34,"../SyntaxError":42,"../statements":107}],70:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],71:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],72:[function(require,module,exports){
/**
 * TODO
 */
function PlayCommand() {}

PlayCommand.prototype.execute = function(data, next) { next(); };

module.exports = PlayCommand;
},{}],73:[function(require,module,exports){
/**
 * TODO
 */
function PlayspeedCommand() {}

PlayspeedCommand.prototype.execute = function(data, next) { next(); };

module.exports = PlayspeedCommand;
},{}],74:[function(require,module,exports){
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

    //if (size < 1) throw new Error('Size out of bounds');
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],75:[function(require,module,exports){
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
    if (args[args.length - 1] === ";") {
        this.noLine = true;
        args = args.substr(-1);
    } else this.noLine = false;

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
        items: items,
        noLine: this.noLine
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
        } else rl.write(items.join(' ') + (this.noLine ? '' : '\n'));
    }

    next();
};

module.exports = PrintCommand;
},{"../../IOInterface":28,"../../filesystem":34,"../SyntaxError":42,"../statements":107}],76:[function(require,module,exports){
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
},{}],77:[function(require,module,exports){
var statements = require('../statements');
var SyntaxError = require('../SyntaxError');

/**
 * Shifts data from the stack
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function ReadCommand(args) {
    var parsed = new statements.ArgumentStatement(args);
    for (var i = 0; i < parsed.args.length; i++) {
        var placeVar = parsed.args[i];
        if (!(placeVar.child instanceof statements.VariableStatement || placeVar.child instanceof statements.FunctionStatement))
            throw new SyntaxError('Expected variable');
    }
    this.items = parsed.args;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
ReadCommand.prototype.toString = function() {
    return this.items.join(", ");
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
ReadCommand.prototype.toJSON = function() {
    return {
        items: this.items
    };
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
ReadCommand.prototype.execute = function(data, next) {
    for (var i = 0; i < this.items.length; i++) {
        if (!data.private.data.length) throw new Error('No more data');
        var placeVar = this.items[i].child;

        var poppedVal = data.private.data.shift();
        data.setVariable(placeVar, poppedVal);
    }
    next();
};

module.exports = ReadCommand;
},{"../SyntaxError":42,"../statements":107}],78:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],79:[function(require,module,exports){
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
},{"../../IOInterface":28}],80:[function(require,module,exports){
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
},{"../../IOInterface":28}],81:[function(require,module,exports){
var SyntaxError = require('../SyntaxError');
var statements = require('../statements');
var util = require('../../util');
var setImmediate = util.setImmediate;

/**
 * Goes to a label, then returns when a non-DATA command is encountered
 *
 * @param {String} args The arguments to the command
 * @constructor
 */
function RestoreCommand(args) {
    if (!args.length) throw new SyntaxError('Label required');
    this.label = args;
}

/**
 * Converts the command arguments to a string
 *
 * @returns {string}
 */
RestoreCommand.prototype.toString = function() {
    return this.label;
};

/**
 * Converts the command to JSON
 *
 * @returns {Object}
 */
RestoreCommand.prototype.toJSON = function() {
    return {
        label: this.label
    }
};

/**
 * Executes the command
 *
 * @param {ExecutionContext} data
 * @param {Function} next
 */
RestoreCommand.prototype.execute = function(data, next) {
    data.private.data = [];
    data.gosubLabel(this.label);

    var isFirstLine = true;

    function lineEncounter(statement) {
        if (isFirstLine) {
            isFirstLine = false;
            return;
        }

        var isRestoreLine = ((statement instanceof statements.EmptyStatement && statement.type !== 'label') ||
            (statement instanceof statements.CommandStatement && statement.name === 'data'));

        if (!isRestoreLine) {
            data.removeListener('line', lineEncounter);
            data.returnLabel();
            return;
        }

        if (data.root.length <= data.cursor + 1) {
            data.once('beforeLine', function() {
                data.removeListener('line', lineEncounter);
                data.returnLabel();
            });
        }
    }
    data.on('line', lineEncounter);
    next();
};

module.exports = RestoreCommand;
},{"../../util":128,"../SyntaxError":42,"../statements":107}],82:[function(require,module,exports){
/**
 * Does nothing, as retina is not possible on desktop
 */
function RetinaCommand() {}

RetinaCommand.prototype.execute = function(data, next) { next(); };

module.exports = RetinaCommand;
},{}],83:[function(require,module,exports){
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
},{}],84:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],85:[function(require,module,exports){
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
},{"../../filesystem":34,"../SyntaxError":42,"../statements":107}],86:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],87:[function(require,module,exports){
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
},{"../SyntaxError":42,"../statements":107}],88:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],89:[function(require,module,exports){
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
        //if (height <= 0) throw new Error('Height out of bounds');
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],90:[function(require,module,exports){
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
},{"../../IOInterface":28,"../SyntaxError":42,"../statements":107}],91:[function(require,module,exports){
/**
 * TODO
 */
function VolumeCommand() {}

VolumeCommand.prototype.execute = function(data, next) { next(); };

module.exports = VolumeCommand;
},{}],92:[function(require,module,exports){
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
},{}],93:[function(require,module,exports){
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
},{"../../util":128,"../statements":107}],94:[function(require,module,exports){
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
},{"./AccelcalibrateCommand":43,"./AntialiasCommand":44,"./BcolorCommand":45,"./BegindrawCommand":46,"./CircleCommand":47,"./CloseCommand":48,"./ClsCommand":49,"./ColorCommand":50,"./DataCommand":51,"./DimCommand":52,"./DrawspriteCommand":53,"./DrawtextCommand":54,"./EllipseCommand":55,"./ElseCommand":56,"./EndCommand":57,"./EnddrawCommand":58,"./EndifCommand":59,"./ForCommand":60,"./GosubCommand":61,"./GotoCommand":62,"./IfCommand":63,"./InputCommand":64,"./LineCommand":65,"./LoadspriteCommand":66,"./LockorientationCommand":67,"./NextCommand":68,"./OpenCommand":69,"./PauseCommand":70,"./PiechartCommand":71,"./PlayCommand":72,"./PlayspeedCommand":73,"./PointCommand":74,"./PrintCommand":75,"./RandomizeCommand":76,"./ReadCommand":77,"./RectCommand":78,"./RequirelandscapeCommand":79,"./RequireportraitCommand":80,"./RestoreCommand":81,"./RetinaCommand":82,"./ReturnCommand":83,"./RrectCommand":84,"./SavespriteCommand":85,"./ShapeCommand":86,"./SleepCommand":87,"./TcolorCommand":88,"./TextfontCommand":89,"./TriangleCommand":90,"./VolumeCommand":91,"./WendCommand":92,"./WhileCommand":93}],95:[function(require,module,exports){
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

function createLineError(error, line) {
    return new SyntaxError(error.message + ' on line ' + (line + 1));
}

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
            try {
                var line = parseLine(lines[i].trim(), i, labels, false, manager);
                if (line instanceof SyntaxError) throw createLineError(line, i);
                if (line.error instanceof SyntaxError) throw createLineError(line.error, i);
                root[i] = line;
            } catch (ex) {
                throw createLineError(ex, i);
            }
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
    if (line === "") return new EmptyStatement('empty');

    if (line.indexOf("'") === 0 || line.toUpperCase() === "REM" || line.toUpperCase().indexOf("REM ") === 0) {
        return new CommentStatement(line.substring(line.indexOf(" ")).trim());
    }

    var bracketPositions;
    function getPositions(ln) {
        return util.findPositions(ln, [
            { start: '(', end: ')' },
            { start: '"', end: '"' }
        ]);
    }
    bracketPositions = getPositions(line);

    // See if there is a comment
    var startCommentIndex = util.indexOfOutside(line, "'", 0, bracketPositions);
    if (startCommentIndex !== -1) {
        line = line.substring(0, startCommentIndex).trim();
        bracketPositions = getPositions(line);
    }

    // Is it a label?
    if (line[line.length - 1] === ':') {
        var labelName = line.substring(0, line.length - 1).toLowerCase();
        labels[labelName] = i;
        return new EmptyStatement('label');
    }

    if (line.indexOf('END IF') === 0) line = 'ENDIF';

    // Find first space, but only outside of brackets
    var spaceIndex = util.indexOfOutside(line, ' ', 0, bracketPositions);

    // If the line is only a line number
    if (spaceIndex === -1) {
        var parsedLine = parseInt(line);
        if (!notLineNumber && !isNaN(parseInt(line))) {
            labels[line] = i;
            return new EmptyStatement('label');
        }
    }

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
},{"../util":128,"./AbstractSyntaxTree":39,"./Block":41,"./SyntaxError":42,"./commands":94,"./statements":107}],96:[function(require,module,exports){
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
},{"../../util":128,"./":107}],97:[function(require,module,exports){
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
},{}],98:[function(require,module,exports){
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
},{"../SyntaxError":42,"../commands":94}],99:[function(require,module,exports){
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
},{}],100:[function(require,module,exports){
/**
 * An empty statement that does nothing
 *
 * @param {String} type The type of the statement
 * @constructor
 */
function EmptyStatement(type) {
    this.type = type;
}

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
    return {
        type: 'EmptyStatement',
        lineType: this.type
    };
};

/**
 * Executes the comment (i.e does nothing)
 */
EmptyStatement.prototype.execute = function() { };

module.exports = EmptyStatement;
},{}],101:[function(require,module,exports){
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
        var endBracketIndex = data.lastIndexOf(')');
        if (endBracketIndex === -1) throw new SyntaxError('Expected end bracket in ' + data);
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
},{"../../util":128,"../SyntaxError":42,"./":107,"./operators":126}],102:[function(require,module,exports){
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
},{"../../util":128,"./":107}],103:[function(require,module,exports){
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
},{}],104:[function(require,module,exports){
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
},{}],105:[function(require,module,exports){
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
},{}],106:[function(require,module,exports){
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
},{"../SyntaxError":42,"./":107}],107:[function(require,module,exports){
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
},{"./ArgumentStatement":96,"./AssignmentStatement":97,"./CommandStatement":98,"./CommentStatement":99,"./EmptyStatement":100,"./ExpressionStatement":101,"./FunctionStatement":102,"./NumberStatement":103,"./PointerStatement":104,"./StringStatement":105,"./VariableStatement":106,"./operators":126}],108:[function(require,module,exports){
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
},{}],109:[function(require,module,exports){
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
},{}],110:[function(require,module,exports){
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
},{}],111:[function(require,module,exports){
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
},{}],112:[function(require,module,exports){
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
},{}],113:[function(require,module,exports){
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
},{}],114:[function(require,module,exports){
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
},{}],115:[function(require,module,exports){
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
},{}],116:[function(require,module,exports){
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
},{}],117:[function(require,module,exports){
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
},{}],118:[function(require,module,exports){
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
},{}],119:[function(require,module,exports){
/**
 * Requires the first value to not equal the second
 *
 * @param {ExpressionStatement} lexpr Left expression
 * @param {ExpressionStatement} rexpr Right expression
 * @constructor
 */
function NotEqualComparator(lexpr, rexpr) {
    this.lexpr = lexpr;
    this.rexpr = rexpr;
}

/**
 * Converts the operator to executable code
 *
 * @returns {string}
 */
NotEqualComparator.prototype.toString = function() {
    return this.lexpr.toString() + ' <> ' + this.rexpr.toString();
};

/**
 * Converts the operator to JSON
 *
 * @returns {Object}
 */
NotEqualComparator.prototype.toJSON = function() {
    return {
        type: "<>",
        lexpr: this.lexpr.toJSON(),
        rexpr: this.rexpr.toJSON()
    };
};

/**
 * Executes the operator
 *
 * @param {ExecutionContext} data
 * @returns {number} The resulting value
 */
NotEqualComparator.prototype.execute = function(data) {
    console.log('not equal comparator');
    return this.lexpr.execute(data) != this.rexpr.execute(data) ? 1 : 0;
}

module.exports = NotEqualComparator;
},{}],120:[function(require,module,exports){
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
},{}],121:[function(require,module,exports){
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
},{}],122:[function(require,module,exports){
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
},{}],123:[function(require,module,exports){
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

},{}],124:[function(require,module,exports){
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
},{}],125:[function(require,module,exports){
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
},{}],126:[function(require,module,exports){
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
        '<>': require('./NotEqualComparator'),
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
},{"./AdditionOperator":108,"./AndComparator":109,"./AndOperator":110,"./DivisionOperator":111,"./EqualComparator":112,"./GtComparator":113,"./GteComparator":114,"./LtComparator":115,"./LteComparator":116,"./MultiplicationOperator":117,"./NotComparator":118,"./NotEqualComparator":119,"./NotOperator":120,"./OrComparator":121,"./OrOperator":122,"./PowerOperator":123,"./SubtractionOperator":124,"./XorOperator":125}],127:[function(require,module,exports){
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
},{"./IOInterface":28,"./executor/ExecutionContext":29,"./parser/AbstractSyntaxTree":39,"./parser/Block/index":41,"./parser/SyntaxError":42,"./parser/commands/index":94,"./parser/index":95,"./parser/statements/index":107,"fs":1}],128:[function(require,module,exports){
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
 * Finds the last index of the item outside of the given positions
 *
 * @param {String} data The string to search
 * @param {String} item The item to find
 * @param {Number=data.length} index The end index
 * @param {Array<{start: Number, end: Number}>} exclude The boundaries to exclude
 * @returns {Number} The found index, or -1 if none found
 */
function lastIndexOfOutside(data, item, index, exclude) {
    var result, positionResult = {start: index ? index + 1 : data.length + 1, end: 0};

    do {
        result = data.lastIndexOf(item, positionResult.start - 1);
    } while (result.index !== -1 && (positionResult = inPosition(result.index, exclude)));
    return result;
}

exports.lastIndexOfOutside = lastIndexOfOutside;

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
    var rootId = -1;
    var result = [];
    var currentItem = {};

    var accumulator = '';
    for (var ci = 0; ci < data.length; ci++) {
        accumulator += data[ci];

        var matchedItem = false;
        for (var x = 0; x < items.length; x++) {
            var item = items[x];

            if (depth > 0 && endsWith(accumulator, item.end)) {
                depth--;
                if (depth === 0 && rootId === x) {
                    currentItem.end = ci - item.end.length + 1;
                    rootId = -1;
                    accumulator = '';
                    result.push(currentItem);
                    currentItem = {};
                }
            } else if (endsWith(accumulator, item.start)) {
                depth++;
                if (depth === 1 && rootId === -1) {
                    currentItem = {
                        startChar: item.start,
                        endChar: item.end,
                        start: ci
                    };
                    rootId = x;
                    accumulator = '';
                }
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
},{"_process":11}]},{},[27]);
