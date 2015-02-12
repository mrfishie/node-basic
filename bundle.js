(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

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
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data))
      subject = subject.data
    length = +subject.length > 0 ? Math.floor(+subject.length) : 0
  } else
    throw new TypeError('must start with number, buffer, array or string')

  if (length > kMaxLength)
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

  if (length > 0 && length <= Buffer.poolSize)
    buf.parent = rootParent

  return buf
}

function SlowBuffer(subject, encoding, noZero) {
  if (!(this instanceof SlowBuffer))
    return new SlowBuffer(subject, encoding, noZero)

  var buf = new Buffer(subject, encoding, noZero)
  delete buf.parent
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
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
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
  var charsWritten = blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length, 2)
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

  if (length < 0 || offset < 0 || offset > this.length)
    throw new RangeError('attempt to write outside buffer bounds');

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

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length)
    newBuf.parent = this.parent || this

  return newBuf
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

Buffer.prototype.readUIntLE = function (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100))
    val += this[offset + i] * mul

  return val
}

Buffer.prototype.readUIntBE = function (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkOffset(offset, byteLength, this.length)

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100))
    val += this[offset + --byteLength] * mul;

  return val
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

Buffer.prototype.readIntLE = function (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100))
    val += this[offset + i] * mul
  mul *= 0x80

  if (val >= mul)
    val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100))
    val += this[offset + --i] * mul
  mul *= 0x80

  if (val >= mul)
    val -= Math.pow(2, 8 * byteLength)

  return val
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
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100))
    this[offset + i] = (value / mul) >>> 0 & 0xFF

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100))
    this[offset + i] = (value / mul) >>> 0 & 0xFF

  return offset + byteLength
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

Buffer.prototype.writeIntLE = function (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkInt(this,
             value,
             offset,
             byteLength,
             Math.pow(2, 8 * byteLength - 1) - 1,
             -Math.pow(2, 8 * byteLength - 1))
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100))
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkInt(this,
             value,
             offset,
             byteLength,
             Math.pow(2, 8 * byteLength - 1) - 1,
             -Math.pow(2, 8 * byteLength - 1))
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100))
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF

  return offset + byteLength
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
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
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
  if (target_start >= target.length) target_start = target.length
  if (!target_start) target_start = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || source.length === 0) return 0

  // Fatal error conditions
  if (target_start < 0)
    throw new RangeError('targetStart out of bounds')
  if (start < 0 || start >= source.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

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

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
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

function utf8ToBytes(string, units) {
  var codePoint, length = string.length
  var leadSurrogate = null
  units = units || Infinity
  var bytes = []
  var i = 0

  for (; i<length; i++) {
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
        }

        // valid surrogate pair
        else {
          codePoint = leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00 | 0x10000
          leadSurrogate = null
        }
      }

      // no lead yet
      else {

        // unexpected trail
        if (codePoint > 0xDBFF) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // unpaired lead
        else if (i + 1 === length) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        else {
          leadSurrogate = codePoint
          continue
        }
      }
    }

    // valid bmp char, but last char was a lead
    else if (leadSurrogate) {
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
      leadSurrogate = null
    }

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    }
    else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      );
    }
    else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    }
    else if (codePoint < 0x200000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    }
    else {
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

},{"./lib/IOInterface":27,"./lib/executor":30,"./lib/filesystem":33,"./lib/functions":35,"./lib/parser":91,"./lib/repl":122,"./lib/util":123,"_process":10}],27:[function(require,module,exports){
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
                oldCallFunc;
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
    this.message = msg;
}

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

    setImmediate(next);
    //next();
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
            try {
                var line = parseLine(lines[i].trim(), i, labels, false, manager);

                if (line instanceof SyntaxError) throw line;//return {"error": line};
                if (line.error instanceof SyntaxError) throw line.error;//return {"error": line.error};
                root[i] = line;
            } catch (ex) {
                throw new SyntaxError(ex.message + ' on line ' + (i + 1));
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
    if (line === "") return new EmptyStatement();

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
        var labelName = line.substring(0, line.length - 1);
        labels[labelName] = i;
        return new EmptyStatement();
    }

    if (line.indexOf('END IF') === 0) line = 'ENDIF';

    // Find first space, but only outside of brackets
    var spaceIndex = util.indexOfOutside(line, ' ', 0, bracketPositions);

    // If the line is only a line number
    if (spaceIndex === -1) {
        var parsedLine = parseInt(line);
        if (!notLineNumber && !isNaN(parseInt(line))) {
            labels[line] = i;
            return new EmptyStatement();
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

},{"_process":10}]},{},[26])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbGliXFxfZW1wdHkuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXGluZGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnVmZmVyXFxub2RlX21vZHVsZXNcXGJhc2U2NC1qc1xcbGliXFxiNjQuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXG5vZGVfbW9kdWxlc1xcaWVlZTc1NFxcaW5kZXguanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXG5vZGVfbW9kdWxlc1xcaXMtYXJyYXlcXGluZGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcZG9tYWluLWJyb3dzZXJcXGluZGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcZXZlbnRzXFxldmVudHMuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxpbmhlcml0c1xcaW5oZXJpdHNfYnJvd3Nlci5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGlzYXJyYXlcXGluZGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xccHJvY2Vzc1xcYnJvd3Nlci5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHJlYWRhYmxlLXN0cmVhbVxcZHVwbGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xccmVhZGFibGUtc3RyZWFtXFxsaWJcXF9zdHJlYW1fZHVwbGV4LmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xccmVhZGFibGUtc3RyZWFtXFxsaWJcXF9zdHJlYW1fcGFzc3Rocm91Z2guanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxyZWFkYWJsZS1zdHJlYW1cXGxpYlxcX3N0cmVhbV9yZWFkYWJsZS5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHJlYWRhYmxlLXN0cmVhbVxcbGliXFxfc3RyZWFtX3RyYW5zZm9ybS5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHJlYWRhYmxlLXN0cmVhbVxcbGliXFxfc3RyZWFtX3dyaXRhYmxlLmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xccmVhZGFibGUtc3RyZWFtXFxub2RlX21vZHVsZXNcXGNvcmUtdXRpbC1pc1xcbGliXFx1dGlsLmpzIiwiLi5cXC4uXFwuLlxcQXBwRGF0YVxcUm9hbWluZ1xcbnBtXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xccmVhZGFibGUtc3RyZWFtXFxwYXNzdGhyb3VnaC5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHJlYWRhYmxlLXN0cmVhbVxccmVhZGFibGUuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxyZWFkYWJsZS1zdHJlYW1cXHRyYW5zZm9ybS5qcyIsIi4uXFwuLlxcLi5cXEFwcERhdGFcXFJvYW1pbmdcXG5wbVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHJlYWRhYmxlLXN0cmVhbVxcd3JpdGFibGUuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxzdHJlYW0tYnJvd3NlcmlmeVxcaW5kZXguanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxzdHJpbmdfZGVjb2RlclxcaW5kZXguanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFx1dGlsXFxzdXBwb3J0XFxpc0J1ZmZlckJyb3dzZXIuanMiLCIuLlxcLi5cXC4uXFxBcHBEYXRhXFxSb2FtaW5nXFxucG1cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFx1dGlsXFx1dGlsLmpzIiwiaW5kZXguanMiLCJsaWJcXElPSW50ZXJmYWNlLmpzIiwibGliXFxleGVjdXRvclxcRXhlY3V0aW9uQ29udGV4dC5qcyIsImxpYlxcZXhlY3V0b3JcXGNvbnN0YW50cy5qcyIsImxpYlxcZXhlY3V0b3JcXGluZGV4LmpzIiwibGliXFxmaWxlc3lzdGVtXFxEcml2ZS5qcyIsImxpYlxcZmlsZXN5c3RlbVxcRmlsZS5qcyIsImxpYlxcZmlsZXN5c3RlbVxcaW5kZXguanMiLCJsaWJcXGZ1bmN0aW9uc1xcZ3JhcGhpY3MuanMiLCJsaWJcXGZ1bmN0aW9uc1xcaW5kZXguanMiLCJsaWJcXGZ1bmN0aW9uc1xcbnVtYmVyLmpzIiwibGliXFxmdW5jdGlvbnNcXHN0cmluZy5qcyIsImxpYlxccGFyc2VyXFxBYnN0cmFjdFN5bnRheFRyZWUuanMiLCJsaWJcXHBhcnNlclxcQmxvY2tcXEJsb2NrLmpzIiwibGliXFxwYXJzZXJcXEJsb2NrXFxpbmRleC5qcyIsImxpYlxccGFyc2VyXFxTeW50YXhFcnJvci5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcQWNjZWxjYWxpYnJhdGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxBbnRpYWxpYXNDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxCY29sb3JDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxCZWdpbmRyYXdDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxDaXJjbGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxDbG9zZUNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXENsc0NvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXENvbG9yQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcRGltQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcRHJhd3Nwcml0ZUNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXERyYXd0ZXh0Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcRWxsaXBzZUNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXEVsc2VDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxFbmRDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxFbmRkcmF3Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcRW5kaWZDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxGb3JDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxHb3N1YkNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXEdvdG9Db21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxJZkNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXElucHV0Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcTGluZUNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXExvYWRzcHJpdGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxMb2Nrb3JpZW50YXRpb25Db21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxOZXh0Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcT3BlbkNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXFBhdXNlQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUGllY2hhcnRDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxQbGF5Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUGxheXNwZWVkQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUG9pbnRDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxQcmludENvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXFJhbmRvbWl6ZUNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXFJlY3RDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxSZXF1aXJlbGFuZHNjYXBlQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUmVxdWlyZXBvcnRyYWl0Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUmV0aW5hQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUmV0dXJuQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcUnJlY3RDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxTYXZlc3ByaXRlQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcU2hhcGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxTbGVlcENvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXFRjb2xvckNvbW1hbmQuanMiLCJsaWJcXHBhcnNlclxcY29tbWFuZHNcXFRleHRmb250Q29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcVHJpYW5nbGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxWb2x1bWVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxXZW5kQ29tbWFuZC5qcyIsImxpYlxccGFyc2VyXFxjb21tYW5kc1xcV2hpbGVDb21tYW5kLmpzIiwibGliXFxwYXJzZXJcXGNvbW1hbmRzXFxpbmRleC5qcyIsImxpYlxccGFyc2VyXFxpbmRleC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxBcmd1bWVudFN0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxBc3NpZ25tZW50U3RhdGVtZW50LmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXENvbW1hbmRTdGF0ZW1lbnQuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcQ29tbWVudFN0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxFbXB0eVN0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxFeHByZXNzaW9uU3RhdGVtZW50LmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXEZ1bmN0aW9uU3RhdGVtZW50LmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXE51bWJlclN0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxQb2ludGVyU3RhdGVtZW50LmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXFN0cmluZ1N0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxWYXJpYWJsZVN0YXRlbWVudC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxpbmRleC5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxvcGVyYXRvcnNcXEFkZGl0aW9uT3BlcmF0b3IuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcb3BlcmF0b3JzXFxBbmRDb21wYXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcQW5kT3BlcmF0b3IuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcb3BlcmF0b3JzXFxEaXZpc2lvbk9wZXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcRXF1YWxDb21wYXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcR3RDb21wYXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcR3RlQ29tcGFyYXRvci5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxvcGVyYXRvcnNcXEx0Q29tcGFyYXRvci5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxvcGVyYXRvcnNcXEx0ZUNvbXBhcmF0b3IuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcb3BlcmF0b3JzXFxNdWx0aXBsaWNhdGlvbk9wZXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcTm90Q29tcGFyYXRvci5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxvcGVyYXRvcnNcXE5vdE9wZXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcT3JDb21wYXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcT3JPcGVyYXRvci5qcyIsImxpYlxccGFyc2VyXFxzdGF0ZW1lbnRzXFxvcGVyYXRvcnNcXFBvd2VyT3BlcmF0b3IuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcb3BlcmF0b3JzXFxTdWJ0cmFjdGlvbk9wZXJhdG9yLmpzIiwibGliXFxwYXJzZXJcXHN0YXRlbWVudHNcXG9wZXJhdG9yc1xcWG9yT3BlcmF0b3IuanMiLCJsaWJcXHBhcnNlclxcc3RhdGVtZW50c1xcb3BlcmF0b3JzXFxpbmRleC5qcyIsImxpYlxccmVwbC5qcyIsImxpYlxcdXRpbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNweUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7OztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3Q5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ2xOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDbFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMxR0E7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTs7QUNEQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQzFrQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM1T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUMzRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNySEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNqTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIixudWxsLCIvKiFcbiAqIFRoZSBidWZmZXIgbW9kdWxlIGZyb20gbm9kZS5qcywgZm9yIHRoZSBicm93c2VyLlxuICpcbiAqIEBhdXRob3IgICBGZXJvc3MgQWJvdWtoYWRpamVoIDxmZXJvc3NAZmVyb3NzLm9yZz4gPGh0dHA6Ly9mZXJvc3Mub3JnPlxuICogQGxpY2Vuc2UgIE1JVFxuICovXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcbnZhciBpc0FycmF5ID0gcmVxdWlyZSgnaXMtYXJyYXknKVxuXG5leHBvcnRzLkJ1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5TbG93QnVmZmVyID0gU2xvd0J1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyIC8vIG5vdCB1c2VkIGJ5IHRoaXMgaW1wbGVtZW50YXRpb25cblxudmFyIGtNYXhMZW5ndGggPSAweDNmZmZmZmZmXG52YXIgcm9vdFBhcmVudCA9IHt9XG5cbi8qKlxuICogSWYgYEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUYDpcbiAqICAgPT09IHRydWUgICAgVXNlIFVpbnQ4QXJyYXkgaW1wbGVtZW50YXRpb24gKGZhc3Rlc3QpXG4gKiAgID09PSBmYWxzZSAgIFVzZSBPYmplY3QgaW1wbGVtZW50YXRpb24gKG1vc3QgY29tcGF0aWJsZSwgZXZlbiBJRTYpXG4gKlxuICogQnJvd3NlcnMgdGhhdCBzdXBwb3J0IHR5cGVkIGFycmF5cyBhcmUgSUUgMTArLCBGaXJlZm94IDQrLCBDaHJvbWUgNyssIFNhZmFyaSA1LjErLFxuICogT3BlcmEgMTEuNissIGlPUyA0LjIrLlxuICpcbiAqIE5vdGU6XG4gKlxuICogLSBJbXBsZW1lbnRhdGlvbiBtdXN0IHN1cHBvcnQgYWRkaW5nIG5ldyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXMuXG4gKiAgIEZpcmVmb3ggNC0yOSBsYWNrZWQgc3VwcG9ydCwgZml4ZWQgaW4gRmlyZWZveCAzMCsuXG4gKiAgIFNlZTogaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9Njk1NDM4LlxuICpcbiAqICAtIENocm9tZSA5LTEwIGlzIG1pc3NpbmcgdGhlIGBUeXBlZEFycmF5LnByb3RvdHlwZS5zdWJhcnJheWAgZnVuY3Rpb24uXG4gKlxuICogIC0gSUUxMCBoYXMgYSBicm9rZW4gYFR5cGVkQXJyYXkucHJvdG90eXBlLnN1YmFycmF5YCBmdW5jdGlvbiB3aGljaCByZXR1cm5zIGFycmF5cyBvZlxuICogICAgaW5jb3JyZWN0IGxlbmd0aCBpbiBzb21lIHNpdHVhdGlvbnMuXG4gKlxuICogV2UgZGV0ZWN0IHRoZXNlIGJ1Z2d5IGJyb3dzZXJzIGFuZCBzZXQgYEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUYCB0byBgZmFsc2VgIHNvIHRoZXkgd2lsbFxuICogZ2V0IHRoZSBPYmplY3QgaW1wbGVtZW50YXRpb24sIHdoaWNoIGlzIHNsb3dlciBidXQgd2lsbCB3b3JrIGNvcnJlY3RseS5cbiAqL1xuQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQgPSAoZnVuY3Rpb24gKCkge1xuICB0cnkge1xuICAgIHZhciBidWYgPSBuZXcgQXJyYXlCdWZmZXIoMClcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoYnVmKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgcmV0dXJuIDQyID09PSBhcnIuZm9vKCkgJiYgLy8gdHlwZWQgYXJyYXkgaW5zdGFuY2VzIGNhbiBiZSBhdWdtZW50ZWRcbiAgICAgICAgdHlwZW9mIGFyci5zdWJhcnJheSA9PT0gJ2Z1bmN0aW9uJyAmJiAvLyBjaHJvbWUgOS0xMCBsYWNrIGBzdWJhcnJheWBcbiAgICAgICAgbmV3IFVpbnQ4QXJyYXkoMSkuc3ViYXJyYXkoMSwgMSkuYnl0ZUxlbmd0aCA9PT0gMCAvLyBpZTEwIGhhcyBicm9rZW4gYHN1YmFycmF5YFxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn0pKClcblxuLyoqXG4gKiBDbGFzczogQnVmZmVyXG4gKiA9PT09PT09PT09PT09XG4gKlxuICogVGhlIEJ1ZmZlciBjb25zdHJ1Y3RvciByZXR1cm5zIGluc3RhbmNlcyBvZiBgVWludDhBcnJheWAgdGhhdCBhcmUgYXVnbWVudGVkXG4gKiB3aXRoIGZ1bmN0aW9uIHByb3BlcnRpZXMgZm9yIGFsbCB0aGUgbm9kZSBgQnVmZmVyYCBBUEkgZnVuY3Rpb25zLiBXZSB1c2VcbiAqIGBVaW50OEFycmF5YCBzbyB0aGF0IHNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0IHJldHVybnNcbiAqIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIEJ5IGF1Z21lbnRpbmcgdGhlIGluc3RhbmNlcywgd2UgY2FuIGF2b2lkIG1vZGlmeWluZyB0aGUgYFVpbnQ4QXJyYXlgXG4gKiBwcm90b3R5cGUuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlciAoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQnVmZmVyKSlcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKVxuXG4gIHZhciB0eXBlID0gdHlwZW9mIHN1YmplY3RcblxuICAvLyBGaW5kIHRoZSBsZW5ndGhcbiAgdmFyIGxlbmd0aFxuICBpZiAodHlwZSA9PT0gJ251bWJlcicpXG4gICAgbGVuZ3RoID0gc3ViamVjdCA+IDAgPyBzdWJqZWN0ID4+PiAwIDogMFxuICBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgIGxlbmd0aCA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHN1YmplY3QsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnICYmIHN1YmplY3QgIT09IG51bGwpIHsgLy8gYXNzdW1lIG9iamVjdCBpcyBhcnJheS1saWtlXG4gICAgaWYgKHN1YmplY3QudHlwZSA9PT0gJ0J1ZmZlcicgJiYgaXNBcnJheShzdWJqZWN0LmRhdGEpKVxuICAgICAgc3ViamVjdCA9IHN1YmplY3QuZGF0YVxuICAgIGxlbmd0aCA9ICtzdWJqZWN0Lmxlbmd0aCA+IDAgPyBNYXRoLmZsb29yKCtzdWJqZWN0Lmxlbmd0aCkgOiAwXG4gIH0gZWxzZVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ211c3Qgc3RhcnQgd2l0aCBudW1iZXIsIGJ1ZmZlciwgYXJyYXkgb3Igc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4ga01heExlbmd0aClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQXR0ZW1wdCB0byBhbGxvY2F0ZSBCdWZmZXIgbGFyZ2VyIHRoYW4gbWF4aW11bSAnICtcbiAgICAgICdzaXplOiAweCcgKyBrTWF4TGVuZ3RoLnRvU3RyaW5nKDE2KSArICcgYnl0ZXMnKVxuXG4gIHZhciBidWZcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgLy8gUHJlZmVycmVkOiBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGJ1ZiA9IEJ1ZmZlci5fYXVnbWVudChuZXcgVWludDhBcnJheShsZW5ndGgpKVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gVEhJUyBpbnN0YW5jZSBvZiBCdWZmZXIgKGNyZWF0ZWQgYnkgYG5ld2ApXG4gICAgYnVmID0gdGhpc1xuICAgIGJ1Zi5sZW5ndGggPSBsZW5ndGhcbiAgICBidWYuX2lzQnVmZmVyID0gdHJ1ZVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUICYmIHR5cGVvZiBzdWJqZWN0LmJ5dGVMZW5ndGggPT09ICdudW1iZXInKSB7XG4gICAgLy8gU3BlZWQgb3B0aW1pemF0aW9uIC0tIHVzZSBzZXQgaWYgd2UncmUgY29weWluZyBmcm9tIGEgdHlwZWQgYXJyYXlcbiAgICBidWYuX3NldChzdWJqZWN0KVxuICB9IGVsc2UgaWYgKGlzQXJyYXlpc2goc3ViamVjdCkpIHtcbiAgICAvLyBUcmVhdCBhcnJheS1pc2ggb2JqZWN0cyBhcyBhIGJ5dGUgYXJyYXlcbiAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpKSB7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3QucmVhZFVJbnQ4KGkpXG4gICAgfSBlbHNlIHtcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKylcbiAgICAgICAgYnVmW2ldID0gKChzdWJqZWN0W2ldICUgMjU2KSArIDI1NikgJSAyNTZcbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBidWYud3JpdGUoc3ViamVjdCwgMCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgIUJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUICYmICFub1plcm8pIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGJ1ZltpXSA9IDBcbiAgICB9XG4gIH1cblxuICBpZiAobGVuZ3RoID4gMCAmJiBsZW5ndGggPD0gQnVmZmVyLnBvb2xTaXplKVxuICAgIGJ1Zi5wYXJlbnQgPSByb290UGFyZW50XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG5mdW5jdGlvbiBTbG93QnVmZmVyKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNsb3dCdWZmZXIpKVxuICAgIHJldHVybiBuZXcgU2xvd0J1ZmZlcihzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pXG4gIGRlbGV0ZSBidWYucGFyZW50XG4gIHJldHVybiBidWZcbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gKGIpIHtcbiAgcmV0dXJuICEhKGIgIT0gbnVsbCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmNvbXBhcmUgPSBmdW5jdGlvbiAoYSwgYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihhKSB8fCAhQnVmZmVyLmlzQnVmZmVyKGIpKVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyBtdXN0IGJlIEJ1ZmZlcnMnKVxuXG4gIHZhciB4ID0gYS5sZW5ndGhcbiAgdmFyIHkgPSBiLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMCwgbGVuID0gTWF0aC5taW4oeCwgeSk7IGkgPCBsZW4gJiYgYVtpXSA9PT0gYltpXTsgaSsrKSB7fVxuICBpZiAoaSAhPT0gbGVuKSB7XG4gICAgeCA9IGFbaV1cbiAgICB5ID0gYltpXVxuICB9XG4gIGlmICh4IDwgeSkgcmV0dXJuIC0xXG4gIGlmICh5IDwgeCkgcmV0dXJuIDFcbiAgcmV0dXJuIDBcbn1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiAobGlzdCwgdG90YWxMZW5ndGgpIHtcbiAgaWYgKCFpc0FycmF5KGxpc3QpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdVc2FnZTogQnVmZmVyLmNvbmNhdChsaXN0WywgbGVuZ3RoXSknKVxuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKDApXG4gIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gbGlzdFswXVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKHRvdGFsTGVuZ3RoID09PSB1bmRlZmluZWQpIHtcbiAgICB0b3RhbExlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgdG90YWxMZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcih0b3RhbExlbmd0aClcbiAgdmFyIHBvcyA9IDBcbiAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaXRlbSA9IGxpc3RbaV1cbiAgICBpdGVtLmNvcHkoYnVmLCBwb3MpXG4gICAgcG9zICs9IGl0ZW0ubGVuZ3RoXG4gIH1cbiAgcmV0dXJuIGJ1ZlxufVxuXG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGZ1bmN0aW9uIChzdHIsIGVuY29kaW5nKSB7XG4gIHZhciByZXRcbiAgc3RyID0gc3RyICsgJydcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdyYXcnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAqIDJcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggPj4+IDFcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IGJhc2U2NFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGhcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbi8vIHByZS1zZXQgZm9yIHZhbHVlcyB0aGF0IG1heSBleGlzdCBpbiB0aGUgZnV0dXJlXG5CdWZmZXIucHJvdG90eXBlLmxlbmd0aCA9IHVuZGVmaW5lZFxuQnVmZmVyLnByb3RvdHlwZS5wYXJlbnQgPSB1bmRlZmluZWRcblxuLy8gdG9TdHJpbmcoZW5jb2RpbmcsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgbG93ZXJlZENhc2UgPSBmYWxzZVxuXG4gIHN0YXJ0ID0gc3RhcnQgPj4+IDBcbiAgZW5kID0gZW5kID09PSB1bmRlZmluZWQgfHwgZW5kID09PSBJbmZpbml0eSA/IHRoaXMubGVuZ3RoIDogZW5kID4+PiAwXG5cbiAgaWYgKCFlbmNvZGluZykgZW5jb2RpbmcgPSAndXRmOCdcbiAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKGVuZCA8PSBzdGFydCkgcmV0dXJuICcnXG5cbiAgd2hpbGUgKHRydWUpIHtcbiAgICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgICBjYXNlICdoZXgnOlxuICAgICAgICByZXR1cm4gaGV4U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAndXRmOCc6XG4gICAgICBjYXNlICd1dGYtOCc6XG4gICAgICAgIHJldHVybiB1dGY4U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYXNjaWknOlxuICAgICAgICByZXR1cm4gYXNjaWlTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdiaW5hcnknOlxuICAgICAgICByZXR1cm4gYmluYXJ5U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgICAgcmV0dXJuIGJhc2U2NFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ3VjczInOlxuICAgICAgY2FzZSAndWNzLTInOlxuICAgICAgY2FzZSAndXRmMTZsZSc6XG4gICAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICAgIHJldHVybiB1dGYxNmxlU2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGxvd2VyZWRDYXNlKVxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1Vua25vd24gZW5jb2Rpbmc6ICcgKyBlbmNvZGluZylcbiAgICAgICAgZW5jb2RpbmcgPSAoZW5jb2RpbmcgKyAnJykudG9Mb3dlckNhc2UoKVxuICAgICAgICBsb3dlcmVkQ2FzZSA9IHRydWVcbiAgICB9XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5lcXVhbHMgPSBmdW5jdGlvbiAoYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnQgbXVzdCBiZSBhIEJ1ZmZlcicpXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKSA9PT0gMFxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzdHIgPSAnJ1xuICB2YXIgbWF4ID0gZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFU1xuICBpZiAodGhpcy5sZW5ndGggPiAwKSB7XG4gICAgc3RyID0gdGhpcy50b1N0cmluZygnaGV4JywgMCwgbWF4KS5tYXRjaCgvLnsyfS9nKS5qb2luKCcgJylcbiAgICBpZiAodGhpcy5sZW5ndGggPiBtYXgpXG4gICAgICBzdHIgKz0gJyAuLi4gJ1xuICB9XG4gIHJldHVybiAnPEJ1ZmZlciAnICsgc3RyICsgJz4nXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uIChiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGEgQnVmZmVyJylcbiAgcmV0dXJuIEJ1ZmZlci5jb21wYXJlKHRoaXMsIGIpXG59XG5cbi8vIGBnZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uICh2LCBvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5zZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLndyaXRlVUludDgodiwgb2Zmc2V0KVxufVxuXG5mdW5jdGlvbiBoZXhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IGJ1Zi5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuXG4gIC8vIG11c3QgYmUgYW4gZXZlbiBudW1iZXIgb2YgZGlnaXRzXG4gIHZhciBzdHJMZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGlmIChzdHJMZW4gJSAyICE9PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaGV4IHN0cmluZycpXG5cbiAgaWYgKGxlbmd0aCA+IHN0ckxlbiAvIDIpIHtcbiAgICBsZW5ndGggPSBzdHJMZW4gLyAyXG4gIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHZhciBieXRlID0gcGFyc2VJbnQoc3RyaW5nLnN1YnN0cihpICogMiwgMiksIDE2KVxuICAgIGlmIChpc05hTihieXRlKSkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleCBzdHJpbmcnKVxuICAgIGJ1ZltvZmZzZXQgKyBpXSA9IGJ5dGVcbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiB1dGY4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcsIGJ1Zi5sZW5ndGggLSBvZmZzZXQpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIGFzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gYmxpdEJ1ZmZlcihhc2NpaVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBiaW5hcnlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBhc2NpaVdyaXRlKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gYmFzZTY0V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gYmxpdEJ1ZmZlcihiYXNlNjRUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gdXRmMTZsZVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIodXRmMTZsZVRvQnl0ZXMoc3RyaW5nLCBidWYubGVuZ3RoIC0gb2Zmc2V0KSwgYnVmLCBvZmZzZXQsIGxlbmd0aCwgMilcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIFN1cHBvcnQgYm90aCAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpXG4gIC8vIGFuZCB0aGUgbGVnYWN5IChzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgaWYgKGlzRmluaXRlKG9mZnNldCkpIHtcbiAgICBpZiAoIWlzRmluaXRlKGxlbmd0aCkpIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIH0gZWxzZSB7ICAvLyBsZWdhY3lcbiAgICB2YXIgc3dhcCA9IGVuY29kaW5nXG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBvZmZzZXQgPSBsZW5ndGhcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG5cbiAgaWYgKGxlbmd0aCA8IDAgfHwgb2Zmc2V0IDwgMCB8fCBvZmZzZXQgPiB0aGlzLmxlbmd0aClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignYXR0ZW1wdCB0byB3cml0ZSBvdXRzaWRlIGJ1ZmZlciBib3VuZHMnKTtcblxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IGFzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IGJpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gdXRmMTZsZVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG5mdW5jdGlvbiBiYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIGFzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldICYgMHg3RilcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIGJpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIGhleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpICsgMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gfn5zdGFydFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCA/IGxlbiA6IH5+ZW5kXG5cbiAgaWYgKHN0YXJ0IDwgMCkge1xuICAgIHN0YXJ0ICs9IGxlbjtcbiAgICBpZiAoc3RhcnQgPCAwKVxuICAgICAgc3RhcnQgPSAwXG4gIH0gZWxzZSBpZiAoc3RhcnQgPiBsZW4pIHtcbiAgICBzdGFydCA9IGxlblxuICB9XG5cbiAgaWYgKGVuZCA8IDApIHtcbiAgICBlbmQgKz0gbGVuXG4gICAgaWYgKGVuZCA8IDApXG4gICAgICBlbmQgPSAwXG4gIH0gZWxzZSBpZiAoZW5kID4gbGVuKSB7XG4gICAgZW5kID0gbGVuXG4gIH1cblxuICBpZiAoZW5kIDwgc3RhcnQpXG4gICAgZW5kID0gc3RhcnRcblxuICB2YXIgbmV3QnVmXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIG5ld0J1ZiA9IEJ1ZmZlci5fYXVnbWVudCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpKVxuICB9IGVsc2Uge1xuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICB9XG5cbiAgaWYgKG5ld0J1Zi5sZW5ndGgpXG4gICAgbmV3QnVmLnBhcmVudCA9IHRoaXMucGFyZW50IHx8IHRoaXNcblxuICByZXR1cm4gbmV3QnVmXG59XG5cbi8qXG4gKiBOZWVkIHRvIG1ha2Ugc3VyZSB0aGF0IGJ1ZmZlciBpc24ndCB0cnlpbmcgdG8gd3JpdGUgb3V0IG9mIGJvdW5kcy5cbiAqL1xuZnVuY3Rpb24gY2hlY2tPZmZzZXQgKG9mZnNldCwgZXh0LCBsZW5ndGgpIHtcbiAgaWYgKChvZmZzZXQgJSAxKSAhPT0gMCB8fCBvZmZzZXQgPCAwKVxuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdvZmZzZXQgaXMgbm90IHVpbnQnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gbGVuZ3RoKVxuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdUcnlpbmcgdG8gYWNjZXNzIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludExFID0gZnVuY3Rpb24gKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoLCB0aGlzLmxlbmd0aClcblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXRdXG4gIHZhciBtdWwgPSAxXG4gIHZhciBpID0gMFxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSlcbiAgICB2YWwgKz0gdGhpc1tvZmZzZXQgKyBpXSAqIG11bFxuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludEJFID0gZnVuY3Rpb24gKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoLCB0aGlzLmxlbmd0aClcblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXQgKyAtLWJ5dGVMZW5ndGhdXG4gIHZhciBtdWwgPSAxXG4gIHdoaWxlIChieXRlTGVuZ3RoID4gMCAmJiAobXVsICo9IDB4MTAwKSlcbiAgICB2YWwgKz0gdGhpc1tvZmZzZXQgKyAtLWJ5dGVMZW5ndGhdICogbXVsO1xuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMSwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiB0aGlzW29mZnNldF0gfCAodGhpc1tvZmZzZXQgKyAxXSA8PCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuICh0aGlzW29mZnNldF0gPDwgOCkgfCB0aGlzW29mZnNldCArIDFdXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAoKHRoaXNbb2Zmc2V0XSkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgMTYpKSArXG4gICAgICAodGhpc1tvZmZzZXQgKyAzXSAqIDB4MTAwMDAwMClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG5cbiAgcmV0dXJuICh0aGlzW29mZnNldF0gKiAweDEwMDAwMDApICtcbiAgICAgICgodGhpc1tvZmZzZXQgKyAxXSA8PCAxNikgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgOCkgfFxuICAgICAgdGhpc1tvZmZzZXQgKyAzXSlcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIGJ5dGVMZW5ndGgsIHRoaXMubGVuZ3RoKVxuXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldF1cbiAgdmFyIG11bCA9IDFcbiAgdmFyIGkgPSAwXG4gIHdoaWxlICgrK2kgPCBieXRlTGVuZ3RoICYmIChtdWwgKj0gMHgxMDApKVxuICAgIHZhbCArPSB0aGlzW29mZnNldCArIGldICogbXVsXG4gIG11bCAqPSAweDgwXG5cbiAgaWYgKHZhbCA+PSBtdWwpXG4gICAgdmFsIC09IE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKVxuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIGJ5dGVMZW5ndGgsIHRoaXMubGVuZ3RoKVxuXG4gIHZhciBpID0gYnl0ZUxlbmd0aFxuICB2YXIgbXVsID0gMVxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXQgKyAtLWldXG4gIHdoaWxlIChpID4gMCAmJiAobXVsICo9IDB4MTAwKSlcbiAgICB2YWwgKz0gdGhpc1tvZmZzZXQgKyAtLWldICogbXVsXG4gIG11bCAqPSAweDgwXG5cbiAgaWYgKHZhbCA+PSBtdWwpXG4gICAgdmFsIC09IE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKVxuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAxLCB0aGlzLmxlbmd0aClcbiAgaWYgKCEodGhpc1tvZmZzZXRdICYgMHg4MCkpXG4gICAgcmV0dXJuICh0aGlzW29mZnNldF0pXG4gIHJldHVybiAoKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXRdIHwgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOClcbiAgcmV0dXJuICh2YWwgJiAweDgwMDApID8gdmFsIHwgMHhGRkZGMDAwMCA6IHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXQgKyAxXSB8ICh0aGlzW29mZnNldF0gPDwgOClcbiAgcmV0dXJuICh2YWwgJiAweDgwMDApID8gdmFsIHwgMHhGRkZGMDAwMCA6IHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdKSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCA4KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCAxNikgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgM10gPDwgMjQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG5cbiAgcmV0dXJuICh0aGlzW29mZnNldF0gPDwgMjQpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDFdIDw8IDE2KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCA4KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAzXSlcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIHRydWUsIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdEJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgZmFsc2UsIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA4LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIHRydWUsIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA4LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIGZhbHNlLCA1MiwgOClcbn1cblxuZnVuY3Rpb24gY2hlY2tJbnQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgZXh0LCBtYXgsIG1pbikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihidWYpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdidWZmZXIgbXVzdCBiZSBhIEJ1ZmZlciBpbnN0YW5jZScpXG4gIGlmICh2YWx1ZSA+IG1heCB8fCB2YWx1ZSA8IG1pbikgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3ZhbHVlIGlzIG91dCBvZiBib3VuZHMnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gYnVmLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ2luZGV4IG91dCBvZiByYW5nZScpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGgpLCAwKVxuXG4gIHZhciBtdWwgPSAxXG4gIHZhciBpID0gMFxuICB0aGlzW29mZnNldF0gPSB2YWx1ZSAmIDB4RkZcbiAgd2hpbGUgKCsraSA8IGJ5dGVMZW5ndGggJiYgKG11bCAqPSAweDEwMCkpXG4gICAgdGhpc1tvZmZzZXQgKyBpXSA9ICh2YWx1ZSAvIG11bCkgPj4+IDAgJiAweEZGXG5cbiAgcmV0dXJuIG9mZnNldCArIGJ5dGVMZW5ndGhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnRCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCksIDApXG5cbiAgdmFyIGkgPSBieXRlTGVuZ3RoIC0gMVxuICB2YXIgbXVsID0gMVxuICB0aGlzW29mZnNldCArIGldID0gdmFsdWUgJiAweEZGXG4gIHdoaWxlICgtLWkgPj0gMCAmJiAobXVsICo9IDB4MTAwKSlcbiAgICB0aGlzW29mZnNldCArIGldID0gKHZhbHVlIC8gbXVsKSA+Pj4gMCAmIDB4RkZcblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMSwgMHhmZiwgMClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICByZXR1cm4gb2Zmc2V0ICsgMVxufVxuXG5mdW5jdGlvbiBvYmplY3RXcml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmZmYgKyB2YWx1ZSArIDFcbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihidWYubGVuZ3RoIC0gb2Zmc2V0LCAyKTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9ICh2YWx1ZSAmICgweGZmIDw8ICg4ICogKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkpKSkgPj4+XG4gICAgICAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSAqIDhcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHhmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHhmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9IHZhbHVlXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuZnVuY3Rpb24gb2JqZWN0V3JpdGVVSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGJ1Zi5sZW5ndGggLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID0gKHZhbHVlID4+PiAobGl0dGxlRW5kaWFuID8gaSA6IDMgLSBpKSAqIDgpICYgMHhmZlxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweGZmZmZmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldCArIDNdID0gKHZhbHVlID4+PiAyNClcbiAgICB0aGlzW29mZnNldCArIDJdID0gKHZhbHVlID4+PiAxNilcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHhmZmZmZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiAyNClcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiAxNilcbiAgICB0aGlzW29mZnNldCArIDJdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSB2YWx1ZVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnRMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrSW50KHRoaXMsXG4gICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICAgb2Zmc2V0LFxuICAgICAgICAgICAgIGJ5dGVMZW5ndGgsXG4gICAgICAgICAgICAgTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGggLSAxKSAtIDEsXG4gICAgICAgICAgICAgLU1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoIC0gMSkpXG4gIH1cblxuICB2YXIgaSA9IDBcbiAgdmFyIG11bCA9IDFcbiAgdmFyIHN1YiA9IHZhbHVlIDwgMCA/IDEgOiAwXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSlcbiAgICB0aGlzW29mZnNldCArIGldID0gKCh2YWx1ZSAvIG11bCkgPj4gMCkgLSBzdWIgJiAweEZGXG5cbiAgcmV0dXJuIG9mZnNldCArIGJ5dGVMZW5ndGhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgY2hlY2tJbnQodGhpcyxcbiAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgICBvZmZzZXQsXG4gICAgICAgICAgICAgYnl0ZUxlbmd0aCxcbiAgICAgICAgICAgICBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCAtIDEpIC0gMSxcbiAgICAgICAgICAgICAtTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGggLSAxKSlcbiAgfVxuXG4gIHZhciBpID0gYnl0ZUxlbmd0aCAtIDFcbiAgdmFyIG11bCA9IDFcbiAgdmFyIHN1YiA9IHZhbHVlIDwgMCA/IDEgOiAwXG4gIHRoaXNbb2Zmc2V0ICsgaV0gPSB2YWx1ZSAmIDB4RkZcbiAgd2hpbGUgKC0taSA+PSAwICYmIChtdWwgKj0gMHgxMDApKVxuICAgIHRoaXNbb2Zmc2V0ICsgaV0gPSAoKHZhbHVlIC8gbXVsKSA+PiAwKSAtIHN1YiAmIDB4RkZcblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweDdmLCAtMHg4MClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmYgKyB2YWx1ZSArIDFcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweDdmZmYsIC0weDgwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9IHZhbHVlXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuZnVuY3Rpb24gY2hlY2tJRUVFNzU0IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndmFsdWUgaXMgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChvZmZzZXQgKyBleHQgPiBidWYubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignaW5kZXggb3V0IG9mIHJhbmdlJylcbiAgaWYgKG9mZnNldCA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdpbmRleCBvdXQgb2YgcmFuZ2UnKVxufVxuXG5mdW5jdGlvbiB3cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0lFRUU3NTQoYnVmLCB2YWx1ZSwgb2Zmc2V0LCA0LCAzLjQwMjgyMzQ2NjM4NTI4ODZlKzM4LCAtMy40MDI4MjM0NjYzODUyODg2ZSszOClcbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0lFRUU3NTQoYnVmLCB2YWx1ZSwgb2Zmc2V0LCA4LCAxLjc5NzY5MzEzNDg2MjMxNTdFKzMwOCwgLTEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4KVxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbiAgcmV0dXJuIG9mZnNldCArIDhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGNvcHkodGFyZ2V0QnVmZmVyLCB0YXJnZXRTdGFydD0wLCBzb3VyY2VTdGFydD0wLCBzb3VyY2VFbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICh0YXJnZXQsIHRhcmdldF9zdGFydCwgc3RhcnQsIGVuZCkge1xuICB2YXIgc291cmNlID0gdGhpc1xuXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXRfc3RhcnQgPj0gdGFyZ2V0Lmxlbmd0aCkgdGFyZ2V0X3N0YXJ0ID0gdGFyZ2V0Lmxlbmd0aFxuICBpZiAoIXRhcmdldF9zdGFydCkgdGFyZ2V0X3N0YXJ0ID0gMFxuICBpZiAoZW5kID4gMCAmJiBlbmQgPCBzdGFydCkgZW5kID0gc3RhcnRcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVybiAwXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHNvdXJjZS5sZW5ndGggPT09IDApIHJldHVybiAwXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBpZiAodGFyZ2V0X3N0YXJ0IDwgMClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChzdGFydCA8IDAgfHwgc3RhcnQgPj0gc291cmNlLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3NvdXJjZVN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBpZiAoZW5kIDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpXG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgPCBlbmQgLSBzdGFydClcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcblxuICB2YXIgbGVuID0gZW5kIC0gc3RhcnRcblxuICBpZiAobGVuIDwgMTAwMCB8fCAhQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICB0YXJnZXRbaSArIHRhcmdldF9zdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGFyZ2V0Ll9zZXQodGhpcy5zdWJhcnJheShzdGFydCwgc3RhcnQgKyBsZW4pLCB0YXJnZXRfc3RhcnQpXG4gIH1cblxuICByZXR1cm4gbGVuXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gKHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIGlmICghdmFsdWUpIHZhbHVlID0gMFxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQpIGVuZCA9IHRoaXMubGVuZ3RoXG5cbiAgaWYgKGVuZCA8IHN0YXJ0KSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSB0aGlzLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBpZiAoZW5kIDwgMCB8fCBlbmQgPiB0aGlzLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ2VuZCBvdXQgb2YgYm91bmRzJylcblxuICB2YXIgaVxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuICAgIGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICAgIHRoaXNbaV0gPSB2YWx1ZVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgYnl0ZXMgPSB1dGY4VG9CeXRlcyh2YWx1ZS50b1N0cmluZygpKVxuICAgIHZhciBsZW4gPSBieXRlcy5sZW5ndGhcbiAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICB0aGlzW2ldID0gYnl0ZXNbaSAlIGxlbl1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEFycmF5QnVmZmVyYCB3aXRoIHRoZSAqY29waWVkKiBtZW1vcnkgb2YgdGhlIGJ1ZmZlciBpbnN0YW5jZS5cbiAqIEFkZGVkIGluIE5vZGUgMC4xMi4gT25seSBhdmFpbGFibGUgaW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEFycmF5QnVmZmVyLlxuICovXG5CdWZmZXIucHJvdG90eXBlLnRvQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICAgIHJldHVybiAobmV3IEJ1ZmZlcih0aGlzKSkuYnVmZmVyXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLmxlbmd0aClcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBidWYubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDEpIHtcbiAgICAgICAgYnVmW2ldID0gdGhpc1tpXVxuICAgICAgfVxuICAgICAgcmV0dXJuIGJ1Zi5idWZmZXJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQnVmZmVyLnRvQXJyYXlCdWZmZXIgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXInKVxuICB9XG59XG5cbi8vIEhFTFBFUiBGVU5DVElPTlNcbi8vID09PT09PT09PT09PT09PT1cblxudmFyIEJQID0gQnVmZmVyLnByb3RvdHlwZVxuXG4vKipcbiAqIEF1Z21lbnQgYSBVaW50OEFycmF5ICppbnN0YW5jZSogKG5vdCB0aGUgVWludDhBcnJheSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAqL1xuQnVmZmVyLl9hdWdtZW50ID0gZnVuY3Rpb24gKGFycikge1xuICBhcnIuY29uc3RydWN0b3IgPSBCdWZmZXJcbiAgYXJyLl9pc0J1ZmZlciA9IHRydWVcblxuICAvLyBzYXZlIHJlZmVyZW5jZSB0byBvcmlnaW5hbCBVaW50OEFycmF5IGdldC9zZXQgbWV0aG9kcyBiZWZvcmUgb3ZlcndyaXRpbmdcbiAgYXJyLl9nZXQgPSBhcnIuZ2V0XG4gIGFyci5fc2V0ID0gYXJyLnNldFxuXG4gIC8vIGRlcHJlY2F0ZWQsIHdpbGwgYmUgcmVtb3ZlZCBpbiBub2RlIDAuMTMrXG4gIGFyci5nZXQgPSBCUC5nZXRcbiAgYXJyLnNldCA9IEJQLnNldFxuXG4gIGFyci53cml0ZSA9IEJQLndyaXRlXG4gIGFyci50b1N0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0xvY2FsZVN0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0pTT04gPSBCUC50b0pTT05cbiAgYXJyLmVxdWFscyA9IEJQLmVxdWFsc1xuICBhcnIuY29tcGFyZSA9IEJQLmNvbXBhcmVcbiAgYXJyLmNvcHkgPSBCUC5jb3B5XG4gIGFyci5zbGljZSA9IEJQLnNsaWNlXG4gIGFyci5yZWFkVUludExFID0gQlAucmVhZFVJbnRMRVxuICBhcnIucmVhZFVJbnRCRSA9IEJQLnJlYWRVSW50QkVcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50TEUgPSBCUC5yZWFkSW50TEVcbiAgYXJyLnJlYWRJbnRCRSA9IEJQLnJlYWRJbnRCRVxuICBhcnIucmVhZEludDggPSBCUC5yZWFkSW50OFxuICBhcnIucmVhZEludDE2TEUgPSBCUC5yZWFkSW50MTZMRVxuICBhcnIucmVhZEludDE2QkUgPSBCUC5yZWFkSW50MTZCRVxuICBhcnIucmVhZEludDMyTEUgPSBCUC5yZWFkSW50MzJMRVxuICBhcnIucmVhZEludDMyQkUgPSBCUC5yZWFkSW50MzJCRVxuICBhcnIucmVhZEZsb2F0TEUgPSBCUC5yZWFkRmxvYXRMRVxuICBhcnIucmVhZEZsb2F0QkUgPSBCUC5yZWFkRmxvYXRCRVxuICBhcnIucmVhZERvdWJsZUxFID0gQlAucmVhZERvdWJsZUxFXG4gIGFyci5yZWFkRG91YmxlQkUgPSBCUC5yZWFkRG91YmxlQkVcbiAgYXJyLndyaXRlVUludDggPSBCUC53cml0ZVVJbnQ4XG4gIGFyci53cml0ZVVJbnRMRSA9IEJQLndyaXRlVUludExFXG4gIGFyci53cml0ZVVJbnRCRSA9IEJQLndyaXRlVUludEJFXG4gIGFyci53cml0ZVVJbnQxNkxFID0gQlAud3JpdGVVSW50MTZMRVxuICBhcnIud3JpdGVVSW50MTZCRSA9IEJQLndyaXRlVUludDE2QkVcbiAgYXJyLndyaXRlVUludDMyTEUgPSBCUC53cml0ZVVJbnQzMkxFXG4gIGFyci53cml0ZVVJbnQzMkJFID0gQlAud3JpdGVVSW50MzJCRVxuICBhcnIud3JpdGVJbnRMRSA9IEJQLndyaXRlSW50TEVcbiAgYXJyLndyaXRlSW50QkUgPSBCUC53cml0ZUludEJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQlAudG9BcnJheUJ1ZmZlclxuXG4gIHJldHVybiBhcnJcbn1cblxudmFyIElOVkFMSURfQkFTRTY0X1JFID0gL1teK1xcLzAtOUEtelxcLV0vZ1xuXG5mdW5jdGlvbiBiYXNlNjRjbGVhbiAoc3RyKSB7XG4gIC8vIE5vZGUgc3RyaXBzIG91dCBpbnZhbGlkIGNoYXJhY3RlcnMgbGlrZSBcXG4gYW5kIFxcdCBmcm9tIHRoZSBzdHJpbmcsIGJhc2U2NC1qcyBkb2VzIG5vdFxuICBzdHIgPSBzdHJpbmd0cmltKHN0cikucmVwbGFjZShJTlZBTElEX0JBU0U2NF9SRSwgJycpXG4gIC8vIE5vZGUgY29udmVydHMgc3RyaW5ncyB3aXRoIGxlbmd0aCA8IDIgdG8gJydcbiAgaWYgKHN0ci5sZW5ndGggPCAyKSByZXR1cm4gJydcbiAgLy8gTm9kZSBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgYmFzZTY0IHN0cmluZ3MgKG1pc3NpbmcgdHJhaWxpbmcgPT09KSwgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHdoaWxlIChzdHIubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgIHN0ciA9IHN0ciArICc9J1xuICB9XG4gIHJldHVybiBzdHJcbn1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMoc3RyaW5nLCB1bml0cykge1xuICB2YXIgY29kZVBvaW50LCBsZW5ndGggPSBzdHJpbmcubGVuZ3RoXG4gIHZhciBsZWFkU3Vycm9nYXRlID0gbnVsbFxuICB1bml0cyA9IHVuaXRzIHx8IEluZmluaXR5XG4gIHZhciBieXRlcyA9IFtdXG4gIHZhciBpID0gMFxuXG4gIGZvciAoOyBpPGxlbmd0aDsgaSsrKSB7XG4gICAgY29kZVBvaW50ID0gc3RyaW5nLmNoYXJDb2RlQXQoaSlcblxuICAgIC8vIGlzIHN1cnJvZ2F0ZSBjb21wb25lbnRcbiAgICBpZiAoY29kZVBvaW50ID4gMHhEN0ZGICYmIGNvZGVQb2ludCA8IDB4RTAwMCkge1xuXG4gICAgICAvLyBsYXN0IGNoYXIgd2FzIGEgbGVhZFxuICAgICAgaWYgKGxlYWRTdXJyb2dhdGUpIHtcblxuICAgICAgICAvLyAyIGxlYWRzIGluIGEgcm93XG4gICAgICAgIGlmIChjb2RlUG9pbnQgPCAweERDMDApIHtcbiAgICAgICAgICBpZiAoKHVuaXRzIC09IDMpID4gLTEpIGJ5dGVzLnB1c2goMHhFRiwgMHhCRiwgMHhCRClcbiAgICAgICAgICBsZWFkU3Vycm9nYXRlID0gY29kZVBvaW50XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHZhbGlkIHN1cnJvZ2F0ZSBwYWlyXG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIGNvZGVQb2ludCA9IGxlYWRTdXJyb2dhdGUgLSAweEQ4MDAgPDwgMTAgfCBjb2RlUG9pbnQgLSAweERDMDAgfCAweDEwMDAwXG4gICAgICAgICAgbGVhZFN1cnJvZ2F0ZSA9IG51bGxcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBubyBsZWFkIHlldFxuICAgICAgZWxzZSB7XG5cbiAgICAgICAgLy8gdW5leHBlY3RlZCB0cmFpbFxuICAgICAgICBpZiAoY29kZVBvaW50ID4gMHhEQkZGKSB7XG4gICAgICAgICAgaWYgKCh1bml0cyAtPSAzKSA+IC0xKSBieXRlcy5wdXNoKDB4RUYsIDB4QkYsIDB4QkQpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVucGFpcmVkIGxlYWRcbiAgICAgICAgZWxzZSBpZiAoaSArIDEgPT09IGxlbmd0aCkge1xuICAgICAgICAgIGlmICgodW5pdHMgLT0gMykgPiAtMSkgYnl0ZXMucHVzaCgweEVGLCAweEJGLCAweEJEKVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cblxuICAgICAgICAvLyB2YWxpZCBsZWFkXG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIGxlYWRTdXJyb2dhdGUgPSBjb2RlUG9pbnRcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gdmFsaWQgYm1wIGNoYXIsIGJ1dCBsYXN0IGNoYXIgd2FzIGEgbGVhZFxuICAgIGVsc2UgaWYgKGxlYWRTdXJyb2dhdGUpIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMykgPiAtMSkgYnl0ZXMucHVzaCgweEVGLCAweEJGLCAweEJEKVxuICAgICAgbGVhZFN1cnJvZ2F0ZSA9IG51bGxcbiAgICB9XG5cbiAgICAvLyBlbmNvZGUgdXRmOFxuICAgIGlmIChjb2RlUG9pbnQgPCAweDgwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDEpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goY29kZVBvaW50KVxuICAgIH1cbiAgICBlbHNlIGlmIChjb2RlUG9pbnQgPCAweDgwMCkge1xuICAgICAgaWYgKCh1bml0cyAtPSAyKSA8IDApIGJyZWFrXG4gICAgICBieXRlcy5wdXNoKFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2IHwgMHhDMCxcbiAgICAgICAgY29kZVBvaW50ICYgMHgzRiB8IDB4ODBcbiAgICAgICk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGNvZGVQb2ludCA8IDB4MTAwMDApIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMykgPCAwKSBicmVha1xuICAgICAgYnl0ZXMucHVzaChcbiAgICAgICAgY29kZVBvaW50ID4+IDB4QyB8IDB4RTAsXG4gICAgICAgIGNvZGVQb2ludCA+PiAweDYgJiAweDNGIHwgMHg4MCxcbiAgICAgICAgY29kZVBvaW50ICYgMHgzRiB8IDB4ODBcbiAgICAgICk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGNvZGVQb2ludCA8IDB4MjAwMDAwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDQpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goXG4gICAgICAgIGNvZGVQb2ludCA+PiAweDEyIHwgMHhGMCxcbiAgICAgICAgY29kZVBvaW50ID4+IDB4QyAmIDB4M0YgfCAweDgwLFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2ICYgMHgzRiB8IDB4ODAsXG4gICAgICAgIGNvZGVQb2ludCAmIDB4M0YgfCAweDgwXG4gICAgICApO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb2RlIHBvaW50JylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnl0ZXNcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0ciwgdW5pdHMpIHtcbiAgdmFyIGMsIGhpLCBsb1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcblxuICAgIGlmICgodW5pdHMgLT0gMikgPCAwKSBicmVha1xuXG4gICAgYyA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaGkgPSBjID4+IDhcbiAgICBsbyA9IGMgJSAyNTZcbiAgICBieXRlQXJyYXkucHVzaChsbylcbiAgICBieXRlQXJyYXkucHVzaChoaSlcbiAgfVxuXG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYmFzZTY0VG9CeXRlcyAoc3RyKSB7XG4gIHJldHVybiBiYXNlNjQudG9CeXRlQXJyYXkoYmFzZTY0Y2xlYW4oc3RyKSlcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoLCB1bml0U2l6ZSkge1xuICBpZiAodW5pdFNpemUpIGxlbmd0aCAtPSBsZW5ndGggJSB1bml0U2l6ZTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG4iLCJ2YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXHR2YXIgUExVU19VUkxfU0FGRSA9ICctJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSF9VUkxfU0FGRSA9ICdfJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMgfHxcblx0XHQgICAgY29kZSA9PT0gUExVU19VUkxfU0FGRSlcblx0XHRcdHJldHVybiA2MiAvLyAnKydcblx0XHRpZiAoY29kZSA9PT0gU0xBU0ggfHxcblx0XHQgICAgY29kZSA9PT0gU0xBU0hfVVJMX1NBRkUpXG5cdFx0XHRyZXR1cm4gNjMgLy8gJy8nXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIpXG5cdFx0XHRyZXR1cm4gLTEgLy9ubyBtYXRjaFxuXHRcdGlmIChjb2RlIDwgTlVNQkVSICsgMTApXG5cdFx0XHRyZXR1cm4gY29kZSAtIE5VTUJFUiArIDI2ICsgMjZcblx0XHRpZiAoY29kZSA8IFVQUEVSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIFVQUEVSXG5cdFx0aWYgKGNvZGUgPCBMT1dFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBMT1dFUiArIDI2XG5cdH1cblxuXHRmdW5jdGlvbiBiNjRUb0J5dGVBcnJheSAoYjY0KSB7XG5cdFx0dmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnJcblxuXHRcdGlmIChiNjQubGVuZ3RoICUgNCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdHJpbmcuIExlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNCcpXG5cdFx0fVxuXG5cdFx0Ly8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcblx0XHQvLyBpZiB0aGVyZSBhcmUgdHdvIHBsYWNlaG9sZGVycywgdGhhbiB0aGUgdHdvIGNoYXJhY3RlcnMgYmVmb3JlIGl0XG5cdFx0Ly8gcmVwcmVzZW50IG9uZSBieXRlXG5cdFx0Ly8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG5cdFx0Ly8gdGhpcyBpcyBqdXN0IGEgY2hlYXAgaGFjayB0byBub3QgZG8gaW5kZXhPZiB0d2ljZVxuXHRcdHZhciBsZW4gPSBiNjQubGVuZ3RoXG5cdFx0cGxhY2VIb2xkZXJzID0gJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDIpID8gMiA6ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAxKSA/IDEgOiAwXG5cblx0XHQvLyBiYXNlNjQgaXMgNC8zICsgdXAgdG8gdHdvIGNoYXJhY3RlcnMgb2YgdGhlIG9yaWdpbmFsIGRhdGFcblx0XHRhcnIgPSBuZXcgQXJyKGI2NC5sZW5ndGggKiAzIC8gNCAtIHBsYWNlSG9sZGVycylcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcblx0XHRsID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSA0IDogYjY0Lmxlbmd0aFxuXG5cdFx0dmFyIEwgPSAwXG5cblx0XHRmdW5jdGlvbiBwdXNoICh2KSB7XG5cdFx0XHRhcnJbTCsrXSA9IHZcblx0XHR9XG5cblx0XHRmb3IgKGkgPSAwLCBqID0gMDsgaSA8IGw7IGkgKz0gNCwgaiArPSAzKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDE4KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDEyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpIDw8IDYpIHwgZGVjb2RlKGI2NC5jaGFyQXQoaSArIDMpKVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwMDApID4+IDE2KVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwKSA+PiA4KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdGlmIChwbGFjZUhvbGRlcnMgPT09IDIpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA+PiA0KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDEwKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDQpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPj4gMilcblx0XHRcdHB1c2goKHRtcCA+PiA4KSAmIDB4RkYpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyclxuXHR9XG5cblx0ZnVuY3Rpb24gdWludDhUb0Jhc2U2NCAodWludDgpIHtcblx0XHR2YXIgaSxcblx0XHRcdGV4dHJhQnl0ZXMgPSB1aW50OC5sZW5ndGggJSAzLCAvLyBpZiB3ZSBoYXZlIDEgYnl0ZSBsZWZ0LCBwYWQgMiBieXRlc1xuXHRcdFx0b3V0cHV0ID0gXCJcIixcblx0XHRcdHRlbXAsIGxlbmd0aFxuXG5cdFx0ZnVuY3Rpb24gZW5jb2RlIChudW0pIHtcblx0XHRcdHJldHVybiBsb29rdXAuY2hhckF0KG51bSlcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuXHRcdFx0cmV0dXJuIGVuY29kZShudW0gPj4gMTggJiAweDNGKSArIGVuY29kZShudW0gPj4gMTIgJiAweDNGKSArIGVuY29kZShudW0gPj4gNiAmIDB4M0YpICsgZW5jb2RlKG51bSAmIDB4M0YpXG5cdFx0fVxuXG5cdFx0Ly8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuXHRcdGZvciAoaSA9IDAsIGxlbmd0aCA9IHVpbnQ4Lmxlbmd0aCAtIGV4dHJhQnl0ZXM7IGkgPCBsZW5ndGg7IGkgKz0gMykge1xuXHRcdFx0dGVtcCA9ICh1aW50OFtpXSA8PCAxNikgKyAodWludDhbaSArIDFdIDw8IDgpICsgKHVpbnQ4W2kgKyAyXSlcblx0XHRcdG91dHB1dCArPSB0cmlwbGV0VG9CYXNlNjQodGVtcClcblx0XHR9XG5cblx0XHQvLyBwYWQgdGhlIGVuZCB3aXRoIHplcm9zLCBidXQgbWFrZSBzdXJlIHRvIG5vdCBmb3JnZXQgdGhlIGV4dHJhIGJ5dGVzXG5cdFx0c3dpdGNoIChleHRyYUJ5dGVzKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHRlbXAgPSB1aW50OFt1aW50OC5sZW5ndGggLSAxXVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPT0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHRlbXAgPSAodWludDhbdWludDgubGVuZ3RoIC0gMl0gPDwgOCkgKyAodWludDhbdWludDgubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAxMClcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA+PiA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgMikgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dFxuXHR9XG5cblx0ZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5XG5cdGV4cG9ydHMuZnJvbUJ5dGVBcnJheSA9IHVpbnQ4VG9CYXNlNjRcbn0odHlwZW9mIGV4cG9ydHMgPT09ICd1bmRlZmluZWQnID8gKHRoaXMuYmFzZTY0anMgPSB7fSkgOiBleHBvcnRzKSlcbiIsImV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuIiwiXG4vKipcbiAqIGlzQXJyYXlcbiAqL1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG5cbi8qKlxuICogdG9TdHJpbmdcbiAqL1xuXG52YXIgc3RyID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcblxuLyoqXG4gKiBXaGV0aGVyIG9yIG5vdCB0aGUgZ2l2ZW4gYHZhbGBcbiAqIGlzIGFuIGFycmF5LlxuICpcbiAqIGV4YW1wbGU6XG4gKlxuICogICAgICAgIGlzQXJyYXkoW10pO1xuICogICAgICAgIC8vID4gdHJ1ZVxuICogICAgICAgIGlzQXJyYXkoYXJndW1lbnRzKTtcbiAqICAgICAgICAvLyA+IGZhbHNlXG4gKiAgICAgICAgaXNBcnJheSgnJyk7XG4gKiAgICAgICAgLy8gPiBmYWxzZVxuICpcbiAqIEBwYXJhbSB7bWl4ZWR9IHZhbFxuICogQHJldHVybiB7Ym9vbH1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQXJyYXkgfHwgZnVuY3Rpb24gKHZhbCkge1xuICByZXR1cm4gISEgdmFsICYmICdbb2JqZWN0IEFycmF5XScgPT0gc3RyLmNhbGwodmFsKTtcbn07XG4iLCIvKmdsb2JhbCBkZWZpbmU6ZmFsc2UgcmVxdWlyZTpmYWxzZSAqL1xubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKXtcblx0Ly8gSW1wb3J0IEV2ZW50c1xuXHR2YXIgZXZlbnRzID0gcmVxdWlyZSgnZXZlbnRzJyk7XG5cblx0Ly8gRXhwb3J0IERvbWFpblxuXHR2YXIgZG9tYWluID0ge307XG5cdGRvbWFpbi5jcmVhdGVEb21haW4gPSBkb21haW4uY3JlYXRlID0gZnVuY3Rpb24oKXtcblx0XHR2YXIgZCA9IG5ldyBldmVudHMuRXZlbnRFbWl0dGVyKCk7XG5cblx0XHRmdW5jdGlvbiBlbWl0RXJyb3IoZSkge1xuXHRcdFx0ZC5lbWl0KCdlcnJvcicsIGUpXG5cdFx0fVxuXG5cdFx0ZC5hZGQgPSBmdW5jdGlvbihlbWl0dGVyKXtcblx0XHRcdGVtaXR0ZXIub24oJ2Vycm9yJywgZW1pdEVycm9yKTtcblx0XHR9XG5cdFx0ZC5yZW1vdmUgPSBmdW5jdGlvbihlbWl0dGVyKXtcblx0XHRcdGVtaXR0ZXIucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgZW1pdEVycm9yKTtcblx0XHR9XG5cdFx0ZC5ydW4gPSBmdW5jdGlvbihmbil7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmbigpO1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0ZC5kaXNwb3NlID0gZnVuY3Rpb24oKXtcblx0XHRcdHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKCk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXHRcdHJldHVybiBkO1xuXHR9O1xuXHRyZXR1cm4gZG9tYWluO1xufSkuY2FsbCh0aGlzKTsiLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCkge1xuICB0aGlzLl9ldmVudHMgPSB0aGlzLl9ldmVudHMgfHwge307XG4gIHRoaXMuX21heExpc3RlbmVycyA9IHRoaXMuX21heExpc3RlbmVycyB8fCB1bmRlZmluZWQ7XG59XG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcblxuLy8gQmFja3dhcmRzLWNvbXBhdCB3aXRoIG5vZGUgMC4xMC54XG5FdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9ldmVudHMgPSB1bmRlZmluZWQ7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9tYXhMaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cbi8vIEJ5IGRlZmF1bHQgRXZlbnRFbWl0dGVycyB3aWxsIHByaW50IGEgd2FybmluZyBpZiBtb3JlIHRoYW4gMTAgbGlzdGVuZXJzIGFyZVxuLy8gYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaCBoZWxwcyBmaW5kaW5nIG1lbW9yeSBsZWFrcy5cbkV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XG5cbi8vIE9idmlvdXNseSBub3QgYWxsIEVtaXR0ZXJzIHNob3VsZCBiZSBsaW1pdGVkIHRvIDEwLiBUaGlzIGZ1bmN0aW9uIGFsbG93c1xuLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcbiAgaWYgKCFpc051bWJlcihuKSB8fCBuIDwgMCB8fCBpc05hTihuKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcicpO1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGVyLCBoYW5kbGVyLCBsZW4sIGFyZ3MsIGksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBJZiB0aGVyZSBpcyBubyAnZXJyb3InIGV2ZW50IGxpc3RlbmVyIHRoZW4gdGhyb3cuXG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgaWYgKCF0aGlzLl9ldmVudHMuZXJyb3IgfHxcbiAgICAgICAgKGlzT2JqZWN0KHRoaXMuX2V2ZW50cy5lcnJvcikgJiYgIXRoaXMuX2V2ZW50cy5lcnJvci5sZW5ndGgpKSB7XG4gICAgICBlciA9IGFyZ3VtZW50c1sxXTtcbiAgICAgIGlmIChlciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHRocm93IGVyOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxuICAgICAgfVxuICAgICAgdGhyb3cgVHlwZUVycm9yKCdVbmNhdWdodCwgdW5zcGVjaWZpZWQgXCJlcnJvclwiIGV2ZW50LicpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzVW5kZWZpbmVkKGhhbmRsZXIpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBpZiAoaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuICAgIHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgLy8gZmFzdCBjYXNlc1xuICAgICAgY2FzZSAxOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgLy8gc2xvd2VyXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGhhbmRsZXIpKSB7XG4gICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuXG4gICAgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuICAgIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgbGlzdGVuZXJzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIG07XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT09IFwibmV3TGlzdGVuZXJcIiEgQmVmb3JlXG4gIC8vIGFkZGluZyBpdCB0byB0aGUgbGlzdGVuZXJzLCBmaXJzdCBlbWl0IFwibmV3TGlzdGVuZXJcIi5cbiAgaWYgKHRoaXMuX2V2ZW50cy5uZXdMaXN0ZW5lcilcbiAgICB0aGlzLmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSxcbiAgICAgICAgICAgICAgaXNGdW5jdGlvbihsaXN0ZW5lci5saXN0ZW5lcikgP1xuICAgICAgICAgICAgICBsaXN0ZW5lci5saXN0ZW5lciA6IGxpc3RlbmVyKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBsaXN0ZW5lcjtcbiAgZWxzZSBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IGdvdCBhbiBhcnJheSwganVzdCBhcHBlbmQuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICBlbHNlXG4gICAgLy8gQWRkaW5nIHRoZSBzZWNvbmQgZWxlbWVudCwgbmVlZCB0byBjaGFuZ2UgdG8gYXJyYXkuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXSwgbGlzdGVuZXJdO1xuXG4gIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXG4gIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pICYmICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkKSB7XG4gICAgdmFyIG07XG4gICAgaWYgKCFpc1VuZGVmaW5lZCh0aGlzLl9tYXhMaXN0ZW5lcnMpKSB7XG4gICAgICBtID0gdGhpcy5fbWF4TGlzdGVuZXJzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgaWYgKG0gJiYgbSA+IDAgJiYgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCA+IG0pIHtcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQgPSB0cnVlO1xuICAgICAgY29uc29sZS5lcnJvcignKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXG4gICAgICAgICAgICAgICAgICAgICdsZWFrIGRldGVjdGVkLiAlZCBsaXN0ZW5lcnMgYWRkZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJyxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCk7XG4gICAgICBpZiAodHlwZW9mIGNvbnNvbGUudHJhY2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gbm90IHN1cHBvcnRlZCBpbiBJRSAxMFxuICAgICAgICBjb25zb2xlLnRyYWNlKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIHZhciBmaXJlZCA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGcoKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBnKTtcblxuICAgIGlmICghZmlyZWQpIHtcbiAgICAgIGZpcmVkID0gdHJ1ZTtcbiAgICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICB9XG5cbiAgZy5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICB0aGlzLm9uKHR5cGUsIGcpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZW1pdHMgYSAncmVtb3ZlTGlzdGVuZXInIGV2ZW50IGlmZiB0aGUgbGlzdGVuZXIgd2FzIHJlbW92ZWRcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbGlzdCwgcG9zaXRpb24sIGxlbmd0aCwgaTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXR1cm4gdGhpcztcblxuICBsaXN0ID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuICBsZW5ndGggPSBsaXN0Lmxlbmd0aDtcbiAgcG9zaXRpb24gPSAtMTtcblxuICBpZiAobGlzdCA9PT0gbGlzdGVuZXIgfHxcbiAgICAgIChpc0Z1bmN0aW9uKGxpc3QubGlzdGVuZXIpICYmIGxpc3QubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG5cbiAgfSBlbHNlIGlmIChpc09iamVjdChsaXN0KSkge1xuICAgIGZvciAoaSA9IGxlbmd0aDsgaS0tID4gMDspIHtcbiAgICAgIGlmIChsaXN0W2ldID09PSBsaXN0ZW5lciB8fFxuICAgICAgICAgIChsaXN0W2ldLmxpc3RlbmVyICYmIGxpc3RbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgICAgICBwb3NpdGlvbiA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwb3NpdGlvbiA8IDApXG4gICAgICByZXR1cm4gdGhpcztcblxuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgbGlzdC5sZW5ndGggPSAwO1xuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGlzdC5zcGxpY2UocG9zaXRpb24sIDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGtleSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIG5vdCBsaXN0ZW5pbmcgZm9yIHJlbW92ZUxpc3RlbmVyLCBubyBuZWVkIHRvIGVtaXRcbiAgaWYgKCF0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcbiAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIGVsc2UgaWYgKHRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBlbWl0IHJlbW92ZUxpc3RlbmVyIGZvciBhbGwgbGlzdGVuZXJzIG9uIGFsbCBldmVudHNcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICBmb3IgKGtleSBpbiB0aGlzLl9ldmVudHMpIHtcbiAgICAgIGlmIChrZXkgPT09ICdyZW1vdmVMaXN0ZW5lcicpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoa2V5KTtcbiAgICB9XG4gICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3JlbW92ZUxpc3RlbmVyJyk7XG4gICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzRnVuY3Rpb24obGlzdGVuZXJzKSkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBMSUZPIG9yZGVyXG4gICAgd2hpbGUgKGxpc3RlbmVycy5sZW5ndGgpXG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVyc1tsaXN0ZW5lcnMubGVuZ3RoIC0gMV0pO1xuICB9XG4gIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSBbXTtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbih0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xuICBlbHNlXG4gICAgcmV0ID0gdGhpcy5fZXZlbnRzW3R5cGVdLnNsaWNlKCk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5FdmVudEVtaXR0ZXIubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCFlbWl0dGVyLl9ldmVudHMgfHwgIWVtaXR0ZXIuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSAwO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKGVtaXR0ZXIuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gMTtcbiAgZWxzZVxuICAgIHJldCA9IGVtaXR0ZXIuX2V2ZW50c1t0eXBlXS5sZW5ndGg7XG4gIHJldHVybiByZXQ7XG59O1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG4iLCJpZiAodHlwZW9mIE9iamVjdC5jcmVhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgLy8gaW1wbGVtZW50YXRpb24gZnJvbSBzdGFuZGFyZCBub2RlLmpzICd1dGlsJyBtb2R1bGVcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIGN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckN0b3IucHJvdG90eXBlLCB7XG4gICAgICBjb25zdHJ1Y3Rvcjoge1xuICAgICAgICB2YWx1ZTogY3RvcixcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn0gZWxzZSB7XG4gIC8vIG9sZCBzY2hvb2wgc2hpbSBmb3Igb2xkIGJyb3dzZXJzXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fVxuICAgIFRlbXBDdG9yLnByb3RvdHlwZSA9IHN1cGVyQ3Rvci5wcm90b3R5cGVcbiAgICBjdG9yLnByb3RvdHlwZSA9IG5ldyBUZW1wQ3RvcigpXG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoYXJyKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJyKSA9PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gdHJ1ZTtcbiAgICB2YXIgY3VycmVudFF1ZXVlO1xuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB2YXIgaSA9IC0xO1xuICAgICAgICB3aGlsZSAoKytpIDwgbGVuKSB7XG4gICAgICAgICAgICBjdXJyZW50UXVldWVbaV0oKTtcbiAgICAgICAgfVxuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG59XG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHF1ZXVlLnB1c2goZnVuKTtcbiAgICBpZiAoIWRyYWluaW5nKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCIuL2xpYi9fc3RyZWFtX2R1cGxleC5qc1wiKVxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIGEgZHVwbGV4IHN0cmVhbSBpcyBqdXN0IGEgc3RyZWFtIHRoYXQgaXMgYm90aCByZWFkYWJsZSBhbmQgd3JpdGFibGUuXG4vLyBTaW5jZSBKUyBkb2Vzbid0IGhhdmUgbXVsdGlwbGUgcHJvdG90eXBhbCBpbmhlcml0YW5jZSwgdGhpcyBjbGFzc1xuLy8gcHJvdG90eXBhbGx5IGluaGVyaXRzIGZyb20gUmVhZGFibGUsIGFuZCB0aGVuIHBhcmFzaXRpY2FsbHkgZnJvbVxuLy8gV3JpdGFibGUuXG5cbm1vZHVsZS5leHBvcnRzID0gRHVwbGV4O1xuXG4vKjxyZXBsYWNlbWVudD4qL1xudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciBrZXlzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIGtleXMucHVzaChrZXkpO1xuICByZXR1cm4ga2V5cztcbn1cbi8qPC9yZXBsYWNlbWVudD4qL1xuXG5cbi8qPHJlcGxhY2VtZW50PiovXG52YXIgdXRpbCA9IHJlcXVpcmUoJ2NvcmUtdXRpbC1pcycpO1xudXRpbC5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG4vKjwvcmVwbGFjZW1lbnQ+Ki9cblxudmFyIFJlYWRhYmxlID0gcmVxdWlyZSgnLi9fc3RyZWFtX3JlYWRhYmxlJyk7XG52YXIgV3JpdGFibGUgPSByZXF1aXJlKCcuL19zdHJlYW1fd3JpdGFibGUnKTtcblxudXRpbC5pbmhlcml0cyhEdXBsZXgsIFJlYWRhYmxlKTtcblxuZm9yRWFjaChvYmplY3RLZXlzKFdyaXRhYmxlLnByb3RvdHlwZSksIGZ1bmN0aW9uKG1ldGhvZCkge1xuICBpZiAoIUR1cGxleC5wcm90b3R5cGVbbWV0aG9kXSlcbiAgICBEdXBsZXgucHJvdG90eXBlW21ldGhvZF0gPSBXcml0YWJsZS5wcm90b3R5cGVbbWV0aG9kXTtcbn0pO1xuXG5mdW5jdGlvbiBEdXBsZXgob3B0aW9ucykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgRHVwbGV4KSlcbiAgICByZXR1cm4gbmV3IER1cGxleChvcHRpb25zKTtcblxuICBSZWFkYWJsZS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICBXcml0YWJsZS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuXG4gIGlmIChvcHRpb25zICYmIG9wdGlvbnMucmVhZGFibGUgPT09IGZhbHNlKVxuICAgIHRoaXMucmVhZGFibGUgPSBmYWxzZTtcblxuICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLndyaXRhYmxlID09PSBmYWxzZSlcbiAgICB0aGlzLndyaXRhYmxlID0gZmFsc2U7XG5cbiAgdGhpcy5hbGxvd0hhbGZPcGVuID0gdHJ1ZTtcbiAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5hbGxvd0hhbGZPcGVuID09PSBmYWxzZSlcbiAgICB0aGlzLmFsbG93SGFsZk9wZW4gPSBmYWxzZTtcblxuICB0aGlzLm9uY2UoJ2VuZCcsIG9uZW5kKTtcbn1cblxuLy8gdGhlIG5vLWhhbGYtb3BlbiBlbmZvcmNlclxuZnVuY3Rpb24gb25lbmQoKSB7XG4gIC8vIGlmIHdlIGFsbG93IGhhbGYtb3BlbiBzdGF0ZSwgb3IgaWYgdGhlIHdyaXRhYmxlIHNpZGUgZW5kZWQsXG4gIC8vIHRoZW4gd2UncmUgb2suXG4gIGlmICh0aGlzLmFsbG93SGFsZk9wZW4gfHwgdGhpcy5fd3JpdGFibGVTdGF0ZS5lbmRlZClcbiAgICByZXR1cm47XG5cbiAgLy8gbm8gbW9yZSBkYXRhIGNhbiBiZSB3cml0dGVuLlxuICAvLyBCdXQgYWxsb3cgbW9yZSB3cml0ZXMgdG8gaGFwcGVuIGluIHRoaXMgdGljay5cbiAgcHJvY2Vzcy5uZXh0VGljayh0aGlzLmVuZC5iaW5kKHRoaXMpKTtcbn1cblxuZnVuY3Rpb24gZm9yRWFjaCAoeHMsIGYpIHtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB4cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBmKHhzW2ldLCBpKTtcbiAgfVxufVxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIGEgcGFzc3Rocm91Z2ggc3RyZWFtLlxuLy8gYmFzaWNhbGx5IGp1c3QgdGhlIG1vc3QgbWluaW1hbCBzb3J0IG9mIFRyYW5zZm9ybSBzdHJlYW0uXG4vLyBFdmVyeSB3cml0dGVuIGNodW5rIGdldHMgb3V0cHV0IGFzLWlzLlxuXG5tb2R1bGUuZXhwb3J0cyA9IFBhc3NUaHJvdWdoO1xuXG52YXIgVHJhbnNmb3JtID0gcmVxdWlyZSgnLi9fc3RyZWFtX3RyYW5zZm9ybScpO1xuXG4vKjxyZXBsYWNlbWVudD4qL1xudmFyIHV0aWwgPSByZXF1aXJlKCdjb3JlLXV0aWwtaXMnKTtcbnV0aWwuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuLyo8L3JlcGxhY2VtZW50PiovXG5cbnV0aWwuaW5oZXJpdHMoUGFzc1Rocm91Z2gsIFRyYW5zZm9ybSk7XG5cbmZ1bmN0aW9uIFBhc3NUaHJvdWdoKG9wdGlvbnMpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFBhc3NUaHJvdWdoKSlcbiAgICByZXR1cm4gbmV3IFBhc3NUaHJvdWdoKG9wdGlvbnMpO1xuXG4gIFRyYW5zZm9ybS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xufVxuXG5QYXNzVGhyb3VnaC5wcm90b3R5cGUuX3RyYW5zZm9ybSA9IGZ1bmN0aW9uKGNodW5rLCBlbmNvZGluZywgY2IpIHtcbiAgY2IobnVsbCwgY2h1bmspO1xufTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5tb2R1bGUuZXhwb3J0cyA9IFJlYWRhYmxlO1xuXG4vKjxyZXBsYWNlbWVudD4qL1xudmFyIGlzQXJyYXkgPSByZXF1aXJlKCdpc2FycmF5Jyk7XG4vKjwvcmVwbGFjZW1lbnQ+Ki9cblxuXG4vKjxyZXBsYWNlbWVudD4qL1xudmFyIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlcjtcbi8qPC9yZXBsYWNlbWVudD4qL1xuXG5SZWFkYWJsZS5SZWFkYWJsZVN0YXRlID0gUmVhZGFibGVTdGF0ZTtcblxudmFyIEVFID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xuXG4vKjxyZXBsYWNlbWVudD4qL1xuaWYgKCFFRS5saXN0ZW5lckNvdW50KSBFRS5saXN0ZW5lckNvdW50ID0gZnVuY3Rpb24oZW1pdHRlciwgdHlwZSkge1xuICByZXR1cm4gZW1pdHRlci5saXN0ZW5lcnModHlwZSkubGVuZ3RoO1xufTtcbi8qPC9yZXBsYWNlbWVudD4qL1xuXG52YXIgU3RyZWFtID0gcmVxdWlyZSgnc3RyZWFtJyk7XG5cbi8qPHJlcGxhY2VtZW50PiovXG52YXIgdXRpbCA9IHJlcXVpcmUoJ2NvcmUtdXRpbC1pcycpO1xudXRpbC5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG4vKjwvcmVwbGFjZW1lbnQ+Ki9cblxudmFyIFN0cmluZ0RlY29kZXI7XG5cbnV0aWwuaW5oZXJpdHMoUmVhZGFibGUsIFN0cmVhbSk7XG5cbmZ1bmN0aW9uIFJlYWRhYmxlU3RhdGUob3B0aW9ucywgc3RyZWFtKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIC8vIHRoZSBwb2ludCBhdCB3aGljaCBpdCBzdG9wcyBjYWxsaW5nIF9yZWFkKCkgdG8gZmlsbCB0aGUgYnVmZmVyXG4gIC8vIE5vdGU6IDAgaXMgYSB2YWxpZCB2YWx1ZSwgbWVhbnMgXCJkb24ndCBjYWxsIF9yZWFkIHByZWVtcHRpdmVseSBldmVyXCJcbiAgdmFyIGh3bSA9IG9wdGlvbnMuaGlnaFdhdGVyTWFyaztcbiAgdGhpcy5oaWdoV2F0ZXJNYXJrID0gKGh3bSB8fCBod20gPT09IDApID8gaHdtIDogMTYgKiAxMDI0O1xuXG4gIC8vIGNhc3QgdG8gaW50cy5cbiAgdGhpcy5oaWdoV2F0ZXJNYXJrID0gfn50aGlzLmhpZ2hXYXRlck1hcms7XG5cbiAgdGhpcy5idWZmZXIgPSBbXTtcbiAgdGhpcy5sZW5ndGggPSAwO1xuICB0aGlzLnBpcGVzID0gbnVsbDtcbiAgdGhpcy5waXBlc0NvdW50ID0gMDtcbiAgdGhpcy5mbG93aW5nID0gZmFsc2U7XG4gIHRoaXMuZW5kZWQgPSBmYWxzZTtcbiAgdGhpcy5lbmRFbWl0dGVkID0gZmFsc2U7XG4gIHRoaXMucmVhZGluZyA9IGZhbHNlO1xuXG4gIC8vIEluIHN0cmVhbXMgdGhhdCBuZXZlciBoYXZlIGFueSBkYXRhLCBhbmQgZG8gcHVzaChudWxsKSByaWdodCBhd2F5LFxuICAvLyB0aGUgY29uc3VtZXIgY2FuIG1pc3MgdGhlICdlbmQnIGV2ZW50IGlmIHRoZXkgZG8gc29tZSBJL08gYmVmb3JlXG4gIC8vIGNvbnN1bWluZyB0aGUgc3RyZWFtLiAgU28sIHdlIGRvbid0IGVtaXQoJ2VuZCcpIHVudGlsIHNvbWUgcmVhZGluZ1xuICAvLyBoYXBwZW5zLlxuICB0aGlzLmNhbGxlZFJlYWQgPSBmYWxzZTtcblxuICAvLyBhIGZsYWcgdG8gYmUgYWJsZSB0byB0ZWxsIGlmIHRoZSBvbndyaXRlIGNiIGlzIGNhbGxlZCBpbW1lZGlhdGVseSxcbiAgLy8gb3Igb24gYSBsYXRlciB0aWNrLiAgV2Ugc2V0IHRoaXMgdG8gdHJ1ZSBhdCBmaXJzdCwgYmVjdWFzZSBhbnlcbiAgLy8gYWN0aW9ucyB0aGF0IHNob3VsZG4ndCBoYXBwZW4gdW50aWwgXCJsYXRlclwiIHNob3VsZCBnZW5lcmFsbHkgYWxzb1xuICAvLyBub3QgaGFwcGVuIGJlZm9yZSB0aGUgZmlyc3Qgd3JpdGUgY2FsbC5cbiAgdGhpcy5zeW5jID0gdHJ1ZTtcblxuICAvLyB3aGVuZXZlciB3ZSByZXR1cm4gbnVsbCwgdGhlbiB3ZSBzZXQgYSBmbGFnIHRvIHNheVxuICAvLyB0aGF0IHdlJ3JlIGF3YWl0aW5nIGEgJ3JlYWRhYmxlJyBldmVudCBlbWlzc2lvbi5cbiAgdGhpcy5uZWVkUmVhZGFibGUgPSBmYWxzZTtcbiAgdGhpcy5lbWl0dGVkUmVhZGFibGUgPSBmYWxzZTtcbiAgdGhpcy5yZWFkYWJsZUxpc3RlbmluZyA9IGZhbHNlO1xuXG5cbiAgLy8gb2JqZWN0IHN0cmVhbSBmbGFnLiBVc2VkIHRvIG1ha2UgcmVhZChuKSBpZ25vcmUgbiBhbmQgdG9cbiAgLy8gbWFrZSBhbGwgdGhlIGJ1ZmZlciBtZXJnaW5nIGFuZCBsZW5ndGggY2hlY2tzIGdvIGF3YXlcbiAgdGhpcy5vYmplY3RNb2RlID0gISFvcHRpb25zLm9iamVjdE1vZGU7XG5cbiAgLy8gQ3J5cHRvIGlzIGtpbmQgb2Ygb2xkIGFuZCBjcnVzdHkuICBIaXN0b3JpY2FsbHksIGl0cyBkZWZhdWx0IHN0cmluZ1xuICAvLyBlbmNvZGluZyBpcyAnYmluYXJ5JyBzbyB3ZSBoYXZlIHRvIG1ha2UgdGhpcyBjb25maWd1cmFibGUuXG4gIC8vIEV2ZXJ5dGhpbmcgZWxzZSBpbiB0aGUgdW5pdmVyc2UgdXNlcyAndXRmOCcsIHRob3VnaC5cbiAgdGhpcy5kZWZhdWx0RW5jb2RpbmcgPSBvcHRpb25zLmRlZmF1bHRFbmNvZGluZyB8fCAndXRmOCc7XG5cbiAgLy8gd2hlbiBwaXBpbmcsIHdlIG9ubHkgY2FyZSBhYm91dCAncmVhZGFibGUnIGV2ZW50cyB0aGF0IGhhcHBlblxuICAvLyBhZnRlciByZWFkKClpbmcgYWxsIHRoZSBieXRlcyBhbmQgbm90IGdldHRpbmcgYW55IHB1c2hiYWNrLlxuICB0aGlzLnJhbk91dCA9IGZhbHNlO1xuXG4gIC8vIHRoZSBudW1iZXIgb2Ygd3JpdGVycyB0aGF0IGFyZSBhd2FpdGluZyBhIGRyYWluIGV2ZW50IGluIC5waXBlKClzXG4gIHRoaXMuYXdhaXREcmFpbiA9IDA7XG5cbiAgLy8gaWYgdHJ1ZSwgYSBtYXliZVJlYWRNb3JlIGhhcyBiZWVuIHNjaGVkdWxlZFxuICB0aGlzLnJlYWRpbmdNb3JlID0gZmFsc2U7XG5cbiAgdGhpcy5kZWNvZGVyID0gbnVsbDtcbiAgdGhpcy5lbmNvZGluZyA9IG51bGw7XG4gIGlmIChvcHRpb25zLmVuY29kaW5nKSB7XG4gICAgaWYgKCFTdHJpbmdEZWNvZGVyKVxuICAgICAgU3RyaW5nRGVjb2RlciA9IHJlcXVpcmUoJ3N0cmluZ19kZWNvZGVyLycpLlN0cmluZ0RlY29kZXI7XG4gICAgdGhpcy5kZWNvZGVyID0gbmV3IFN0cmluZ0RlY29kZXIob3B0aW9ucy5lbmNvZGluZyk7XG4gICAgdGhpcy5lbmNvZGluZyA9IG9wdGlvbnMuZW5jb2Rpbmc7XG4gIH1cbn1cblxuZnVuY3Rpb24gUmVhZGFibGUob3B0aW9ucykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgUmVhZGFibGUpKVxuICAgIHJldHVybiBuZXcgUmVhZGFibGUob3B0aW9ucyk7XG5cbiAgdGhpcy5fcmVhZGFibGVTdGF0ZSA9IG5ldyBSZWFkYWJsZVN0YXRlKG9wdGlvbnMsIHRoaXMpO1xuXG4gIC8vIGxlZ2FjeVxuICB0aGlzLnJlYWRhYmxlID0gdHJ1ZTtcblxuICBTdHJlYW0uY2FsbCh0aGlzKTtcbn1cblxuLy8gTWFudWFsbHkgc2hvdmUgc29tZXRoaW5nIGludG8gdGhlIHJlYWQoKSBidWZmZXIuXG4vLyBUaGlzIHJldHVybnMgdHJ1ZSBpZiB0aGUgaGlnaFdhdGVyTWFyayBoYXMgbm90IGJlZW4gaGl0IHlldCxcbi8vIHNpbWlsYXIgdG8gaG93IFdyaXRhYmxlLndyaXRlKCkgcmV0dXJucyB0cnVlIGlmIHlvdSBzaG91bGRcbi8vIHdyaXRlKCkgc29tZSBtb3JlLlxuUmVhZGFibGUucHJvdG90eXBlLnB1c2ggPSBmdW5jdGlvbihjaHVuaywgZW5jb2RpbmcpIHtcbiAgdmFyIHN0YXRlID0gdGhpcy5fcmVhZGFibGVTdGF0ZTtcblxuICBpZiAodHlwZW9mIGNodW5rID09PSAnc3RyaW5nJyAmJiAhc3RhdGUub2JqZWN0TW9kZSkge1xuICAgIGVuY29kaW5nID0gZW5jb2RpbmcgfHwgc3RhdGUuZGVmYXVsdEVuY29kaW5nO1xuICAgIGlmIChlbmNvZGluZyAhPT0gc3RhdGUuZW5jb2RpbmcpIHtcbiAgICAgIGNodW5rID0gbmV3IEJ1ZmZlcihjaHVuaywgZW5jb2RpbmcpO1xuICAgICAgZW5jb2RpbmcgPSAnJztcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVhZGFibGVBZGRDaHVuayh0aGlzLCBzdGF0ZSwgY2h1bmssIGVuY29kaW5nLCBmYWxzZSk7XG59O1xuXG4vLyBVbnNoaWZ0IHNob3VsZCAqYWx3YXlzKiBiZSBzb21ldGhpbmcgZGlyZWN0bHkgb3V0IG9mIHJlYWQoKVxuUmVhZGFibGUucHJvdG90eXBlLnVuc2hpZnQgPSBmdW5jdGlvbihjaHVuaykge1xuICB2YXIgc3RhdGUgPSB0aGlzLl9yZWFkYWJsZVN0YXRlO1xuICByZXR1cm4gcmVhZGFibGVBZGRDaHVuayh0aGlzLCBzdGF0ZSwgY2h1bmssICcnLCB0cnVlKTtcbn07XG5cbmZ1bmN0aW9uIHJlYWRhYmxlQWRkQ2h1bmsoc3RyZWFtLCBzdGF0ZSwgY2h1bmssIGVuY29kaW5nLCBhZGRUb0Zyb250KSB7XG4gIHZhciBlciA9IGNodW5rSW52YWxpZChzdGF0ZSwgY2h1bmspO1xuICBpZiAoZXIpIHtcbiAgICBzdHJlYW0uZW1pdCgnZXJyb3InLCBlcik7XG4gIH0gZWxzZSBpZiAoY2h1bmsgPT09IG51bGwgfHwgY2h1bmsgPT09IHVuZGVmaW5lZCkge1xuICAgIHN0YXRlLnJlYWRpbmcgPSBmYWxzZTtcbiAgICBpZiAoIXN0YXRlLmVuZGVkKVxuICAgICAgb25Fb2ZDaHVuayhzdHJlYW0sIHN0YXRlKTtcbiAgfSBlbHNlIGlmIChzdGF0ZS5vYmplY3RNb2RlIHx8IGNodW5rICYmIGNodW5rLmxlbmd0aCA+IDApIHtcbiAgICBpZiAoc3RhdGUuZW5kZWQgJiYgIWFkZFRvRnJvbnQpIHtcbiAgICAgIHZhciBlID0gbmV3IEVycm9yKCdzdHJlYW0ucHVzaCgpIGFmdGVyIEVPRicpO1xuICAgICAgc3RyZWFtLmVtaXQoJ2Vycm9yJywgZSk7XG4gICAgfSBlbHNlIGlmIChzdGF0ZS5lbmRFbWl0dGVkICYmIGFkZFRvRnJvbnQpIHtcbiAgICAgIHZhciBlID0gbmV3IEVycm9yKCdzdHJlYW0udW5zaGlmdCgpIGFmdGVyIGVuZCBldmVudCcpO1xuICAgICAgc3RyZWFtLmVtaXQoJ2Vycm9yJywgZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChzdGF0ZS5kZWNvZGVyICYmICFhZGRUb0Zyb250ICYmICFlbmNvZGluZylcbiAgICAgICAgY2h1bmsgPSBzdGF0ZS5kZWNvZGVyLndyaXRlKGNodW5rKTtcblxuICAgICAgLy8gdXBkYXRlIHRoZSBidWZmZXIgaW5mby5cbiAgICAgIHN0YXRlLmxlbmd0aCArPSBzdGF0ZS5vYmplY3RNb2RlID8gMSA6IGNodW5rLmxlbmd0aDtcbiAgICAgIGlmIChhZGRUb0Zyb250KSB7XG4gICAgICAgIHN0YXRlLmJ1ZmZlci51bnNoaWZ0KGNodW5rKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRlLnJlYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgc3RhdGUuYnVmZmVyLnB1c2goY2h1bmspO1xuICAgICAgfVxuXG4gICAgICBpZiAoc3RhdGUubmVlZFJlYWRhYmxlKVxuICAgICAgICBlbWl0UmVhZGFibGUoc3RyZWFtKTtcblxuICAgICAgbWF5YmVSZWFkTW9yZShzdHJlYW0sIHN0YXRlKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoIWFkZFRvRnJvbnQpIHtcbiAgICBzdGF0ZS5yZWFkaW5nID0gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gbmVlZE1vcmVEYXRhKHN0YXRlKTtcbn1cblxuXG5cbi8vIGlmIGl0J3MgcGFzdCB0aGUgaGlnaCB3YXRlciBtYXJrLCB3ZSBjYW4gcHVzaCBpbiBzb21lIG1vcmUuXG4vLyBBbHNvLCBpZiB3ZSBoYXZlIG5vIGRhdGEgeWV0LCB3ZSBjYW4gc3RhbmQgc29tZVxuLy8gbW9yZSBieXRlcy4gIFRoaXMgaXMgdG8gd29yayBhcm91bmQgY2FzZXMgd2hlcmUgaHdtPTAsXG4vLyBzdWNoIGFzIHRoZSByZXBsLiAgQWxzbywgaWYgdGhlIHB1c2goKSB0cmlnZ2VyZWQgYVxuLy8gcmVhZGFibGUgZXZlbnQsIGFuZCB0aGUgdXNlciBjYWxsZWQgcmVhZChsYXJnZU51bWJlcikgc3VjaCB0aGF0XG4vLyBuZWVkUmVhZGFibGUgd2FzIHNldCwgdGhlbiB3ZSBvdWdodCB0byBwdXNoIG1vcmUsIHNvIHRoYXQgYW5vdGhlclxuLy8gJ3JlYWRhYmxlJyBldmVudCB3aWxsIGJlIHRyaWdnZXJlZC5cbmZ1bmN0aW9uIG5lZWRNb3JlRGF0YShzdGF0ZSkge1xuICByZXR1cm4gIXN0YXRlLmVuZGVkICYmXG4gICAgICAgICAoc3RhdGUubmVlZFJlYWRhYmxlIHx8XG4gICAgICAgICAgc3RhdGUubGVuZ3RoIDwgc3RhdGUuaGlnaFdhdGVyTWFyayB8fFxuICAgICAgICAgIHN0YXRlLmxlbmd0aCA9PT0gMCk7XG59XG5cbi8vIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LlxuUmVhZGFibGUucHJvdG90eXBlLnNldEVuY29kaW5nID0gZnVuY3Rpb24oZW5jKSB7XG4gIGlmICghU3RyaW5nRGVjb2RlcilcbiAgICBTdHJpbmdEZWNvZGVyID0gcmVxdWlyZSgnc3RyaW5nX2RlY29kZXIvJykuU3RyaW5nRGVjb2RlcjtcbiAgdGhpcy5fcmVhZGFibGVTdGF0ZS5kZWNvZGVyID0gbmV3IFN0cmluZ0RlY29kZXIoZW5jKTtcbiAgdGhpcy5fcmVhZGFibGVTdGF0ZS5lbmNvZGluZyA9IGVuYztcbn07XG5cbi8vIERvbid0IHJhaXNlIHRoZSBod20gPiAxMjhNQlxudmFyIE1BWF9IV00gPSAweDgwMDAwMDtcbmZ1bmN0aW9uIHJvdW5kVXBUb05leHRQb3dlck9mMihuKSB7XG4gIGlmIChuID49IE1BWF9IV00pIHtcbiAgICBuID0gTUFYX0hXTTtcbiAgfSBlbHNlIHtcbiAgICAvLyBHZXQgdGhlIG5leHQgaGlnaGVzdCBwb3dlciBvZiAyXG4gICAgbi0tO1xuICAgIGZvciAodmFyIHAgPSAxOyBwIDwgMzI7IHAgPDw9IDEpIG4gfD0gbiA+PiBwO1xuICAgIG4rKztcbiAgfVxuICByZXR1cm4gbjtcbn1cblxuZnVuY3Rpb24gaG93TXVjaFRvUmVhZChuLCBzdGF0ZSkge1xuICBpZiAoc3RhdGUubGVuZ3RoID09PSAwICYmIHN0YXRlLmVuZGVkKVxuICAgIHJldHVybiAwO1xuXG4gIGlmIChzdGF0ZS5vYmplY3RNb2RlKVxuICAgIHJldHVybiBuID09PSAwID8gMCA6IDE7XG5cbiAgaWYgKG4gPT09IG51bGwgfHwgaXNOYU4obikpIHtcbiAgICAvLyBvbmx5IGZsb3cgb25lIGJ1ZmZlciBhdCBhIHRpbWVcbiAgICBpZiAoc3RhdGUuZmxvd2luZyAmJiBzdGF0ZS5idWZmZXIubGVuZ3RoKVxuICAgICAgcmV0dXJuIHN0YXRlLmJ1ZmZlclswXS5sZW5ndGg7XG4gICAgZWxzZVxuICAgICAgcmV0dXJuIHN0YXRlLmxlbmd0aDtcbiAgfVxuXG4gIGlmIChuIDw9IDApXG4gICAgcmV0dXJuIDA7XG5cbiAgLy8gSWYgd2UncmUgYXNraW5nIGZvciBtb3JlIHRoYW4gdGhlIHRhcmdldCBidWZmZXIgbGV2ZWwsXG4gIC8vIHRoZW4gcmFpc2UgdGhlIHdhdGVyIG1hcmsuICBCdW1wIHVwIHRvIHRoZSBuZXh0IGhpZ2hlc3RcbiAgLy8gcG93ZXIgb2YgMiwgdG8gcHJldmVudCBpbmNyZWFzaW5nIGl0IGV4Y2Vzc2l2ZWx5IGluIHRpbnlcbiAgLy8gYW1vdW50cy5cbiAgaWYgKG4gPiBzdGF0ZS5oaWdoV2F0ZXJNYXJrKVxuICAgIHN0YXRlLmhpZ2hXYXRlck1hcmsgPSByb3VuZFVwVG9OZXh0UG93ZXJPZjIobik7XG5cbiAgLy8gZG9uJ3QgaGF2ZSB0aGF0IG11Y2guICByZXR1cm4gbnVsbCwgdW5sZXNzIHdlJ3ZlIGVuZGVkLlxuICBpZiAobiA+IHN0YXRlLmxlbmd0aCkge1xuICAgIGlmICghc3RhdGUuZW5kZWQpIHtcbiAgICAgIHN0YXRlLm5lZWRSZWFkYWJsZSA9IHRydWU7XG4gICAgICByZXR1cm4gMDtcbiAgICB9IGVsc2VcbiAgICAgIHJldHVybiBzdGF0ZS5sZW5ndGg7XG4gIH1cblxuICByZXR1cm4gbjtcbn1cblxuLy8geW91IGNhbiBvdmVycmlkZSBlaXRoZXIgdGhpcyBtZXRob2QsIG9yIHRoZSBhc3luYyBfcmVhZChuKSBiZWxvdy5cblJlYWRhYmxlLnByb3RvdHlwZS5yZWFkID0gZnVuY3Rpb24obikge1xuICB2YXIgc3RhdGUgPSB0aGlzLl9yZWFkYWJsZVN0YXRlO1xuICBzdGF0ZS5jYWxsZWRSZWFkID0gdHJ1ZTtcbiAgdmFyIG5PcmlnID0gbjtcbiAgdmFyIHJldDtcblxuICBpZiAodHlwZW9mIG4gIT09ICdudW1iZXInIHx8IG4gPiAwKVxuICAgIHN0YXRlLmVtaXR0ZWRSZWFkYWJsZSA9IGZhbHNlO1xuXG4gIC8vIGlmIHdlJ3JlIGRvaW5nIHJlYWQoMCkgdG8gdHJpZ2dlciBhIHJlYWRhYmxlIGV2ZW50LCBidXQgd2VcbiAgLy8gYWxyZWFkeSBoYXZlIGEgYnVuY2ggb2YgZGF0YSBpbiB0aGUgYnVmZmVyLCB0aGVuIGp1c3QgdHJpZ2dlclxuICAvLyB0aGUgJ3JlYWRhYmxlJyBldmVudCBhbmQgbW92ZSBvbi5cbiAgaWYgKG4gPT09IDAgJiZcbiAgICAgIHN0YXRlLm5lZWRSZWFkYWJsZSAmJlxuICAgICAgKHN0YXRlLmxlbmd0aCA+PSBzdGF0ZS5oaWdoV2F0ZXJNYXJrIHx8IHN0YXRlLmVuZGVkKSkge1xuICAgIGVtaXRSZWFkYWJsZSh0aGlzKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIG4gPSBob3dNdWNoVG9SZWFkKG4sIHN0YXRlKTtcblxuICAvLyBpZiB3ZSd2ZSBlbmRlZCwgYW5kIHdlJ3JlIG5vdyBjbGVhciwgdGhlbiBmaW5pc2ggaXQgdXAuXG4gIGlmIChuID09PSAwICYmIHN0YXRlLmVuZGVkKSB7XG4gICAgcmV0ID0gbnVsbDtcblxuICAgIC8vIEluIGNhc2VzIHdoZXJlIHRoZSBkZWNvZGVyIGRpZCBub3QgcmVjZWl2ZSBlbm91Z2ggZGF0YVxuICAgIC8vIHRvIHByb2R1Y2UgYSBmdWxsIGNodW5rLCB0aGVuIGltbWVkaWF0ZWx5IHJlY2VpdmVkIGFuXG4gICAgLy8gRU9GLCBzdGF0ZS5idWZmZXIgd2lsbCBjb250YWluIFs8QnVmZmVyID4sIDxCdWZmZXIgMDAgLi4uPl0uXG4gICAgLy8gaG93TXVjaFRvUmVhZCB3aWxsIHNlZSB0aGlzIGFuZCBjb2VyY2UgdGhlIGFtb3VudCB0b1xuICAgIC8vIHJlYWQgdG8gemVybyAoYmVjYXVzZSBpdCdzIGxvb2tpbmcgYXQgdGhlIGxlbmd0aCBvZiB0aGVcbiAgICAvLyBmaXJzdCA8QnVmZmVyID4gaW4gc3RhdGUuYnVmZmVyKSwgYW5kIHdlJ2xsIGVuZCB1cCBoZXJlLlxuICAgIC8vXG4gICAgLy8gVGhpcyBjYW4gb25seSBoYXBwZW4gdmlhIHN0YXRlLmRlY29kZXIgLS0gbm8gb3RoZXIgdmVudWVcbiAgICAvLyBleGlzdHMgZm9yIHB1c2hpbmcgYSB6ZXJvLWxlbmd0aCBjaHVuayBpbnRvIHN0YXRlLmJ1ZmZlclxuICAgIC8vIGFuZCB0cmlnZ2VyaW5nIHRoaXMgYmVoYXZpb3IuIEluIHRoaXMgY2FzZSwgd2UgcmV0dXJuIG91clxuICAgIC8vIHJlbWFpbmluZyBkYXRhIGFuZCBlbmQgdGhlIHN0cmVhbSwgaWYgYXBwcm9wcmlhdGUuXG4gICAgaWYgKHN0YXRlLmxlbmd0aCA+IDAgJiYgc3RhdGUuZGVjb2Rlcikge1xuICAgICAgcmV0ID0gZnJvbUxpc3Qobiwgc3RhdGUpO1xuICAgICAgc3RhdGUubGVuZ3RoIC09IHJldC5sZW5ndGg7XG4gICAgfVxuXG4gICAgaWYgKHN0YXRlLmxlbmd0aCA9PT0gMClcbiAgICAgIGVuZFJlYWRhYmxlKHRoaXMpO1xuXG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIC8vIEFsbCB0aGUgYWN0dWFsIGNodW5rIGdlbmVyYXRpb24gbG9naWMgbmVlZHMgdG8gYmVcbiAgLy8gKmJlbG93KiB0aGUgY2FsbCB0byBfcmVhZC4gIFRoZSByZWFzb24gaXMgdGhhdCBpbiBjZXJ0YWluXG4gIC8vIHN5bnRoZXRpYyBzdHJlYW0gY2FzZXMsIHN1Y2ggYXMgcGFzc3Rocm91Z2ggc3RyZWFtcywgX3JlYWRcbiAgLy8gbWF5IGJlIGEgY29tcGxldGVseSBzeW5jaHJvbm91cyBvcGVyYXRpb24gd2hpY2ggbWF5IGNoYW5nZVxuICAvLyB0aGUgc3RhdGUgb2YgdGhlIHJlYWQgYnVmZmVyLCBwcm92aWRpbmcgZW5vdWdoIGRhdGEgd2hlblxuICAvLyBiZWZvcmUgdGhlcmUgd2FzICpub3QqIGVub3VnaC5cbiAgLy9cbiAgLy8gU28sIHRoZSBzdGVwcyBhcmU6XG4gIC8vIDEuIEZpZ3VyZSBvdXQgd2hhdCB0aGUgc3RhdGUgb2YgdGhpbmdzIHdpbGwgYmUgYWZ0ZXIgd2UgZG9cbiAgLy8gYSByZWFkIGZyb20gdGhlIGJ1ZmZlci5cbiAgLy9cbiAgLy8gMi4gSWYgdGhhdCByZXN1bHRpbmcgc3RhdGUgd2lsbCB0cmlnZ2VyIGEgX3JlYWQsIHRoZW4gY2FsbCBfcmVhZC5cbiAgLy8gTm90ZSB0aGF0IHRoaXMgbWF5IGJlIGFzeW5jaHJvbm91cywgb3Igc3luY2hyb25vdXMuICBZZXMsIGl0IGlzXG4gIC8vIGRlZXBseSB1Z2x5IHRvIHdyaXRlIEFQSXMgdGhpcyB3YXksIGJ1dCB0aGF0IHN0aWxsIGRvZXNuJ3QgbWVhblxuICAvLyB0aGF0IHRoZSBSZWFkYWJsZSBjbGFzcyBzaG91bGQgYmVoYXZlIGltcHJvcGVybHksIGFzIHN0cmVhbXMgYXJlXG4gIC8vIGRlc2lnbmVkIHRvIGJlIHN5bmMvYXN5bmMgYWdub3N0aWMuXG4gIC8vIFRha2Ugbm90ZSBpZiB0aGUgX3JlYWQgY2FsbCBpcyBzeW5jIG9yIGFzeW5jIChpZSwgaWYgdGhlIHJlYWQgY2FsbFxuICAvLyBoYXMgcmV0dXJuZWQgeWV0KSwgc28gdGhhdCB3ZSBrbm93IHdoZXRoZXIgb3Igbm90IGl0J3Mgc2FmZSB0byBlbWl0XG4gIC8vICdyZWFkYWJsZScgZXRjLlxuICAvL1xuICAvLyAzLiBBY3R1YWxseSBwdWxsIHRoZSByZXF1ZXN0ZWQgY2h1bmtzIG91dCBvZiB0aGUgYnVmZmVyIGFuZCByZXR1cm4uXG5cbiAgLy8gaWYgd2UgbmVlZCBhIHJlYWRhYmxlIGV2ZW50LCB0aGVuIHdlIG5lZWQgdG8gZG8gc29tZSByZWFkaW5nLlxuICB2YXIgZG9SZWFkID0gc3RhdGUubmVlZFJlYWRhYmxlO1xuXG4gIC8vIGlmIHdlIGN1cnJlbnRseSBoYXZlIGxlc3MgdGhhbiB0aGUgaGlnaFdhdGVyTWFyaywgdGhlbiBhbHNvIHJlYWQgc29tZVxuICBpZiAoc3RhdGUubGVuZ3RoIC0gbiA8PSBzdGF0ZS5oaWdoV2F0ZXJNYXJrKVxuICAgIGRvUmVhZCA9IHRydWU7XG5cbiAgLy8gaG93ZXZlciwgaWYgd2UndmUgZW5kZWQsIHRoZW4gdGhlcmUncyBubyBwb2ludCwgYW5kIGlmIHdlJ3JlIGFscmVhZHlcbiAgLy8gcmVhZGluZywgdGhlbiBpdCdzIHVubmVjZXNzYXJ5LlxuICBpZiAoc3RhdGUuZW5kZWQgfHwgc3RhdGUucmVhZGluZylcbiAgICBkb1JlYWQgPSBmYWxzZTtcblxuICBpZiAoZG9SZWFkKSB7XG4gICAgc3RhdGUucmVhZGluZyA9IHRydWU7XG4gICAgc3RhdGUuc3luYyA9IHRydWU7XG4gICAgLy8gaWYgdGhlIGxlbmd0aCBpcyBjdXJyZW50bHkgemVybywgdGhlbiB3ZSAqbmVlZCogYSByZWFkYWJsZSBldmVudC5cbiAgICBpZiAoc3RhdGUubGVuZ3RoID09PSAwKVxuICAgICAgc3RhdGUubmVlZFJlYWRhYmxlID0gdHJ1ZTtcbiAgICAvLyBjYWxsIGludGVybmFsIHJlYWQgbWV0aG9kXG4gICAgdGhpcy5fcmVhZChzdGF0ZS5oaWdoV2F0ZXJNYXJrKTtcbiAgICBzdGF0ZS5zeW5jID0gZmFsc2U7XG4gIH1cblxuICAvLyBJZiBfcmVhZCBjYWxsZWQgaXRzIGNhbGxiYWNrIHN5bmNocm9ub3VzbHksIHRoZW4gYHJlYWRpbmdgXG4gIC8vIHdpbGwgYmUgZmFsc2UsIGFuZCB3ZSBuZWVkIHRvIHJlLWV2YWx1YXRlIGhvdyBtdWNoIGRhdGEgd2VcbiAgLy8gY2FuIHJldHVybiB0byB0aGUgdXNlci5cbiAgaWYgKGRvUmVhZCAmJiAhc3RhdGUucmVhZGluZylcbiAgICBuID0gaG93TXVjaFRvUmVhZChuT3JpZywgc3RhdGUpO1xuXG4gIGlmIChuID4gMClcbiAgICByZXQgPSBmcm9tTGlzdChuLCBzdGF0ZSk7XG4gIGVsc2VcbiAgICByZXQgPSBudWxsO1xuXG4gIGlmIChyZXQgPT09IG51bGwpIHtcbiAgICBzdGF0ZS5uZWVkUmVhZGFibGUgPSB0cnVlO1xuICAgIG4gPSAwO1xuICB9XG5cbiAgc3RhdGUubGVuZ3RoIC09IG47XG5cbiAgLy8gSWYgd2UgaGF2ZSBub3RoaW5nIGluIHRoZSBidWZmZXIsIHRoZW4gd2Ugd2FudCB0byBrbm93XG4gIC8vIGFzIHNvb24gYXMgd2UgKmRvKiBnZXQgc29tZXRoaW5nIGludG8gdGhlIGJ1ZmZlci5cbiAgaWYgKHN0YXRlLmxlbmd0aCA9PT0gMCAmJiAhc3RhdGUuZW5kZWQpXG4gICAgc3RhdGUubmVlZFJlYWRhYmxlID0gdHJ1ZTtcblxuICAvLyBJZiB3ZSBoYXBwZW5lZCB0byByZWFkKCkgZXhhY3RseSB0aGUgcmVtYWluaW5nIGFtb3VudCBpbiB0aGVcbiAgLy8gYnVmZmVyLCBhbmQgdGhlIEVPRiBoYXMgYmVlbiBzZWVuIGF0IHRoaXMgcG9pbnQsIHRoZW4gbWFrZSBzdXJlXG4gIC8vIHRoYXQgd2UgZW1pdCAnZW5kJyBvbiB0aGUgdmVyeSBuZXh0IHRpY2suXG4gIGlmIChzdGF0ZS5lbmRlZCAmJiAhc3RhdGUuZW5kRW1pdHRlZCAmJiBzdGF0ZS5sZW5ndGggPT09IDApXG4gICAgZW5kUmVhZGFibGUodGhpcyk7XG5cbiAgcmV0dXJuIHJldDtcbn07XG5cbmZ1bmN0aW9uIGNodW5rSW52YWxpZChzdGF0ZSwgY2h1bmspIHtcbiAgdmFyIGVyID0gbnVsbDtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoY2h1bmspICYmXG4gICAgICAnc3RyaW5nJyAhPT0gdHlwZW9mIGNodW5rICYmXG4gICAgICBjaHVuayAhPT0gbnVsbCAmJlxuICAgICAgY2h1bmsgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgIXN0YXRlLm9iamVjdE1vZGUpIHtcbiAgICBlciA9IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgbm9uLXN0cmluZy9idWZmZXIgY2h1bmsnKTtcbiAgfVxuICByZXR1cm4gZXI7XG59XG5cblxuZnVuY3Rpb24gb25Fb2ZDaHVuayhzdHJlYW0sIHN0YXRlKSB7XG4gIGlmIChzdGF0ZS5kZWNvZGVyICYmICFzdGF0ZS5lbmRlZCkge1xuICAgIHZhciBjaHVuayA9IHN0YXRlLmRlY29kZXIuZW5kKCk7XG4gICAgaWYgKGNodW5rICYmIGNodW5rLmxlbmd0aCkge1xuICAgICAgc3RhdGUuYnVmZmVyLnB1c2goY2h1bmspO1xuICAgICAgc3RhdGUubGVuZ3RoICs9IHN0YXRlLm9iamVjdE1vZGUgPyAxIDogY2h1bmsubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBzdGF0ZS5lbmRlZCA9IHRydWU7XG5cbiAgLy8gaWYgd2UndmUgZW5kZWQgYW5kIHdlIGhhdmUgc29tZSBkYXRhIGxlZnQsIHRoZW4gZW1pdFxuICAvLyAncmVhZGFibGUnIG5vdyB0byBtYWtlIHN1cmUgaXQgZ2V0cyBwaWNrZWQgdXAuXG4gIGlmIChzdGF0ZS5sZW5ndGggPiAwKVxuICAgIGVtaXRSZWFkYWJsZShzdHJlYW0pO1xuICBlbHNlXG4gICAgZW5kUmVhZGFibGUoc3RyZWFtKTtcbn1cblxuLy8gRG9uJ3QgZW1pdCByZWFkYWJsZSByaWdodCBhd2F5IGluIHN5bmMgbW9kZSwgYmVjYXVzZSB0aGlzIGNhbiB0cmlnZ2VyXG4vLyBhbm90aGVyIHJlYWQoKSBjYWxsID0+IHN0YWNrIG92ZXJmbG93LiAgVGhpcyB3YXksIGl0IG1pZ2h0IHRyaWdnZXJcbi8vIGEgbmV4dFRpY2sgcmVjdXJzaW9uIHdhcm5pbmcsIGJ1dCB0aGF0J3Mgbm90IHNvIGJhZC5cbmZ1bmN0aW9uIGVtaXRSZWFkYWJsZShzdHJlYW0pIHtcbiAgdmFyIHN0YXRlID0gc3RyZWFtLl9yZWFkYWJsZVN0YXRlO1xuICBzdGF0ZS5uZWVkUmVhZGFibGUgPSBmYWxzZTtcbiAgaWYgKHN0YXRlLmVtaXR0ZWRSZWFkYWJsZSlcbiAgICByZXR1cm47XG5cbiAgc3RhdGUuZW1pdHRlZFJlYWRhYmxlID0gdHJ1ZTtcbiAgaWYgKHN0YXRlLnN5bmMpXG4gICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgIGVtaXRSZWFkYWJsZV8oc3RyZWFtKTtcbiAgICB9KTtcbiAgZWxzZVxuICAgIGVtaXRSZWFkYWJsZV8oc3RyZWFtKTtcbn1cblxuZnVuY3Rpb24gZW1pdFJlYWRhYmxlXyhzdHJlYW0pIHtcbiAgc3RyZWFtLmVtaXQoJ3JlYWRhYmxlJyk7XG59XG5cblxuLy8gYXQgdGhpcyBwb2ludCwgdGhlIHVzZXIgaGFzIHByZXN1bWFibHkgc2VlbiB0aGUgJ3JlYWRhYmxlJyBldmVudCxcbi8vIGFuZCBjYWxsZWQgcmVhZCgpIHRvIGNvbnN1bWUgc29tZSBkYXRhLiAgdGhhdCBtYXkgaGF2ZSB0cmlnZ2VyZWRcbi8vIGluIHR1cm4gYW5vdGhlciBfcmVhZChuKSBjYWxsLCBpbiB3aGljaCBjYXNlIHJlYWRpbmcgPSB0cnVlIGlmXG4vLyBpdCdzIGluIHByb2dyZXNzLlxuLy8gSG93ZXZlciwgaWYgd2UncmUgbm90IGVuZGVkLCBvciByZWFkaW5nLCBhbmQgdGhlIGxlbmd0aCA8IGh3bSxcbi8vIHRoZW4gZ28gYWhlYWQgYW5kIHRyeSB0byByZWFkIHNvbWUgbW9yZSBwcmVlbXB0aXZlbHkuXG5mdW5jdGlvbiBtYXliZVJlYWRNb3JlKHN0cmVhbSwgc3RhdGUpIHtcbiAgaWYgKCFzdGF0ZS5yZWFkaW5nTW9yZSkge1xuICAgIHN0YXRlLnJlYWRpbmdNb3JlID0gdHJ1ZTtcbiAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgbWF5YmVSZWFkTW9yZV8oc3RyZWFtLCBzdGF0ZSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbWF5YmVSZWFkTW9yZV8oc3RyZWFtLCBzdGF0ZSkge1xuICB2YXIgbGVuID0gc3RhdGUubGVuZ3RoO1xuICB3aGlsZSAoIXN0YXRlLnJlYWRpbmcgJiYgIXN0YXRlLmZsb3dpbmcgJiYgIXN0YXRlLmVuZGVkICYmXG4gICAgICAgICBzdGF0ZS5sZW5ndGggPCBzdGF0ZS5oaWdoV2F0ZXJNYXJrKSB7XG4gICAgc3RyZWFtLnJlYWQoMCk7XG4gICAgaWYgKGxlbiA9PT0gc3RhdGUubGVuZ3RoKVxuICAgICAgLy8gZGlkbid0IGdldCBhbnkgZGF0YSwgc3RvcCBzcGlubmluZy5cbiAgICAgIGJyZWFrO1xuICAgIGVsc2VcbiAgICAgIGxlbiA9IHN0YXRlLmxlbmd0aDtcbiAgfVxuICBzdGF0ZS5yZWFkaW5nTW9yZSA9IGZhbHNlO1xufVxuXG4vLyBhYnN0cmFjdCBtZXRob2QuICB0byBiZSBvdmVycmlkZGVuIGluIHNwZWNpZmljIGltcGxlbWVudGF0aW9uIGNsYXNzZXMuXG4vLyBjYWxsIGNiKGVyLCBkYXRhKSB3aGVyZSBkYXRhIGlzIDw9IG4gaW4gbGVuZ3RoLlxuLy8gZm9yIHZpcnR1YWwgKG5vbi1zdHJpbmcsIG5vbi1idWZmZXIpIHN0cmVhbXMsIFwibGVuZ3RoXCIgaXMgc29tZXdoYXRcbi8vIGFyYml0cmFyeSwgYW5kIHBlcmhhcHMgbm90IHZlcnkgbWVhbmluZ2Z1bC5cblJlYWRhYmxlLnByb3RvdHlwZS5fcmVhZCA9IGZ1bmN0aW9uKG4pIHtcbiAgdGhpcy5lbWl0KCdlcnJvcicsIG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJykpO1xufTtcblxuUmVhZGFibGUucHJvdG90eXBlLnBpcGUgPSBmdW5jdGlvbihkZXN0LCBwaXBlT3B0cykge1xuICB2YXIgc3JjID0gdGhpcztcbiAgdmFyIHN0YXRlID0gdGhpcy5fcmVhZGFibGVTdGF0ZTtcblxuICBzd2l0Y2ggKHN0YXRlLnBpcGVzQ291bnQpIHtcbiAgICBjYXNlIDA6XG4gICAgICBzdGF0ZS5waXBlcyA9IGRlc3Q7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDE6XG4gICAgICBzdGF0ZS5waXBlcyA9IFtzdGF0ZS5waXBlcywgZGVzdF07XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgc3RhdGUucGlwZXMucHVzaChkZXN0KTtcbiAgICAgIGJyZWFrO1xuICB9XG4gIHN0YXRlLnBpcGVzQ291bnQgKz0gMTtcblxuICB2YXIgZG9FbmQgPSAoIXBpcGVPcHRzIHx8IHBpcGVPcHRzLmVuZCAhPT0gZmFsc2UpICYmXG4gICAgICAgICAgICAgIGRlc3QgIT09IHByb2Nlc3Muc3Rkb3V0ICYmXG4gICAgICAgICAgICAgIGRlc3QgIT09IHByb2Nlc3Muc3RkZXJyO1xuXG4gIHZhciBlbmRGbiA9IGRvRW5kID8gb25lbmQgOiBjbGVhbnVwO1xuICBpZiAoc3RhdGUuZW5kRW1pdHRlZClcbiAgICBwcm9jZXNzLm5leHRUaWNrKGVuZEZuKTtcbiAgZWxzZVxuICAgIHNyYy5vbmNlKCdlbmQnLCBlbmRGbik7XG5cbiAgZGVzdC5vbigndW5waXBlJywgb251bnBpcGUpO1xuICBmdW5jdGlvbiBvbnVucGlwZShyZWFkYWJsZSkge1xuICAgIGlmIChyZWFkYWJsZSAhPT0gc3JjKSByZXR1cm47XG4gICAgY2xlYW51cCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gb25lbmQoKSB7XG4gICAgZGVzdC5lbmQoKTtcbiAgfVxuXG4gIC8vIHdoZW4gdGhlIGRlc3QgZHJhaW5zLCBpdCByZWR1Y2VzIHRoZSBhd2FpdERyYWluIGNvdW50ZXJcbiAgLy8gb24gdGhlIHNvdXJjZS4gIFRoaXMgd291bGQgYmUgbW9yZSBlbGVnYW50IHdpdGggYSAub25jZSgpXG4gIC8vIGhhbmRsZXIgaW4gZmxvdygpLCBidXQgYWRkaW5nIGFuZCByZW1vdmluZyByZXBlYXRlZGx5IGlzXG4gIC8vIHRvbyBzbG93LlxuICB2YXIgb25kcmFpbiA9IHBpcGVPbkRyYWluKHNyYyk7XG4gIGRlc3Qub24oJ2RyYWluJywgb25kcmFpbik7XG5cbiAgZnVuY3Rpb24gY2xlYW51cCgpIHtcbiAgICAvLyBjbGVhbnVwIGV2ZW50IGhhbmRsZXJzIG9uY2UgdGhlIHBpcGUgaXMgYnJva2VuXG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignY2xvc2UnLCBvbmNsb3NlKTtcbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdmaW5pc2gnLCBvbmZpbmlzaCk7XG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignZHJhaW4nLCBvbmRyYWluKTtcbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIG9uZXJyb3IpO1xuICAgIGRlc3QucmVtb3ZlTGlzdGVuZXIoJ3VucGlwZScsIG9udW5waXBlKTtcbiAgICBzcmMucmVtb3ZlTGlzdGVuZXIoJ2VuZCcsIG9uZW5kKTtcbiAgICBzcmMucmVtb3ZlTGlzdGVuZXIoJ2VuZCcsIGNsZWFudXApO1xuXG4gICAgLy8gaWYgdGhlIHJlYWRlciBpcyB3YWl0aW5nIGZvciBhIGRyYWluIGV2ZW50IGZyb20gdGhpc1xuICAgIC8vIHNwZWNpZmljIHdyaXRlciwgdGhlbiBpdCB3b3VsZCBjYXVzZSBpdCB0byBuZXZlciBzdGFydFxuICAgIC8vIGZsb3dpbmcgYWdhaW4uXG4gICAgLy8gU28sIGlmIHRoaXMgaXMgYXdhaXRpbmcgYSBkcmFpbiwgdGhlbiB3ZSBqdXN0IGNhbGwgaXQgbm93LlxuICAgIC8vIElmIHdlIGRvbid0IGtub3csIHRoZW4gYXNzdW1lIHRoYXQgd2UgYXJlIHdhaXRpbmcgZm9yIG9uZS5cbiAgICBpZiAoIWRlc3QuX3dyaXRhYmxlU3RhdGUgfHwgZGVzdC5fd3JpdGFibGVTdGF0ZS5uZWVkRHJhaW4pXG4gICAgICBvbmRyYWluKCk7XG4gIH1cblxuICAvLyBpZiB0aGUgZGVzdCBoYXMgYW4gZXJyb3IsIHRoZW4gc3RvcCBwaXBpbmcgaW50byBpdC5cbiAgLy8gaG93ZXZlciwgZG9uJ3Qgc3VwcHJlc3MgdGhlIHRocm93aW5nIGJlaGF2aW9yIGZvciB0aGlzLlxuICBmdW5jdGlvbiBvbmVycm9yKGVyKSB7XG4gICAgdW5waXBlKCk7XG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBvbmVycm9yKTtcbiAgICBpZiAoRUUubGlzdGVuZXJDb3VudChkZXN0LCAnZXJyb3InKSA9PT0gMClcbiAgICAgIGRlc3QuZW1pdCgnZXJyb3InLCBlcik7XG4gIH1cbiAgLy8gVGhpcyBpcyBhIGJydXRhbGx5IHVnbHkgaGFjayB0byBtYWtlIHN1cmUgdGhhdCBvdXIgZXJyb3IgaGFuZGxlclxuICAvLyBpcyBhdHRhY2hlZCBiZWZvcmUgYW55IHVzZXJsYW5kIG9uZXMuICBORVZFUiBETyBUSElTLlxuICBpZiAoIWRlc3QuX2V2ZW50cyB8fCAhZGVzdC5fZXZlbnRzLmVycm9yKVxuICAgIGRlc3Qub24oJ2Vycm9yJywgb25lcnJvcik7XG4gIGVsc2UgaWYgKGlzQXJyYXkoZGVzdC5fZXZlbnRzLmVycm9yKSlcbiAgICBkZXN0Ll9ldmVudHMuZXJyb3IudW5zaGlmdChvbmVycm9yKTtcbiAgZWxzZVxuICAgIGRlc3QuX2V2ZW50cy5lcnJvciA9IFtvbmVycm9yLCBkZXN0Ll9ldmVudHMuZXJyb3JdO1xuXG5cblxuICAvLyBCb3RoIGNsb3NlIGFuZCBmaW5pc2ggc2hvdWxkIHRyaWdnZXIgdW5waXBlLCBidXQgb25seSBvbmNlLlxuICBmdW5jdGlvbiBvbmNsb3NlKCkge1xuICAgIGRlc3QucmVtb3ZlTGlzdGVuZXIoJ2ZpbmlzaCcsIG9uZmluaXNoKTtcbiAgICB1bnBpcGUoKTtcbiAgfVxuICBkZXN0Lm9uY2UoJ2Nsb3NlJywgb25jbG9zZSk7XG4gIGZ1bmN0aW9uIG9uZmluaXNoKCkge1xuICAgIGRlc3QucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgb25jbG9zZSk7XG4gICAgdW5waXBlKCk7XG4gIH1cbiAgZGVzdC5vbmNlKCdmaW5pc2gnLCBvbmZpbmlzaCk7XG5cbiAgZnVuY3Rpb24gdW5waXBlKCkge1xuICAgIHNyYy51bnBpcGUoZGVzdCk7XG4gIH1cblxuICAvLyB0ZWxsIHRoZSBkZXN0IHRoYXQgaXQncyBiZWluZyBwaXBlZCB0b1xuICBkZXN0LmVtaXQoJ3BpcGUnLCBzcmMpO1xuXG4gIC8vIHN0YXJ0IHRoZSBmbG93IGlmIGl0IGhhc24ndCBiZWVuIHN0YXJ0ZWQgYWxyZWFkeS5cbiAgaWYgKCFzdGF0ZS5mbG93aW5nKSB7XG4gICAgLy8gdGhlIGhhbmRsZXIgdGhhdCB3YWl0cyBmb3IgcmVhZGFibGUgZXZlbnRzIGFmdGVyIGFsbFxuICAgIC8vIHRoZSBkYXRhIGdldHMgc3Vja2VkIG91dCBpbiBmbG93LlxuICAgIC8vIFRoaXMgd291bGQgYmUgZWFzaWVyIHRvIGZvbGxvdyB3aXRoIGEgLm9uY2UoKSBoYW5kbGVyXG4gICAgLy8gaW4gZmxvdygpLCBidXQgdGhhdCBpcyB0b28gc2xvdy5cbiAgICB0aGlzLm9uKCdyZWFkYWJsZScsIHBpcGVPblJlYWRhYmxlKTtcblxuICAgIHN0YXRlLmZsb3dpbmcgPSB0cnVlO1xuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICBmbG93KHNyYyk7XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gZGVzdDtcbn07XG5cbmZ1bmN0aW9uIHBpcGVPbkRyYWluKHNyYykge1xuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGRlc3QgPSB0aGlzO1xuICAgIHZhciBzdGF0ZSA9IHNyYy5fcmVhZGFibGVTdGF0ZTtcbiAgICBzdGF0ZS5hd2FpdERyYWluLS07XG4gICAgaWYgKHN0YXRlLmF3YWl0RHJhaW4gPT09IDApXG4gICAgICBmbG93KHNyYyk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGZsb3coc3JjKSB7XG4gIHZhciBzdGF0ZSA9IHNyYy5fcmVhZGFibGVTdGF0ZTtcbiAgdmFyIGNodW5rO1xuICBzdGF0ZS5hd2FpdERyYWluID0gMDtcblxuICBmdW5jdGlvbiB3cml0ZShkZXN0LCBpLCBsaXN0KSB7XG4gICAgdmFyIHdyaXR0ZW4gPSBkZXN0LndyaXRlKGNodW5rKTtcbiAgICBpZiAoZmFsc2UgPT09IHdyaXR0ZW4pIHtcbiAgICAgIHN0YXRlLmF3YWl0RHJhaW4rKztcbiAgICB9XG4gIH1cblxuICB3aGlsZSAoc3RhdGUucGlwZXNDb3VudCAmJiBudWxsICE9PSAoY2h1bmsgPSBzcmMucmVhZCgpKSkge1xuXG4gICAgaWYgKHN0YXRlLnBpcGVzQ291bnQgPT09IDEpXG4gICAgICB3cml0ZShzdGF0ZS5waXBlcywgMCwgbnVsbCk7XG4gICAgZWxzZVxuICAgICAgZm9yRWFjaChzdGF0ZS5waXBlcywgd3JpdGUpO1xuXG4gICAgc3JjLmVtaXQoJ2RhdGEnLCBjaHVuayk7XG5cbiAgICAvLyBpZiBhbnlvbmUgbmVlZHMgYSBkcmFpbiwgdGhlbiB3ZSBoYXZlIHRvIHdhaXQgZm9yIHRoYXQuXG4gICAgaWYgKHN0YXRlLmF3YWl0RHJhaW4gPiAwKVxuICAgICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gaWYgZXZlcnkgZGVzdGluYXRpb24gd2FzIHVucGlwZWQsIGVpdGhlciBiZWZvcmUgZW50ZXJpbmcgdGhpc1xuICAvLyBmdW5jdGlvbiwgb3IgaW4gdGhlIHdoaWxlIGxvb3AsIHRoZW4gc3RvcCBmbG93aW5nLlxuICAvL1xuICAvLyBOQjogVGhpcyBpcyBhIHByZXR0eSByYXJlIGVkZ2UgY2FzZS5cbiAgaWYgKHN0YXRlLnBpcGVzQ291bnQgPT09IDApIHtcbiAgICBzdGF0ZS5mbG93aW5nID0gZmFsc2U7XG5cbiAgICAvLyBpZiB0aGVyZSB3ZXJlIGRhdGEgZXZlbnQgbGlzdGVuZXJzIGFkZGVkLCB0aGVuIHN3aXRjaCB0byBvbGQgbW9kZS5cbiAgICBpZiAoRUUubGlzdGVuZXJDb3VudChzcmMsICdkYXRhJykgPiAwKVxuICAgICAgZW1pdERhdGFFdmVudHMoc3JjKTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBhdCB0aGlzIHBvaW50LCBubyBvbmUgbmVlZGVkIGEgZHJhaW4sIHNvIHdlIGp1c3QgcmFuIG91dCBvZiBkYXRhXG4gIC8vIG9uIHRoZSBuZXh0IHJlYWRhYmxlIGV2ZW50LCBzdGFydCBpdCBvdmVyIGFnYWluLlxuICBzdGF0ZS5yYW5PdXQgPSB0cnVlO1xufVxuXG5mdW5jdGlvbiBwaXBlT25SZWFkYWJsZSgpIHtcbiAgaWYgKHRoaXMuX3JlYWRhYmxlU3RhdGUucmFuT3V0KSB7XG4gICAgdGhpcy5fcmVhZGFibGVTdGF0ZS5yYW5PdXQgPSBmYWxzZTtcbiAgICBmbG93KHRoaXMpO1xuICB9XG59XG5cblxuUmVhZGFibGUucHJvdG90eXBlLnVucGlwZSA9IGZ1bmN0aW9uKGRlc3QpIHtcbiAgdmFyIHN0YXRlID0gdGhpcy5fcmVhZGFibGVTdGF0ZTtcblxuICAvLyBpZiB3ZSdyZSBub3QgcGlwaW5nIGFueXdoZXJlLCB0aGVuIGRvIG5vdGhpbmcuXG4gIGlmIChzdGF0ZS5waXBlc0NvdW50ID09PSAwKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIGp1c3Qgb25lIGRlc3RpbmF0aW9uLiAgbW9zdCBjb21tb24gY2FzZS5cbiAgaWYgKHN0YXRlLnBpcGVzQ291bnQgPT09IDEpIHtcbiAgICAvLyBwYXNzZWQgaW4gb25lLCBidXQgaXQncyBub3QgdGhlIHJpZ2h0IG9uZS5cbiAgICBpZiAoZGVzdCAmJiBkZXN0ICE9PSBzdGF0ZS5waXBlcylcbiAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgaWYgKCFkZXN0KVxuICAgICAgZGVzdCA9IHN0YXRlLnBpcGVzO1xuXG4gICAgLy8gZ290IGEgbWF0Y2guXG4gICAgc3RhdGUucGlwZXMgPSBudWxsO1xuICAgIHN0YXRlLnBpcGVzQ291bnQgPSAwO1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIoJ3JlYWRhYmxlJywgcGlwZU9uUmVhZGFibGUpO1xuICAgIHN0YXRlLmZsb3dpbmcgPSBmYWxzZTtcbiAgICBpZiAoZGVzdClcbiAgICAgIGRlc3QuZW1pdCgndW5waXBlJywgdGhpcyk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBzbG93IGNhc2UuIG11bHRpcGxlIHBpcGUgZGVzdGluYXRpb25zLlxuXG4gIGlmICghZGVzdCkge1xuICAgIC8vIHJlbW92ZSBhbGwuXG4gICAgdmFyIGRlc3RzID0gc3RhdGUucGlwZXM7XG4gICAgdmFyIGxlbiA9IHN0YXRlLnBpcGVzQ291bnQ7XG4gICAgc3RhdGUucGlwZXMgPSBudWxsO1xuICAgIHN0YXRlLnBpcGVzQ291bnQgPSAwO1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIoJ3JlYWRhYmxlJywgcGlwZU9uUmVhZGFibGUpO1xuICAgIHN0YXRlLmZsb3dpbmcgPSBmYWxzZTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICBkZXN0c1tpXS5lbWl0KCd1bnBpcGUnLCB0aGlzKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIHRyeSB0byBmaW5kIHRoZSByaWdodCBvbmUuXG4gIHZhciBpID0gaW5kZXhPZihzdGF0ZS5waXBlcywgZGVzdCk7XG4gIGlmIChpID09PSAtMSlcbiAgICByZXR1cm4gdGhpcztcblxuICBzdGF0ZS5waXBlcy5zcGxpY2UoaSwgMSk7XG4gIHN0YXRlLnBpcGVzQ291bnQgLT0gMTtcbiAgaWYgKHN0YXRlLnBpcGVzQ291bnQgPT09IDEpXG4gICAgc3RhdGUucGlwZXMgPSBzdGF0ZS5waXBlc1swXTtcblxuICBkZXN0LmVtaXQoJ3VucGlwZScsIHRoaXMpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gc2V0IHVwIGRhdGEgZXZlbnRzIGlmIHRoZXkgYXJlIGFza2VkIGZvclxuLy8gRW5zdXJlIHJlYWRhYmxlIGxpc3RlbmVycyBldmVudHVhbGx5IGdldCBzb21ldGhpbmdcblJlYWRhYmxlLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uKGV2LCBmbikge1xuICB2YXIgcmVzID0gU3RyZWFtLnByb3RvdHlwZS5vbi5jYWxsKHRoaXMsIGV2LCBmbik7XG5cbiAgaWYgKGV2ID09PSAnZGF0YScgJiYgIXRoaXMuX3JlYWRhYmxlU3RhdGUuZmxvd2luZylcbiAgICBlbWl0RGF0YUV2ZW50cyh0aGlzKTtcblxuICBpZiAoZXYgPT09ICdyZWFkYWJsZScgJiYgdGhpcy5yZWFkYWJsZSkge1xuICAgIHZhciBzdGF0ZSA9IHRoaXMuX3JlYWRhYmxlU3RhdGU7XG4gICAgaWYgKCFzdGF0ZS5yZWFkYWJsZUxpc3RlbmluZykge1xuICAgICAgc3RhdGUucmVhZGFibGVMaXN0ZW5pbmcgPSB0cnVlO1xuICAgICAgc3RhdGUuZW1pdHRlZFJlYWRhYmxlID0gZmFsc2U7XG4gICAgICBzdGF0ZS5uZWVkUmVhZGFibGUgPSB0cnVlO1xuICAgICAgaWYgKCFzdGF0ZS5yZWFkaW5nKSB7XG4gICAgICAgIHRoaXMucmVhZCgwKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUubGVuZ3RoKSB7XG4gICAgICAgIGVtaXRSZWFkYWJsZSh0aGlzLCBzdGF0ZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlcztcbn07XG5SZWFkYWJsZS5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBSZWFkYWJsZS5wcm90b3R5cGUub247XG5cbi8vIHBhdXNlKCkgYW5kIHJlc3VtZSgpIGFyZSByZW1uYW50cyBvZiB0aGUgbGVnYWN5IHJlYWRhYmxlIHN0cmVhbSBBUElcbi8vIElmIHRoZSB1c2VyIHVzZXMgdGhlbSwgdGhlbiBzd2l0Y2ggaW50byBvbGQgbW9kZS5cblJlYWRhYmxlLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbigpIHtcbiAgZW1pdERhdGFFdmVudHModGhpcyk7XG4gIHRoaXMucmVhZCgwKTtcbiAgdGhpcy5lbWl0KCdyZXN1bWUnKTtcbn07XG5cblJlYWRhYmxlLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICBlbWl0RGF0YUV2ZW50cyh0aGlzLCB0cnVlKTtcbiAgdGhpcy5lbWl0KCdwYXVzZScpO1xufTtcblxuZnVuY3Rpb24gZW1pdERhdGFFdmVudHMoc3RyZWFtLCBzdGFydFBhdXNlZCkge1xuICB2YXIgc3RhdGUgPSBzdHJlYW0uX3JlYWRhYmxlU3RhdGU7XG5cbiAgaWYgKHN0YXRlLmZsb3dpbmcpIHtcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vaXNhYWNzL3JlYWRhYmxlLXN0cmVhbS9pc3N1ZXMvMTZcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBzd2l0Y2ggdG8gb2xkIG1vZGUgbm93LicpO1xuICB9XG5cbiAgdmFyIHBhdXNlZCA9IHN0YXJ0UGF1c2VkIHx8IGZhbHNlO1xuICB2YXIgcmVhZGFibGUgPSBmYWxzZTtcblxuICAvLyBjb252ZXJ0IHRvIGFuIG9sZC1zdHlsZSBzdHJlYW0uXG4gIHN0cmVhbS5yZWFkYWJsZSA9IHRydWU7XG4gIHN0cmVhbS5waXBlID0gU3RyZWFtLnByb3RvdHlwZS5waXBlO1xuICBzdHJlYW0ub24gPSBzdHJlYW0uYWRkTGlzdGVuZXIgPSBTdHJlYW0ucHJvdG90eXBlLm9uO1xuXG4gIHN0cmVhbS5vbigncmVhZGFibGUnLCBmdW5jdGlvbigpIHtcbiAgICByZWFkYWJsZSA9IHRydWU7XG5cbiAgICB2YXIgYztcbiAgICB3aGlsZSAoIXBhdXNlZCAmJiAobnVsbCAhPT0gKGMgPSBzdHJlYW0ucmVhZCgpKSkpXG4gICAgICBzdHJlYW0uZW1pdCgnZGF0YScsIGMpO1xuXG4gICAgaWYgKGMgPT09IG51bGwpIHtcbiAgICAgIHJlYWRhYmxlID0gZmFsc2U7XG4gICAgICBzdHJlYW0uX3JlYWRhYmxlU3RhdGUubmVlZFJlYWRhYmxlID0gdHJ1ZTtcbiAgICB9XG4gIH0pO1xuXG4gIHN0cmVhbS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICAgIHBhdXNlZCA9IHRydWU7XG4gICAgdGhpcy5lbWl0KCdwYXVzZScpO1xuICB9O1xuXG4gIHN0cmVhbS5yZXN1bWUgPSBmdW5jdGlvbigpIHtcbiAgICBwYXVzZWQgPSBmYWxzZTtcbiAgICBpZiAocmVhZGFibGUpXG4gICAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICBzdHJlYW0uZW1pdCgncmVhZGFibGUnKTtcbiAgICAgIH0pO1xuICAgIGVsc2VcbiAgICAgIHRoaXMucmVhZCgwKTtcbiAgICB0aGlzLmVtaXQoJ3Jlc3VtZScpO1xuICB9O1xuXG4gIC8vIG5vdyBtYWtlIGl0IHN0YXJ0LCBqdXN0IGluIGNhc2UgaXQgaGFkbid0IGFscmVhZHkuXG4gIHN0cmVhbS5lbWl0KCdyZWFkYWJsZScpO1xufVxuXG4vLyB3cmFwIGFuIG9sZC1zdHlsZSBzdHJlYW0gYXMgdGhlIGFzeW5jIGRhdGEgc291cmNlLlxuLy8gVGhpcyBpcyAqbm90KiBwYXJ0IG9mIHRoZSByZWFkYWJsZSBzdHJlYW0gaW50ZXJmYWNlLlxuLy8gSXQgaXMgYW4gdWdseSB1bmZvcnR1bmF0ZSBtZXNzIG9mIGhpc3RvcnkuXG5SZWFkYWJsZS5wcm90b3R5cGUud3JhcCA9IGZ1bmN0aW9uKHN0cmVhbSkge1xuICB2YXIgc3RhdGUgPSB0aGlzLl9yZWFkYWJsZVN0YXRlO1xuICB2YXIgcGF1c2VkID0gZmFsc2U7XG5cbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBzdHJlYW0ub24oJ2VuZCcsIGZ1bmN0aW9uKCkge1xuICAgIGlmIChzdGF0ZS5kZWNvZGVyICYmICFzdGF0ZS5lbmRlZCkge1xuICAgICAgdmFyIGNodW5rID0gc3RhdGUuZGVjb2Rlci5lbmQoKTtcbiAgICAgIGlmIChjaHVuayAmJiBjaHVuay5sZW5ndGgpXG4gICAgICAgIHNlbGYucHVzaChjaHVuayk7XG4gICAgfVxuXG4gICAgc2VsZi5wdXNoKG51bGwpO1xuICB9KTtcblxuICBzdHJlYW0ub24oJ2RhdGEnLCBmdW5jdGlvbihjaHVuaykge1xuICAgIGlmIChzdGF0ZS5kZWNvZGVyKVxuICAgICAgY2h1bmsgPSBzdGF0ZS5kZWNvZGVyLndyaXRlKGNodW5rKTtcblxuICAgIC8vIGRvbid0IHNraXAgb3ZlciBmYWxzeSB2YWx1ZXMgaW4gb2JqZWN0TW9kZVxuICAgIC8vaWYgKHN0YXRlLm9iamVjdE1vZGUgJiYgdXRpbC5pc051bGxPclVuZGVmaW5lZChjaHVuaykpXG4gICAgaWYgKHN0YXRlLm9iamVjdE1vZGUgJiYgKGNodW5rID09PSBudWxsIHx8IGNodW5rID09PSB1bmRlZmluZWQpKVxuICAgICAgcmV0dXJuO1xuICAgIGVsc2UgaWYgKCFzdGF0ZS5vYmplY3RNb2RlICYmICghY2h1bmsgfHwgIWNodW5rLmxlbmd0aCkpXG4gICAgICByZXR1cm47XG5cbiAgICB2YXIgcmV0ID0gc2VsZi5wdXNoKGNodW5rKTtcbiAgICBpZiAoIXJldCkge1xuICAgICAgcGF1c2VkID0gdHJ1ZTtcbiAgICAgIHN0cmVhbS5wYXVzZSgpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gcHJveHkgYWxsIHRoZSBvdGhlciBtZXRob2RzLlxuICAvLyBpbXBvcnRhbnQgd2hlbiB3cmFwcGluZyBmaWx0ZXJzIGFuZCBkdXBsZXhlcy5cbiAgZm9yICh2YXIgaSBpbiBzdHJlYW0pIHtcbiAgICBpZiAodHlwZW9mIHN0cmVhbVtpXSA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICB0eXBlb2YgdGhpc1tpXSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRoaXNbaV0gPSBmdW5jdGlvbihtZXRob2QpIHsgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gc3RyZWFtW21ldGhvZF0uYXBwbHkoc3RyZWFtLCBhcmd1bWVudHMpO1xuICAgICAgfX0oaSk7XG4gICAgfVxuICB9XG5cbiAgLy8gcHJveHkgY2VydGFpbiBpbXBvcnRhbnQgZXZlbnRzLlxuICB2YXIgZXZlbnRzID0gWydlcnJvcicsICdjbG9zZScsICdkZXN0cm95JywgJ3BhdXNlJywgJ3Jlc3VtZSddO1xuICBmb3JFYWNoKGV2ZW50cywgZnVuY3Rpb24oZXYpIHtcbiAgICBzdHJlYW0ub24oZXYsIHNlbGYuZW1pdC5iaW5kKHNlbGYsIGV2KSk7XG4gIH0pO1xuXG4gIC8vIHdoZW4gd2UgdHJ5IHRvIGNvbnN1bWUgc29tZSBtb3JlIGJ5dGVzLCBzaW1wbHkgdW5wYXVzZSB0aGVcbiAgLy8gdW5kZXJseWluZyBzdHJlYW0uXG4gIHNlbGYuX3JlYWQgPSBmdW5jdGlvbihuKSB7XG4gICAgaWYgKHBhdXNlZCkge1xuICAgICAgcGF1c2VkID0gZmFsc2U7XG4gICAgICBzdHJlYW0ucmVzdW1lKCk7XG4gICAgfVxuICB9O1xuXG4gIHJldHVybiBzZWxmO1xufTtcblxuXG5cbi8vIGV4cG9zZWQgZm9yIHRlc3RpbmcgcHVycG9zZXMgb25seS5cblJlYWRhYmxlLl9mcm9tTGlzdCA9IGZyb21MaXN0O1xuXG4vLyBQbHVjayBvZmYgbiBieXRlcyBmcm9tIGFuIGFycmF5IG9mIGJ1ZmZlcnMuXG4vLyBMZW5ndGggaXMgdGhlIGNvbWJpbmVkIGxlbmd0aHMgb2YgYWxsIHRoZSBidWZmZXJzIGluIHRoZSBsaXN0LlxuZnVuY3Rpb24gZnJvbUxpc3Qobiwgc3RhdGUpIHtcbiAgdmFyIGxpc3QgPSBzdGF0ZS5idWZmZXI7XG4gIHZhciBsZW5ndGggPSBzdGF0ZS5sZW5ndGg7XG4gIHZhciBzdHJpbmdNb2RlID0gISFzdGF0ZS5kZWNvZGVyO1xuICB2YXIgb2JqZWN0TW9kZSA9ICEhc3RhdGUub2JqZWN0TW9kZTtcbiAgdmFyIHJldDtcblxuICAvLyBub3RoaW5nIGluIHRoZSBsaXN0LCBkZWZpbml0ZWx5IGVtcHR5LlxuICBpZiAobGlzdC5sZW5ndGggPT09IDApXG4gICAgcmV0dXJuIG51bGw7XG5cbiAgaWYgKGxlbmd0aCA9PT0gMClcbiAgICByZXQgPSBudWxsO1xuICBlbHNlIGlmIChvYmplY3RNb2RlKVxuICAgIHJldCA9IGxpc3Quc2hpZnQoKTtcbiAgZWxzZSBpZiAoIW4gfHwgbiA+PSBsZW5ndGgpIHtcbiAgICAvLyByZWFkIGl0IGFsbCwgdHJ1bmNhdGUgdGhlIGFycmF5LlxuICAgIGlmIChzdHJpbmdNb2RlKVxuICAgICAgcmV0ID0gbGlzdC5qb2luKCcnKTtcbiAgICBlbHNlXG4gICAgICByZXQgPSBCdWZmZXIuY29uY2F0KGxpc3QsIGxlbmd0aCk7XG4gICAgbGlzdC5sZW5ndGggPSAwO1xuICB9IGVsc2Uge1xuICAgIC8vIHJlYWQganVzdCBzb21lIG9mIGl0LlxuICAgIGlmIChuIDwgbGlzdFswXS5sZW5ndGgpIHtcbiAgICAgIC8vIGp1c3QgdGFrZSBhIHBhcnQgb2YgdGhlIGZpcnN0IGxpc3QgaXRlbS5cbiAgICAgIC8vIHNsaWNlIGlzIHRoZSBzYW1lIGZvciBidWZmZXJzIGFuZCBzdHJpbmdzLlxuICAgICAgdmFyIGJ1ZiA9IGxpc3RbMF07XG4gICAgICByZXQgPSBidWYuc2xpY2UoMCwgbik7XG4gICAgICBsaXN0WzBdID0gYnVmLnNsaWNlKG4pO1xuICAgIH0gZWxzZSBpZiAobiA9PT0gbGlzdFswXS5sZW5ndGgpIHtcbiAgICAgIC8vIGZpcnN0IGxpc3QgaXMgYSBwZXJmZWN0IG1hdGNoXG4gICAgICByZXQgPSBsaXN0LnNoaWZ0KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIGNvbXBsZXggY2FzZS5cbiAgICAgIC8vIHdlIGhhdmUgZW5vdWdoIHRvIGNvdmVyIGl0LCBidXQgaXQgc3BhbnMgcGFzdCB0aGUgZmlyc3QgYnVmZmVyLlxuICAgICAgaWYgKHN0cmluZ01vZGUpXG4gICAgICAgIHJldCA9ICcnO1xuICAgICAgZWxzZVxuICAgICAgICByZXQgPSBuZXcgQnVmZmVyKG4pO1xuXG4gICAgICB2YXIgYyA9IDA7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IGxpc3QubGVuZ3RoOyBpIDwgbCAmJiBjIDwgbjsgaSsrKSB7XG4gICAgICAgIHZhciBidWYgPSBsaXN0WzBdO1xuICAgICAgICB2YXIgY3B5ID0gTWF0aC5taW4obiAtIGMsIGJ1Zi5sZW5ndGgpO1xuXG4gICAgICAgIGlmIChzdHJpbmdNb2RlKVxuICAgICAgICAgIHJldCArPSBidWYuc2xpY2UoMCwgY3B5KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgIGJ1Zi5jb3B5KHJldCwgYywgMCwgY3B5KTtcblxuICAgICAgICBpZiAoY3B5IDwgYnVmLmxlbmd0aClcbiAgICAgICAgICBsaXN0WzBdID0gYnVmLnNsaWNlKGNweSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBsaXN0LnNoaWZ0KCk7XG5cbiAgICAgICAgYyArPSBjcHk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gZW5kUmVhZGFibGUoc3RyZWFtKSB7XG4gIHZhciBzdGF0ZSA9IHN0cmVhbS5fcmVhZGFibGVTdGF0ZTtcblxuICAvLyBJZiB3ZSBnZXQgaGVyZSBiZWZvcmUgY29uc3VtaW5nIGFsbCB0aGUgYnl0ZXMsIHRoZW4gdGhhdCBpcyBhXG4gIC8vIGJ1ZyBpbiBub2RlLiAgU2hvdWxkIG5ldmVyIGhhcHBlbi5cbiAgaWYgKHN0YXRlLmxlbmd0aCA+IDApXG4gICAgdGhyb3cgbmV3IEVycm9yKCdlbmRSZWFkYWJsZSBjYWxsZWQgb24gbm9uLWVtcHR5IHN0cmVhbScpO1xuXG4gIGlmICghc3RhdGUuZW5kRW1pdHRlZCAmJiBzdGF0ZS5jYWxsZWRSZWFkKSB7XG4gICAgc3RhdGUuZW5kZWQgPSB0cnVlO1xuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAvLyBDaGVjayB0aGF0IHdlIGRpZG4ndCBnZXQgb25lIGxhc3QgdW5zaGlmdC5cbiAgICAgIGlmICghc3RhdGUuZW5kRW1pdHRlZCAmJiBzdGF0ZS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgc3RhdGUuZW5kRW1pdHRlZCA9IHRydWU7XG4gICAgICAgIHN0cmVhbS5yZWFkYWJsZSA9IGZhbHNlO1xuICAgICAgICBzdHJlYW0uZW1pdCgnZW5kJyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZm9yRWFjaCAoeHMsIGYpIHtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB4cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBmKHhzW2ldLCBpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpbmRleE9mICh4cywgeCkge1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHhzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGlmICh4c1tpXSA9PT0geCkgcmV0dXJuIGk7XG4gIH1cbiAgcmV0dXJuIC0xO1xufVxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cblxuLy8gYSB0cmFuc2Zvcm0gc3RyZWFtIGlzIGEgcmVhZGFibGUvd3JpdGFibGUgc3RyZWFtIHdoZXJlIHlvdSBkb1xuLy8gc29tZXRoaW5nIHdpdGggdGhlIGRhdGEuICBTb21ldGltZXMgaXQncyBjYWxsZWQgYSBcImZpbHRlclwiLFxuLy8gYnV0IHRoYXQncyBub3QgYSBncmVhdCBuYW1lIGZvciBpdCwgc2luY2UgdGhhdCBpbXBsaWVzIGEgdGhpbmcgd2hlcmVcbi8vIHNvbWUgYml0cyBwYXNzIHRocm91Z2gsIGFuZCBvdGhlcnMgYXJlIHNpbXBseSBpZ25vcmVkLiAgKFRoYXQgd291bGRcbi8vIGJlIGEgdmFsaWQgZXhhbXBsZSBvZiBhIHRyYW5zZm9ybSwgb2YgY291cnNlLilcbi8vXG4vLyBXaGlsZSB0aGUgb3V0cHV0IGlzIGNhdXNhbGx5IHJlbGF0ZWQgdG8gdGhlIGlucHV0LCBpdCdzIG5vdCBhXG4vLyBuZWNlc3NhcmlseSBzeW1tZXRyaWMgb3Igc3luY2hyb25vdXMgdHJhbnNmb3JtYXRpb24uICBGb3IgZXhhbXBsZSxcbi8vIGEgemxpYiBzdHJlYW0gbWlnaHQgdGFrZSBtdWx0aXBsZSBwbGFpbi10ZXh0IHdyaXRlcygpLCBhbmQgdGhlblxuLy8gZW1pdCBhIHNpbmdsZSBjb21wcmVzc2VkIGNodW5rIHNvbWUgdGltZSBpbiB0aGUgZnV0dXJlLlxuLy9cbi8vIEhlcmUncyBob3cgdGhpcyB3b3Jrczpcbi8vXG4vLyBUaGUgVHJhbnNmb3JtIHN0cmVhbSBoYXMgYWxsIHRoZSBhc3BlY3RzIG9mIHRoZSByZWFkYWJsZSBhbmQgd3JpdGFibGVcbi8vIHN0cmVhbSBjbGFzc2VzLiAgV2hlbiB5b3Ugd3JpdGUoY2h1bmspLCB0aGF0IGNhbGxzIF93cml0ZShjaHVuayxjYilcbi8vIGludGVybmFsbHksIGFuZCByZXR1cm5zIGZhbHNlIGlmIHRoZXJlJ3MgYSBsb3Qgb2YgcGVuZGluZyB3cml0ZXNcbi8vIGJ1ZmZlcmVkIHVwLiAgV2hlbiB5b3UgY2FsbCByZWFkKCksIHRoYXQgY2FsbHMgX3JlYWQobikgdW50aWxcbi8vIHRoZXJlJ3MgZW5vdWdoIHBlbmRpbmcgcmVhZGFibGUgZGF0YSBidWZmZXJlZCB1cC5cbi8vXG4vLyBJbiBhIHRyYW5zZm9ybSBzdHJlYW0sIHRoZSB3cml0dGVuIGRhdGEgaXMgcGxhY2VkIGluIGEgYnVmZmVyLiAgV2hlblxuLy8gX3JlYWQobikgaXMgY2FsbGVkLCBpdCB0cmFuc2Zvcm1zIHRoZSBxdWV1ZWQgdXAgZGF0YSwgY2FsbGluZyB0aGVcbi8vIGJ1ZmZlcmVkIF93cml0ZSBjYidzIGFzIGl0IGNvbnN1bWVzIGNodW5rcy4gIElmIGNvbnN1bWluZyBhIHNpbmdsZVxuLy8gd3JpdHRlbiBjaHVuayB3b3VsZCByZXN1bHQgaW4gbXVsdGlwbGUgb3V0cHV0IGNodW5rcywgdGhlbiB0aGUgZmlyc3Rcbi8vIG91dHB1dHRlZCBiaXQgY2FsbHMgdGhlIHJlYWRjYiwgYW5kIHN1YnNlcXVlbnQgY2h1bmtzIGp1c3QgZ28gaW50b1xuLy8gdGhlIHJlYWQgYnVmZmVyLCBhbmQgd2lsbCBjYXVzZSBpdCB0byBlbWl0ICdyZWFkYWJsZScgaWYgbmVjZXNzYXJ5LlxuLy9cbi8vIFRoaXMgd2F5LCBiYWNrLXByZXNzdXJlIGlzIGFjdHVhbGx5IGRldGVybWluZWQgYnkgdGhlIHJlYWRpbmcgc2lkZSxcbi8vIHNpbmNlIF9yZWFkIGhhcyB0byBiZSBjYWxsZWQgdG8gc3RhcnQgcHJvY2Vzc2luZyBhIG5ldyBjaHVuay4gIEhvd2V2ZXIsXG4vLyBhIHBhdGhvbG9naWNhbCBpbmZsYXRlIHR5cGUgb2YgdHJhbnNmb3JtIGNhbiBjYXVzZSBleGNlc3NpdmUgYnVmZmVyaW5nXG4vLyBoZXJlLiAgRm9yIGV4YW1wbGUsIGltYWdpbmUgYSBzdHJlYW0gd2hlcmUgZXZlcnkgYnl0ZSBvZiBpbnB1dCBpc1xuLy8gaW50ZXJwcmV0ZWQgYXMgYW4gaW50ZWdlciBmcm9tIDAtMjU1LCBhbmQgdGhlbiByZXN1bHRzIGluIHRoYXQgbWFueVxuLy8gYnl0ZXMgb2Ygb3V0cHV0LiAgV3JpdGluZyB0aGUgNCBieXRlcyB7ZmYsZmYsZmYsZmZ9IHdvdWxkIHJlc3VsdCBpblxuLy8gMWtiIG9mIGRhdGEgYmVpbmcgb3V0cHV0LiAgSW4gdGhpcyBjYXNlLCB5b3UgY291bGQgd3JpdGUgYSB2ZXJ5IHNtYWxsXG4vLyBhbW91bnQgb2YgaW5wdXQsIGFuZCBlbmQgdXAgd2l0aCBhIHZlcnkgbGFyZ2UgYW1vdW50IG9mIG91dHB1dC4gIEluXG4vLyBzdWNoIGEgcGF0aG9sb2dpY2FsIGluZmxhdGluZyBtZWNoYW5pc20sIHRoZXJlJ2QgYmUgbm8gd2F5IHRvIHRlbGxcbi8vIHRoZSBzeXN0ZW0gdG8gc3RvcCBkb2luZyB0aGUgdHJhbnNmb3JtLiAgQSBzaW5nbGUgNE1CIHdyaXRlIGNvdWxkXG4vLyBjYXVzZSB0aGUgc3lzdGVtIHRvIHJ1biBvdXQgb2YgbWVtb3J5LlxuLy9cbi8vIEhvd2V2ZXIsIGV2ZW4gaW4gc3VjaCBhIHBhdGhvbG9naWNhbCBjYXNlLCBvbmx5IGEgc2luZ2xlIHdyaXR0ZW4gY2h1bmtcbi8vIHdvdWxkIGJlIGNvbnN1bWVkLCBhbmQgdGhlbiB0aGUgcmVzdCB3b3VsZCB3YWl0ICh1bi10cmFuc2Zvcm1lZCkgdW50aWxcbi8vIHRoZSByZXN1bHRzIG9mIHRoZSBwcmV2aW91cyB0cmFuc2Zvcm1lZCBjaHVuayB3ZXJlIGNvbnN1bWVkLlxuXG5tb2R1bGUuZXhwb3J0cyA9IFRyYW5zZm9ybTtcblxudmFyIER1cGxleCA9IHJlcXVpcmUoJy4vX3N0cmVhbV9kdXBsZXgnKTtcblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbnZhciB1dGlsID0gcmVxdWlyZSgnY29yZS11dGlsLWlzJyk7XG51dGlsLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcbi8qPC9yZXBsYWNlbWVudD4qL1xuXG51dGlsLmluaGVyaXRzKFRyYW5zZm9ybSwgRHVwbGV4KTtcblxuXG5mdW5jdGlvbiBUcmFuc2Zvcm1TdGF0ZShvcHRpb25zLCBzdHJlYW0pIHtcbiAgdGhpcy5hZnRlclRyYW5zZm9ybSA9IGZ1bmN0aW9uKGVyLCBkYXRhKSB7XG4gICAgcmV0dXJuIGFmdGVyVHJhbnNmb3JtKHN0cmVhbSwgZXIsIGRhdGEpO1xuICB9O1xuXG4gIHRoaXMubmVlZFRyYW5zZm9ybSA9IGZhbHNlO1xuICB0aGlzLnRyYW5zZm9ybWluZyA9IGZhbHNlO1xuICB0aGlzLndyaXRlY2IgPSBudWxsO1xuICB0aGlzLndyaXRlY2h1bmsgPSBudWxsO1xufVxuXG5mdW5jdGlvbiBhZnRlclRyYW5zZm9ybShzdHJlYW0sIGVyLCBkYXRhKSB7XG4gIHZhciB0cyA9IHN0cmVhbS5fdHJhbnNmb3JtU3RhdGU7XG4gIHRzLnRyYW5zZm9ybWluZyA9IGZhbHNlO1xuXG4gIHZhciBjYiA9IHRzLndyaXRlY2I7XG5cbiAgaWYgKCFjYilcbiAgICByZXR1cm4gc3RyZWFtLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKCdubyB3cml0ZWNiIGluIFRyYW5zZm9ybSBjbGFzcycpKTtcblxuICB0cy53cml0ZWNodW5rID0gbnVsbDtcbiAgdHMud3JpdGVjYiA9IG51bGw7XG5cbiAgaWYgKGRhdGEgIT09IG51bGwgJiYgZGF0YSAhPT0gdW5kZWZpbmVkKVxuICAgIHN0cmVhbS5wdXNoKGRhdGEpO1xuXG4gIGlmIChjYilcbiAgICBjYihlcik7XG5cbiAgdmFyIHJzID0gc3RyZWFtLl9yZWFkYWJsZVN0YXRlO1xuICBycy5yZWFkaW5nID0gZmFsc2U7XG4gIGlmIChycy5uZWVkUmVhZGFibGUgfHwgcnMubGVuZ3RoIDwgcnMuaGlnaFdhdGVyTWFyaykge1xuICAgIHN0cmVhbS5fcmVhZChycy5oaWdoV2F0ZXJNYXJrKTtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIFRyYW5zZm9ybShvcHRpb25zKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBUcmFuc2Zvcm0pKVxuICAgIHJldHVybiBuZXcgVHJhbnNmb3JtKG9wdGlvbnMpO1xuXG4gIER1cGxleC5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuXG4gIHZhciB0cyA9IHRoaXMuX3RyYW5zZm9ybVN0YXRlID0gbmV3IFRyYW5zZm9ybVN0YXRlKG9wdGlvbnMsIHRoaXMpO1xuXG4gIC8vIHdoZW4gdGhlIHdyaXRhYmxlIHNpZGUgZmluaXNoZXMsIHRoZW4gZmx1c2ggb3V0IGFueXRoaW5nIHJlbWFpbmluZy5cbiAgdmFyIHN0cmVhbSA9IHRoaXM7XG5cbiAgLy8gc3RhcnQgb3V0IGFza2luZyBmb3IgYSByZWFkYWJsZSBldmVudCBvbmNlIGRhdGEgaXMgdHJhbnNmb3JtZWQuXG4gIHRoaXMuX3JlYWRhYmxlU3RhdGUubmVlZFJlYWRhYmxlID0gdHJ1ZTtcblxuICAvLyB3ZSBoYXZlIGltcGxlbWVudGVkIHRoZSBfcmVhZCBtZXRob2QsIGFuZCBkb25lIHRoZSBvdGhlciB0aGluZ3NcbiAgLy8gdGhhdCBSZWFkYWJsZSB3YW50cyBiZWZvcmUgdGhlIGZpcnN0IF9yZWFkIGNhbGwsIHNvIHVuc2V0IHRoZVxuICAvLyBzeW5jIGd1YXJkIGZsYWcuXG4gIHRoaXMuX3JlYWRhYmxlU3RhdGUuc3luYyA9IGZhbHNlO1xuXG4gIHRoaXMub25jZSgnZmluaXNoJywgZnVuY3Rpb24oKSB7XG4gICAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0aGlzLl9mbHVzaClcbiAgICAgIHRoaXMuX2ZsdXNoKGZ1bmN0aW9uKGVyKSB7XG4gICAgICAgIGRvbmUoc3RyZWFtLCBlcik7XG4gICAgICB9KTtcbiAgICBlbHNlXG4gICAgICBkb25lKHN0cmVhbSk7XG4gIH0pO1xufVxuXG5UcmFuc2Zvcm0ucHJvdG90eXBlLnB1c2ggPSBmdW5jdGlvbihjaHVuaywgZW5jb2RpbmcpIHtcbiAgdGhpcy5fdHJhbnNmb3JtU3RhdGUubmVlZFRyYW5zZm9ybSA9IGZhbHNlO1xuICByZXR1cm4gRHVwbGV4LnByb3RvdHlwZS5wdXNoLmNhbGwodGhpcywgY2h1bmssIGVuY29kaW5nKTtcbn07XG5cbi8vIFRoaXMgaXMgdGhlIHBhcnQgd2hlcmUgeW91IGRvIHN0dWZmIVxuLy8gb3ZlcnJpZGUgdGhpcyBmdW5jdGlvbiBpbiBpbXBsZW1lbnRhdGlvbiBjbGFzc2VzLlxuLy8gJ2NodW5rJyBpcyBhbiBpbnB1dCBjaHVuay5cbi8vXG4vLyBDYWxsIGBwdXNoKG5ld0NodW5rKWAgdG8gcGFzcyBhbG9uZyB0cmFuc2Zvcm1lZCBvdXRwdXRcbi8vIHRvIHRoZSByZWFkYWJsZSBzaWRlLiAgWW91IG1heSBjYWxsICdwdXNoJyB6ZXJvIG9yIG1vcmUgdGltZXMuXG4vL1xuLy8gQ2FsbCBgY2IoZXJyKWAgd2hlbiB5b3UgYXJlIGRvbmUgd2l0aCB0aGlzIGNodW5rLiAgSWYgeW91IHBhc3Ncbi8vIGFuIGVycm9yLCB0aGVuIHRoYXQnbGwgcHV0IHRoZSBodXJ0IG9uIHRoZSB3aG9sZSBvcGVyYXRpb24uICBJZiB5b3Vcbi8vIG5ldmVyIGNhbGwgY2IoKSwgdGhlbiB5b3UnbGwgbmV2ZXIgZ2V0IGFub3RoZXIgY2h1bmsuXG5UcmFuc2Zvcm0ucHJvdG90eXBlLl90cmFuc2Zvcm0gPSBmdW5jdGlvbihjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG59O1xuXG5UcmFuc2Zvcm0ucHJvdG90eXBlLl93cml0ZSA9IGZ1bmN0aW9uKGNodW5rLCBlbmNvZGluZywgY2IpIHtcbiAgdmFyIHRzID0gdGhpcy5fdHJhbnNmb3JtU3RhdGU7XG4gIHRzLndyaXRlY2IgPSBjYjtcbiAgdHMud3JpdGVjaHVuayA9IGNodW5rO1xuICB0cy53cml0ZWVuY29kaW5nID0gZW5jb2Rpbmc7XG4gIGlmICghdHMudHJhbnNmb3JtaW5nKSB7XG4gICAgdmFyIHJzID0gdGhpcy5fcmVhZGFibGVTdGF0ZTtcbiAgICBpZiAodHMubmVlZFRyYW5zZm9ybSB8fFxuICAgICAgICBycy5uZWVkUmVhZGFibGUgfHxcbiAgICAgICAgcnMubGVuZ3RoIDwgcnMuaGlnaFdhdGVyTWFyaylcbiAgICAgIHRoaXMuX3JlYWQocnMuaGlnaFdhdGVyTWFyayk7XG4gIH1cbn07XG5cbi8vIERvZXNuJ3QgbWF0dGVyIHdoYXQgdGhlIGFyZ3MgYXJlIGhlcmUuXG4vLyBfdHJhbnNmb3JtIGRvZXMgYWxsIHRoZSB3b3JrLlxuLy8gVGhhdCB3ZSBnb3QgaGVyZSBtZWFucyB0aGF0IHRoZSByZWFkYWJsZSBzaWRlIHdhbnRzIG1vcmUgZGF0YS5cblRyYW5zZm9ybS5wcm90b3R5cGUuX3JlYWQgPSBmdW5jdGlvbihuKSB7XG4gIHZhciB0cyA9IHRoaXMuX3RyYW5zZm9ybVN0YXRlO1xuXG4gIGlmICh0cy53cml0ZWNodW5rICE9PSBudWxsICYmIHRzLndyaXRlY2IgJiYgIXRzLnRyYW5zZm9ybWluZykge1xuICAgIHRzLnRyYW5zZm9ybWluZyA9IHRydWU7XG4gICAgdGhpcy5fdHJhbnNmb3JtKHRzLndyaXRlY2h1bmssIHRzLndyaXRlZW5jb2RpbmcsIHRzLmFmdGVyVHJhbnNmb3JtKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBtYXJrIHRoYXQgd2UgbmVlZCBhIHRyYW5zZm9ybSwgc28gdGhhdCBhbnkgZGF0YSB0aGF0IGNvbWVzIGluXG4gICAgLy8gd2lsbCBnZXQgcHJvY2Vzc2VkLCBub3cgdGhhdCB3ZSd2ZSBhc2tlZCBmb3IgaXQuXG4gICAgdHMubmVlZFRyYW5zZm9ybSA9IHRydWU7XG4gIH1cbn07XG5cblxuZnVuY3Rpb24gZG9uZShzdHJlYW0sIGVyKSB7XG4gIGlmIChlcilcbiAgICByZXR1cm4gc3RyZWFtLmVtaXQoJ2Vycm9yJywgZXIpO1xuXG4gIC8vIGlmIHRoZXJlJ3Mgbm90aGluZyBpbiB0aGUgd3JpdGUgYnVmZmVyLCB0aGVuIHRoYXQgbWVhbnNcbiAgLy8gdGhhdCBub3RoaW5nIG1vcmUgd2lsbCBldmVyIGJlIHByb3ZpZGVkXG4gIHZhciB3cyA9IHN0cmVhbS5fd3JpdGFibGVTdGF0ZTtcbiAgdmFyIHJzID0gc3RyZWFtLl9yZWFkYWJsZVN0YXRlO1xuICB2YXIgdHMgPSBzdHJlYW0uX3RyYW5zZm9ybVN0YXRlO1xuXG4gIGlmICh3cy5sZW5ndGgpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsaW5nIHRyYW5zZm9ybSBkb25lIHdoZW4gd3MubGVuZ3RoICE9IDAnKTtcblxuICBpZiAodHMudHJhbnNmb3JtaW5nKVxuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGluZyB0cmFuc2Zvcm0gZG9uZSB3aGVuIHN0aWxsIHRyYW5zZm9ybWluZycpO1xuXG4gIHJldHVybiBzdHJlYW0ucHVzaChudWxsKTtcbn1cbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyBBIGJpdCBzaW1wbGVyIHRoYW4gcmVhZGFibGUgc3RyZWFtcy5cbi8vIEltcGxlbWVudCBhbiBhc3luYyAuX3dyaXRlKGNodW5rLCBjYiksIGFuZCBpdCdsbCBoYW5kbGUgYWxsXG4vLyB0aGUgZHJhaW4gZXZlbnQgZW1pc3Npb24gYW5kIGJ1ZmZlcmluZy5cblxubW9kdWxlLmV4cG9ydHMgPSBXcml0YWJsZTtcblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbnZhciBCdWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5CdWZmZXI7XG4vKjwvcmVwbGFjZW1lbnQ+Ki9cblxuV3JpdGFibGUuV3JpdGFibGVTdGF0ZSA9IFdyaXRhYmxlU3RhdGU7XG5cblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbnZhciB1dGlsID0gcmVxdWlyZSgnY29yZS11dGlsLWlzJyk7XG51dGlsLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcbi8qPC9yZXBsYWNlbWVudD4qL1xuXG52YXIgU3RyZWFtID0gcmVxdWlyZSgnc3RyZWFtJyk7XG5cbnV0aWwuaW5oZXJpdHMoV3JpdGFibGUsIFN0cmVhbSk7XG5cbmZ1bmN0aW9uIFdyaXRlUmVxKGNodW5rLCBlbmNvZGluZywgY2IpIHtcbiAgdGhpcy5jaHVuayA9IGNodW5rO1xuICB0aGlzLmVuY29kaW5nID0gZW5jb2Rpbmc7XG4gIHRoaXMuY2FsbGJhY2sgPSBjYjtcbn1cblxuZnVuY3Rpb24gV3JpdGFibGVTdGF0ZShvcHRpb25zLCBzdHJlYW0pIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgLy8gdGhlIHBvaW50IGF0IHdoaWNoIHdyaXRlKCkgc3RhcnRzIHJldHVybmluZyBmYWxzZVxuICAvLyBOb3RlOiAwIGlzIGEgdmFsaWQgdmFsdWUsIG1lYW5zIHRoYXQgd2UgYWx3YXlzIHJldHVybiBmYWxzZSBpZlxuICAvLyB0aGUgZW50aXJlIGJ1ZmZlciBpcyBub3QgZmx1c2hlZCBpbW1lZGlhdGVseSBvbiB3cml0ZSgpXG4gIHZhciBod20gPSBvcHRpb25zLmhpZ2hXYXRlck1hcms7XG4gIHRoaXMuaGlnaFdhdGVyTWFyayA9IChod20gfHwgaHdtID09PSAwKSA/IGh3bSA6IDE2ICogMTAyNDtcblxuICAvLyBvYmplY3Qgc3RyZWFtIGZsYWcgdG8gaW5kaWNhdGUgd2hldGhlciBvciBub3QgdGhpcyBzdHJlYW1cbiAgLy8gY29udGFpbnMgYnVmZmVycyBvciBvYmplY3RzLlxuICB0aGlzLm9iamVjdE1vZGUgPSAhIW9wdGlvbnMub2JqZWN0TW9kZTtcblxuICAvLyBjYXN0IHRvIGludHMuXG4gIHRoaXMuaGlnaFdhdGVyTWFyayA9IH5+dGhpcy5oaWdoV2F0ZXJNYXJrO1xuXG4gIHRoaXMubmVlZERyYWluID0gZmFsc2U7XG4gIC8vIGF0IHRoZSBzdGFydCBvZiBjYWxsaW5nIGVuZCgpXG4gIHRoaXMuZW5kaW5nID0gZmFsc2U7XG4gIC8vIHdoZW4gZW5kKCkgaGFzIGJlZW4gY2FsbGVkLCBhbmQgcmV0dXJuZWRcbiAgdGhpcy5lbmRlZCA9IGZhbHNlO1xuICAvLyB3aGVuICdmaW5pc2gnIGlzIGVtaXR0ZWRcbiAgdGhpcy5maW5pc2hlZCA9IGZhbHNlO1xuXG4gIC8vIHNob3VsZCB3ZSBkZWNvZGUgc3RyaW5ncyBpbnRvIGJ1ZmZlcnMgYmVmb3JlIHBhc3NpbmcgdG8gX3dyaXRlP1xuICAvLyB0aGlzIGlzIGhlcmUgc28gdGhhdCBzb21lIG5vZGUtY29yZSBzdHJlYW1zIGNhbiBvcHRpbWl6ZSBzdHJpbmdcbiAgLy8gaGFuZGxpbmcgYXQgYSBsb3dlciBsZXZlbC5cbiAgdmFyIG5vRGVjb2RlID0gb3B0aW9ucy5kZWNvZGVTdHJpbmdzID09PSBmYWxzZTtcbiAgdGhpcy5kZWNvZGVTdHJpbmdzID0gIW5vRGVjb2RlO1xuXG4gIC8vIENyeXB0byBpcyBraW5kIG9mIG9sZCBhbmQgY3J1c3R5LiAgSGlzdG9yaWNhbGx5LCBpdHMgZGVmYXVsdCBzdHJpbmdcbiAgLy8gZW5jb2RpbmcgaXMgJ2JpbmFyeScgc28gd2UgaGF2ZSB0byBtYWtlIHRoaXMgY29uZmlndXJhYmxlLlxuICAvLyBFdmVyeXRoaW5nIGVsc2UgaW4gdGhlIHVuaXZlcnNlIHVzZXMgJ3V0ZjgnLCB0aG91Z2guXG4gIHRoaXMuZGVmYXVsdEVuY29kaW5nID0gb3B0aW9ucy5kZWZhdWx0RW5jb2RpbmcgfHwgJ3V0ZjgnO1xuXG4gIC8vIG5vdCBhbiBhY3R1YWwgYnVmZmVyIHdlIGtlZXAgdHJhY2sgb2YsIGJ1dCBhIG1lYXN1cmVtZW50XG4gIC8vIG9mIGhvdyBtdWNoIHdlJ3JlIHdhaXRpbmcgdG8gZ2V0IHB1c2hlZCB0byBzb21lIHVuZGVybHlpbmdcbiAgLy8gc29ja2V0IG9yIGZpbGUuXG4gIHRoaXMubGVuZ3RoID0gMDtcblxuICAvLyBhIGZsYWcgdG8gc2VlIHdoZW4gd2UncmUgaW4gdGhlIG1pZGRsZSBvZiBhIHdyaXRlLlxuICB0aGlzLndyaXRpbmcgPSBmYWxzZTtcblxuICAvLyBhIGZsYWcgdG8gYmUgYWJsZSB0byB0ZWxsIGlmIHRoZSBvbndyaXRlIGNiIGlzIGNhbGxlZCBpbW1lZGlhdGVseSxcbiAgLy8gb3Igb24gYSBsYXRlciB0aWNrLiAgV2Ugc2V0IHRoaXMgdG8gdHJ1ZSBhdCBmaXJzdCwgYmVjdWFzZSBhbnlcbiAgLy8gYWN0aW9ucyB0aGF0IHNob3VsZG4ndCBoYXBwZW4gdW50aWwgXCJsYXRlclwiIHNob3VsZCBnZW5lcmFsbHkgYWxzb1xuICAvLyBub3QgaGFwcGVuIGJlZm9yZSB0aGUgZmlyc3Qgd3JpdGUgY2FsbC5cbiAgdGhpcy5zeW5jID0gdHJ1ZTtcblxuICAvLyBhIGZsYWcgdG8ga25vdyBpZiB3ZSdyZSBwcm9jZXNzaW5nIHByZXZpb3VzbHkgYnVmZmVyZWQgaXRlbXMsIHdoaWNoXG4gIC8vIG1heSBjYWxsIHRoZSBfd3JpdGUoKSBjYWxsYmFjayBpbiB0aGUgc2FtZSB0aWNrLCBzbyB0aGF0IHdlIGRvbid0XG4gIC8vIGVuZCB1cCBpbiBhbiBvdmVybGFwcGVkIG9ud3JpdGUgc2l0dWF0aW9uLlxuICB0aGlzLmJ1ZmZlclByb2Nlc3NpbmcgPSBmYWxzZTtcblxuICAvLyB0aGUgY2FsbGJhY2sgdGhhdCdzIHBhc3NlZCB0byBfd3JpdGUoY2h1bmssY2IpXG4gIHRoaXMub253cml0ZSA9IGZ1bmN0aW9uKGVyKSB7XG4gICAgb253cml0ZShzdHJlYW0sIGVyKTtcbiAgfTtcblxuICAvLyB0aGUgY2FsbGJhY2sgdGhhdCB0aGUgdXNlciBzdXBwbGllcyB0byB3cml0ZShjaHVuayxlbmNvZGluZyxjYilcbiAgdGhpcy53cml0ZWNiID0gbnVsbDtcblxuICAvLyB0aGUgYW1vdW50IHRoYXQgaXMgYmVpbmcgd3JpdHRlbiB3aGVuIF93cml0ZSBpcyBjYWxsZWQuXG4gIHRoaXMud3JpdGVsZW4gPSAwO1xuXG4gIHRoaXMuYnVmZmVyID0gW107XG5cbiAgLy8gVHJ1ZSBpZiB0aGUgZXJyb3Igd2FzIGFscmVhZHkgZW1pdHRlZCBhbmQgc2hvdWxkIG5vdCBiZSB0aHJvd24gYWdhaW5cbiAgdGhpcy5lcnJvckVtaXR0ZWQgPSBmYWxzZTtcbn1cblxuZnVuY3Rpb24gV3JpdGFibGUob3B0aW9ucykge1xuICB2YXIgRHVwbGV4ID0gcmVxdWlyZSgnLi9fc3RyZWFtX2R1cGxleCcpO1xuXG4gIC8vIFdyaXRhYmxlIGN0b3IgaXMgYXBwbGllZCB0byBEdXBsZXhlcywgdGhvdWdoIHRoZXkncmUgbm90XG4gIC8vIGluc3RhbmNlb2YgV3JpdGFibGUsIHRoZXkncmUgaW5zdGFuY2VvZiBSZWFkYWJsZS5cbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFdyaXRhYmxlKSAmJiAhKHRoaXMgaW5zdGFuY2VvZiBEdXBsZXgpKVxuICAgIHJldHVybiBuZXcgV3JpdGFibGUob3B0aW9ucyk7XG5cbiAgdGhpcy5fd3JpdGFibGVTdGF0ZSA9IG5ldyBXcml0YWJsZVN0YXRlKG9wdGlvbnMsIHRoaXMpO1xuXG4gIC8vIGxlZ2FjeS5cbiAgdGhpcy53cml0YWJsZSA9IHRydWU7XG5cbiAgU3RyZWFtLmNhbGwodGhpcyk7XG59XG5cbi8vIE90aGVyd2lzZSBwZW9wbGUgY2FuIHBpcGUgV3JpdGFibGUgc3RyZWFtcywgd2hpY2ggaXMganVzdCB3cm9uZy5cbldyaXRhYmxlLnByb3RvdHlwZS5waXBlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IoJ0Nhbm5vdCBwaXBlLiBOb3QgcmVhZGFibGUuJykpO1xufTtcblxuXG5mdW5jdGlvbiB3cml0ZUFmdGVyRW5kKHN0cmVhbSwgc3RhdGUsIGNiKSB7XG4gIHZhciBlciA9IG5ldyBFcnJvcignd3JpdGUgYWZ0ZXIgZW5kJyk7XG4gIC8vIFRPRE86IGRlZmVyIGVycm9yIGV2ZW50cyBjb25zaXN0ZW50bHkgZXZlcnl3aGVyZSwgbm90IGp1c3QgdGhlIGNiXG4gIHN0cmVhbS5lbWl0KCdlcnJvcicsIGVyKTtcbiAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICBjYihlcik7XG4gIH0pO1xufVxuXG4vLyBJZiB3ZSBnZXQgc29tZXRoaW5nIHRoYXQgaXMgbm90IGEgYnVmZmVyLCBzdHJpbmcsIG51bGwsIG9yIHVuZGVmaW5lZCxcbi8vIGFuZCB3ZSdyZSBub3QgaW4gb2JqZWN0TW9kZSwgdGhlbiB0aGF0J3MgYW4gZXJyb3IuXG4vLyBPdGhlcndpc2Ugc3RyZWFtIGNodW5rcyBhcmUgYWxsIGNvbnNpZGVyZWQgdG8gYmUgb2YgbGVuZ3RoPTEsIGFuZCB0aGVcbi8vIHdhdGVybWFya3MgZGV0ZXJtaW5lIGhvdyBtYW55IG9iamVjdHMgdG8ga2VlcCBpbiB0aGUgYnVmZmVyLCByYXRoZXIgdGhhblxuLy8gaG93IG1hbnkgYnl0ZXMgb3IgY2hhcmFjdGVycy5cbmZ1bmN0aW9uIHZhbGlkQ2h1bmsoc3RyZWFtLCBzdGF0ZSwgY2h1bmssIGNiKSB7XG4gIHZhciB2YWxpZCA9IHRydWU7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGNodW5rKSAmJlxuICAgICAgJ3N0cmluZycgIT09IHR5cGVvZiBjaHVuayAmJlxuICAgICAgY2h1bmsgIT09IG51bGwgJiZcbiAgICAgIGNodW5rICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICFzdGF0ZS5vYmplY3RNb2RlKSB7XG4gICAgdmFyIGVyID0gbmV3IFR5cGVFcnJvcignSW52YWxpZCBub24tc3RyaW5nL2J1ZmZlciBjaHVuaycpO1xuICAgIHN0cmVhbS5lbWl0KCdlcnJvcicsIGVyKTtcbiAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgY2IoZXIpO1xuICAgIH0pO1xuICAgIHZhbGlkID0gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHZhbGlkO1xufVxuXG5Xcml0YWJsZS5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbihjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIHZhciBzdGF0ZSA9IHRoaXMuX3dyaXRhYmxlU3RhdGU7XG4gIHZhciByZXQgPSBmYWxzZTtcblxuICBpZiAodHlwZW9mIGVuY29kaW5nID09PSAnZnVuY3Rpb24nKSB7XG4gICAgY2IgPSBlbmNvZGluZztcbiAgICBlbmNvZGluZyA9IG51bGw7XG4gIH1cblxuICBpZiAoQnVmZmVyLmlzQnVmZmVyKGNodW5rKSlcbiAgICBlbmNvZGluZyA9ICdidWZmZXInO1xuICBlbHNlIGlmICghZW5jb2RpbmcpXG4gICAgZW5jb2RpbmcgPSBzdGF0ZS5kZWZhdWx0RW5jb2Rpbmc7XG5cbiAgaWYgKHR5cGVvZiBjYiAhPT0gJ2Z1bmN0aW9uJylcbiAgICBjYiA9IGZ1bmN0aW9uKCkge307XG5cbiAgaWYgKHN0YXRlLmVuZGVkKVxuICAgIHdyaXRlQWZ0ZXJFbmQodGhpcywgc3RhdGUsIGNiKTtcbiAgZWxzZSBpZiAodmFsaWRDaHVuayh0aGlzLCBzdGF0ZSwgY2h1bmssIGNiKSlcbiAgICByZXQgPSB3cml0ZU9yQnVmZmVyKHRoaXMsIHN0YXRlLCBjaHVuaywgZW5jb2RpbmcsIGNiKTtcblxuICByZXR1cm4gcmV0O1xufTtcblxuZnVuY3Rpb24gZGVjb2RlQ2h1bmsoc3RhdGUsIGNodW5rLCBlbmNvZGluZykge1xuICBpZiAoIXN0YXRlLm9iamVjdE1vZGUgJiZcbiAgICAgIHN0YXRlLmRlY29kZVN0cmluZ3MgIT09IGZhbHNlICYmXG4gICAgICB0eXBlb2YgY2h1bmsgPT09ICdzdHJpbmcnKSB7XG4gICAgY2h1bmsgPSBuZXcgQnVmZmVyKGNodW5rLCBlbmNvZGluZyk7XG4gIH1cbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vLyBpZiB3ZSdyZSBhbHJlYWR5IHdyaXRpbmcgc29tZXRoaW5nLCB0aGVuIGp1c3QgcHV0IHRoaXNcbi8vIGluIHRoZSBxdWV1ZSwgYW5kIHdhaXQgb3VyIHR1cm4uICBPdGhlcndpc2UsIGNhbGwgX3dyaXRlXG4vLyBJZiB3ZSByZXR1cm4gZmFsc2UsIHRoZW4gd2UgbmVlZCBhIGRyYWluIGV2ZW50LCBzbyBzZXQgdGhhdCBmbGFnLlxuZnVuY3Rpb24gd3JpdGVPckJ1ZmZlcihzdHJlYW0sIHN0YXRlLCBjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIGNodW5rID0gZGVjb2RlQ2h1bmsoc3RhdGUsIGNodW5rLCBlbmNvZGluZyk7XG4gIGlmIChCdWZmZXIuaXNCdWZmZXIoY2h1bmspKVxuICAgIGVuY29kaW5nID0gJ2J1ZmZlcic7XG4gIHZhciBsZW4gPSBzdGF0ZS5vYmplY3RNb2RlID8gMSA6IGNodW5rLmxlbmd0aDtcblxuICBzdGF0ZS5sZW5ndGggKz0gbGVuO1xuXG4gIHZhciByZXQgPSBzdGF0ZS5sZW5ndGggPCBzdGF0ZS5oaWdoV2F0ZXJNYXJrO1xuICAvLyB3ZSBtdXN0IGVuc3VyZSB0aGF0IHByZXZpb3VzIG5lZWREcmFpbiB3aWxsIG5vdCBiZSByZXNldCB0byBmYWxzZS5cbiAgaWYgKCFyZXQpXG4gICAgc3RhdGUubmVlZERyYWluID0gdHJ1ZTtcblxuICBpZiAoc3RhdGUud3JpdGluZylcbiAgICBzdGF0ZS5idWZmZXIucHVzaChuZXcgV3JpdGVSZXEoY2h1bmssIGVuY29kaW5nLCBjYikpO1xuICBlbHNlXG4gICAgZG9Xcml0ZShzdHJlYW0sIHN0YXRlLCBsZW4sIGNodW5rLCBlbmNvZGluZywgY2IpO1xuXG4gIHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIGRvV3JpdGUoc3RyZWFtLCBzdGF0ZSwgbGVuLCBjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIHN0YXRlLndyaXRlbGVuID0gbGVuO1xuICBzdGF0ZS53cml0ZWNiID0gY2I7XG4gIHN0YXRlLndyaXRpbmcgPSB0cnVlO1xuICBzdGF0ZS5zeW5jID0gdHJ1ZTtcbiAgc3RyZWFtLl93cml0ZShjaHVuaywgZW5jb2RpbmcsIHN0YXRlLm9ud3JpdGUpO1xuICBzdGF0ZS5zeW5jID0gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIG9ud3JpdGVFcnJvcihzdHJlYW0sIHN0YXRlLCBzeW5jLCBlciwgY2IpIHtcbiAgaWYgKHN5bmMpXG4gICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgIGNiKGVyKTtcbiAgICB9KTtcbiAgZWxzZVxuICAgIGNiKGVyKTtcblxuICBzdHJlYW0uX3dyaXRhYmxlU3RhdGUuZXJyb3JFbWl0dGVkID0gdHJ1ZTtcbiAgc3RyZWFtLmVtaXQoJ2Vycm9yJywgZXIpO1xufVxuXG5mdW5jdGlvbiBvbndyaXRlU3RhdGVVcGRhdGUoc3RhdGUpIHtcbiAgc3RhdGUud3JpdGluZyA9IGZhbHNlO1xuICBzdGF0ZS53cml0ZWNiID0gbnVsbDtcbiAgc3RhdGUubGVuZ3RoIC09IHN0YXRlLndyaXRlbGVuO1xuICBzdGF0ZS53cml0ZWxlbiA9IDA7XG59XG5cbmZ1bmN0aW9uIG9ud3JpdGUoc3RyZWFtLCBlcikge1xuICB2YXIgc3RhdGUgPSBzdHJlYW0uX3dyaXRhYmxlU3RhdGU7XG4gIHZhciBzeW5jID0gc3RhdGUuc3luYztcbiAgdmFyIGNiID0gc3RhdGUud3JpdGVjYjtcblxuICBvbndyaXRlU3RhdGVVcGRhdGUoc3RhdGUpO1xuXG4gIGlmIChlcilcbiAgICBvbndyaXRlRXJyb3Ioc3RyZWFtLCBzdGF0ZSwgc3luYywgZXIsIGNiKTtcbiAgZWxzZSB7XG4gICAgLy8gQ2hlY2sgaWYgd2UncmUgYWN0dWFsbHkgcmVhZHkgdG8gZmluaXNoLCBidXQgZG9uJ3QgZW1pdCB5ZXRcbiAgICB2YXIgZmluaXNoZWQgPSBuZWVkRmluaXNoKHN0cmVhbSwgc3RhdGUpO1xuXG4gICAgaWYgKCFmaW5pc2hlZCAmJiAhc3RhdGUuYnVmZmVyUHJvY2Vzc2luZyAmJiBzdGF0ZS5idWZmZXIubGVuZ3RoKVxuICAgICAgY2xlYXJCdWZmZXIoc3RyZWFtLCBzdGF0ZSk7XG5cbiAgICBpZiAoc3luYykge1xuICAgICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgYWZ0ZXJXcml0ZShzdHJlYW0sIHN0YXRlLCBmaW5pc2hlZCwgY2IpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFmdGVyV3JpdGUoc3RyZWFtLCBzdGF0ZSwgZmluaXNoZWQsIGNiKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWZ0ZXJXcml0ZShzdHJlYW0sIHN0YXRlLCBmaW5pc2hlZCwgY2IpIHtcbiAgaWYgKCFmaW5pc2hlZClcbiAgICBvbndyaXRlRHJhaW4oc3RyZWFtLCBzdGF0ZSk7XG4gIGNiKCk7XG4gIGlmIChmaW5pc2hlZClcbiAgICBmaW5pc2hNYXliZShzdHJlYW0sIHN0YXRlKTtcbn1cblxuLy8gTXVzdCBmb3JjZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgb24gbmV4dFRpY2ssIHNvIHRoYXQgd2UgZG9uJ3Rcbi8vIGVtaXQgJ2RyYWluJyBiZWZvcmUgdGhlIHdyaXRlKCkgY29uc3VtZXIgZ2V0cyB0aGUgJ2ZhbHNlJyByZXR1cm5cbi8vIHZhbHVlLCBhbmQgaGFzIGEgY2hhbmNlIHRvIGF0dGFjaCBhICdkcmFpbicgbGlzdGVuZXIuXG5mdW5jdGlvbiBvbndyaXRlRHJhaW4oc3RyZWFtLCBzdGF0ZSkge1xuICBpZiAoc3RhdGUubGVuZ3RoID09PSAwICYmIHN0YXRlLm5lZWREcmFpbikge1xuICAgIHN0YXRlLm5lZWREcmFpbiA9IGZhbHNlO1xuICAgIHN0cmVhbS5lbWl0KCdkcmFpbicpO1xuICB9XG59XG5cblxuLy8gaWYgdGhlcmUncyBzb21ldGhpbmcgaW4gdGhlIGJ1ZmZlciB3YWl0aW5nLCB0aGVuIHByb2Nlc3MgaXRcbmZ1bmN0aW9uIGNsZWFyQnVmZmVyKHN0cmVhbSwgc3RhdGUpIHtcbiAgc3RhdGUuYnVmZmVyUHJvY2Vzc2luZyA9IHRydWU7XG5cbiAgZm9yICh2YXIgYyA9IDA7IGMgPCBzdGF0ZS5idWZmZXIubGVuZ3RoOyBjKyspIHtcbiAgICB2YXIgZW50cnkgPSBzdGF0ZS5idWZmZXJbY107XG4gICAgdmFyIGNodW5rID0gZW50cnkuY2h1bms7XG4gICAgdmFyIGVuY29kaW5nID0gZW50cnkuZW5jb2Rpbmc7XG4gICAgdmFyIGNiID0gZW50cnkuY2FsbGJhY2s7XG4gICAgdmFyIGxlbiA9IHN0YXRlLm9iamVjdE1vZGUgPyAxIDogY2h1bmsubGVuZ3RoO1xuXG4gICAgZG9Xcml0ZShzdHJlYW0sIHN0YXRlLCBsZW4sIGNodW5rLCBlbmNvZGluZywgY2IpO1xuXG4gICAgLy8gaWYgd2UgZGlkbid0IGNhbGwgdGhlIG9ud3JpdGUgaW1tZWRpYXRlbHksIHRoZW5cbiAgICAvLyBpdCBtZWFucyB0aGF0IHdlIG5lZWQgdG8gd2FpdCB1bnRpbCBpdCBkb2VzLlxuICAgIC8vIGFsc28sIHRoYXQgbWVhbnMgdGhhdCB0aGUgY2h1bmsgYW5kIGNiIGFyZSBjdXJyZW50bHlcbiAgICAvLyBiZWluZyBwcm9jZXNzZWQsIHNvIG1vdmUgdGhlIGJ1ZmZlciBjb3VudGVyIHBhc3QgdGhlbS5cbiAgICBpZiAoc3RhdGUud3JpdGluZykge1xuICAgICAgYysrO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgc3RhdGUuYnVmZmVyUHJvY2Vzc2luZyA9IGZhbHNlO1xuICBpZiAoYyA8IHN0YXRlLmJ1ZmZlci5sZW5ndGgpXG4gICAgc3RhdGUuYnVmZmVyID0gc3RhdGUuYnVmZmVyLnNsaWNlKGMpO1xuICBlbHNlXG4gICAgc3RhdGUuYnVmZmVyLmxlbmd0aCA9IDA7XG59XG5cbldyaXRhYmxlLnByb3RvdHlwZS5fd3JpdGUgPSBmdW5jdGlvbihjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIGNiKG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJykpO1xufTtcblxuV3JpdGFibGUucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uKGNodW5rLCBlbmNvZGluZywgY2IpIHtcbiAgdmFyIHN0YXRlID0gdGhpcy5fd3JpdGFibGVTdGF0ZTtcblxuICBpZiAodHlwZW9mIGNodW5rID09PSAnZnVuY3Rpb24nKSB7XG4gICAgY2IgPSBjaHVuaztcbiAgICBjaHVuayA9IG51bGw7XG4gICAgZW5jb2RpbmcgPSBudWxsO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBlbmNvZGluZyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGNiID0gZW5jb2Rpbmc7XG4gICAgZW5jb2RpbmcgPSBudWxsO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBjaHVuayAhPT0gJ3VuZGVmaW5lZCcgJiYgY2h1bmsgIT09IG51bGwpXG4gICAgdGhpcy53cml0ZShjaHVuaywgZW5jb2RpbmcpO1xuXG4gIC8vIGlnbm9yZSB1bm5lY2Vzc2FyeSBlbmQoKSBjYWxscy5cbiAgaWYgKCFzdGF0ZS5lbmRpbmcgJiYgIXN0YXRlLmZpbmlzaGVkKVxuICAgIGVuZFdyaXRhYmxlKHRoaXMsIHN0YXRlLCBjYik7XG59O1xuXG5cbmZ1bmN0aW9uIG5lZWRGaW5pc2goc3RyZWFtLCBzdGF0ZSkge1xuICByZXR1cm4gKHN0YXRlLmVuZGluZyAmJlxuICAgICAgICAgIHN0YXRlLmxlbmd0aCA9PT0gMCAmJlxuICAgICAgICAgICFzdGF0ZS5maW5pc2hlZCAmJlxuICAgICAgICAgICFzdGF0ZS53cml0aW5nKTtcbn1cblxuZnVuY3Rpb24gZmluaXNoTWF5YmUoc3RyZWFtLCBzdGF0ZSkge1xuICB2YXIgbmVlZCA9IG5lZWRGaW5pc2goc3RyZWFtLCBzdGF0ZSk7XG4gIGlmIChuZWVkKSB7XG4gICAgc3RhdGUuZmluaXNoZWQgPSB0cnVlO1xuICAgIHN0cmVhbS5lbWl0KCdmaW5pc2gnKTtcbiAgfVxuICByZXR1cm4gbmVlZDtcbn1cblxuZnVuY3Rpb24gZW5kV3JpdGFibGUoc3RyZWFtLCBzdGF0ZSwgY2IpIHtcbiAgc3RhdGUuZW5kaW5nID0gdHJ1ZTtcbiAgZmluaXNoTWF5YmUoc3RyZWFtLCBzdGF0ZSk7XG4gIGlmIChjYikge1xuICAgIGlmIChzdGF0ZS5maW5pc2hlZClcbiAgICAgIHByb2Nlc3MubmV4dFRpY2soY2IpO1xuICAgIGVsc2VcbiAgICAgIHN0cmVhbS5vbmNlKCdmaW5pc2gnLCBjYik7XG4gIH1cbiAgc3RhdGUuZW5kZWQgPSB0cnVlO1xufVxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIE5PVEU6IFRoZXNlIHR5cGUgY2hlY2tpbmcgZnVuY3Rpb25zIGludGVudGlvbmFsbHkgZG9uJ3QgdXNlIGBpbnN0YW5jZW9mYFxuLy8gYmVjYXVzZSBpdCBpcyBmcmFnaWxlIGFuZCBjYW4gYmUgZWFzaWx5IGZha2VkIHdpdGggYE9iamVjdC5jcmVhdGUoKWAuXG5mdW5jdGlvbiBpc0FycmF5KGFyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFyKTtcbn1cbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXk7XG5cbmZ1bmN0aW9uIGlzQm9vbGVhbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJztcbn1cbmV4cG9ydHMuaXNCb29sZWFuID0gaXNCb29sZWFuO1xuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbCA9IGlzTnVsbDtcblxuZnVuY3Rpb24gaXNOdWxsT3JVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsT3JVbmRlZmluZWQgPSBpc051bGxPclVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cbmV4cG9ydHMuaXNOdW1iZXIgPSBpc051bWJlcjtcblxuZnVuY3Rpb24gaXNTdHJpbmcoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJztcbn1cbmV4cG9ydHMuaXNTdHJpbmcgPSBpc1N0cmluZztcblxuZnVuY3Rpb24gaXNTeW1ib2woYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3ltYm9sJztcbn1cbmV4cG9ydHMuaXNTeW1ib2wgPSBpc1N5bWJvbDtcblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbmV4cG9ydHMuaXNVbmRlZmluZWQgPSBpc1VuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNSZWdFeHAocmUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHJlKSAmJiBvYmplY3RUb1N0cmluZyhyZSkgPT09ICdbb2JqZWN0IFJlZ0V4cF0nO1xufVxuZXhwb3J0cy5pc1JlZ0V4cCA9IGlzUmVnRXhwO1xuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNPYmplY3QgPSBpc09iamVjdDtcblxuZnVuY3Rpb24gaXNEYXRlKGQpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGQpICYmIG9iamVjdFRvU3RyaW5nKGQpID09PSAnW29iamVjdCBEYXRlXSc7XG59XG5leHBvcnRzLmlzRGF0ZSA9IGlzRGF0ZTtcblxuZnVuY3Rpb24gaXNFcnJvcihlKSB7XG4gIHJldHVybiBpc09iamVjdChlKSAmJlxuICAgICAgKG9iamVjdFRvU3RyaW5nKGUpID09PSAnW29iamVjdCBFcnJvcl0nIHx8IGUgaW5zdGFuY2VvZiBFcnJvcik7XG59XG5leHBvcnRzLmlzRXJyb3IgPSBpc0Vycm9yO1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cbmV4cG9ydHMuaXNGdW5jdGlvbiA9IGlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIGlzUHJpbWl0aXZlKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnYm9vbGVhbicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdudW1iZXInIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCcgfHwgIC8vIEVTNiBzeW1ib2xcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICd1bmRlZmluZWQnO1xufVxuZXhwb3J0cy5pc1ByaW1pdGl2ZSA9IGlzUHJpbWl0aXZlO1xuXG5mdW5jdGlvbiBpc0J1ZmZlcihhcmcpIHtcbiAgcmV0dXJuIEJ1ZmZlci5pc0J1ZmZlcihhcmcpO1xufVxuZXhwb3J0cy5pc0J1ZmZlciA9IGlzQnVmZmVyO1xuXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyhvKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobyk7XG59IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiLi9saWIvX3N0cmVhbV9wYXNzdGhyb3VnaC5qc1wiKVxuIiwidmFyIFN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpOyAvLyBoYWNrIHRvIGZpeCBhIGNpcmN1bGFyIGRlcGVuZGVuY3kgaXNzdWUgd2hlbiB1c2VkIHdpdGggYnJvd3NlcmlmeVxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9saWIvX3N0cmVhbV9yZWFkYWJsZS5qcycpO1xuZXhwb3J0cy5TdHJlYW0gPSBTdHJlYW07XG5leHBvcnRzLlJlYWRhYmxlID0gZXhwb3J0cztcbmV4cG9ydHMuV3JpdGFibGUgPSByZXF1aXJlKCcuL2xpYi9fc3RyZWFtX3dyaXRhYmxlLmpzJyk7XG5leHBvcnRzLkR1cGxleCA9IHJlcXVpcmUoJy4vbGliL19zdHJlYW1fZHVwbGV4LmpzJyk7XG5leHBvcnRzLlRyYW5zZm9ybSA9IHJlcXVpcmUoJy4vbGliL19zdHJlYW1fdHJhbnNmb3JtLmpzJyk7XG5leHBvcnRzLlBhc3NUaHJvdWdoID0gcmVxdWlyZSgnLi9saWIvX3N0cmVhbV9wYXNzdGhyb3VnaC5qcycpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiLi9saWIvX3N0cmVhbV90cmFuc2Zvcm0uanNcIilcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcIi4vbGliL19zdHJlYW1fd3JpdGFibGUuanNcIilcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5tb2R1bGUuZXhwb3J0cyA9IFN0cmVhbTtcblxudmFyIEVFID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIGluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuaW5oZXJpdHMoU3RyZWFtLCBFRSk7XG5TdHJlYW0uUmVhZGFibGUgPSByZXF1aXJlKCdyZWFkYWJsZS1zdHJlYW0vcmVhZGFibGUuanMnKTtcblN0cmVhbS5Xcml0YWJsZSA9IHJlcXVpcmUoJ3JlYWRhYmxlLXN0cmVhbS93cml0YWJsZS5qcycpO1xuU3RyZWFtLkR1cGxleCA9IHJlcXVpcmUoJ3JlYWRhYmxlLXN0cmVhbS9kdXBsZXguanMnKTtcblN0cmVhbS5UcmFuc2Zvcm0gPSByZXF1aXJlKCdyZWFkYWJsZS1zdHJlYW0vdHJhbnNmb3JtLmpzJyk7XG5TdHJlYW0uUGFzc1Rocm91Z2ggPSByZXF1aXJlKCdyZWFkYWJsZS1zdHJlYW0vcGFzc3Rocm91Z2guanMnKTtcblxuLy8gQmFja3dhcmRzLWNvbXBhdCB3aXRoIG5vZGUgMC40LnhcblN0cmVhbS5TdHJlYW0gPSBTdHJlYW07XG5cblxuXG4vLyBvbGQtc3R5bGUgc3RyZWFtcy4gIE5vdGUgdGhhdCB0aGUgcGlwZSBtZXRob2QgKHRoZSBvbmx5IHJlbGV2YW50XG4vLyBwYXJ0IG9mIHRoaXMgY2xhc3MpIGlzIG92ZXJyaWRkZW4gaW4gdGhlIFJlYWRhYmxlIGNsYXNzLlxuXG5mdW5jdGlvbiBTdHJlYW0oKSB7XG4gIEVFLmNhbGwodGhpcyk7XG59XG5cblN0cmVhbS5wcm90b3R5cGUucGlwZSA9IGZ1bmN0aW9uKGRlc3QsIG9wdGlvbnMpIHtcbiAgdmFyIHNvdXJjZSA9IHRoaXM7XG5cbiAgZnVuY3Rpb24gb25kYXRhKGNodW5rKSB7XG4gICAgaWYgKGRlc3Qud3JpdGFibGUpIHtcbiAgICAgIGlmIChmYWxzZSA9PT0gZGVzdC53cml0ZShjaHVuaykgJiYgc291cmNlLnBhdXNlKSB7XG4gICAgICAgIHNvdXJjZS5wYXVzZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHNvdXJjZS5vbignZGF0YScsIG9uZGF0YSk7XG5cbiAgZnVuY3Rpb24gb25kcmFpbigpIHtcbiAgICBpZiAoc291cmNlLnJlYWRhYmxlICYmIHNvdXJjZS5yZXN1bWUpIHtcbiAgICAgIHNvdXJjZS5yZXN1bWUoKTtcbiAgICB9XG4gIH1cblxuICBkZXN0Lm9uKCdkcmFpbicsIG9uZHJhaW4pO1xuXG4gIC8vIElmIHRoZSAnZW5kJyBvcHRpb24gaXMgbm90IHN1cHBsaWVkLCBkZXN0LmVuZCgpIHdpbGwgYmUgY2FsbGVkIHdoZW5cbiAgLy8gc291cmNlIGdldHMgdGhlICdlbmQnIG9yICdjbG9zZScgZXZlbnRzLiAgT25seSBkZXN0LmVuZCgpIG9uY2UuXG4gIGlmICghZGVzdC5faXNTdGRpbyAmJiAoIW9wdGlvbnMgfHwgb3B0aW9ucy5lbmQgIT09IGZhbHNlKSkge1xuICAgIHNvdXJjZS5vbignZW5kJywgb25lbmQpO1xuICAgIHNvdXJjZS5vbignY2xvc2UnLCBvbmNsb3NlKTtcbiAgfVxuXG4gIHZhciBkaWRPbkVuZCA9IGZhbHNlO1xuICBmdW5jdGlvbiBvbmVuZCgpIHtcbiAgICBpZiAoZGlkT25FbmQpIHJldHVybjtcbiAgICBkaWRPbkVuZCA9IHRydWU7XG5cbiAgICBkZXN0LmVuZCgpO1xuICB9XG5cblxuICBmdW5jdGlvbiBvbmNsb3NlKCkge1xuICAgIGlmIChkaWRPbkVuZCkgcmV0dXJuO1xuICAgIGRpZE9uRW5kID0gdHJ1ZTtcblxuICAgIGlmICh0eXBlb2YgZGVzdC5kZXN0cm95ID09PSAnZnVuY3Rpb24nKSBkZXN0LmRlc3Ryb3koKTtcbiAgfVxuXG4gIC8vIGRvbid0IGxlYXZlIGRhbmdsaW5nIHBpcGVzIHdoZW4gdGhlcmUgYXJlIGVycm9ycy5cbiAgZnVuY3Rpb24gb25lcnJvcihlcikge1xuICAgIGNsZWFudXAoKTtcbiAgICBpZiAoRUUubGlzdGVuZXJDb3VudCh0aGlzLCAnZXJyb3InKSA9PT0gMCkge1xuICAgICAgdGhyb3cgZXI7IC8vIFVuaGFuZGxlZCBzdHJlYW0gZXJyb3IgaW4gcGlwZS5cbiAgICB9XG4gIH1cblxuICBzb3VyY2Uub24oJ2Vycm9yJywgb25lcnJvcik7XG4gIGRlc3Qub24oJ2Vycm9yJywgb25lcnJvcik7XG5cbiAgLy8gcmVtb3ZlIGFsbCB0aGUgZXZlbnQgbGlzdGVuZXJzIHRoYXQgd2VyZSBhZGRlZC5cbiAgZnVuY3Rpb24gY2xlYW51cCgpIHtcbiAgICBzb3VyY2UucmVtb3ZlTGlzdGVuZXIoJ2RhdGEnLCBvbmRhdGEpO1xuICAgIGRlc3QucmVtb3ZlTGlzdGVuZXIoJ2RyYWluJywgb25kcmFpbik7XG5cbiAgICBzb3VyY2UucmVtb3ZlTGlzdGVuZXIoJ2VuZCcsIG9uZW5kKTtcbiAgICBzb3VyY2UucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgb25jbG9zZSk7XG5cbiAgICBzb3VyY2UucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgb25lcnJvcik7XG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBvbmVycm9yKTtcblxuICAgIHNvdXJjZS5yZW1vdmVMaXN0ZW5lcignZW5kJywgY2xlYW51cCk7XG4gICAgc291cmNlLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIGNsZWFudXApO1xuXG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignY2xvc2UnLCBjbGVhbnVwKTtcbiAgfVxuXG4gIHNvdXJjZS5vbignZW5kJywgY2xlYW51cCk7XG4gIHNvdXJjZS5vbignY2xvc2UnLCBjbGVhbnVwKTtcblxuICBkZXN0Lm9uKCdjbG9zZScsIGNsZWFudXApO1xuXG4gIGRlc3QuZW1pdCgncGlwZScsIHNvdXJjZSk7XG5cbiAgLy8gQWxsb3cgZm9yIHVuaXgtbGlrZSB1c2FnZTogQS5waXBlKEIpLnBpcGUoQylcbiAgcmV0dXJuIGRlc3Q7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbnZhciBCdWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5CdWZmZXI7XG5cbnZhciBpc0J1ZmZlckVuY29kaW5nID0gQnVmZmVyLmlzRW5jb2RpbmdcbiAgfHwgZnVuY3Rpb24oZW5jb2RpbmcpIHtcbiAgICAgICBzd2l0Y2ggKGVuY29kaW5nICYmIGVuY29kaW5nLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgIGNhc2UgJ2hleCc6IGNhc2UgJ3V0ZjgnOiBjYXNlICd1dGYtOCc6IGNhc2UgJ2FzY2lpJzogY2FzZSAnYmluYXJ5JzogY2FzZSAnYmFzZTY0JzogY2FzZSAndWNzMic6IGNhc2UgJ3Vjcy0yJzogY2FzZSAndXRmMTZsZSc6IGNhc2UgJ3V0Zi0xNmxlJzogY2FzZSAncmF3JzogcmV0dXJuIHRydWU7XG4gICAgICAgICBkZWZhdWx0OiByZXR1cm4gZmFsc2U7XG4gICAgICAgfVxuICAgICB9XG5cblxuZnVuY3Rpb24gYXNzZXJ0RW5jb2RpbmcoZW5jb2RpbmcpIHtcbiAgaWYgKGVuY29kaW5nICYmICFpc0J1ZmZlckVuY29kaW5nKGVuY29kaW5nKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKTtcbiAgfVxufVxuXG4vLyBTdHJpbmdEZWNvZGVyIHByb3ZpZGVzIGFuIGludGVyZmFjZSBmb3IgZWZmaWNpZW50bHkgc3BsaXR0aW5nIGEgc2VyaWVzIG9mXG4vLyBidWZmZXJzIGludG8gYSBzZXJpZXMgb2YgSlMgc3RyaW5ncyB3aXRob3V0IGJyZWFraW5nIGFwYXJ0IG11bHRpLWJ5dGVcbi8vIGNoYXJhY3RlcnMuIENFU1UtOCBpcyBoYW5kbGVkIGFzIHBhcnQgb2YgdGhlIFVURi04IGVuY29kaW5nLlxuLy9cbi8vIEBUT0RPIEhhbmRsaW5nIGFsbCBlbmNvZGluZ3MgaW5zaWRlIGEgc2luZ2xlIG9iamVjdCBtYWtlcyBpdCB2ZXJ5IGRpZmZpY3VsdFxuLy8gdG8gcmVhc29uIGFib3V0IHRoaXMgY29kZSwgc28gaXQgc2hvdWxkIGJlIHNwbGl0IHVwIGluIHRoZSBmdXR1cmUuXG4vLyBAVE9ETyBUaGVyZSBzaG91bGQgYmUgYSB1dGY4LXN0cmljdCBlbmNvZGluZyB0aGF0IHJlamVjdHMgaW52YWxpZCBVVEYtOCBjb2RlXG4vLyBwb2ludHMgYXMgdXNlZCBieSBDRVNVLTguXG52YXIgU3RyaW5nRGVjb2RlciA9IGV4cG9ydHMuU3RyaW5nRGVjb2RlciA9IGZ1bmN0aW9uKGVuY29kaW5nKSB7XG4gIHRoaXMuZW5jb2RpbmcgPSAoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1stX10vLCAnJyk7XG4gIGFzc2VydEVuY29kaW5nKGVuY29kaW5nKTtcbiAgc3dpdGNoICh0aGlzLmVuY29kaW5nKSB7XG4gICAgY2FzZSAndXRmOCc6XG4gICAgICAvLyBDRVNVLTggcmVwcmVzZW50cyBlYWNoIG9mIFN1cnJvZ2F0ZSBQYWlyIGJ5IDMtYnl0ZXNcbiAgICAgIHRoaXMuc3Vycm9nYXRlU2l6ZSA9IDM7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICAgIC8vIFVURi0xNiByZXByZXNlbnRzIGVhY2ggb2YgU3Vycm9nYXRlIFBhaXIgYnkgMi1ieXRlc1xuICAgICAgdGhpcy5zdXJyb2dhdGVTaXplID0gMjtcbiAgICAgIHRoaXMuZGV0ZWN0SW5jb21wbGV0ZUNoYXIgPSB1dGYxNkRldGVjdEluY29tcGxldGVDaGFyO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIC8vIEJhc2UtNjQgc3RvcmVzIDMgYnl0ZXMgaW4gNCBjaGFycywgYW5kIHBhZHMgdGhlIHJlbWFpbmRlci5cbiAgICAgIHRoaXMuc3Vycm9nYXRlU2l6ZSA9IDM7XG4gICAgICB0aGlzLmRldGVjdEluY29tcGxldGVDaGFyID0gYmFzZTY0RGV0ZWN0SW5jb21wbGV0ZUNoYXI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgdGhpcy53cml0ZSA9IHBhc3NUaHJvdWdoV3JpdGU7XG4gICAgICByZXR1cm47XG4gIH1cblxuICAvLyBFbm91Z2ggc3BhY2UgdG8gc3RvcmUgYWxsIGJ5dGVzIG9mIGEgc2luZ2xlIGNoYXJhY3Rlci4gVVRGLTggbmVlZHMgNFxuICAvLyBieXRlcywgYnV0IENFU1UtOCBtYXkgcmVxdWlyZSB1cCB0byA2ICgzIGJ5dGVzIHBlciBzdXJyb2dhdGUpLlxuICB0aGlzLmNoYXJCdWZmZXIgPSBuZXcgQnVmZmVyKDYpO1xuICAvLyBOdW1iZXIgb2YgYnl0ZXMgcmVjZWl2ZWQgZm9yIHRoZSBjdXJyZW50IGluY29tcGxldGUgbXVsdGktYnl0ZSBjaGFyYWN0ZXIuXG4gIHRoaXMuY2hhclJlY2VpdmVkID0gMDtcbiAgLy8gTnVtYmVyIG9mIGJ5dGVzIGV4cGVjdGVkIGZvciB0aGUgY3VycmVudCBpbmNvbXBsZXRlIG11bHRpLWJ5dGUgY2hhcmFjdGVyLlxuICB0aGlzLmNoYXJMZW5ndGggPSAwO1xufTtcblxuXG4vLyB3cml0ZSBkZWNvZGVzIHRoZSBnaXZlbiBidWZmZXIgYW5kIHJldHVybnMgaXQgYXMgSlMgc3RyaW5nIHRoYXQgaXNcbi8vIGd1YXJhbnRlZWQgdG8gbm90IGNvbnRhaW4gYW55IHBhcnRpYWwgbXVsdGktYnl0ZSBjaGFyYWN0ZXJzLiBBbnkgcGFydGlhbFxuLy8gY2hhcmFjdGVyIGZvdW5kIGF0IHRoZSBlbmQgb2YgdGhlIGJ1ZmZlciBpcyBidWZmZXJlZCB1cCwgYW5kIHdpbGwgYmVcbi8vIHJldHVybmVkIHdoZW4gY2FsbGluZyB3cml0ZSBhZ2FpbiB3aXRoIHRoZSByZW1haW5pbmcgYnl0ZXMuXG4vL1xuLy8gTm90ZTogQ29udmVydGluZyBhIEJ1ZmZlciBjb250YWluaW5nIGFuIG9ycGhhbiBzdXJyb2dhdGUgdG8gYSBTdHJpbmdcbi8vIGN1cnJlbnRseSB3b3JrcywgYnV0IGNvbnZlcnRpbmcgYSBTdHJpbmcgdG8gYSBCdWZmZXIgKHZpYSBgbmV3IEJ1ZmZlcmAsIG9yXG4vLyBCdWZmZXIjd3JpdGUpIHdpbGwgcmVwbGFjZSBpbmNvbXBsZXRlIHN1cnJvZ2F0ZXMgd2l0aCB0aGUgdW5pY29kZVxuLy8gcmVwbGFjZW1lbnQgY2hhcmFjdGVyLiBTZWUgaHR0cHM6Ly9jb2RlcmV2aWV3LmNocm9taXVtLm9yZy8xMjExNzMwMDkvIC5cblN0cmluZ0RlY29kZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gIHZhciBjaGFyU3RyID0gJyc7XG4gIC8vIGlmIG91ciBsYXN0IHdyaXRlIGVuZGVkIHdpdGggYW4gaW5jb21wbGV0ZSBtdWx0aWJ5dGUgY2hhcmFjdGVyXG4gIHdoaWxlICh0aGlzLmNoYXJMZW5ndGgpIHtcbiAgICAvLyBkZXRlcm1pbmUgaG93IG1hbnkgcmVtYWluaW5nIGJ5dGVzIHRoaXMgYnVmZmVyIGhhcyB0byBvZmZlciBmb3IgdGhpcyBjaGFyXG4gICAgdmFyIGF2YWlsYWJsZSA9IChidWZmZXIubGVuZ3RoID49IHRoaXMuY2hhckxlbmd0aCAtIHRoaXMuY2hhclJlY2VpdmVkKSA/XG4gICAgICAgIHRoaXMuY2hhckxlbmd0aCAtIHRoaXMuY2hhclJlY2VpdmVkIDpcbiAgICAgICAgYnVmZmVyLmxlbmd0aDtcblxuICAgIC8vIGFkZCB0aGUgbmV3IGJ5dGVzIHRvIHRoZSBjaGFyIGJ1ZmZlclxuICAgIGJ1ZmZlci5jb3B5KHRoaXMuY2hhckJ1ZmZlciwgdGhpcy5jaGFyUmVjZWl2ZWQsIDAsIGF2YWlsYWJsZSk7XG4gICAgdGhpcy5jaGFyUmVjZWl2ZWQgKz0gYXZhaWxhYmxlO1xuXG4gICAgaWYgKHRoaXMuY2hhclJlY2VpdmVkIDwgdGhpcy5jaGFyTGVuZ3RoKSB7XG4gICAgICAvLyBzdGlsbCBub3QgZW5vdWdoIGNoYXJzIGluIHRoaXMgYnVmZmVyPyB3YWl0IGZvciBtb3JlIC4uLlxuICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIC8vIHJlbW92ZSBieXRlcyBiZWxvbmdpbmcgdG8gdGhlIGN1cnJlbnQgY2hhcmFjdGVyIGZyb20gdGhlIGJ1ZmZlclxuICAgIGJ1ZmZlciA9IGJ1ZmZlci5zbGljZShhdmFpbGFibGUsIGJ1ZmZlci5sZW5ndGgpO1xuXG4gICAgLy8gZ2V0IHRoZSBjaGFyYWN0ZXIgdGhhdCB3YXMgc3BsaXRcbiAgICBjaGFyU3RyID0gdGhpcy5jaGFyQnVmZmVyLnNsaWNlKDAsIHRoaXMuY2hhckxlbmd0aCkudG9TdHJpbmcodGhpcy5lbmNvZGluZyk7XG5cbiAgICAvLyBDRVNVLTg6IGxlYWQgc3Vycm9nYXRlIChEODAwLURCRkYpIGlzIGFsc28gdGhlIGluY29tcGxldGUgY2hhcmFjdGVyXG4gICAgdmFyIGNoYXJDb2RlID0gY2hhclN0ci5jaGFyQ29kZUF0KGNoYXJTdHIubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGNoYXJDb2RlID49IDB4RDgwMCAmJiBjaGFyQ29kZSA8PSAweERCRkYpIHtcbiAgICAgIHRoaXMuY2hhckxlbmd0aCArPSB0aGlzLnN1cnJvZ2F0ZVNpemU7XG4gICAgICBjaGFyU3RyID0gJyc7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgdGhpcy5jaGFyUmVjZWl2ZWQgPSB0aGlzLmNoYXJMZW5ndGggPSAwO1xuXG4gICAgLy8gaWYgdGhlcmUgYXJlIG5vIG1vcmUgYnl0ZXMgaW4gdGhpcyBidWZmZXIsIGp1c3QgZW1pdCBvdXIgY2hhclxuICAgIGlmIChidWZmZXIubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gY2hhclN0cjtcbiAgICB9XG4gICAgYnJlYWs7XG4gIH1cblxuICAvLyBkZXRlcm1pbmUgYW5kIHNldCBjaGFyTGVuZ3RoIC8gY2hhclJlY2VpdmVkXG4gIHRoaXMuZGV0ZWN0SW5jb21wbGV0ZUNoYXIoYnVmZmVyKTtcblxuICB2YXIgZW5kID0gYnVmZmVyLmxlbmd0aDtcbiAgaWYgKHRoaXMuY2hhckxlbmd0aCkge1xuICAgIC8vIGJ1ZmZlciB0aGUgaW5jb21wbGV0ZSBjaGFyYWN0ZXIgYnl0ZXMgd2UgZ290XG4gICAgYnVmZmVyLmNvcHkodGhpcy5jaGFyQnVmZmVyLCAwLCBidWZmZXIubGVuZ3RoIC0gdGhpcy5jaGFyUmVjZWl2ZWQsIGVuZCk7XG4gICAgZW5kIC09IHRoaXMuY2hhclJlY2VpdmVkO1xuICB9XG5cbiAgY2hhclN0ciArPSBidWZmZXIudG9TdHJpbmcodGhpcy5lbmNvZGluZywgMCwgZW5kKTtcblxuICB2YXIgZW5kID0gY2hhclN0ci5sZW5ndGggLSAxO1xuICB2YXIgY2hhckNvZGUgPSBjaGFyU3RyLmNoYXJDb2RlQXQoZW5kKTtcbiAgLy8gQ0VTVS04OiBsZWFkIHN1cnJvZ2F0ZSAoRDgwMC1EQkZGKSBpcyBhbHNvIHRoZSBpbmNvbXBsZXRlIGNoYXJhY3RlclxuICBpZiAoY2hhckNvZGUgPj0gMHhEODAwICYmIGNoYXJDb2RlIDw9IDB4REJGRikge1xuICAgIHZhciBzaXplID0gdGhpcy5zdXJyb2dhdGVTaXplO1xuICAgIHRoaXMuY2hhckxlbmd0aCArPSBzaXplO1xuICAgIHRoaXMuY2hhclJlY2VpdmVkICs9IHNpemU7XG4gICAgdGhpcy5jaGFyQnVmZmVyLmNvcHkodGhpcy5jaGFyQnVmZmVyLCBzaXplLCAwLCBzaXplKTtcbiAgICBidWZmZXIuY29weSh0aGlzLmNoYXJCdWZmZXIsIDAsIDAsIHNpemUpO1xuICAgIHJldHVybiBjaGFyU3RyLnN1YnN0cmluZygwLCBlbmQpO1xuICB9XG5cbiAgLy8gb3IganVzdCBlbWl0IHRoZSBjaGFyU3RyXG4gIHJldHVybiBjaGFyU3RyO1xufTtcblxuLy8gZGV0ZWN0SW5jb21wbGV0ZUNoYXIgZGV0ZXJtaW5lcyBpZiB0aGVyZSBpcyBhbiBpbmNvbXBsZXRlIFVURi04IGNoYXJhY3RlciBhdFxuLy8gdGhlIGVuZCBvZiB0aGUgZ2l2ZW4gYnVmZmVyLiBJZiBzbywgaXQgc2V0cyB0aGlzLmNoYXJMZW5ndGggdG8gdGhlIGJ5dGVcbi8vIGxlbmd0aCB0aGF0IGNoYXJhY3RlciwgYW5kIHNldHMgdGhpcy5jaGFyUmVjZWl2ZWQgdG8gdGhlIG51bWJlciBvZiBieXRlc1xuLy8gdGhhdCBhcmUgYXZhaWxhYmxlIGZvciB0aGlzIGNoYXJhY3Rlci5cblN0cmluZ0RlY29kZXIucHJvdG90eXBlLmRldGVjdEluY29tcGxldGVDaGFyID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gIC8vIGRldGVybWluZSBob3cgbWFueSBieXRlcyB3ZSBoYXZlIHRvIGNoZWNrIGF0IHRoZSBlbmQgb2YgdGhpcyBidWZmZXJcbiAgdmFyIGkgPSAoYnVmZmVyLmxlbmd0aCA+PSAzKSA/IDMgOiBidWZmZXIubGVuZ3RoO1xuXG4gIC8vIEZpZ3VyZSBvdXQgaWYgb25lIG9mIHRoZSBsYXN0IGkgYnl0ZXMgb2Ygb3VyIGJ1ZmZlciBhbm5vdW5jZXMgYW5cbiAgLy8gaW5jb21wbGV0ZSBjaGFyLlxuICBmb3IgKDsgaSA+IDA7IGktLSkge1xuICAgIHZhciBjID0gYnVmZmVyW2J1ZmZlci5sZW5ndGggLSBpXTtcblxuICAgIC8vIFNlZSBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1VURi04I0Rlc2NyaXB0aW9uXG5cbiAgICAvLyAxMTBYWFhYWFxuICAgIGlmIChpID09IDEgJiYgYyA+PiA1ID09IDB4MDYpIHtcbiAgICAgIHRoaXMuY2hhckxlbmd0aCA9IDI7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICAvLyAxMTEwWFhYWFxuICAgIGlmIChpIDw9IDIgJiYgYyA+PiA0ID09IDB4MEUpIHtcbiAgICAgIHRoaXMuY2hhckxlbmd0aCA9IDM7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICAvLyAxMTExMFhYWFxuICAgIGlmIChpIDw9IDMgJiYgYyA+PiAzID09IDB4MUUpIHtcbiAgICAgIHRoaXMuY2hhckxlbmd0aCA9IDQ7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgdGhpcy5jaGFyUmVjZWl2ZWQgPSBpO1xufTtcblxuU3RyaW5nRGVjb2Rlci5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gIHZhciByZXMgPSAnJztcbiAgaWYgKGJ1ZmZlciAmJiBidWZmZXIubGVuZ3RoKVxuICAgIHJlcyA9IHRoaXMud3JpdGUoYnVmZmVyKTtcblxuICBpZiAodGhpcy5jaGFyUmVjZWl2ZWQpIHtcbiAgICB2YXIgY3IgPSB0aGlzLmNoYXJSZWNlaXZlZDtcbiAgICB2YXIgYnVmID0gdGhpcy5jaGFyQnVmZmVyO1xuICAgIHZhciBlbmMgPSB0aGlzLmVuY29kaW5nO1xuICAgIHJlcyArPSBidWYuc2xpY2UoMCwgY3IpLnRvU3RyaW5nKGVuYyk7XG4gIH1cblxuICByZXR1cm4gcmVzO1xufTtcblxuZnVuY3Rpb24gcGFzc1Rocm91Z2hXcml0ZShidWZmZXIpIHtcbiAgcmV0dXJuIGJ1ZmZlci50b1N0cmluZyh0aGlzLmVuY29kaW5nKTtcbn1cblxuZnVuY3Rpb24gdXRmMTZEZXRlY3RJbmNvbXBsZXRlQ2hhcihidWZmZXIpIHtcbiAgdGhpcy5jaGFyUmVjZWl2ZWQgPSBidWZmZXIubGVuZ3RoICUgMjtcbiAgdGhpcy5jaGFyTGVuZ3RoID0gdGhpcy5jaGFyUmVjZWl2ZWQgPyAyIDogMDtcbn1cblxuZnVuY3Rpb24gYmFzZTY0RGV0ZWN0SW5jb21wbGV0ZUNoYXIoYnVmZmVyKSB7XG4gIHRoaXMuY2hhclJlY2VpdmVkID0gYnVmZmVyLmxlbmd0aCAlIDM7XG4gIHRoaXMuY2hhckxlbmd0aCA9IHRoaXMuY2hhclJlY2VpdmVkID8gMyA6IDA7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQnVmZmVyKGFyZykge1xuICByZXR1cm4gYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnXG4gICAgJiYgdHlwZW9mIGFyZy5jb3B5ID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5maWxsID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5yZWFkVUludDggPT09ICdmdW5jdGlvbic7XG59IiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbnZhciBmb3JtYXRSZWdFeHAgPSAvJVtzZGolXS9nO1xuZXhwb3J0cy5mb3JtYXQgPSBmdW5jdGlvbihmKSB7XG4gIGlmICghaXNTdHJpbmcoZikpIHtcbiAgICB2YXIgb2JqZWN0cyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBvYmplY3RzLnB1c2goaW5zcGVjdChhcmd1bWVudHNbaV0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdHMuam9pbignICcpO1xuICB9XG5cbiAgdmFyIGkgPSAxO1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIGxlbiA9IGFyZ3MubGVuZ3RoO1xuICB2YXIgc3RyID0gU3RyaW5nKGYpLnJlcGxhY2UoZm9ybWF0UmVnRXhwLCBmdW5jdGlvbih4KSB7XG4gICAgaWYgKHggPT09ICclJScpIHJldHVybiAnJSc7XG4gICAgaWYgKGkgPj0gbGVuKSByZXR1cm4geDtcbiAgICBzd2l0Y2ggKHgpIHtcbiAgICAgIGNhc2UgJyVzJzogcmV0dXJuIFN0cmluZyhhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWQnOiByZXR1cm4gTnVtYmVyKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclaic6XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFyZ3NbaSsrXSk7XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICByZXR1cm4gJ1tDaXJjdWxhcl0nO1xuICAgICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4geDtcbiAgICB9XG4gIH0pO1xuICBmb3IgKHZhciB4ID0gYXJnc1tpXTsgaSA8IGxlbjsgeCA9IGFyZ3NbKytpXSkge1xuICAgIGlmIChpc051bGwoeCkgfHwgIWlzT2JqZWN0KHgpKSB7XG4gICAgICBzdHIgKz0gJyAnICsgeDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyICs9ICcgJyArIGluc3BlY3QoeCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHI7XG59O1xuXG5cbi8vIE1hcmsgdGhhdCBhIG1ldGhvZCBzaG91bGQgbm90IGJlIHVzZWQuXG4vLyBSZXR1cm5zIGEgbW9kaWZpZWQgZnVuY3Rpb24gd2hpY2ggd2FybnMgb25jZSBieSBkZWZhdWx0LlxuLy8gSWYgLS1uby1kZXByZWNhdGlvbiBpcyBzZXQsIHRoZW4gaXQgaXMgYSBuby1vcC5cbmV4cG9ydHMuZGVwcmVjYXRlID0gZnVuY3Rpb24oZm4sIG1zZykge1xuICAvLyBBbGxvdyBmb3IgZGVwcmVjYXRpbmcgdGhpbmdzIGluIHRoZSBwcm9jZXNzIG9mIHN0YXJ0aW5nIHVwLlxuICBpZiAoaXNVbmRlZmluZWQoZ2xvYmFsLnByb2Nlc3MpKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4cG9ydHMuZGVwcmVjYXRlKGZuLCBtc2cpLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuXG4gIGlmIChwcm9jZXNzLm5vRGVwcmVjYXRpb24gPT09IHRydWUpIHtcbiAgICByZXR1cm4gZm47XG4gIH1cblxuICB2YXIgd2FybmVkID0gZmFsc2U7XG4gIGZ1bmN0aW9uIGRlcHJlY2F0ZWQoKSB7XG4gICAgaWYgKCF3YXJuZWQpIHtcbiAgICAgIGlmIChwcm9jZXNzLnRocm93RGVwcmVjYXRpb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XG4gICAgICB9IGVsc2UgaWYgKHByb2Nlc3MudHJhY2VEZXByZWNhdGlvbikge1xuICAgICAgICBjb25zb2xlLnRyYWNlKG1zZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKG1zZyk7XG4gICAgICB9XG4gICAgICB3YXJuZWQgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfVxuXG4gIHJldHVybiBkZXByZWNhdGVkO1xufTtcblxuXG52YXIgZGVidWdzID0ge307XG52YXIgZGVidWdFbnZpcm9uO1xuZXhwb3J0cy5kZWJ1Z2xvZyA9IGZ1bmN0aW9uKHNldCkge1xuICBpZiAoaXNVbmRlZmluZWQoZGVidWdFbnZpcm9uKSlcbiAgICBkZWJ1Z0Vudmlyb24gPSBwcm9jZXNzLmVudi5OT0RFX0RFQlVHIHx8ICcnO1xuICBzZXQgPSBzZXQudG9VcHBlckNhc2UoKTtcbiAgaWYgKCFkZWJ1Z3Nbc2V0XSkge1xuICAgIGlmIChuZXcgUmVnRXhwKCdcXFxcYicgKyBzZXQgKyAnXFxcXGInLCAnaScpLnRlc3QoZGVidWdFbnZpcm9uKSkge1xuICAgICAgdmFyIHBpZCA9IHByb2Nlc3MucGlkO1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG1zZyA9IGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cyk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyVzICVkOiAlcycsIHNldCwgcGlkLCBtc2cpO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHt9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gZGVidWdzW3NldF07XG59O1xuXG5cbi8qKlxuICogRWNob3MgdGhlIHZhbHVlIG9mIGEgdmFsdWUuIFRyeXMgdG8gcHJpbnQgdGhlIHZhbHVlIG91dFxuICogaW4gdGhlIGJlc3Qgd2F5IHBvc3NpYmxlIGdpdmVuIHRoZSBkaWZmZXJlbnQgdHlwZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHByaW50IG91dC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgYWx0ZXJzIHRoZSBvdXRwdXQuXG4gKi9cbi8qIGxlZ2FjeTogb2JqLCBzaG93SGlkZGVuLCBkZXB0aCwgY29sb3JzKi9cbmZ1bmN0aW9uIGluc3BlY3Qob2JqLCBvcHRzKSB7XG4gIC8vIGRlZmF1bHQgb3B0aW9uc1xuICB2YXIgY3R4ID0ge1xuICAgIHNlZW46IFtdLFxuICAgIHN0eWxpemU6IHN0eWxpemVOb0NvbG9yXG4gIH07XG4gIC8vIGxlZ2FjeS4uLlxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSAzKSBjdHguZGVwdGggPSBhcmd1bWVudHNbMl07XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDQpIGN0eC5jb2xvcnMgPSBhcmd1bWVudHNbM107XG4gIGlmIChpc0Jvb2xlYW4ob3B0cykpIHtcbiAgICAvLyBsZWdhY3kuLi5cbiAgICBjdHguc2hvd0hpZGRlbiA9IG9wdHM7XG4gIH0gZWxzZSBpZiAob3B0cykge1xuICAgIC8vIGdvdCBhbiBcIm9wdGlvbnNcIiBvYmplY3RcbiAgICBleHBvcnRzLl9leHRlbmQoY3R4LCBvcHRzKTtcbiAgfVxuICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gIGlmIChpc1VuZGVmaW5lZChjdHguc2hvd0hpZGRlbikpIGN0eC5zaG93SGlkZGVuID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguZGVwdGgpKSBjdHguZGVwdGggPSAyO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmNvbG9ycykpIGN0eC5jb2xvcnMgPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jdXN0b21JbnNwZWN0KSkgY3R4LmN1c3RvbUluc3BlY3QgPSB0cnVlO1xuICBpZiAoY3R4LmNvbG9ycykgY3R4LnN0eWxpemUgPSBzdHlsaXplV2l0aENvbG9yO1xuICByZXR1cm4gZm9ybWF0VmFsdWUoY3R4LCBvYmosIGN0eC5kZXB0aCk7XG59XG5leHBvcnRzLmluc3BlY3QgPSBpbnNwZWN0O1xuXG5cbi8vIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQU5TSV9lc2NhcGVfY29kZSNncmFwaGljc1xuaW5zcGVjdC5jb2xvcnMgPSB7XG4gICdib2xkJyA6IFsxLCAyMl0sXG4gICdpdGFsaWMnIDogWzMsIDIzXSxcbiAgJ3VuZGVybGluZScgOiBbNCwgMjRdLFxuICAnaW52ZXJzZScgOiBbNywgMjddLFxuICAnd2hpdGUnIDogWzM3LCAzOV0sXG4gICdncmV5JyA6IFs5MCwgMzldLFxuICAnYmxhY2snIDogWzMwLCAzOV0sXG4gICdibHVlJyA6IFszNCwgMzldLFxuICAnY3lhbicgOiBbMzYsIDM5XSxcbiAgJ2dyZWVuJyA6IFszMiwgMzldLFxuICAnbWFnZW50YScgOiBbMzUsIDM5XSxcbiAgJ3JlZCcgOiBbMzEsIDM5XSxcbiAgJ3llbGxvdycgOiBbMzMsIDM5XVxufTtcblxuLy8gRG9uJ3QgdXNlICdibHVlJyBub3QgdmlzaWJsZSBvbiBjbWQuZXhlXG5pbnNwZWN0LnN0eWxlcyA9IHtcbiAgJ3NwZWNpYWwnOiAnY3lhbicsXG4gICdudW1iZXInOiAneWVsbG93JyxcbiAgJ2Jvb2xlYW4nOiAneWVsbG93JyxcbiAgJ3VuZGVmaW5lZCc6ICdncmV5JyxcbiAgJ251bGwnOiAnYm9sZCcsXG4gICdzdHJpbmcnOiAnZ3JlZW4nLFxuICAnZGF0ZSc6ICdtYWdlbnRhJyxcbiAgLy8gXCJuYW1lXCI6IGludGVudGlvbmFsbHkgbm90IHN0eWxpbmdcbiAgJ3JlZ2V4cCc6ICdyZWQnXG59O1xuXG5cbmZ1bmN0aW9uIHN0eWxpemVXaXRoQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgdmFyIHN0eWxlID0gaW5zcGVjdC5zdHlsZXNbc3R5bGVUeXBlXTtcblxuICBpZiAoc3R5bGUpIHtcbiAgICByZXR1cm4gJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVswXSArICdtJyArIHN0ciArXG4gICAgICAgICAgICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMV0gKyAnbSc7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIHN0eWxpemVOb0NvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHJldHVybiBzdHI7XG59XG5cblxuZnVuY3Rpb24gYXJyYXlUb0hhc2goYXJyYXkpIHtcbiAgdmFyIGhhc2ggPSB7fTtcblxuICBhcnJheS5mb3JFYWNoKGZ1bmN0aW9uKHZhbCwgaWR4KSB7XG4gICAgaGFzaFt2YWxdID0gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIGhhc2g7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0VmFsdWUoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzKSB7XG4gIC8vIFByb3ZpZGUgYSBob29rIGZvciB1c2VyLXNwZWNpZmllZCBpbnNwZWN0IGZ1bmN0aW9ucy5cbiAgLy8gQ2hlY2sgdGhhdCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbiBpbnNwZWN0IGZ1bmN0aW9uIG9uIGl0XG4gIGlmIChjdHguY3VzdG9tSW5zcGVjdCAmJlxuICAgICAgdmFsdWUgJiZcbiAgICAgIGlzRnVuY3Rpb24odmFsdWUuaW5zcGVjdCkgJiZcbiAgICAgIC8vIEZpbHRlciBvdXQgdGhlIHV0aWwgbW9kdWxlLCBpdCdzIGluc3BlY3QgZnVuY3Rpb24gaXMgc3BlY2lhbFxuICAgICAgdmFsdWUuaW5zcGVjdCAhPT0gZXhwb3J0cy5pbnNwZWN0ICYmXG4gICAgICAvLyBBbHNvIGZpbHRlciBvdXQgYW55IHByb3RvdHlwZSBvYmplY3RzIHVzaW5nIHRoZSBjaXJjdWxhciBjaGVjay5cbiAgICAgICEodmFsdWUuY29uc3RydWN0b3IgJiYgdmFsdWUuY29uc3RydWN0b3IucHJvdG90eXBlID09PSB2YWx1ZSkpIHtcbiAgICB2YXIgcmV0ID0gdmFsdWUuaW5zcGVjdChyZWN1cnNlVGltZXMsIGN0eCk7XG4gICAgaWYgKCFpc1N0cmluZyhyZXQpKSB7XG4gICAgICByZXQgPSBmb3JtYXRWYWx1ZShjdHgsIHJldCwgcmVjdXJzZVRpbWVzKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIC8vIFByaW1pdGl2ZSB0eXBlcyBjYW5ub3QgaGF2ZSBwcm9wZXJ0aWVzXG4gIHZhciBwcmltaXRpdmUgPSBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSk7XG4gIGlmIChwcmltaXRpdmUpIHtcbiAgICByZXR1cm4gcHJpbWl0aXZlO1xuICB9XG5cbiAgLy8gTG9vayB1cCB0aGUga2V5cyBvZiB0aGUgb2JqZWN0LlxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlKTtcbiAgdmFyIHZpc2libGVLZXlzID0gYXJyYXlUb0hhc2goa2V5cyk7XG5cbiAgaWYgKGN0eC5zaG93SGlkZGVuKSB7XG4gICAga2V5cyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHZhbHVlKTtcbiAgfVxuXG4gIC8vIElFIGRvZXNuJ3QgbWFrZSBlcnJvciBmaWVsZHMgbm9uLWVudW1lcmFibGVcbiAgLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2llL2R3dzUyc2J0KHY9dnMuOTQpLmFzcHhcbiAgaWYgKGlzRXJyb3IodmFsdWUpXG4gICAgICAmJiAoa2V5cy5pbmRleE9mKCdtZXNzYWdlJykgPj0gMCB8fCBrZXlzLmluZGV4T2YoJ2Rlc2NyaXB0aW9uJykgPj0gMCkpIHtcbiAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgLy8gU29tZSB0eXBlIG9mIG9iamVjdCB3aXRob3V0IHByb3BlcnRpZXMgY2FuIGJlIHNob3J0Y3V0dGVkLlxuICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICAgIHZhciBuYW1lID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tGdW5jdGlvbicgKyBuYW1lICsgJ10nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH1cbiAgICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKERhdGUucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAnZGF0ZScpO1xuICAgIH1cbiAgICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGJhc2UgPSAnJywgYXJyYXkgPSBmYWxzZSwgYnJhY2VzID0gWyd7JywgJ30nXTtcblxuICAvLyBNYWtlIEFycmF5IHNheSB0aGF0IHRoZXkgYXJlIEFycmF5XG4gIGlmIChpc0FycmF5KHZhbHVlKSkge1xuICAgIGFycmF5ID0gdHJ1ZTtcbiAgICBicmFjZXMgPSBbJ1snLCAnXSddO1xuICB9XG5cbiAgLy8gTWFrZSBmdW5jdGlvbnMgc2F5IHRoYXQgdGhleSBhcmUgZnVuY3Rpb25zXG4gIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgIHZhciBuID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgYmFzZSA9ICcgW0Z1bmN0aW9uJyArIG4gKyAnXSc7XG4gIH1cblxuICAvLyBNYWtlIFJlZ0V4cHMgc2F5IHRoYXQgdGhleSBhcmUgUmVnRXhwc1xuICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGRhdGVzIHdpdGggcHJvcGVydGllcyBmaXJzdCBzYXkgdGhlIGRhdGVcbiAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgRGF0ZS5wcm90b3R5cGUudG9VVENTdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGVycm9yIHdpdGggbWVzc2FnZSBmaXJzdCBzYXkgdGhlIGVycm9yXG4gIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICBpZiAoa2V5cy5sZW5ndGggPT09IDAgJiYgKCFhcnJheSB8fCB2YWx1ZS5sZW5ndGggPT0gMCkpIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArIGJyYWNlc1sxXTtcbiAgfVxuXG4gIGlmIChyZWN1cnNlVGltZXMgPCAwKSB7XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbT2JqZWN0XScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG5cbiAgY3R4LnNlZW4ucHVzaCh2YWx1ZSk7XG5cbiAgdmFyIG91dHB1dDtcbiAgaWYgKGFycmF5KSB7XG4gICAgb3V0cHV0ID0gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cyk7XG4gIH0gZWxzZSB7XG4gICAgb3V0cHV0ID0ga2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgICByZXR1cm4gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSk7XG4gICAgfSk7XG4gIH1cblxuICBjdHguc2Vlbi5wb3AoKTtcblxuICByZXR1cm4gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKSB7XG4gIGlmIChpc1VuZGVmaW5lZCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCd1bmRlZmluZWQnLCAndW5kZWZpbmVkJyk7XG4gIGlmIChpc1N0cmluZyh2YWx1ZSkpIHtcbiAgICB2YXIgc2ltcGxlID0gJ1xcJycgKyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkucmVwbGFjZSgvXlwifFwiJC9nLCAnJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJykgKyAnXFwnJztcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoc2ltcGxlLCAnc3RyaW5nJyk7XG4gIH1cbiAgaWYgKGlzTnVtYmVyKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ251bWJlcicpO1xuICBpZiAoaXNCb29sZWFuKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ2Jvb2xlYW4nKTtcbiAgLy8gRm9yIHNvbWUgcmVhc29uIHR5cGVvZiBudWxsIGlzIFwib2JqZWN0XCIsIHNvIHNwZWNpYWwgY2FzZSBoZXJlLlxuICBpZiAoaXNOdWxsKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ251bGwnLCAnbnVsbCcpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEVycm9yKHZhbHVlKSB7XG4gIHJldHVybiAnWycgKyBFcnJvci5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSkgKyAnXSc7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cykge1xuICB2YXIgb3V0cHV0ID0gW107XG4gIGZvciAodmFyIGkgPSAwLCBsID0gdmFsdWUubGVuZ3RoOyBpIDwgbDsgKytpKSB7XG4gICAgaWYgKGhhc093blByb3BlcnR5KHZhbHVlLCBTdHJpbmcoaSkpKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIFN0cmluZyhpKSwgdHJ1ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXRwdXQucHVzaCgnJyk7XG4gICAgfVxuICB9XG4gIGtleXMuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICBpZiAoIWtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAga2V5LCB0cnVlKSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KSB7XG4gIHZhciBuYW1lLCBzdHIsIGRlc2M7XG4gIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHZhbHVlLCBrZXkpIHx8IHsgdmFsdWU6IHZhbHVlW2tleV0gfTtcbiAgaWYgKGRlc2MuZ2V0KSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlci9TZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoIWhhc093blByb3BlcnR5KHZpc2libGVLZXlzLCBrZXkpKSB7XG4gICAgbmFtZSA9ICdbJyArIGtleSArICddJztcbiAgfVxuICBpZiAoIXN0cikge1xuICAgIGlmIChjdHguc2Vlbi5pbmRleE9mKGRlc2MudmFsdWUpIDwgMCkge1xuICAgICAgaWYgKGlzTnVsbChyZWN1cnNlVGltZXMpKSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgbnVsbCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIHJlY3Vyc2VUaW1lcyAtIDEpO1xuICAgICAgfVxuICAgICAgaWYgKHN0ci5pbmRleE9mKCdcXG4nKSA+IC0xKSB7XG4gICAgICAgIGlmIChhcnJheSkge1xuICAgICAgICAgIHN0ciA9IHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKS5zdWJzdHIoMik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RyID0gJ1xcbicgKyBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbQ2lyY3VsYXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKGlzVW5kZWZpbmVkKG5hbWUpKSB7XG4gICAgaWYgKGFycmF5ICYmIGtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICAgIG5hbWUgPSBKU09OLnN0cmluZ2lmeSgnJyArIGtleSk7XG4gICAgaWYgKG5hbWUubWF0Y2goL15cIihbYS16QS1aX11bYS16QS1aXzAtOV0qKVwiJC8pKSB7XG4gICAgICBuYW1lID0gbmFtZS5zdWJzdHIoMSwgbmFtZS5sZW5ndGggLSAyKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnbmFtZScpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvKF5cInxcIiQpL2csIFwiJ1wiKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnc3RyaW5nJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG5hbWUgKyAnOiAnICsgc3RyO1xufVxuXG5cbmZ1bmN0aW9uIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKSB7XG4gIHZhciBudW1MaW5lc0VzdCA9IDA7XG4gIHZhciBsZW5ndGggPSBvdXRwdXQucmVkdWNlKGZ1bmN0aW9uKHByZXYsIGN1cikge1xuICAgIG51bUxpbmVzRXN0Kys7XG4gICAgaWYgKGN1ci5pbmRleE9mKCdcXG4nKSA+PSAwKSBudW1MaW5lc0VzdCsrO1xuICAgIHJldHVybiBwcmV2ICsgY3VyLnJlcGxhY2UoL1xcdTAwMWJcXFtcXGRcXGQ/bS9nLCAnJykubGVuZ3RoICsgMTtcbiAgfSwgMCk7XG5cbiAgaWYgKGxlbmd0aCA+IDYwKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArXG4gICAgICAgICAgIChiYXNlID09PSAnJyA/ICcnIDogYmFzZSArICdcXG4gJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBvdXRwdXQuam9pbignLFxcbiAgJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBicmFjZXNbMV07XG4gIH1cblxuICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArICcgJyArIG91dHB1dC5qb2luKCcsICcpICsgJyAnICsgYnJhY2VzWzFdO1xufVxuXG5cbi8vIE5PVEU6IFRoZXNlIHR5cGUgY2hlY2tpbmcgZnVuY3Rpb25zIGludGVudGlvbmFsbHkgZG9uJ3QgdXNlIGBpbnN0YW5jZW9mYFxuLy8gYmVjYXVzZSBpdCBpcyBmcmFnaWxlIGFuZCBjYW4gYmUgZWFzaWx5IGZha2VkIHdpdGggYE9iamVjdC5jcmVhdGUoKWAuXG5mdW5jdGlvbiBpc0FycmF5KGFyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFyKTtcbn1cbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXk7XG5cbmZ1bmN0aW9uIGlzQm9vbGVhbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJztcbn1cbmV4cG9ydHMuaXNCb29sZWFuID0gaXNCb29sZWFuO1xuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbCA9IGlzTnVsbDtcblxuZnVuY3Rpb24gaXNOdWxsT3JVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsT3JVbmRlZmluZWQgPSBpc051bGxPclVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cbmV4cG9ydHMuaXNOdW1iZXIgPSBpc051bWJlcjtcblxuZnVuY3Rpb24gaXNTdHJpbmcoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJztcbn1cbmV4cG9ydHMuaXNTdHJpbmcgPSBpc1N0cmluZztcblxuZnVuY3Rpb24gaXNTeW1ib2woYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3ltYm9sJztcbn1cbmV4cG9ydHMuaXNTeW1ib2wgPSBpc1N5bWJvbDtcblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbmV4cG9ydHMuaXNVbmRlZmluZWQgPSBpc1VuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNSZWdFeHAocmUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHJlKSAmJiBvYmplY3RUb1N0cmluZyhyZSkgPT09ICdbb2JqZWN0IFJlZ0V4cF0nO1xufVxuZXhwb3J0cy5pc1JlZ0V4cCA9IGlzUmVnRXhwO1xuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNPYmplY3QgPSBpc09iamVjdDtcblxuZnVuY3Rpb24gaXNEYXRlKGQpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGQpICYmIG9iamVjdFRvU3RyaW5nKGQpID09PSAnW29iamVjdCBEYXRlXSc7XG59XG5leHBvcnRzLmlzRGF0ZSA9IGlzRGF0ZTtcblxuZnVuY3Rpb24gaXNFcnJvcihlKSB7XG4gIHJldHVybiBpc09iamVjdChlKSAmJlxuICAgICAgKG9iamVjdFRvU3RyaW5nKGUpID09PSAnW29iamVjdCBFcnJvcl0nIHx8IGUgaW5zdGFuY2VvZiBFcnJvcik7XG59XG5leHBvcnRzLmlzRXJyb3IgPSBpc0Vycm9yO1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cbmV4cG9ydHMuaXNGdW5jdGlvbiA9IGlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIGlzUHJpbWl0aXZlKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnYm9vbGVhbicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdudW1iZXInIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCcgfHwgIC8vIEVTNiBzeW1ib2xcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICd1bmRlZmluZWQnO1xufVxuZXhwb3J0cy5pc1ByaW1pdGl2ZSA9IGlzUHJpbWl0aXZlO1xuXG5leHBvcnRzLmlzQnVmZmVyID0gcmVxdWlyZSgnLi9zdXBwb3J0L2lzQnVmZmVyJyk7XG5cbmZ1bmN0aW9uIG9iamVjdFRvU3RyaW5nKG8pIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKTtcbn1cblxuXG5mdW5jdGlvbiBwYWQobikge1xuICByZXR1cm4gbiA8IDEwID8gJzAnICsgbi50b1N0cmluZygxMCkgOiBuLnRvU3RyaW5nKDEwKTtcbn1cblxuXG52YXIgbW9udGhzID0gWydKYW4nLCAnRmViJywgJ01hcicsICdBcHInLCAnTWF5JywgJ0p1bicsICdKdWwnLCAnQXVnJywgJ1NlcCcsXG4gICAgICAgICAgICAgICdPY3QnLCAnTm92JywgJ0RlYyddO1xuXG4vLyAyNiBGZWIgMTY6MTk6MzRcbmZ1bmN0aW9uIHRpbWVzdGFtcCgpIHtcbiAgdmFyIGQgPSBuZXcgRGF0ZSgpO1xuICB2YXIgdGltZSA9IFtwYWQoZC5nZXRIb3VycygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0TWludXRlcygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0U2Vjb25kcygpKV0uam9pbignOicpO1xuICByZXR1cm4gW2QuZ2V0RGF0ZSgpLCBtb250aHNbZC5nZXRNb250aCgpXSwgdGltZV0uam9pbignICcpO1xufVxuXG5cbi8vIGxvZyBpcyBqdXN0IGEgdGhpbiB3cmFwcGVyIHRvIGNvbnNvbGUubG9nIHRoYXQgcHJlcGVuZHMgYSB0aW1lc3RhbXBcbmV4cG9ydHMubG9nID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKCclcyAtICVzJywgdGltZXN0YW1wKCksIGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cykpO1xufTtcblxuXG4vKipcbiAqIEluaGVyaXQgdGhlIHByb3RvdHlwZSBtZXRob2RzIGZyb20gb25lIGNvbnN0cnVjdG9yIGludG8gYW5vdGhlci5cbiAqXG4gKiBUaGUgRnVuY3Rpb24ucHJvdG90eXBlLmluaGVyaXRzIGZyb20gbGFuZy5qcyByZXdyaXR0ZW4gYXMgYSBzdGFuZGFsb25lXG4gKiBmdW5jdGlvbiAobm90IG9uIEZ1bmN0aW9uLnByb3RvdHlwZSkuIE5PVEU6IElmIHRoaXMgZmlsZSBpcyB0byBiZSBsb2FkZWRcbiAqIGR1cmluZyBib290c3RyYXBwaW5nIHRoaXMgZnVuY3Rpb24gbmVlZHMgdG8gYmUgcmV3cml0dGVuIHVzaW5nIHNvbWUgbmF0aXZlXG4gKiBmdW5jdGlvbnMgYXMgcHJvdG90eXBlIHNldHVwIHVzaW5nIG5vcm1hbCBKYXZhU2NyaXB0IGRvZXMgbm90IHdvcmsgYXNcbiAqIGV4cGVjdGVkIGR1cmluZyBib290c3RyYXBwaW5nIChzZWUgbWlycm9yLmpzIGluIHIxMTQ5MDMpLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gd2hpY2ggbmVlZHMgdG8gaW5oZXJpdCB0aGVcbiAqICAgICBwcm90b3R5cGUuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBzdXBlckN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gdG8gaW5oZXJpdCBwcm90b3R5cGUgZnJvbS5cbiAqL1xuZXhwb3J0cy5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG5cbmV4cG9ydHMuX2V4dGVuZCA9IGZ1bmN0aW9uKG9yaWdpbiwgYWRkKSB7XG4gIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIGFkZCBpc24ndCBhbiBvYmplY3RcbiAgaWYgKCFhZGQgfHwgIWlzT2JqZWN0KGFkZCkpIHJldHVybiBvcmlnaW47XG5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhhZGQpO1xuICB2YXIgaSA9IGtleXMubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgb3JpZ2luW2tleXNbaV1dID0gYWRkW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiBvcmlnaW47XG59O1xuXG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuIiwiLyoqXHJcbiAqIEphdmFzY3JpcHQgQkFTSUMgcGFyc2VyIGFuZCBlZGl0b3JcclxuICovXHJcblxyXG5leHBvcnRzLmV4ZWN1dG9yID0gcmVxdWlyZSgnLi9saWIvZXhlY3V0b3InKTtcclxuZXhwb3J0cy5maWxlc3lzdGVtID0gcmVxdWlyZSgnLi9saWIvZmlsZXN5c3RlbScpO1xyXG5leHBvcnRzLmZ1bmN0aW9ucyA9IHJlcXVpcmUoJy4vbGliL2Z1bmN0aW9ucycpO1xyXG5leHBvcnRzLnBhcnNlciA9IHJlcXVpcmUoJy4vbGliL3BhcnNlcicpO1xyXG5leHBvcnRzLklPSW50ZXJmYWNlID0gcmVxdWlyZSgnLi9saWIvSU9JbnRlcmZhY2UnKTtcclxuZXhwb3J0cy5yZXBsID0gcmVxdWlyZSgnLi9saWIvcmVwbCcpO1xyXG5leHBvcnRzLnV0aWwgPSByZXF1aXJlKCcuL2xpYi91dGlsJyk7XHJcblxyXG4vLyBDcmVhdGUgZHVtbXkgSU8gaW50ZXJmYWNlXHJcbnZhciBJT0ludGVyZmFjZSA9IHJlcXVpcmUoJy4vbGliL0lPSW50ZXJmYWNlJyk7XHJcbnZhciBkcmF3SW50ZXJmYWNlID0gbmV3IElPSW50ZXJmYWNlKCk7XHJcbmRyYXdJbnRlcmZhY2Uuc2V0T3V0cHV0KGZ1bmN0aW9uKG9iaikge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBkcmF3aW5nIGludGVyZmFjZScpO1xyXG59KTtcclxuZHJhd0ludGVyZmFjZS5zZXRJbnB1dChmdW5jdGlvbigpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignTm8gZHJhd2luZyBpbnRlcmZhY2UnKTtcclxufSk7XHJcbklPSW50ZXJmYWNlLnNldChcImRyYXdcIiwgZHJhd0ludGVyZmFjZSk7XHJcblxyXG4vKipcclxuICogUXVpY2stcnVucyBjb2RlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBjb2RlXHJcbiAqIEBwYXJhbSB7ZXhwb3J0cy5FeGVjdXRpb25Db250ZXh0fEZ1bmN0aW9uP30gY3R4XHJcbiAqIEBwYXJhbSB7RnVuY3Rpb24/fSBkb25lXHJcbiAqIEByZXR1cm5zIHtFeGVjdXRpb25Db250ZXh0fVxyXG4gKi9cclxuZXhwb3J0cy5ydW4gPSBmdW5jdGlvbihjb2RlLCBjdHgsIGRvbmUpIHtcclxuICAgIGlmICghZG9uZSAmJiAhKGN0eCBpbnN0YW5jZW9mIGV4cG9ydHMuZXhlY3V0b3IuRXhlY3V0aW9uQ29udGV4dCkpIHtcclxuICAgICAgICBkb25lID0gY3R4O1xyXG4gICAgICAgIGN0eCA9IG5ldyBleHBvcnRzLmV4ZWN1dG9yLkV4ZWN1dGlvbkNvbnRleHQoKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgYXN0ID0gZXhwb3J0cy5wYXJzZXIucGFyc2UoY29kZSk7XHJcbiAgICBpZiAoYXN0LmVycm9yKSB7XHJcbiAgICAgICAgaWYgKGRvbmUpIHtcclxuICAgICAgICAgICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgIGRvbmUoYXN0LmVycm9yKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjdHg7XHJcbiAgICB9XHJcbiAgICB0cnkge1xyXG4gICAgICAgIGV4cG9ydHMuZXhlY3V0b3IuZXhlY3V0ZShhc3QsIGN0eCwgZG9uZSk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICBkb25lKGVycik7XHJcbiAgICAgICAgcmV0dXJuIGN0eDtcclxuICAgIH1cclxuICAgIHJldHVybiBjdHg7XHJcbn07IiwidmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcclxudmFyIHN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpO1xyXG5cclxuLyoqXHJcbiAqIEFuIGludGVyZmFjZSBmb3IgY3VzdG9tIGlucHV0L291dHB1dFxyXG4gKlxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9uP30gb3V0cHV0IEFuIG91dHB1dCBmdW5jdGlvblxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9uP30gaW5wdXQgQW4gaW5wdXQgZnVuY3Rpb25cclxuICogQHBhcmFtIHtPYmplY3Q/fSBkYXRhIERhdGFcclxuICovXHJcbmZ1bmN0aW9uIElPSW50ZXJmYWNlKG91dHB1dCwgaW5wdXQsIGRhdGEpIHtcclxuICAgIHRoaXMuX291dHB1dCA9IG91dHB1dCB8fCBmdW5jdGlvbigpIHsgfTtcclxuICAgIHRoaXMuX2lucHV0ID0gaW5wdXQgfHwgZnVuY3Rpb24oZG9uZSkgeyBkb25lKCdcXG4nKTsgfTtcclxuICAgIHRoaXMuX2RhdGEgPSBkYXRhIHx8IHt9O1xyXG59XHJcblxyXG5JT0ludGVyZmFjZS5JT0ludGVyZmFjZSA9IElPSW50ZXJmYWNlO1xyXG5cclxuLyoqXHJcbiAqIFNldHMgdGhlIG91dHB1dCBmdW5jdGlvblxyXG4gKlxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvdXRwdXRcclxuICovXHJcbklPSW50ZXJmYWNlLnByb3RvdHlwZS5zZXRPdXRwdXQgPSBmdW5jdGlvbihvdXRwdXQpIHtcclxuICAgIHRoaXMuX291dHB1dCA9IG91dHB1dDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIHRoZSBpbnB1dCBmdW5jdGlvblxyXG4gKlxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBpbnB1dFxyXG4gKi9cclxuSU9JbnRlcmZhY2UucHJvdG90eXBlLnNldElucHV0ID0gZnVuY3Rpb24oaW5wdXQpIHtcclxuICAgIHRoaXMuX2lucHV0ID0gaW5wdXQ7XHJcbn07XHJcblxyXG4vKipcclxuICogV3JpdGVzIHNvbWV0aGluZyB0byB0aGUgaW50ZXJmYWNlXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gdGV4dFxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIG91dHB1dCBpcyBub3QgYSBmdW5jdGlvblxyXG4gKi9cclxuSU9JbnRlcmZhY2UucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24odGV4dCkge1xyXG4gICAgaWYgKHR5cGVvZiB0aGlzLl9vdXRwdXQgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKCdvdXRwdXQgaXMgbm90IGEgZnVuY3Rpb24nKTtcclxuICAgIHRoaXMuX291dHB1dC5jYWxsKHRoaXMuX2RhdGEsIHRleHQpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFdyaXRlcyBhIGxpbmUgdG8gdGhlIGludGVyZmFjZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdGV4dFxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIG91dHB1dCBpcyBub3QgYSBmdW5jdGlvblxyXG4gKi9cclxuSU9JbnRlcmZhY2UucHJvdG90eXBlLndyaXRlbG4gPSBmdW5jdGlvbih0ZXh0KSB7XHJcbiAgICB0aGlzLndyaXRlKHRleHQgKyAnXFxuJyk7XHJcbn07XHJcbklPSW50ZXJmYWNlLnByb3RvdHlwZS5sb2cgPSBJT0ludGVyZmFjZS5wcm90b3R5cGUud3JpdGVsbjtcclxuXHJcbi8qKlxyXG4gKiBDb250aW51ZXMgcmVhZGluZyBjaGFyYWN0ZXJzIHVudGlsIHRoZSBmdW5jdGlvbiBjYWxscyB0aGUgY2FuY2VsIGFyZ3VtZW50XHJcbiAqXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFBhc3NlZCBjdXJyZW50IGNoYXJhY3RlciwgdG90YWwgdmFsdWUsIGFuZCBjYW5jZWwgZnVuY3Rpb25cclxuICogQHRocm93cyBFcnJvciBpZiBpbnB1dCBpcyBub3QgYSBmdW5jdGlvblxyXG4gKi9cclxuSU9JbnRlcmZhY2UucHJvdG90eXBlLnJlYWQgPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gICAgaWYgKHR5cGVvZiB0aGlzLl9pbnB1dCAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoJ2lucHV0IGlzIG5vdCBhIGZ1bmN0aW9uJyk7XHJcbiAgICB2YXIgdmFsdWUgPSAnJywgc2VsZiA9IHRoaXMsIHJ1bm5pbmcgPSB0cnVlO1xyXG5cclxuICAgIGZ1bmN0aW9uIHNlbmRJbnB1dChjaGFycywgb3ZlcnJpZGUpIHtcclxuICAgICAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKG92ZXJyaWRlKSB2YWx1ZSA9IGNoYXJzICsgJyAnO1xyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoYXJzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBhcmdzID0gW2NoYXJzW2ldXTtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjaGFyc1tpXSA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgICAgIGlmICghb3ZlcnJpZGUpIHZhbHVlICs9IGNoYXJzW2ldO1xyXG4gICAgICAgICAgICAgICAgYXJncy5wdXNoKHZhbHVlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBhcmdzLnB1c2goZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxmLl9pbnB1dC5jYWxsKHNlbGYuX2RhdGEsIGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIHJ1bm5pbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBjYWxsYmFjay5hcHBseSh7fSwgYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgc2VuZElucHV0LmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHNlbGYuX2lucHV0LmNhbGwoc2VsZi5fZGF0YSwgZmFsc2UpO1xyXG4gICAgICAgIHJ1bm5pbmcgPSBmYWxzZTtcclxuICAgIH07XHJcblxyXG4gICAgc2VsZi5faW5wdXQuY2FsbChzZWxmLl9kYXRhLCBzZW5kSW5wdXQpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlYWRzIHVudGlsIGEgbmV3bGluZSBpcyBkZXRlY3RlZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBQYXNzZWQgdGhlIGZpbmFsIHZhbHVlXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgaW5wdXQgaXMgbm90IGEgZnVuY3Rpb25cclxuICovXHJcbklPSW50ZXJmYWNlLnByb3RvdHlwZS5yZWFkbG4gPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gICAgdGhpcy5yZWFkKGZ1bmN0aW9uKGNoYXIsIHZhbHVlLCBjYW5jZWwpIHtcclxuICAgICAgICBpZiAoY2hhciA9PT0gXCJcXG5cIikge1xyXG4gICAgICAgICAgICBjYW5jZWwoKTtcclxuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHZhbHVlLnN1YnN0cmluZygwLCB2YWx1ZS5sZW5ndGggLSAyKTtcclxuICAgICAgICAgICAgY2FsbGJhY2socmVzdWx0KTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBXcml0ZXMgdGhlIHRleHQgYW5kIHRoZW4gcmVhZHMgdW50aWwgdGhlIG5ldyBsaW5lXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0XHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IHJlc3BvbnNlIENhbGxlZCB3aXRoIHRoZSByZXNwb25zZVxyXG4gKi9cclxuSU9JbnRlcmZhY2UucHJvdG90eXBlLnF1ZXN0aW9uID0gZnVuY3Rpb24odGV4dCwgcmVzcG9uc2UpIHtcclxuICAgIHRoaXMud3JpdGUodGV4dCk7XHJcbiAgICB0aGlzLnJlYWRsbihyZXNwb25zZSk7XHJcbn07XHJcblxyXG52YXIgaW50ZXJmYWNlcyA9IHt9O1xyXG52YXIgYWRkZWRIYW5kbGVycyA9IHt9O1xyXG5cclxuLyoqXHJcbiAqIFNldHMgYW4gaW50ZXJmYWNlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBpbnRlcmZhY2VcclxuICogQHBhcmFtIHtJT0ludGVyZmFjZX0gaW5mIFRoZSBpbnRlcmZhY2VcclxuICogQHRocm93cyBFcnJvciBpZiBpbmYgaXMgbm90IGFuIGluc3RhbmNlIG9mIElPSW50ZXJmYWNlXHJcbiAqL1xyXG5JT0ludGVyZmFjZS5zZXQgPSBmdW5jdGlvbihuYW1lLCBpbmYpIHtcclxuICAgIGlmICghKGluZiBpbnN0YW5jZW9mIElPSW50ZXJmYWNlKSkgdGhyb3cgbmV3IEVycm9yKFwiSW50ZXJmYWNlIGlzIG5vdCBhbiBpbnN0YW5jZSBvZiBJT0ludGVyZmFjZVwiKTtcclxuICAgIG5hbWUgPSBuYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBpbnRlcmZhY2VzW25hbWVdID0gaW5mO1xyXG4gICAgaWYgKGFkZGVkSGFuZGxlcnNbbmFtZV0gJiYgYWRkZWRIYW5kbGVyc1tuYW1lXS5sZW5ndGgpIHtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFkZGVkSGFuZGxlcnNbbmFtZV0ubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgYWRkZWRIYW5kbGVyc1tuYW1lXVtpXSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIGFuIGludGVyZmFjZS4gSWYgYW4gaW50ZXJmYWNlIGRvZXNuJ3QgZXhpc3QgdGhlIGRlZmF1bHQgd2lsbCBiZSByZXR1cm5lZC5cclxuICogSWYgdGhlIGludGVyZmFjZSBpcyBsYXRlciBjaGFuZ2VkIChpLmUgYSBuZXcgaW50ZXJmYWNlIHJlcGxhY2VzIHRoZSBjdXJyZW50IG9uZSksXHJcbiAqIHRoZSBpbnRlcmZhY2Ugb2JqZWN0IHdpbGwgcmVmbGVjdCB0byBjaGFuZ2UgdGhhdC4gU2V0IHRoZSBzZWNvbmQgcGFyYW1ldGVyIHRvXHJcbiAqIGZhbHNlIHRvIHN0b3AgdGhpc1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgaW50ZXJmYWNlXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbj10cnVlfSB1cGRhdGUgVXBkYXRlIHRoZSBpbnRlcmZhY2UgaWYgYSBuZXcgb25lIHJlcGxhY2VzIGl0XHJcbiAqIEByZXR1cm5zIHtJT0ludGVyZmFjZX0gVGhlIGludGVyZmFjZSwgb3IgdGhlIGRlZmF1bHQgaWYgdGhlIHJlcXVpcmVkIG9uZSBkb2Vzbid0IGV4aXN0XHJcbiAqL1xyXG5JT0ludGVyZmFjZS5nZXQgPSBmdW5jdGlvbihuYW1lLCB1cGRhdGUpIHtcclxuICAgIG5hbWUgPSBuYW1lLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgdmFyIHJlc3VsdDtcclxuICAgIGlmICghaW50ZXJmYWNlc1tuYW1lXSkgcmVzdWx0ID0gSU9JbnRlcmZhY2UuZ2V0RGVmYXVsdCgpO1xyXG4gICAgZWxzZSB7XHJcbiAgICAgICAgdmFyIGluZiA9IGludGVyZmFjZXNbbmFtZV07XHJcbiAgICAgICAgcmVzdWx0ID0gbmV3IElPSW50ZXJmYWNlKGluZi5fb3V0cHV0LCBpbmYuX2lucHV0LCB1dGlsLnNoYWxsb3dDbG9uZShpbmYuX2RhdGEpKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodXBkYXRlICE9PSBmYWxzZSkge1xyXG4gICAgICAgIGlmICghYWRkZWRIYW5kbGVyc1tuYW1lXSkgYWRkZWRIYW5kbGVyc1tuYW1lXSA9IFtdO1xyXG4gICAgICAgIGFkZGVkSGFuZGxlcnNbbmFtZV0ucHVzaChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHZhciBpdGVtID0gSU9JbnRlcmZhY2UuZ2V0KG5hbWUsIGZhbHNlKTtcclxuICAgICAgICAgICAgcmVzdWx0Ll9vdXRwdXQgPSBpdGVtLl9vdXRwdXQ7XHJcbiAgICAgICAgICAgIHJlc3VsdC5faW5wdXQgPSBpdGVtLl9pbnB1dDtcclxuICAgICAgICAgICAgcmVzdWx0Ll9kYXRhID0gaXRlbS5fZGF0YTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG4vKipcclxuICogU2V0cyBhbiBpbnRlcmZhY2UgYXMgdGhlIGRlZmF1bHRcclxuICpcclxuICogQHBhcmFtIHtJT0ludGVyZmFjZX0gaW5mIFRoZSBpbnRlcmZhY2VcclxuICovXHJcbklPSW50ZXJmYWNlLnNldERlZmF1bHQgPSBmdW5jdGlvbihpbmYpIHtcclxuICAgIElPSW50ZXJmYWNlLnNldChcImRlZmF1bHRcIiwgaW5mKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIHRoZSBkZWZhdWx0IGludGVyZmFjZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7SU9JbnRlcmZhY2V9XHJcbiAqL1xyXG5JT0ludGVyZmFjZS5nZXREZWZhdWx0ID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5nZXQoXCJkZWZhdWx0XCIpO1xyXG59O1xyXG5cclxuLy8gQ3JlYXRlIHRoZSBkZWZhdWx0IGludGVyZmFjZVxyXG52YXIgZGVmYXVsdEludGVyZmFjZSA9IG5ldyBJT0ludGVyZmFjZSgpO1xyXG5cclxuaWYgKHByb2Nlc3MuYnJvd3Nlcikge1xyXG4gICAgLy8gSWYgcnVubmluZyBpbiBhIGJyb3dzZXIgKGUuZy4gd2l0aCBCcm93c2VyaWZ5KSB1c2UgY29uc29sZS5sb2dcclxuICAgIGRlZmF1bHRJbnRlcmZhY2UuX2RhdGEuYWNjdW11bGF0b3IgPSAnJztcclxuXHJcbiAgICBkZWZhdWx0SW50ZXJmYWNlLnNldE91dHB1dChmdW5jdGlvbih0ZXh0KSB7XHJcbiAgICAgICAgdGhpcy5hY2N1bXVsYXRvciArPSB0ZXh0O1xyXG4gICAgICAgIHZhciBzcGxpdExpbmVzID0gdGhpcy5hY2N1bXVsYXRvci5zcGxpdCgnXFxuJyk7XHJcbiAgICAgICAgaWYgKHNwbGl0TGluZXMubGVuZ3RoID4gMSkge1xyXG4gICAgICAgICAgICBpZiAoc3BsaXRMaW5lc1tzcGxpdExpbmVzLmxlbmd0aCAtIDFdID09PSAnJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hY2N1bXVsYXRvciA9IHRoaXMuYWNjdW11bGF0b3Iuc3Vic3RyaW5nKDAsIHRoaXMuYWNjdW11bGF0b3IubGVuZ3RoIC0gMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc29sZS5sb2codGhpcy5hY2N1bXVsYXRvcik7XHJcbiAgICAgICAgICAgIHRoaXMuYWNjdW11bGF0b3IgPSAnJztcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBCcm93c2VyIGhhcyBubyBpbnB1dCBtZXRob2RcclxufSBlbHNlIHtcclxuICAgIC8vIElmIHJ1bm5pbmcgaW4gTm9kZSwgdXNlIHN0ZGluIGFuZCBzdGRvdXRcclxuICAgIHByb2Nlc3Muc3RkaW4uc2V0RW5jb2RpbmcoJ3V0ZjgnKTtcclxuXHJcbiAgICBkZWZhdWx0SW50ZXJmYWNlLnNldE91dHB1dChmdW5jdGlvbih0ZXh0KSB7XHJcbiAgICAgICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUodGV4dCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBkZWZhdWx0SW50ZXJmYWNlLnNldElucHV0KGZ1bmN0aW9uKGNiKSB7XHJcbiAgICAgICAgaWYgKGNiKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnJlYWRlcikgcHJvY2Vzcy5zdGRpbi5yZW1vdmVMaXN0ZW5lcigncmVhZGFibGUnLCB0aGlzLnJlYWRlcik7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnJlYWRlciA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIHZhciBjaHVuayA9IHByb2Nlc3Muc3RkaW4ucmVhZCgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGNodW5rICE9IG51bGwpIGNiKGNodW5rKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgcHJvY2Vzcy5zdGRpbi5vbigncmVhZGFibGUnLCB0aGlzLnJlYWRlcik7XHJcbiAgICAgICAgfSBlbHNlIHByb2Nlc3Muc3RkaW4ucmVtb3ZlTGlzdGVuZXIoJ3JlYWRhYmxlJywgdGhpcy5yZWFkZXIpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbklPSW50ZXJmYWNlLnNldERlZmF1bHQoZGVmYXVsdEludGVyZmFjZSk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IElPSW50ZXJmYWNlOyIsInZhciBmdW5jdGlvbnMgPSByZXF1aXJlKCcuLi9mdW5jdGlvbnMnKTtcclxudmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9wYXJzZXIvc3RhdGVtZW50cycpO1xyXG52YXIgZG9tYWluID0gcmVxdWlyZSgnZG9tYWluJyk7XHJcbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xyXG52YXIgcFV0aWwgPSByZXF1aXJlKCcuLi91dGlsJyk7XHJcblxyXG4vKipcclxuICogQW4gb2JqZWN0IHRoYXQgcHJvdmlkZXMgbW9kaWZpY2F0aW9uIGFuZCByZWFkaW5nIG9mIHRoZSBjdXJyZW50IGV4ZWN1dGlvblxyXG4gKiBjb250ZXh0LCBhcyB3ZWxsIGFzIHRoZSBhYmlsaXR5IHRvIGV4ZWN1dGUgYW4gQVNUIGluIHRoZSBjb250ZXh0XHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0P30gb3B0aW9ucyBPcHRpb25zIGZvciBleGVjdXRpb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBFeGVjdXRpb25Db250ZXh0KG9wdGlvbnMpIHtcclxuICAgIHRoaXMuc3RyaW5nVmFycyA9IHt9O1xyXG4gICAgdGhpcy5udW1iZXJWYXJzID0ge307XHJcbiAgICB0aGlzLnBvaW50ZXJzID0ge307XHJcbiAgICB0aGlzLmdvc3VicyA9IFtdO1xyXG4gICAgdGhpcy5wcml2YXRlID0ge1xyXG4gICAgICAgIHJuZF9zZWVkOiBNYXRoLnJhbmRvbSgpLFxyXG4gICAgICAgIHNwcml0ZXM6IFtdXHJcbiAgICB9O1xyXG4gICAgdGhpcy5jb25zdGFudHMgPSByZXF1aXJlKCcuL2NvbnN0YW50cycpO1xyXG4gICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XHJcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcclxuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zLmRlbGF5ID09PSAndW5kZWZpbmVkJykgb3B0aW9ucy5kZWxheSA9IGZhbHNlO1xyXG5cclxuICAgIC8vIENvcHkgYWxsIGZ1bmN0aW9ucyBhcyBjb25zdGFudHNcclxuICAgIGZvciAodmFyIGsgaW4gZnVuY3Rpb25zKSB7XHJcbiAgICAgICAgaWYgKCFmdW5jdGlvbnMuaGFzT3duUHJvcGVydHkoaykpIGNvbnRpbnVlO1xyXG4gICAgICAgIHRoaXMuY29uc3RhbnRzW2tdID0gZnVuY3Rpb25zW2tdO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFN0b3AgbXVsdGlwbGUgY29udGV4dHMgY29uZmxpY3Rpbmcgd2l0aCBjb25zdGFudHNcclxuICAgIHRoaXMuY29uc3RhbnRzID0gcFV0aWwuc2hhbGxvd0Nsb25lKHRoaXMuY29uc3RhbnRzKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEJlZ2lucyBleGVjdXRpb24gb2YgdGhlIEFTVFxyXG4gKlxyXG4gKiBAcGFyYW0ge0FycmF5fSByb290IFRoZSByb290IG5vZGVzIGluIHRoZSBBU1RcclxuICogQHBhcmFtIHtPYmplY3R9IGxhYmVscyBBIGxpc3Qgb2YgYWxsIGxhYmVscyBhbmQgbGluZXNcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRvbmUgQSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gdGhlIGV4ZWN1dGlvbiBpcyB0ZXJtaW5hdGVkXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24ocm9vdCwgbGFiZWxzLCBkb25lKSB7XHJcbiAgICB0aGlzLnJvb3QgPSByb290O1xyXG4gICAgdGhpcy5sYWJlbHMgPSBsYWJlbHM7XHJcbiAgICB0aGlzLmN1cnNvciA9IHRoaXMub3B0aW9ucy5jdXJzb3JTdGFydCB8fCAwO1xyXG4gICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcclxuICAgIHRoaXMuZG9tYWluID0gZG9tYWluLmNyZWF0ZSgpO1xyXG5cclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIHRoaXMuZG9uZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmIChkb25lKSBkb25lLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuZXJyb3IgPSBmYWxzZTtcclxuXHJcbiAgICB0aGlzLmRvbWFpbi5vbignZXJyb3InLCBmdW5jdGlvbihlcnIpIHtcclxuICAgICAgICB0aHJvdyBlcnI7XHJcbiAgICAgICAgLy9jb25zb2xlLmxvZygnRVJST1I6ICcgKyBlcnIubWVzc2FnZSk7XHJcbiAgICAgICAgLy9zZWxmLmVycm9yID0gZXJyO1xyXG4gICAgICAgIC8vc2VsZi5ydW5uaW5nID0gZmFsc2U7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmRvbWFpbi5ydW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgc2VsZi5uZXh0TGluZSgpO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGN1cnJlbnQgY3Vyc29yIGxpbmUgYW5kIGluY3JlbWVudHMgdGhlIGN1cnNvclxyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUubmV4dExpbmUgPSBmdW5jdGlvbigpIHtcclxuICAgIHRoaXMuY3Vyc29yID0gdGhpcy5jdXJzb3IudmFsdWVPZigpO1xyXG4gICAgaWYgKHRoaXMucm9vdC5sZW5ndGggPD0gdGhpcy5jdXJzb3IpIHtcclxuICAgICAgICB0aGlzLnRlcm1pbmF0ZSgpO1xyXG4gICAgfVxyXG4gICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHtcclxuICAgICAgICB0aGlzLmRvbmUodGhpcy5lcnJvcik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBjdXJyZW50TGluZSA9IHRoaXMucm9vdFt0aGlzLmN1cnNvcl07XHJcbiAgICB2YXIgZXhlY3V0aW9uUmVzdWx0ID0gY3VycmVudExpbmUuZXhlY3V0ZSh0aGlzKTtcclxuXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB0aGlzLmN1cnNvcisrO1xyXG5cclxuICAgIGlmICh0eXBlb2YgZXhlY3V0aW9uUmVzdWx0ID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgZXhlY3V0aW9uUmVzdWx0KGZ1bmN0aW9uKGVycikge1xyXG4gICAgICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxmLmVycm9yID0gbmV3IEVycm9yKGVyci5tZXNzYWdlICsgXCIgb24gbGluZSBcIiArIHNlbGYuY3Vyc29yKTtcclxuICAgICAgICAgICAgICAgIHNlbGYudGVybWluYXRlKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc2VsZi5uZXh0TGluZSgpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSBlbHNlIHRoaXMubmV4dExpbmUoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBWYWxpZGF0ZXMgYSB2YXJpYWJsZSBhZ2FpbnN0IGEgdHlwZVxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHYgVGhlIHZhcmlhYmxlIHRvIHZhbGlkYXRlXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIFRoZSB0eXBlIHRvIHZhbGlkYXRlXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdmFsaWRhdGlvbiBmYWlsc1xyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUudmFsaWRhdGUgPSBmdW5jdGlvbih2LCB0eXBlKSB7XHJcbiAgICBpZiAodHlwZW9mIHYgIT09IHR5cGUpIHRocm93IG5ldyBFcnJvcignVHlwZXMgbWlzbWF0Y2gnKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIGEgdmFyaWFibGVcclxuICpcclxuICogQHBhcmFtIHtWYXJpYWJsZVN0YXRlbWVudH0gdmFyaWFibGUgVGhlIHZhcmlhYmxlXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudHxOdW1iZXJ8U3RyaW5nfSB2YWx1ZSBUaGUgbmV3IHZhbHVlXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5zZXRWYXJpYWJsZSA9IGZ1bmN0aW9uKHZhcmlhYmxlLCB2YWx1ZSkge1xyXG4gICAgdmFyIG1hcCA9IHZhcmlhYmxlLnR5cGUgPT09ICdzdHJpbmcnID8gdGhpcy5zdHJpbmdWYXJzIDogdGhpcy5udW1iZXJWYXJzO1xyXG5cclxuICAgIGlmICh2YWx1ZS5lcnJvcikgdGhyb3cgdmFsdWUuZXJyb3I7XHJcblxyXG4gICAgdmFyIHJlYWxWYWx1ZSA9IHZhbHVlO1xyXG4gICAgaWYgKHZhbHVlIGluc3RhbmNlb2Ygc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KSByZWFsVmFsdWUgPSB2YWx1ZS5leGVjdXRlKHRoaXMpO1xyXG5cclxuICAgIGlmICh2YXJpYWJsZS50eXBlID09PSAnc3RyaW5nJykgcmVhbFZhbHVlID0gU3RyaW5nKHJlYWxWYWx1ZSk7XHJcbiAgICBlbHNlIHtcclxuICAgICAgICByZWFsVmFsdWUgPSBwYXJzZUZsb2F0KHJlYWxWYWx1ZSk7XHJcbiAgICAgICAgaWYgKGlzTmFOKHJlYWxWYWx1ZSkpIHRocm93IG5ldyBFcnJvcignVHlwZXMgbWlzbWF0Y2gnKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodmFyaWFibGUuaXNBcnJheSkgc2V0QXJyYXlJbmRleEF0KG1hcFt2YXJpYWJsZS5uYW1lXSwgdmFyaWFibGUuZGltZW5zaW9ucywgcmVhbFZhbHVlLCB0aGlzKTtcclxuICAgIGVsc2UgbWFwW3ZhcmlhYmxlLm5hbWVdID0gcmVhbFZhbHVlO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgYSB2YXJpYWJsZSwgY29uc3RhbnQgb3IgZnVuY3Rpb25cclxuICpcclxuICogQHBhcmFtIHtWYXJpYWJsZVN0YXRlbWVudH0gdmFyaWFibGUgVGhlIHZhcmlhYmxlIHRvIGdldFxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfFN0cmluZ30gVGhlIHZhbHVlIG9mIHRoZSB2YXJpYWJsZSBvciBjb25zdGFudFxyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUuZ2V0VmFyaWFibGUgPSBmdW5jdGlvbih2YXJpYWJsZSkge1xyXG4gICAgdmFyIHZhbHVlO1xyXG5cclxuICAgIGlmICh2YXJpYWJsZS50eXBlID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgdGhpcy5jb25zdGFudHNbdmFyaWFibGUubmFtZSArICckJ10gIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgdmFsdWUgPSB0aGlzLmNvbnN0YW50c1t2YXJpYWJsZS5uYW1lICsgJyQnXTtcclxuICAgIH0gZWxzZSBpZiAodmFyaWFibGUudHlwZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHRoaXMuY29uc3RhbnRzW3ZhcmlhYmxlLm5hbWVdICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgIHZhbHVlID0gdGhpcy5jb25zdGFudHNbdmFyaWFibGUubmFtZV07XHJcbiAgICB9IGVsc2UgaWYgKHZhcmlhYmxlLnR5cGUgPT09ICdzdHJpbmcnICYmIHR5cGVvZiB0aGlzLmNvbnN0YW50c1t2YXJpYWJsZS5uYW1lLnRvTG93ZXJDYXNlKCkgKyAnJCddID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdmFsdWUgPSB0aGlzLmNvbnN0YW50c1t2YXJpYWJsZS5uYW1lLnRvTG93ZXJDYXNlKCkgKyAnJCddO1xyXG4gICAgfSBlbHNlIGlmICh2YXJpYWJsZS50eXBlID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgdGhpcy5jb25zdGFudHNbdmFyaWFibGUubmFtZS50b0xvd2VyQ2FzZSgpXSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHZhbHVlID0gdGhpcy5jb25zdGFudHNbdmFyaWFibGUubmFtZS50b0xvd2VyQ2FzZSgpXTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIG1hcCA9IHZhcmlhYmxlLnR5cGUgPT09ICdzdHJpbmcnID8gdGhpcy5zdHJpbmdWYXJzIDogdGhpcy5udW1iZXJWYXJzO1xyXG5cclxuICAgICAgICAvLyBUaGlzIHJlYWxseSBzaG91bGRuJ3QgaGFwcGVuIChpdCBzaG91bGQgYmUgZGV0ZWN0ZWQgYXMgYSBmdW5jdGlvbiBieSB0aGUgcGFyc2VyKSwgYnV0IHdlJ2xsIGNoZWNrIHRvXHJcbiAgICAgICAgLy8gbWFrZSBzdXJlIGFueXdheVxyXG4gICAgICAgIGlmICh2YXJpYWJsZS5pc0FycmF5KSByZXR1cm4gZ2V0QXJyYXlJbmRleEF0KG1hcFt2YXJpYWJsZS5uYW1lXSwgdmFyaWFibGUuZGltZW5zaW9ucywgdGhpcyk7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBtYXBbdmFyaWFibGUubmFtZV0gPT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgIGlmICh2YXJpYWJsZS50eXBlID09PSAnc3RyaW5nJykgcmV0dXJuICcnO1xyXG4gICAgICAgICAgICBlbHNlIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YWx1ZSA9IG1hcFt2YXJpYWJsZS5uYW1lXTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSByZXR1cm4gdmFsdWUuY2FsbCh0aGlzKTtcclxuICAgIGVsc2UgcmV0dXJuIHZhbHVlO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIHZhbHVlIG9mIGEgcG9pbnRlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1BvaW50ZXJTdGF0ZW1lbnR9IHBvaW50ZXJcclxuICogQHJldHVybnMgeyp9XHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5nZXRQb2ludGVyID0gZnVuY3Rpb24ocG9pbnRlcikge1xyXG4gICAgdmFyIHZhbHVlID0gdGhpcy5wb2ludGVyc1twb2ludGVyLmlkXTtcclxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgcG9pbnRlcicpO1xyXG4gICAgcmV0dXJuIHZhbHVlO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFNldHMgdGhlIHZhbHVlIG9mIGEgcG9pbnRlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1BvaW50ZXJTdGF0ZW1lbnR9IHBvaW50ZXJcclxuICogQHBhcmFtIHsqfSB2YWx1ZVxyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUuc2V0UG9pbnRlciA9IGZ1bmN0aW9uKHBvaW50ZXIsIHZhbHVlKSB7XHJcbiAgICB0aGlzLnBvaW50ZXJzW3BvaW50ZXIuaWRdID0gdmFsdWU7XHJcbn07XHJcblxyXG4vKipcclxuICogU2V0cyB0aGUgdmFsdWUgb2YgYSBjb25zdGFudFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgY29uc3RhbnRcclxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWx1ZSBUaGUgdmFsdWUgb2YgdGhlIGNvbnN0YW50XHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5zZXRDb25zdGFudCA9IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XHJcbiAgICB0aGlzLmNvbnN0YW50c1tuYW1lXSA9IHZhbHVlO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgYSBwcml2YXRlIHZhcmlhYmxlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBwcml2YXRlIHZhcmlhYmxlXHJcbiAqIEByZXR1cm5zIHsqfSBUaGUgdmFsdWUgb2YgdGhlIHZhcmlhYmxlXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5nZXRQcml2YXRlID0gZnVuY3Rpb24obmFtZSkge1xyXG4gICAgcmV0dXJuIHRoaXMucHJpdmF0ZVtuYW1lXTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIGEgcHJpdmF0ZSB2YXJpYWJsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgcHJpdmF0ZSB2YXJpYWJsZVxyXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSBvZiB0aGUgdmFyaWFibGVcclxuICovXHJcbkV4ZWN1dGlvbkNvbnRleHQucHJvdG90eXBlLnNldFByaXZhdGUgPSBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xyXG4gICAgdGhpcy5wcml2YXRlW25hbWVdID0gdmFsdWU7XHJcbn07XHJcblxyXG4vKipcclxuICogRGVmaW5lcyBhbiBhcnJheVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgYXJyYXlcclxuICogQHBhcmFtIHtBcnJheTxOdW1iZXI+fSBsZW5ndGhzIFRoZSBsZW5ndGhzIG9mIGVhY2ggZGltZW5zaW9uXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5kZWZpbmVBcnJheSA9IGZ1bmN0aW9uKG5hbWUsIGxlbmd0aHMpIHtcclxuICAgIHZhciB0eXBlID0gJ251bWJlcic7XHJcbiAgICBpZiAobmFtZVtuYW1lLmxlbmd0aCAtIDFdID09PSAnJCcpIHtcclxuICAgICAgICB0eXBlID0gJ3N0cmluZyc7XHJcbiAgICAgICAgbmFtZSA9IG5hbWUuc3Vic3RyaW5nKDAsIG5hbWUubGVuZ3RoIC0gMSk7XHJcbiAgICB9XHJcbiAgICB2YXIgYXJyYXkgPSBjcmVhdGVBcnJheURlcHRoKGxlbmd0aHMsIHR5cGUgPT09ICdzdHJpbmcnID8gJycgOiAwKTtcclxuXHJcbiAgICB2YXIgbWFwID0gdHlwZSA9PT0gJ3N0cmluZycgPyB0aGlzLnN0cmluZ1ZhcnMgOiB0aGlzLm51bWJlclZhcnM7XHJcbiAgICBtYXBbbmFtZV0gPSBhcnJheTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDYWxscyBhIGZ1bmN0aW9uXHJcbiAqXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb25TdGF0ZW1lbnR9IGZ1bmNPYmogVGhlIGZ1bmN0aW9uIHRvIGNhbGxcclxuICogQHBhcmFtIHtBcnJheX0gYXJncyBUaGUgYXJndW1lbnRzIHRvIHByb3ZpZGVcclxuICovXHJcbkV4ZWN1dGlvbkNvbnRleHQucHJvdG90eXBlLmNhbGxGdW5jdGlvbiA9IGZ1bmN0aW9uKGZ1bmNPYmosIGFyZ3MpIHtcclxuICAgIHZhciBmdW5jTmFtZSA9IGZ1bmNPYmoubmFtZSArIChmdW5jT2JqLnR5cGUgPT09ICdzdHJpbmcnID8gJyQnIDogJycpO1xyXG4gICAgdmFyIGZ1bmMgPSB0aGlzLmNvbnN0YW50c1tmdW5jTmFtZS50b0xvd2VyQ2FzZSgpXTtcclxuICAgIGlmICghZnVuYykge1xyXG4gICAgICAgIC8vIEl0IGNvdWxkIGJlIGFuIGFycmF5IGNhbGxcclxuICAgICAgICB2YXIgbWFwID0gZnVuY09iai50eXBlID09PSAnc3RyaW5nJyA/IHRoaXMuc3RyaW5nVmFycyA6IHRoaXMubnVtYmVyVmFycztcclxuICAgICAgICB2YXIgYXJyID0gbWFwW2Z1bmNPYmoubmFtZV07XHJcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYXJyKSkgcmV0dXJuIGdldEFycmF5SW5kZXhBdChhcnIsIGFyZ3MsIHRoaXMpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBmdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBzcGVjaWZpZWQgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gY21kIFRoZSBjb21tYW5kIHRvIGV4ZWN1dGVcclxuICogQHJldHVybnMge0Z1bmN0aW9uPEZ1bmN0aW9uPn0gcHJvdmlkZSBhIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiBleGVjdXRpb24gaXMgY29tcGxldGVcclxuICovXHJcbkV4ZWN1dGlvbkNvbnRleHQucHJvdG90eXBlLmNhbGxDb21tYW5kID0gZnVuY3Rpb24oY21kKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgZnVuY3Rpb24gY2FsbEZ1bmMobmV3RG9uZSkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNtZC5leGVjdXRlKHNlbGYsIG5ld0RvbmUpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGV4KSB7XHJcbiAgICAgICAgICAgIG5ld0RvbmUoZXgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHZhciBjbWREZWxheSA9IHNlbGYub3B0aW9ucy5kZWxheTtcclxuICAgIGlmIChjbWREZWxheSAhPT0gZmFsc2UpIHtcclxuICAgICAgICB2YXIgb2xkQ2FsbEZ1bmMgPSBjYWxsRnVuYztcclxuICAgICAgICBjYWxsRnVuYyA9IGZ1bmN0aW9uKG5ld0RvbmUpIHtcclxuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgIG9sZENhbGxGdW5jO1xyXG4gICAgICAgICAgICB9LCBjbWREZWxheSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjYWxsRnVuYztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHb2VzIHRvIGEgbGFiZWwsIGFuZCByZXR1cm5zIG9uIFJFVFVSTlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbGFiZWwgVGhlIG5hbWUgb2YgdGhlIGxhYmVsIHRvIGdvIHRvXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5nb3N1YkxhYmVsID0gZnVuY3Rpb24obGFiZWwpIHtcclxuICAgIGlmICh0eXBlb2YgdGhpcy5sYWJlbHNbbGFiZWxdID09PSAndW5kZWZpbmVkJykgdGhyb3cgbmV3IEVycm9yKCdVbmRlZmluZWQgbGFiZWwgXCInICsgbGFiZWwgKyAnXCInKTtcclxuICAgIHRoaXMuZ29zdWJzLnB1c2godGhpcy5jdXJzb3IpO1xyXG4gICAgdGhpcy5jdXJzb3IgPSB0aGlzLmxhYmVsc1tsYWJlbF07XHJcbn07XHJcblxyXG4vKipcclxuICogR29lcyB0byBhIGxhYmVsXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBsYWJlbCBUaGUgbmFtZSBvZiB0aGUgbGFiZWwgdG8gZ28gdG9cclxuICovXHJcbkV4ZWN1dGlvbkNvbnRleHQucHJvdG90eXBlLmdvdG9MYWJlbCA9IGZ1bmN0aW9uKGxhYmVsKSB7XHJcbiAgICBpZiAodHlwZW9mIHRoaXMubGFiZWxzW2xhYmVsXSA9PT0gJ3VuZGVmaW5lZCcpIHRocm93IG5ldyBFcnJvcignVW5kZWZpbmVkIGxhYmVsIFwiJyArIGxhYmVsICsgJ1wiJyk7XHJcbiAgICB0aGlzLmN1cnNvciA9IHRoaXMubGFiZWxzW2xhYmVsXTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRvIHRoZSBsYXN0IEdPU1VCIHBvc2l0aW9uXHJcbiAqL1xyXG5FeGVjdXRpb25Db250ZXh0LnByb3RvdHlwZS5yZXR1cm5MYWJlbCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYgKCF0aGlzLmdvc3Vicy5sZW5ndGgpIHRocm93IG5ldyBFcnJvcignUkVUVVJOIHdpdGhvdXQgR09TVUInKTtcclxuICAgIHRoaXMuY3Vyc29yID0gdGhpcy5nb3N1YnMucG9wKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogRW5kcyB0aGUgcHJvZ3JhbVxyXG4gKi9cclxuRXhlY3V0aW9uQ29udGV4dC5wcm90b3R5cGUudGVybWluYXRlID0gZnVuY3Rpb24oKSB7XHJcbiAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcclxufTtcclxuXHJcblxyXG4vKipcclxuICogU2V0cyB0aGUgYXJyYXkgaXRlbSBhdCBhIGNlcnRhaW4gaW5kZXgsIGluY2x1ZGluZyBtdWx0aXBsZSBkaW1lbnNpb25zXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXJyYXl9IGFyciBUaGUgYXJyYXkgdG8gc2VhcmNoXHJcbiAqIEBwYXJhbSB7QXJyYXk8RXhwcmVzc2lvblN0YXRlbWVudD59IGRpbWVuc2lvbnMgQW4gYXJyYXkgb2YgaW5kZXhlc1xyXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHZhbCBUaGUgdmFsdWUgdG8gcHV0IGluIHRoZSBhcnJheVxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGEgVGhlIGV4ZWN1dGlvbiBkYXRhIGNvbnRleHRcclxuICogQHByaXZhdGVcclxuICovXHJcbmZ1bmN0aW9uIHNldEFycmF5SW5kZXhBdChhcnIsIGRpbWVuc2lvbnMsIHZhbCwgZGF0YSkge1xyXG4gICAgdmFyIGN1cnJlbnREaW1lbnNpb24gPSBkaW1lbnNpb25zWzBdLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKGN1cnJlbnREaW1lbnNpb24sICdudW1iZXInKTtcclxuICAgIGN1cnJlbnREaW1lbnNpb24gLT0gMTtcclxuXHJcbiAgICBpZiAoYXJyLmxlbmd0aCA8PSBjdXJyZW50RGltZW5zaW9uIHx8IGN1cnJlbnREaW1lbnNpb24gPCAwKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJyYXkgYm91bmRzJyk7XHJcbiAgICB2YXIgaXRlbSA9IGFycltjdXJyZW50RGltZW5zaW9uXTtcclxuICAgIGlmIChkaW1lbnNpb25zLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbSkpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcnJheSBkaW1lbnNpb25zJyk7XHJcbiAgICAgICAgcmV0dXJuIHNldEFycmF5SW5kZXhBdChhcnJbY3VycmVudERpbWVuc2lvbl0sIGRpbWVuc2lvbnMuc2xpY2UoMSksIHZhbCwgIGRhdGEpO1xyXG4gICAgfSBlbHNlIGFycltjdXJyZW50RGltZW5zaW9uXSA9IHZhbDtcclxufVxyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIGFycmF5IGl0ZW0gYXQgYSBjZXJ0YWluIGluZGV4LCBpbmNsdWRpbmcgbXVsdGlwbGUgZGltZW5zaW9uc1xyXG4gKlxyXG4gKiBAcGFyYW0ge0FycmF5fSBhcnIgVGhlIGFycmF5IHRvIHNlYXJjaFxyXG4gKiBAcGFyYW0ge0FycmF5PEV4cHJlc3Npb25TdGF0ZW1lbnQ+fSBkaW1lbnNpb25zIEFuIGFycmF5IG9mIGluZGV4ZXNcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhIFRoZSBleGVjdXRpb24gZGF0YSBjb250ZXh0XHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ8U3RyaW5nfVxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0QXJyYXlJbmRleEF0KGFyciwgZGltZW5zaW9ucywgZGF0YSkge1xyXG4gICAgdmFyIGN1cnJlbnREaW1lbnNpb24gPSBkaW1lbnNpb25zWzBdO1xyXG4gICAgZGF0YS52YWxpZGF0ZShjdXJyZW50RGltZW5zaW9uLCAnbnVtYmVyJyk7XHJcbiAgICBjdXJyZW50RGltZW5zaW9uID0gTWF0aC5mbG9vcihjdXJyZW50RGltZW5zaW9uIC0gMSk7XHJcblxyXG4gICAgaWYgKGFyci5sZW5ndGggPD0gY3VycmVudERpbWVuc2lvbiB8fCBjdXJyZW50RGltZW5zaW9uIDwgMCkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFycmF5IGJvdW5kcycpO1xyXG4gICAgdmFyIGl0ZW0gPSBhcnJbY3VycmVudERpbWVuc2lvbl07XHJcbiAgICBpZiAoZGltZW5zaW9ucy5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW0pKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJyYXkgZGltZW5zaW9ucycpO1xyXG4gICAgICAgIHJldHVybiBnZXRBcnJheUluZGV4QXQoYXJyW2N1cnJlbnREaW1lbnNpb25dLCBkaW1lbnNpb25zLnNsaWNlKDEpLCBkYXRhKTtcclxuICAgIH0gZWxzZSByZXR1cm4gaXRlbTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENyZWF0ZXMgYW4gYXJyYXkgd2l0aCB0aGUgc3BlY2lmaWVkIGxlbmd0aHMgb2YgZGltZW5zaW9uc1xyXG4gKlxyXG4gKiBAcGFyYW0ge0FycmF5PE51bWJlcj59IGRpbWVuc2lvbnMgVGhlIGFycmF5IGRpbWVuc2lvbnNcclxuICogQHBhcmFtIHsqfSBlbmRwb2ludCBUaGUgdmFsdWUgZm9yIHRoZSBhcnJheSBlbmRwb2ludFxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gY3JlYXRlQXJyYXlEZXB0aChkaW1lbnNpb25zLCBlbmRwb2ludCkge1xyXG4gICAgdmFyIGN1cnJlbnREaW1lbnNpb24gPSBkaW1lbnNpb25zWzBdO1xyXG5cclxuICAgIHZhciBuZXdBcnIgPSBuZXcgQXJyYXkoY3VycmVudERpbWVuc2lvbik7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGN1cnJlbnREaW1lbnNpb247IGkrKykge1xyXG4gICAgICAgIHZhciB2YWx1ZSA9IGVuZHBvaW50O1xyXG4gICAgICAgIGlmIChkaW1lbnNpb25zLmxlbmd0aCA+IDEpIHZhbHVlID0gY3JlYXRlQXJyYXlEZXB0aChkaW1lbnNpb25zLnNsaWNlKDEpLCBlbmRwb2ludCk7XHJcbiAgICAgICAgbmV3QXJyW2ldID0gdmFsdWU7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbmV3QXJyO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEV4ZWN1dGlvbkNvbnRleHQ7IiwiLyoqXHJcbiAqIERlZmF1bHQgY29uc3RhbnRzXHJcbiAqL1xyXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4uL3V0aWwnKTtcclxuXHJcbnZhciBtb250aHMgPSBbXHJcbiAgICAnSmFudWFyeScsXHJcbiAgICAnRmVicnVhcnknLFxyXG4gICAgJ01hcmNoJyxcclxuICAgICdBcHJpbCcsXHJcbiAgICAnTWF5JyxcclxuICAgICdKdW5lJyxcclxuICAgICdKdWx5JyxcclxuICAgICdBdWd1c3QnLFxyXG4gICAgJ1NlcHRlbWJlcicsXHJcbiAgICAnT2N0b2JlcicsXHJcbiAgICAnTm92ZW1iZXInLFxyXG4gICAgJ0RlY2VtYmVyJ1xyXG5dO1xyXG52YXIgZGF5cyA9IFtcclxuICAgICdTdW5kYXknLFxyXG4gICAgJ01vbmRheScsXHJcbiAgICAnVHVlc2RheScsXHJcbiAgICAnV2VkbmVzZGF5JyxcclxuICAgICdUaHVyc2RheScsXHJcbiAgICAnRnJpZGF5JyxcclxuICAgICdTYXR1cmRheSdcclxuXTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgJ1BJJzogTWF0aC5QSSxcclxuICAgICdUV09fUEknOiBNYXRoLlBJICogMixcclxuICAgICdIQUxGX1BJJzogTWF0aC5QSSAvIDIsXHJcblxyXG4gICAgJ0VPRic6IDAsXHJcblxyXG4gICAgJ0JDb2xvclInOiAwLFxyXG4gICAgJ0JDb2xvckcnOiAwLFxyXG4gICAgJ0JDb2xvckInOiAwLFxyXG4gICAgJ1RDb2xvclInOiAwLFxyXG4gICAgJ1RDb2xvckcnOiAxLFxyXG4gICAgJ1RDb2xvckInOiAwLFxyXG5cclxuICAgICdDb2xvclInOiAwLFxyXG4gICAgJ0NvbG9yRyc6IDEsXHJcbiAgICAnQ29sb3JCJzogMCxcclxuICAgICdDb2xvckEnOiAxLFxyXG5cclxuICAgICdJc1JldGluYSc6IDAsXHJcbiAgICAnSXNQaG9uZSc6IDAsXHJcbiAgICAnSXNQYWQnOiAwLFxyXG5cclxuICAgICdUaWNrQ291bnQnOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gdXRpbC5ub3coKTtcclxuICAgIH0sXHJcbiAgICAnREFURSQnOiBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgZGF0ZSA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgcmV0dXJuIGRhdGUuZ2V0RGF0ZSgpICsgJyAnICsgbW9udGhzW2RhdGUuZ2V0TW9udGgoKV0uc3Vic3RyaW5nKDAsIDMpICsgJyAnICsgZGF0ZS5nZXRGdWxsWWVhcigpO1xyXG4gICAgfSxcclxuICAgICdUSU1FJCc6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhciBkYXRlID0gbmV3IERhdGUoKTtcclxuICAgICAgICB2YXIgYW0gPSB0cnVlLCBob3VycyA9IGRhdGUuZ2V0SG91cnMoKTtcclxuICAgICAgICBpZiAoaG91cnMgPiAxMikge1xyXG4gICAgICAgICAgICBob3VycyAtPSAxMjtcclxuICAgICAgICAgICAgYW0gPSBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB1dGlsLnBhZChob3VycywgMiwgJzAnKSArICc6JyArXHJcbiAgICAgICAgICAgICAgICB1dGlsLnBhZChkYXRlLmdldE1pbnV0ZXMoKSwgMiwgJzAnKSArICc6JyArXHJcbiAgICAgICAgICAgICAgICB1dGlsLnBhZChkYXRlLmdldFNlY29uZHMoKSwgMiwgJzAnKSArXHJcbiAgICAgICAgICAgICAgICAoYW0gPyAnIGFtJyA6ICcgcG0nKTtcclxuICAgIH0sXHJcbiAgICAnRGF0ZVllYXInOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gKG5ldyBEYXRlKCkpLmdldEZ1bGxZZWFyKCk7XHJcbiAgICB9LFxyXG4gICAgJ0RhdGVNb250aCc6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiAobmV3IERhdGUoKSkuZ2V0TW9udGgoKSArIDE7XHJcbiAgICB9LFxyXG4gICAgJ0RhdGVNb250aCQnOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gbW9udGhzWyhuZXcgRGF0ZSgpKS5nZXRNb250aCgpXTtcclxuICAgIH0sXHJcbiAgICAnRGF0ZURheSc6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiAobmV3IERhdGUoKSkuZ2V0RGF0ZSgpO1xyXG4gICAgfSxcclxuICAgICdEYXRlV2Vla0RheSQnOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gZGF5c1sobmV3IERhdGUoKSkuZ2V0RGF5KCldO1xyXG4gICAgfSxcclxuICAgICdUaW1lSG91cnMnOiBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgaG91cnMgPSAobmV3IERhdGUoKSkuZ2V0SG91cnMoKTtcclxuICAgICAgICBpZiAoaG91cnMgPT09IDApIGhvdXJzID0gMjQ7XHJcbiAgICAgICAgcmV0dXJuIGhvdXJzO1xyXG4gICAgfSxcclxuICAgICdUaW1lTWludXRlcyc6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiAobmV3IERhdGUoKSkuZ2V0TWludXRlcygpO1xyXG4gICAgfSxcclxuICAgICdUaW1lU2Vjb25kcyc6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiAobmV3IERhdGUoKSkuZ2V0U2Vjb25kcygpO1xyXG4gICAgfVxyXG59OyIsInZhciBFeGVjdXRpb25Db250ZXh0ID0gcmVxdWlyZSgnLi9FeGVjdXRpb25Db250ZXh0Jyk7XHJcbnZhciBjb25zdGFudHMgPSByZXF1aXJlKCcuL2NvbnN0YW50cycpO1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBhYnN0cmFjdCBzeW50YXggdHJlZVxyXG4gKlxyXG4gKiBAcGFyYW0ge0Fic3RyYWN0U3ludGF4VHJlZX0gYXN0IFRoZSB0cmVlIHRvIGV4ZWN1dGVcclxuICogQHBhcmFtIHtleHBvcnRzLkV4ZWN1dGlvbkNvbnRleHR8RXhlY3V0aW9uQ29udGV4dHxGdW5jdGlvbj99IGN0eCBUaGUgY29udGV4dFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9uP30gZG9uZSBDYWxsZWQgd2hlbiBleGVjdXRpb24gaXMgY29tcGxldGVcclxuICovXHJcbmZ1bmN0aW9uIGV4ZWN1dGUoYXN0LCBjdHgsIGRvbmUpIHtcclxuICAgIGlmICghZG9uZSAmJiAhKGN0eCBpbnN0YW5jZW9mIEV4ZWN1dGlvbkNvbnRleHQpKSB7XHJcbiAgICAgICAgZG9uZSA9IGN0eDtcclxuICAgICAgICBjdHggPSBuZXcgRXhlY3V0aW9uQ29udGV4dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzdC5leGVjdXRlKGN0eCwgZG9uZSk7XHJcbn1cclxuXHJcbmV4cG9ydHMuZXhlY3V0ZSA9IGV4ZWN1dGU7XHJcblxyXG5leHBvcnRzLkV4ZWN1dGlvbkNvbnRleHQgPSBFeGVjdXRpb25Db250ZXh0O1xyXG5leHBvcnRzLmNvbnN0YW50cyA9IGNvbnN0YW50czsiLCJ2YXIgRmlsZSA9IHJlcXVpcmUoJy4vRmlsZScpO1xyXG52YXIgZmlsZXN5c3RlbSA9IHJlcXVpcmUoJy4vJyk7XHJcblxyXG4vKipcclxuICogQSBmaWxlc3lzdGVtIGRyaXZlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBkcml2ZVxyXG4gKiBAcGFyYW0ge09iamVjdH0gcm9vdCBUaGUgZHJpdmUgY29udGVudHNcclxuICovXHJcbmZ1bmN0aW9uIERyaXZlKG5hbWUsIHJvb3QpIHtcclxuICAgIHRoaXMubmFtZSA9IG5hbWU7XHJcbiAgICB0aGlzLnJvb3QgPSByb290O1xyXG59XHJcblxyXG4vKipcclxuICogT3BlbnMgYSBmaWxlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlIFRoZSBuYW1lIG9mIHRoZSBmaWxlXHJcbiAqL1xyXG5Ecml2ZS5wcm90b3R5cGUub3BlbiA9IGZ1bmN0aW9uKGZpbGUpIHtcclxuICAgIGlmICghdGhpcy5yb290W2ZpbGVdKSB0aGlzLnJvb3RbZmlsZV0gPSBbXTtcclxuICAgIHJldHVybiBuZXcgRmlsZShmaWxlLCB0aGlzLnJvb3RbZmlsZV0sIHRoaXMpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFNhdmVzIHRoZSBkcml2ZVxyXG4gKlxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9uP30gZG9uZSBBIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiBjb21wbGV0ZVxyXG4gKi9cclxuRHJpdmUucHJvdG90eXBlLnNhdmUgPSBmdW5jdGlvbihkb25lKSB7XHJcbiAgICBmaWxlc3lzdGVtLnNhdmUoZG9uZSk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IERyaXZlOyIsIi8qKlxyXG4gKiBSZXByZXNlbnRzIGEgZmlsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgZmlsZVxyXG4gKiBAcGFyYW0ge0FycmF5fSBmaWxlIFRoZSBmaWxlIGNvbnRlbnRzXHJcbiAqIEBwYXJhbSB7RHJpdmV9IHBhcmVudCBUaGUgcGFyZW50IGRyaXZlXHJcbiAqL1xyXG5mdW5jdGlvbiBGaWxlKG5hbWUsIGZpbGUsIHBhcmVudCkge1xyXG4gICAgdGhpcy5uYW1lID0gbmFtZTtcclxuICAgIHRoaXMuZmlsZSA9IGZpbGU7XHJcbiAgICB0aGlzLnBhcmVudCA9IHBhcmVudDtcclxuICAgIHRoaXMucmVhZEN1cnNvciA9IDA7XHJcbiAgICB0aGlzLmVvZiA9IGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogU2V0cyB0aGUgY29udGVudCBvZiB0aGUgZmlsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gY29udGVudHNcclxuICovXHJcbkZpbGUucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uKGNvbnRlbnRzKSB7XHJcbiAgICB0aGlzLnBhcmVudC5yb290W3RoaXMubmFtZV0gPSB0aGlzLmZpbGUgPSBTdHJpbmcoY29udGVudHMpLnNwbGl0KCdcXG4nKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDbGVhcnMgdGhlIGNvbnRlbnRzIG9mIHRoZSBmaWxlXHJcbiAqL1xyXG5GaWxlLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdGhpcy5wYXJlbnQucm9vdFt0aGlzLm5hbWVdID0gdGhpcy5maWxlID0gW107XHJcbn07XHJcblxyXG4vKipcclxuICogUmVhZHMgdGhlIG5leHQgbGluZSBmcm9tIHRoZSBmaWxlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtTdHJpbmd9XHJcbiAqL1xyXG5GaWxlLnByb3RvdHlwZS5uZXh0TGluZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYgKHRoaXMuZW9mIHx8IHRoaXMucmVhZEN1cnNvciA+PSB0aGlzLmZpbGUubGVuZ3RoKSB7XHJcbiAgICAgICAgdGhpcy5lb2YgPSB0cnVlO1xyXG4gICAgICAgIHJldHVybiAnJztcclxuICAgIH1cclxuICAgIHZhciB2YWx1ZSA9IHRoaXMuZmlsZVt0aGlzLnJlYWRDdXJzb3JdO1xyXG4gICAgdGhpcy5yZWFkQ3Vyc29yKys7XHJcbiAgICByZXR1cm4gdmFsdWU7XHJcbn07XHJcblxyXG4vKipcclxuICogTW92ZXMgdGhlIGN1cnNvciB0byBhIGNlcnRhaW4gcG9zaXRpb25cclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IHBvcyBOZXcgY3Vyc29yIHBvc2l0aW9uXHJcbiAqL1xyXG5GaWxlLnByb3RvdHlwZS5tb3ZlVG8gPSBmdW5jdGlvbihwb3MpIHtcclxuICAgIHRoaXMucmVhZEN1cnNvciA9IHBvcztcclxuICAgIHRoaXMuZW9mID0gdGhpcy5yZWFkQ3Vyc29yID49IHRoaXMuZmlsZS5sZW5ndGg7XHJcbn07XHJcblxyXG4vKipcclxuICogQXBwZW5kcyB0aGUgdGV4dCB0byB0aGUgZW5kIG9mIHRoZSBmaWxlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0XHJcbiAqL1xyXG5GaWxlLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uKHRleHQpIHtcclxuICAgIHZhciBzcGxpdCA9IFN0cmluZyh0ZXh0KS5zcGxpdCgnXFxuJyk7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNwbGl0Lmxlbmd0aDsgaSsrKSB0aGlzLmZpbGUucHVzaChzcGxpdFtpXSk7XHJcbn07XHJcblxyXG4vKipcclxuICogU2F2ZXMgdGhlIGZpbGVcclxuICpcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRvbmUgQSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gY29tcGxldGVcclxuICovXHJcbkZpbGUucHJvdG90eXBlLnNhdmUgPSBmdW5jdGlvbihkb25lKSB7XHJcbiAgICB0aGlzLnBhcmVudC5zYXZlKGRvbmUpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBGaWxlOyIsIi8qKlxyXG4gKiBCQVNJQyBGaWxlc3lzdGVtXHJcbiAqL1xyXG5cclxudmFyIGZzID0gcmVxdWlyZSgnZnMnKTtcclxudmFyIERyaXZlID0gcmVxdWlyZSgnLi9Ecml2ZScpO1xyXG5cclxudmFyIGFsbG93ZWREcml2ZXMgPSBbXCJhXCIsIFwiYlwiXTtcclxuXHJcbnZhciBmaWxlQ29udGVudHMgPSBwcm9jZXNzLmJyb3dzZXIgPyB7fSA6IGZhbHNlO1xyXG52YXIgZHJpdmVDYWNoZSA9IHt9O1xyXG5cclxuZXhwb3J0cy5Ecml2ZSA9IERyaXZlO1xyXG5leHBvcnRzLkZpbGUgPSByZXF1aXJlKCcuL0ZpbGUnKTtcclxuXHJcbi8qKlxyXG4gKiBJbml0aWFsaXplcyB0aGUgZmlsZSBzeXN0ZW1cclxuICpcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRvbmUgQSBjYWxsYmFjayBmb3Igd2hlbiBpbml0aWFsaXphdGlvbiBpcyBjb21wbGV0ZVxyXG4gKi9cclxuZnVuY3Rpb24gaW5pdGlhbGl6ZShkb25lKSB7XHJcbiAgICBkb25lID0gZG9uZSB8fCBmdW5jdGlvbigpIHsgfTtcclxuICAgIGlmIChmaWxlQ29udGVudHMpIGRvbmUoKTtcclxuXHJcbiAgICBmcy5yZWFkRmlsZShfX2Rpcm5hbWUgKyAnLy4uLy4uL2RhdGEvZmlsZXN5c3RlbS5qc29uJywge1xyXG4gICAgICAgIGVuY29kaW5nOiAndXRmOCdcclxuICAgIH0sIGZ1bmN0aW9uKGVyciwgZGF0YSkge1xyXG4gICAgICAgIGlmIChlcnIpIGZpbGVDb250ZW50cyA9IHt9O1xyXG4gICAgICAgIGVsc2UgZmlsZUNvbnRlbnRzID0gSlNPTi5wYXJzZShkYXRhKTtcclxuICAgICAgICBkb25lKCk7XHJcbiAgICB9KTtcclxufVxyXG5leHBvcnRzLmluaXRpYWxpemUgPSBpbml0aWFsaXplO1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgd2hldGhlciB0aGUgZmlsZXN5c3RlbSBpcyBpbml0aWFsaXplZFxyXG4gKlxyXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn1cclxuICovXHJcbmZ1bmN0aW9uIGluaXRpYWxpemVkKCkge1xyXG4gICAgcmV0dXJuIEJvb2xlYW4oZmlsZUNvbnRlbnRzKTtcclxufVxyXG5leHBvcnRzLmluaXRpYWxpemVkID0gaW5pdGlhbGl6ZWQ7XHJcblxyXG4vKipcclxuICogR2V0cyBhIGRyaXZlLiBVc2luZyB0aGUgJ2RvbmUnIHBhcmFtZXRlciBpcyByZWNvbW1lbmRlZCAodGhlIGZpbGVzeXN0ZW0gd2lsbCBiZSBpbml0aWFsaXplZCBpZiBpdCBoYXNuJ3QgYmVlbilcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGRyaXZlXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb248RHJpdmU+P30gZG9uZSBBIGNhbGxiYWNrIHRvIGNhbGwgd2hlbiB0aGUgZHJpdmUgaXMgYWNxdWlyZWRcclxuICogQHJldHVybnMge0RyaXZlfHVuZGVmaW5lZH0gVGhlIGRyaXZlLCBvciB1bmRlZmluZWQgaWYgbm90IHlldCBpbml0aWFsaXplZFxyXG4gKi9cclxuZnVuY3Rpb24gZHJpdmUobmFtZSwgZG9uZSkge1xyXG4gICAgbmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKTtcclxuICAgIGRvbmUgPSBkb25lIHx8IGZ1bmN0aW9uKCkgeyB9O1xyXG5cclxuICAgIGlmIChhbGxvd2VkRHJpdmVzLmluZGV4T2YobmFtZSkgPT09IC0xKSByZXR1cm4gZG9uZShuZXcgRXJyb3IoXCJVbmtub3duIGRyaXZlXCIpKTtcclxuICAgIGlmICghZmlsZUNvbnRlbnRzKSByZXR1cm4gaW5pdGlhbGl6ZShmdW5jdGlvbigpIHsgZHJpdmUobmFtZSwgZG9uZSk7IH0pO1xyXG5cclxuICAgIGlmICghZmlsZUNvbnRlbnRzW25hbWVdKSBmaWxlQ29udGVudHNbbmFtZV0gPSB7fTtcclxuICAgIGlmICghZHJpdmVDYWNoZVtuYW1lXSkgZHJpdmVDYWNoZVtuYW1lXSA9IG5ldyBEcml2ZShuYW1lLCBmaWxlQ29udGVudHNbbmFtZV0pO1xyXG5cclxuICAgIGRvbmUoZHJpdmVDYWNoZVtuYW1lXSk7XHJcbiAgICByZXR1cm4gZHJpdmVDYWNoZVtuYW1lXTtcclxufVxyXG5leHBvcnRzLmRyaXZlID0gZHJpdmU7XHJcblxyXG4vKipcclxuICogU2F2ZXMgdGhlIGZpbGVzeXN0ZW1cclxuICpcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRvbmUgQSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gY29tcGxldGVcclxuICovXHJcbmZ1bmN0aW9uIHNhdmUoZG9uZSkge1xyXG4gICAgaWYgKHByb2Nlc3MuYnJvd3NlcikgcmV0dXJuIGRvbmUoKTtcclxuXHJcbiAgICBmcy53cml0ZUZpbGUoX19kaXJuYW1lICsgJy8uLi8uLi9kYXRhL2ZpbGVzeXN0ZW0uanNvbicsIEpTT04uc3RyaW5naWZ5KGZpbGVDb250ZW50cyksIGZ1bmN0aW9uKGVycikge1xyXG4gICAgICAgIGlmIChkb25lKSBkb25lKGVycik7XHJcbiAgICB9KTtcclxufVxyXG5leHBvcnRzLnNhdmUgPSBzYXZlOyIsInZhciBjdHggPSByZXF1aXJlKCcuLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgaWYgdGhlIG1vdXNlIGlzIGN1cnJlbnRseSBwcmVzc2VkXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLnRvdWNoID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gMDtcclxuICAgIGN0eC5yZWFkKGZ1bmN0aW9uKHJlc3BvbnNlLCBjYW5jZWwpIHtcclxuICAgICAgICBpZiAocmVzcG9uc2UuY29tbWFuZCAhPT0gJ21vdXNlZG93bicpIHJldHVybjtcclxuICAgICAgICBjYW5jZWwoKTtcclxuICAgICAgICByZXN1bHQgPSByZXNwb25zZS5kYXRhO1xyXG4gICAgfSk7XHJcbiAgICBjdHgud3JpdGUoeyBjb21tYW5kOiBcIm1vdXNlZG93blwiIH0pO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBtb3VzZSBYIHBvc2l0aW9uXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLnRvdWNoeCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHJlc3VsdCA9IDA7XHJcbiAgICBjdHgucmVhZChmdW5jdGlvbihyZXNwb25zZSwgY2FuY2VsKSB7XHJcbiAgICAgICAgaWYgKHJlc3BvbnNlLmNvbW1hbmQgIT09ICdtb3VzZXBvcycpIHJldHVybjtcclxuICAgICAgICBjYW5jZWwoKTtcclxuICAgICAgICByZXN1bHQgPSByZXNwb25zZS5kYXRhLng7XHJcbiAgICB9KTtcclxuICAgIGN0eC53cml0ZSh7IGNvbW1hbmQ6ICdtb3VzZXBvcycgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIG1vdXNlIFkgcG9zaXRpb25cclxuICpcclxuICogQHJldHVybnMge251bWJlcn1cclxuICovXHJcbmV4cG9ydHMudG91Y2h5ID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gMDtcclxuICAgIGN0eC5yZWFkKGZ1bmN0aW9uKHJlc3BvbnNlLCBjYW5jZWwpIHtcclxuICAgICAgICBpZiAocmVzcG9uc2UuY29tbWFuZCAhPT0gJ21vdXNlcG9zJykgcmV0dXJuO1xyXG4gICAgICAgIGNhbmNlbCgpO1xyXG4gICAgICAgIHJlc3VsdCA9IHJlc3BvbnNlLmRhdGEueTtcclxuICAgIH0pO1xyXG4gICAgY3R4LndyaXRlKHsgY29tbWFuZDogJ21vdXNlcG9zJyB9KTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgY2FudmFzIHdpZHRoXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLnNjcmVlbndpZHRoID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gMDtcclxuICAgIGN0eC5yZWFkKGZ1bmN0aW9uKHJlc3BvbnNlLCBjYW5jZWwpIHtcclxuICAgICAgICBpZiAocmVzcG9uc2UuY29tbWFuZCAhPT0gJ3NjcmVlbnNpemUnKSByZXR1cm47XHJcbiAgICAgICAgY2FuY2VsKCk7XHJcbiAgICAgICAgcmVzdWx0ID0gcmVzcG9uc2UuZGF0YS53aWR0aDtcclxuICAgIH0pO1xyXG4gICAgY3R4LndyaXRlKHsgY29tbWFuZDogJ3NjcmVlbnNpemUnIH0pO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBjYW52YXMgaGVpZ2h0XHJcbiAqXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLnNjcmVlbmhlaWdodCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHJlc3VsdCA9IDA7XHJcbiAgICBjdHgucmVhZChmdW5jdGlvbihyZXNwb25zZSwgY2FuY2VsKSB7XHJcbiAgICAgICAgaWYgKHJlc3BvbnNlLmNvbW1hbmQgIT09ICdzY3JlZW5zaXplJykgcmV0dXJuO1xyXG4gICAgICAgIGNhbmNlbCgpO1xyXG4gICAgICAgIHJlc3VsdCA9IHJlc3BvbnNlLmRhdGEuaGVpZ2h0O1xyXG4gICAgfSk7XHJcbiAgICBjdHgud3JpdGUoeyBjb21tYW5kOiAnc2NyZWVuc2l6ZScgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgaWYgdGhlIGNhbnZhcyBoZWlnaHQgaXMgYmlnZ2VyIHRoYW4gd2lkdGhcclxuICpcclxuICogQHJldHVybnMge251bWJlcn1cclxuICovXHJcbmV4cG9ydHMuaXNwb3J0cmFpdCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHJlc3VsdCA9IDA7XHJcbiAgICBjdHgucmVhZChmdW5jdGlvbihyZXNwb25zZSwgY2FuY2VsKSB7XHJcbiAgICAgICAgaWYgKHJlc3BvbnNlLmNvbW1hbmQgIT09ICdzY3JlZW5zaXplJykgcmV0dXJuO1xyXG4gICAgICAgIGNhbmNlbCgpO1xyXG4gICAgICAgIHJlc3VsdCA9IHJlc3BvbnNlLmRhdGEuaGVpZ2h0ID4gcmVzcG9uc2UuZGF0YS53aWR0aCA/IDEgOiAwO1xyXG4gICAgfSk7XHJcbiAgICBjdHgud3JpdGUoeyBjb21tYW5kOiAnc2NyZWVuc2l6ZScgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgaWYgdGhlIGNhbnZhcyB3aWR0aCBpcyBiaWdnZXIgdGhhbiBoZWlnaHRcclxuICpcclxuICogQHJldHVybnMge251bWJlcn1cclxuICovXHJcbmV4cG9ydHMuaXNsYW5kc2NhcGUgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciByZXN1bHQgPSAwO1xyXG4gICAgY3R4LnJlYWQoZnVuY3Rpb24ocmVzcG9uc2UsIGNhbmNlbCkge1xyXG4gICAgICAgIGlmIChyZXNwb25zZS5jb21tYW5kICE9PSAnc2NyZWVuc2l6ZScpIHJldHVybjtcclxuICAgICAgICBjYW5jZWwoKTtcclxuICAgICAgICByZXN1bHQgPSByZXNwb25zZS5kYXRhLmhlaWdodCA8PSByZXNwb25zZS5kYXRhLndpZHRoID8gMSA6IDA7XHJcbiAgICB9KTtcclxuICAgIGN0eC53cml0ZSh7IGNvbW1hbmQ6ICdzY3JlZW5zaXplJyB9KTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgWCBtb3VzZSBvZmZzZXQgZnJvbSB0aGUgY2VudGVyLCBiZXR3ZWVuIC0xIGFuZCAxXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLmFjY2VseCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHJlc3VsdCA9IDA7XHJcbiAgICBjdHgucmVhZChmdW5jdGlvbihyZXNwb25zZSwgY2FuY2VsKSB7XHJcbiAgICAgICAgaWYgKHJlc3BvbnNlLmNvbW1hbmQgIT09ICdhY2NlbCcpIHJldHVybjtcclxuICAgICAgICBjYW5jZWwoKTtcclxuICAgICAgICByZXN1bHQgPSByZXNwb25zZS5kYXRhLng7XHJcbiAgICB9KTtcclxuICAgIGN0eC53cml0ZSh7IGNvbW1hbmQ6ICdhY2NlbCcgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIFkgbW91c2Ugb2Zmc2V0IGZyb20gdGhlIGNlbnRlciwgYmV0d2VlbiAtMSBhbmQgMVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy5hY2NlbHkgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciByZXN1bHQgPSAwO1xyXG4gICAgY3R4LnJlYWQoZnVuY3Rpb24ocmVzcG9uc2UsIGNhbmNlbCkge1xyXG4gICAgICAgIGlmIChyZXNwb25zZS5jb21tYW5kICE9PSAnYWNjZWwnKSByZXR1cm47XHJcbiAgICAgICAgY2FuY2VsKCk7XHJcbiAgICAgICAgcmVzdWx0ID0gcmVzcG9uc2UuZGF0YS55O1xyXG4gICAgfSk7XHJcbiAgICBjdHgud3JpdGUoeyBjb21tYW5kOiAnYWNjZWwnIH0pO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBtb3VzZSBzY3JvbGwgb2Zmc2V0IGZyb20gdGhlIGNlbnRlciAoZGVmYXVsdCksIGJldHdlZW4gLTEgYW5kIDFcclxuICpcclxuICogQHJldHVybnMge251bWJlcn1cclxuICovXHJcbmV4cG9ydHMuYWNjZWx6ID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gMDtcclxuICAgIGN0eC5yZWFkKGZ1bmN0aW9uKHJlc3BvbnNlLCBjYW5jZWwpIHtcclxuICAgICAgICBpZiAocmVzcG9uc2UuY29tbWFuZCAhPT0gJ2FjY2VsJykgcmV0dXJuO1xyXG4gICAgICAgIGNhbmNlbCgpO1xyXG4gICAgICAgIHJlc3VsdCA9IHJlc3BvbnNlLmRhdGEuejtcclxuICAgIH0pO1xyXG4gICAgY3R4LndyaXRlKHsgY29tbWFuZDogJ2FjY2VsJyB9KTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG4vKipcclxuICogR2V0cyB0aGUgd2lkdGggb2YgdGhlIHNwcml0ZVxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gaWRcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuc3ByaXRld2lkdGggPSBmdW5jdGlvbihpZCkge1xyXG4gICAgdmFyIHNwcml0ZSA9IHRoaXMucHJpdmF0ZS5zcHJpdGVzW2lkXTtcclxuICAgIGlmICghc3ByaXRlKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3ByaXRlIElEJyk7XHJcbiAgICByZXR1cm4gc3ByaXRlLndpZHRoO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIGhlaWdodCBvZiB0aGUgc3ByaXRlXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBpZFxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy5zcHJpdGVoZWlnaHQgPSBmdW5jdGlvbihpZCkge1xyXG4gICAgdmFyIHNwcml0ZSA9IHRoaXMucHJpdmF0ZS5zcHJpdGVzW2lkXTtcclxuICAgIGlmICghc3ByaXRlKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3ByaXRlIElEJyk7XHJcbiAgICByZXR1cm4gc3ByaXRlLmhlaWdodDtcclxufTsiLCIvKipcclxuICogRnVuY3Rpb24gTGlzdFxyXG4gKi9cclxuXHJcbmludG9FeHBvcnQocmVxdWlyZSgnLi9udW1iZXInKSk7XHJcbmludG9FeHBvcnQocmVxdWlyZSgnLi9zdHJpbmcnKSk7XHJcbmludG9FeHBvcnQocmVxdWlyZSgnLi9ncmFwaGljcycpKTtcclxuXHJcbi8qKlxyXG4gKiBDb3BpZXMgdGhlIHByb3BlcnRpZXMgb2YgYW4gb2JqZWN0IHRvIHRoZSBleHBvcnRzXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBjb3B5XHJcbiAqL1xyXG5mdW5jdGlvbiBpbnRvRXhwb3J0KG9iaikge1xyXG4gICAgZm9yICh2YXIgayBpbiBvYmopIHtcclxuICAgICAgICBpZiAoIW9iai5oYXNPd25Qcm9wZXJ0eShrKSkgY29udGludWU7XHJcbiAgICAgICAgZXhwb3J0c1trXSA9IG9ialtrXTtcclxuICAgIH1cclxufSIsIi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBzaW5lIG9mIGFuIGFuZ2xlXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIFJhZGlhbnNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuc2luID0gZnVuY3Rpb24oYSkge1xyXG4gICAgdGhpcy52YWxpZGF0ZShhLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5zaW4oYSk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgY29zaW5lIG9mIGFuIGFuZ2xlXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIFJhZGlhbnNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuY29zID0gZnVuY3Rpb24oYSkge1xyXG4gICAgdGhpcy52YWxpZGF0ZShhLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5jb3MoYSk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgdGFuZ2VudCBvZiBhbiBhbmdsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gYSBSYWRpYW5zXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLnRhbiA9IGZ1bmN0aW9uKGEpIHtcclxuICAgIHRoaXMudmFsaWRhdGUoYSwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGgudGFuKGEpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIGFyYyBzaW5lXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIFJhZGlhbnNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuYXNpbiA9IGZ1bmN0aW9uKGEpIHtcclxuICAgIHRoaXMudmFsaWRhdGUoYSwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGguYXNpbihhKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBhcmMgY29zaW5lXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIFJhZGlhbnNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuYWNvcyA9IGZ1bmN0aW9uKGEpIHtcclxuICAgIHRoaXMudmFsaWRhdGUoYSwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGguYWNvcyhhKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBhcmMgdGFuZ2VudFxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gYSBSYWRpYW5zXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLmF0biA9IGZ1bmN0aW9uKGEpIHtcclxuICAgIHRoaXMudmFsaWRhdGUoYSwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGguYXRuKGEpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIGFuIGFuZ2xlIGZyb20gZGVncmVlcyB0byByYWRpYW5zXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBhIERlZ3JlZXNcclxuICogQHJldHVybnMge051bWJlcn0gUmFkaWFuc1xyXG4gKi9cclxuZXhwb3J0cy5yYWQgPSBmdW5jdGlvbihhKSB7XHJcbiAgICB0aGlzLnZhbGlkYXRlKGEsICdudW1iZXInKTtcclxuICAgIHJldHVybiBNYXRoLnJhZChhKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyBhbiBhbmdsZSBmcm9tIHJhZGlhbnMgdG8gZGVncmVlc1xyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gYSBSYWRpYW5zXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IERlZ3JlZXNcclxuICovXHJcbmV4cG9ydHMuZGVnID0gZnVuY3Rpb24oYSkge1xyXG4gICAgdGhpcy52YWxpZGF0ZShhLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5kZWcoYSk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgc3F1YXJlIHJvb3Qgb2YgYSBudW1iZXJcclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IG5cclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuc3FyID0gZnVuY3Rpb24obikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShuLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5zcXJ0KG4pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIGFic29sdXRlIHZhbHVlIG9mIGEgbnVtYmVyXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLmFicyA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIHRoaXMudmFsaWRhdGUobiwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGguYWJzKG4pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIGludGVnZXIgcGFydCBvZiBhIGZsb2F0aW5nLXBvaW50IG51bWJlclxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gblxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy5pbnQgPSBmdW5jdGlvbihuKSB7XHJcbiAgICB0aGlzLnZhbGlkYXRlKG4sICdudW1iZXInKTtcclxuICAgIHJldHVybiBNYXRoLmZsb29yKG4pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIG5hdHVyYWwgbG9nYXJpdGhtXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLmxvZyA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIHRoaXMudmFsaWRhdGUobiwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIE1hdGgubG9nKG4pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybnMgdGhlIGNvbW1vbiAoYmFzZS0xMCkgbG9nYXJpdGhtXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XHJcbiAqL1xyXG5leHBvcnRzLmxvZzEwID0gZnVuY3Rpb24obikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShuLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5sb2cxMChuKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBiYXNlLWUgZXhwb25lbnRpYWwgZnVuY3Rpb25cclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IG5cclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuZXhwID0gZnVuY3Rpb24obikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShuLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gTWF0aC5leHAobik7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgZmxvYXRpbmctcG9pbnQgcmVtYWluZGVyIG9mIGEgLyBiLlxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gYVxyXG4gKiBAcGFyYW0ge051bWJlcn0gYlxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy5tb2QgPSBmdW5jdGlvbihhLCBiKSB7XHJcbiAgICB0aGlzLnZhbGlkYXRlKGEsICdudW1iZXInKTtcclxuICAgIHRoaXMudmFsaWRhdGUoYiwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIGEgJSBiO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgYSByYW5kb20gbnVtYmVyIHVzaW5nIGEgc2VlZFxyXG4gKlxyXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0UmFuZG9tKGRhdGEpIHtcclxuICAgIHZhciB4ID0gTWF0aC5zaW4oZGF0YS5nZXRQcml2YXRlKCdybmRfc2VlZCcpKSAqIDEwMDAwO1xyXG4gICAgZGF0YS5zZXRQcml2YXRlKCdybmRfc2VlZCcsIGRhdGEuZ2V0UHJpdmF0ZSgncm5kX3NlZWQnKSArIDEpO1xyXG4gICAgcmV0dXJuIHggLSBNYXRoLmZsb29yKHgpO1xyXG59XHJcblxyXG4vKipcclxuICogR2VuZXJhdGVzIGFuZCByZXR1cm5zIGEgcmFuZG9tIG51bWJlciBmcm9tIDAgdG8gMVxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcj99IG1pblxyXG4gKiBAcGFyYW0ge051bWJlcj99IG1heFxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy5ybmQgPSBmdW5jdGlvbihtaW4sIG1heCkge1xyXG4gICAgaWYgKHR5cGVvZiBtaW4gIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBtYXggIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgdGhpcy52YWxpZGF0ZShtaW4sICdudW1iZXInKTtcclxuICAgICAgICB0aGlzLnZhbGlkYXRlKG1heCwgJ251bWJlcicpO1xyXG4gICAgICAgIHJldHVybiBNYXRoLmZsb29yKGdldFJhbmRvbSh0aGlzKSAqIChtYXggLSBtaW4gKyAxKSkgKyBtaW47XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZ2V0UmFuZG9tKHRoaXMpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFNldCByYW5kb20gbnVtYmVyIGdlbmVyYXRvciBzZWVkXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBzZWVkXHJcbiAqL1xyXG5leHBvcnRzLnJhbmRvbWl6ZSA9IGZ1bmN0aW9uKHNlZWQpIHtcclxuICAgIHRoaXMuc2V0UHJpdmF0ZSgncm5kX3NlZWQnLCBzZWVkKTtcclxufTsiLCIvKipcclxuICogTWFrZSBzdHJpbmcgdXBwZXJjYXNlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBzXHJcbiAqIEByZXR1cm5zIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzWyd1cHBlciQnXSA9IGZ1bmN0aW9uKHMpIHtcclxuICAgIHRoaXMudmFsaWRhdGUocywgJ3N0cmluZycpO1xyXG4gICAgcmV0dXJuIHMudG9VcHBlckNhc2UoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBNYWtlIHN0cmluZyBsb3dlcmNhc2VcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHNcclxuICogQHJldHVybnMge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHNbJ2xvd2VyJCddID0gZnVuY3Rpb24ocykge1xyXG4gICAgdGhpcy52YWxpZGF0ZShzLCAnc3RyaW5nJyk7XHJcbiAgICByZXR1cm4gcy50b0xvd2VyQ2FzZSgpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFRha2UgbiBjaGFyYWN0ZXJzIGZyb20gc3RyaW5nJ3MgbGVmdFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gc1xyXG4gKiBAcGFyYW0ge051bWJlcn0gblxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0c1snbGVmdCQnXSA9IGZ1bmN0aW9uKHMsIG4pIHtcclxuICAgIHRoaXMudmFsaWRhdGUocywgJ3N0cmluZycpO1xyXG4gICAgdGhpcy52YWxpZGF0ZShuLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gcy5zdWJzdHIoMCwgbik7XHJcbn07XHJcblxyXG4vKipcclxuICogVGFrZSBuIGNoYXJhY3RlcnMgZnJvbSBzdHJpbmcgc3RhcnRpbmcgd2l0aCBpJ3RoIGNoYXJhY3RlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gc1xyXG4gKiBAcGFyYW0ge051bWJlcn0gaVxyXG4gKiBAcGFyYW0ge051bWJlcn0gblxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0c1snbWlkJCddID0gZnVuY3Rpb24ocywgaSwgbikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShzLCAnc3RyaW5nJyk7XHJcbiAgICB0aGlzLnZhbGlkYXRlKGksICdudW1iZXInKTtcclxuICAgIHRoaXMudmFsaWRhdGUobiwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIHMuc3Vic3RyKGksIG4pO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFRha2UgbiBjaGFyYWN0ZXJzIGZyb20gc3RyaW5nJ3MgcmlnaHRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHNcclxuICogQHBhcmFtIHtOdW1iZXJ9IG5cclxuICogQHJldHVybnMge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHNbJ3JpZ2h0JCddID0gZnVuY3Rpb24ocywgbikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShzLCAnc3RyaW5nJyk7XHJcbiAgICB0aGlzLnZhbGlkYXRlKG4sICdudW1iZXInKTtcclxuICAgIHJldHVybiBzLnN1YnN0cigtbik7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJuIHN0cmluZyBsZW5ndGhcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMubGVuID0gZnVuY3Rpb24ocykge1xyXG4gICAgdGhpcy52YWxpZGF0ZShzLCAnc3RyaW5nJyk7XHJcbiAgICByZXR1cm4gcy5sZW5ndGg7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydCBzdHJpbmcgaW50byBhIG51bWJlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gc1xyXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxyXG4gKi9cclxuZXhwb3J0cy52YWwgPSBmdW5jdGlvbihzKSB7XHJcbiAgICB0aGlzLnZhbGlkYXRlKHMsICdzdHJpbmcnKTtcclxuICAgIHZhciBudW0gPSBwYXJzZUZsb2F0KHMpO1xyXG4gICAgaWYgKGlzTmFOKG51bSkpIHRocm93IG5ldyBFcnJvcignU3RyaW5nIGlzIG5vdCBhIG51bWJlcicpO1xyXG4gICAgcmV0dXJuIG51bTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0IG51bWJlciBpbnRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXHJcbiAqIEByZXR1cm5zIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzWydzdHIkJ10gPSBmdW5jdGlvbihuKSB7XHJcbiAgICB0aGlzLnZhbGlkYXRlKG4sICdudW1iZXInKTtcclxuICAgIHJldHVybiBuLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJuIEFTQ0lJIGNvZGUgb2Ygc3RyaW5ncyBmaXJzdCBjaGFyYWN0ZXJcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHNcclxuICogQHJldHVybnMge051bWJlcn1cclxuICovXHJcbmV4cG9ydHMuYXNjID0gZnVuY3Rpb24ocykge1xyXG4gICAgdGhpcy52YWxpZGF0ZShzLCAnc3RyaW5nJyk7XHJcbiAgICByZXR1cm4gcy5jaGFyQ29kZUF0KDApO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybiBzdHJpbmcgY29udGFpbmluZyBhIHNpbmdsZSBBU0NJSSBjaGFyYWN0ZXJcclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IG5cclxuICogQHJldHVybnMge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHNbJ2NociQnXSA9IGZ1bmN0aW9uKG4pIHtcclxuICAgIHRoaXMudmFsaWRhdGUobiwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUobik7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJuIHN0cmluZyBjb250YWluaW5nIG4gc3BhY2UgY2hhcmFjdGVyc1xyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0gblxyXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0c1snc3BjJCddID0gZnVuY3Rpb24obikge1xyXG4gICAgdGhpcy52YWxpZGF0ZShuLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gKG5ldyBBcnJheShuICsgMSkpLmpvaW4oJyAnKTtcclxufTsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4vc3RhdGVtZW50cycpO1xyXG5cclxuLyoqXHJcbiAqIFJlcHJlc2VudHMgYSB0cmVlIHRoYXQgY2FuIGJlIGV4ZWN1dGVkXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXJyYXl9IHJvb3QgVGhlIHJvb3QtbGV2ZWwgbm9kZXNcclxuICogQHBhcmFtIHtPYmplY3R9IGxhYmVscyBBbiBvYmplY3Qgb2YgbGFiZWw6IGxpbmUgbWFwcGluZ3NcclxuICogQHBhcmFtIHtCbG9ja01hbmFnZXJ9IG1hbmFnZXIgVGhlIGJsb2NrIG1hbmFnZXJcclxuICovXHJcbmZ1bmN0aW9uIEFic3RyYWN0U3ludGF4VHJlZShyb290LCBsYWJlbHMsIG1hbmFnZXIpIHtcclxuICAgIHRoaXMucm9vdCA9IHJvb3Q7XHJcbiAgICB0aGlzLmxhYmVscyA9IGxhYmVscztcclxuICAgIHRoaXMubWFuYWdlciA9IG1hbmFnZXI7XHJcblxyXG4gICAgbWFuYWdlci5wYXJzZSh0aGlzKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSB0cmVlIHRvIGFuIGV4ZWN1dGFibGUgY29kZSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkFic3RyYWN0U3ludGF4VHJlZS5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBsaW5lcyA9IFtdO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvb3QubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBsaW5lcy5wdXNoKHRoaXMucm9vdFtpXS50b1N0cmluZygpKTtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKHZhciBuYW1lIGluIHRoaXMubGFiZWxzKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxhYmVscy5oYXNPd25Qcm9wZXJ0eShuYW1lKSkgY29udGludWU7XHJcblxyXG4gICAgICAgIHZhciBsaW5lTnVtYmVyID0gdGhpcy5sYWJlbHNbbmFtZV07XHJcbiAgICAgICAgaWYgKHRoaXMucm9vdFtsaW5lTnVtYmVyXSBpbnN0YW5jZW9mIHN0YXRlbWVudHMuRW1wdHlTdGF0ZW1lbnQpIGxpbmVzW2xpbmVOdW1iZXJdID0gbmFtZSArICc6JztcclxuICAgICAgICBlbHNlIGxpbmVzW2xpbmVOdW1iZXJdID0gbmFtZSArICcgJyArIGxpbmVzW2xpbmVOdW1iZXJdO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSB0cmVlIHRvIHNlcmlhbGl6YWJsZSBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5BYnN0cmFjdFN5bnRheFRyZWUucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIHJvb3QgPSBbXTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb290Lmxlbmd0aDsgaSsrKSByb290LnB1c2godGhpcy5yb290W2ldLnRvSlNPTigpKTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcm9vdDogcm9vdCxcclxuICAgICAgICBsYWJlbHM6IHRoaXMubGFiZWxzXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIGl0ZW1zIGluIHRoZSB0cmVlXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YSBUaGUgZXhlY3V0aW9uIGNvbnRleHRcclxuICogQHBhcmFtIHtGdW5jdGlvbj99IGRvbmUgQSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gdGhlIHByb2dyYW0gdGVybWluYXRlc1xyXG4gKi9cclxuQWJzdHJhY3RTeW50YXhUcmVlLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgZG9uZSkge1xyXG4gICAgZGF0YS5leGVjdXRlKHRoaXMucm9vdCwgdGhpcy5sYWJlbHMsIGRvbmUpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBYnN0cmFjdFN5bnRheFRyZWU7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcblxyXG4vKipcclxuICogQSBibG9jayBwYXJzZXJcclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IGxpbmUgVGhlIGN1cnJlbnQgbGluZSBudW1iZXJcclxuICogQHBhcmFtIHt7c3RhcnQ6IEFycmF5LCBlbmQ6IEFycmF5LCB0aGVuOiBBcnJheX19IGRlZiBQcm9wZXJ0aWVzIGZvciBibG9jayBkZWZpbml0aW9uXHJcbiAqIEBwYXJhbSB7QmxvY2tNYW5hZ2VyfSBwYXJlbnRcclxuICovXHJcbmZ1bmN0aW9uIEJsb2NrKGxpbmUsIGRlZiwgcGFyZW50KSB7XHJcbiAgICB0aGlzLnN0YXJ0TmFtZXMgPSBbXTtcclxuICAgIHRoaXMudGhlbk5hbWVzID0gW107XHJcbiAgICB0aGlzLmVuZE5hbWVzID0gW107XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRlZi5zdGFydC5sZW5ndGg7IGkrKykgdGhpcy5zdGFydE5hbWVzLnB1c2goZGVmLnN0YXJ0W2ldLnRvTG93ZXJDYXNlKCkpO1xyXG4gICAgZm9yICh2YXIgeCA9IDA7IHggPCBkZWYuZW5kLmxlbmd0aDsgeCsrKSB0aGlzLmVuZE5hbWVzLnB1c2goZGVmLmVuZFt4XS50b0xvd2VyQ2FzZSgpKTtcclxuICAgIGZvciAodmFyIHkgPSAwOyB5IDwgZGVmLnRoZW4ubGVuZ3RoOyB5KyspIHRoaXMudGhlbk5hbWVzLnB1c2goZGVmLnRoZW5beV0udG9Mb3dlckNhc2UoKSk7XHJcblxyXG4gICAgdGhpcy5saW5lID0gbGluZTtcclxuICAgIHRoaXMucGFyZW50ID0gcGFyZW50O1xyXG4gICAgdGhpcy5zZWFyY2hJbmRleCA9IGxpbmU7XHJcbiAgICB0aGlzLnN0YXJ0ID0gLTE7XHJcbiAgICB0aGlzLmludGVybWVkaWF0ZUluZGV4ZXMgPSB7fTtcclxuICAgIHRoaXMuaW50ZXJtZWRpYXRlQ3Vyc29ycyA9IHt9O1xyXG4gICAgdGhpcy5lbmQgPSAtMTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFBhcnNlcyB0aGUgYmxvY2tcclxuICpcclxuICogQHBhcmFtIHtBYnN0cmFjdFN5bnRheFRyZWV9IGFzdFxyXG4gKi9cclxuQmxvY2sucHJvdG90eXBlLnBhcnNlID0gZnVuY3Rpb24oYXN0KSB7XHJcbiAgICB2YXIgcm9vdCA9IGFzdC5yb290LCBkZXB0aCA9IDA7XHJcbiAgICB2YXIgaW50ZXJtZWRpYXRlRmluZHMgPSB0aGlzLmludGVybWVkaWF0ZUluZGV4ZXMgPSB7fTtcclxuXHJcbiAgICBmb3IgKHZhciBsbiA9IHRoaXMuc2VhcmNoSW5kZXg7IGxuIDwgcm9vdC5sZW5ndGg7IGxuKyspIHtcclxuICAgICAgICB2YXIgbGluZSA9IHJvb3RbbG5dO1xyXG4gICAgICAgIGlmICghKGxpbmUgaW5zdGFuY2VvZiBzdGF0ZW1lbnRzLkNvbW1hbmRTdGF0ZW1lbnQpKSBjb250aW51ZTtcclxuICAgICAgICB2YXIgbGluZU5hbWUgPSBsaW5lLm5hbWU7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnN0YXJ0TmFtZXMuaW5kZXhPZihsaW5lTmFtZSkgIT09IC0xKSB7XHJcbiAgICAgICAgICAgIGlmIChkZXB0aCA9PT0gMCkgdGhpcy5zdGFydCA9IGxuO1xyXG4gICAgICAgICAgICBkZXB0aCsrO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy50aGVuTmFtZXMuaW5kZXhPZihsaW5lTmFtZSkgIT09IC0xICYmIGRlcHRoID09PSAxKSB7XHJcbiAgICAgICAgICAgIGlmICghaW50ZXJtZWRpYXRlRmluZHNbbGluZU5hbWVdKSBpbnRlcm1lZGlhdGVGaW5kc1tsaW5lTmFtZV0gPSBbXTtcclxuICAgICAgICAgICAgaW50ZXJtZWRpYXRlRmluZHNbbGluZU5hbWVdLnB1c2gobG4pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5lbmROYW1lcy5pbmRleE9mKGxpbmVOYW1lKSAhPT0gLTEpIHtcclxuICAgICAgICAgICAgZGVwdGgtLTtcclxuICAgICAgICAgICAgaWYgKGRlcHRoIDwgMCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiVW5leHBlY3RlZCBcIiArIGxpbmVOYW1lLnRvVXBwZXJDYXNlKCkpO1xyXG4gICAgICAgICAgICBlbHNlIGlmIChkZXB0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbmQgPSBsbjtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoZGVwdGggIT09IDApIHRocm93IG5ldyBTeW50YXhFcnJvcih0aGlzLnN0YXJ0TmFtZXNbMF0udG9VcHBlckNhc2UoKSArIFwiIHdpdGhvdXQgXCIgKyB0aGlzLmVuZE5hbWVzWzBdLnRvVXBwZXJDYXNlKCkpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEZpbmRzIGlmIHRoZSBibG9jayBoYXMgdGhlIGludGVybWVkaWF0ZSBjb21tYW5kIHNwZWNpZmllZFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgY29tbWFuZFxyXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cclxuICovXHJcbkJsb2NrLnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbihuYW1lKSB7XHJcbiAgICBuYW1lID0gbmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKHRoaXMudGhlbk5hbWVzLmluZGV4T2YobmFtZSkgPT09IC0xKSByZXR1cm4gZmFsc2U7XHJcbiAgICBpZiAoIXRoaXMuaW50ZXJtZWRpYXRlSW5kZXhlc1tuYW1lXSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgcmV0dXJuIEJvb2xlYW4odGhpcy5pbnRlcm1lZGlhdGVJbmRleGVzW25hbWVdLmxlbmd0aCk7XHJcbn07XHJcblxyXG4vKipcclxuICogRmluZHMgdGhlIG5leHQgaW50ZXJtZWRpYXRlIGNvbW1hbmQgd2l0aCB0aGUgbmFtZSBzcGVjaWZpZWRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGNvbW1hbmRcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIGxpbmUgb3IgLTEgaWYgbm9uZSBmb3VuZFxyXG4gKi9cclxuQmxvY2sucHJvdG90eXBlLm5leHQgPSBmdW5jdGlvbihuYW1lKSB7XHJcbiAgICBuYW1lID0gbmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKCF0aGlzLmhhcyhuYW1lKSkgcmV0dXJuIC0xO1xyXG5cclxuICAgIGlmICghdGhpcy5pbnRlcm1lZGlhdGVDdXJzb3JzW25hbWVdKSB0aGlzLmludGVybWVkaWF0ZUN1cnNvcnNbbmFtZV0gPSAwO1xyXG4gICAgdmFyIGN1cnNvciA9IHRoaXMuaW50ZXJtZWRpYXRlQ3Vyc29yc1tuYW1lXTtcclxuICAgIGlmIChjdXJzb3IgPj0gdGhpcy5pbnRlcm1lZGlhdGVJbmRleGVzW25hbWVdLmxlbmd0aCkgY3Vyc29yID0gdGhpcy5pbnRlcm1lZGlhdGVDdXJzb3JzW25hbWVdID0gMDtcclxuXHJcbiAgICB2YXIgdmFsdWUgPSB0aGlzLmludGVybWVkaWF0ZUluZGV4ZXNbbmFtZV1bY3Vyc29yXTtcclxuICAgIHRoaXMuaW50ZXJtZWRpYXRlQ3Vyc29yc1tuYW1lXSsrO1xyXG4gICAgcmV0dXJuIHZhbHVlO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgYSBsaXN0IG9mIHJlZmVyZW5jZXNcclxuICpcclxuICogQHJldHVybnMge0FycmF5PEJsb2NrPn1cclxuICovXHJcbkJsb2NrLnByb3RvdHlwZS5yZWZlcmVuY2VzID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5wYXJlbnQuYnlMaW5lUmVmW3RoaXMubGluZV07XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuQmxvY2sucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXHJcbiAgICAgICAgc2VhcmNoSW5kZXg6IHRoaXMuc2VhcmNoSW5kZXgsXHJcbiAgICAgICAgc3RhcnQ6IHRoaXMuc3RhcnQsXHJcbiAgICAgICAgaW50ZXJtZWRpYXRlSW5kZXhlczogdGhpcy5pbnRlcm1lZGlhdGVJbmRleGVzLFxyXG4gICAgICAgIGludGVybWVkaWF0ZUN1cnNvcnM6IHRoaXMuaW50ZXJtZWRpYXRlQ3Vyc29ycyxcclxuICAgICAgICBlbmQ6IHRoaXMuZW5kXHJcbiAgICB9O1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBCbG9jazsiLCJ2YXIgQmxvY2sgPSByZXF1aXJlKCcuL0Jsb2NrJyk7XHJcblxyXG4vKipcclxuICogQ3JlYXRlcyBibG9jayBkZWZpbml0aW9uIGZ1bmN0aW9uc1xyXG4gKi9cclxuZnVuY3Rpb24gQmxvY2tNYW5hZ2VyKCkge1xyXG4gICAgdGhpcy5jaGlsZHJlbiA9IFtdO1xyXG4gICAgdGhpcy5ieUxpbmVSZWYgPSB7fTtcclxufVxyXG5cclxuQmxvY2tNYW5hZ2VyLkJsb2NrID0gQmxvY2s7XHJcbkJsb2NrTWFuYWdlci5CbG9ja01hbmFnZXIgPSBCbG9ja01hbmFnZXI7XHJcblxyXG4vKipcclxuICogUGFyc2VzIHRoZSBibG9ja3NcclxuICpcclxuICogQHBhcmFtIHtBYnN0cmFjdFN5bnRheFRyZWV9IGFzdFxyXG4gKi9cclxuQmxvY2tNYW5hZ2VyLnByb3RvdHlwZS5wYXJzZSA9IGZ1bmN0aW9uKGFzdCkge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXTtcclxuICAgICAgICBjaGlsZC5wYXJzZShhc3QpO1xyXG5cclxuICAgICAgICBpZiAoY2hpbGQuc3RhcnQgIT09IC0xKSBhZGRDaGlsZFRvKHRoaXMuYnlMaW5lUmVmLCBjaGlsZCwgY2hpbGQuc3RhcnQpO1xyXG4gICAgICAgIGlmIChjaGlsZC5lbmQgIT09IC0xKSBhZGRDaGlsZFRvKHRoaXMuYnlMaW5lUmVmLCBjaGlsZCwgY2hpbGQuZW5kKTtcclxuICAgICAgICBmb3IgKHZhciB0eXBlIGluIGNoaWxkLmludGVybWVkaWF0ZUluZGV4ZXMpIHtcclxuICAgICAgICAgICAgaWYgKCFjaGlsZC5pbnRlcm1lZGlhdGVJbmRleGVzLmhhc093blByb3BlcnR5KHR5cGUpKSBjb250aW51ZTtcclxuICAgICAgICAgICAgdmFyIGNoaWxkSW5kZXhlcyA9IGNoaWxkLmludGVybWVkaWF0ZUluZGV4ZXNbdHlwZV07XHJcbiAgICAgICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgY2hpbGRJbmRleGVzLmxlbmd0aDsgeCsrKSB7XHJcbiAgICAgICAgICAgICAgICBhZGRDaGlsZFRvKHRoaXMuYnlMaW5lUmVmLCBjaGlsZCwgY2hpbGRJbmRleGVzW3hdKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBDcmVhdGVzIGEgZnVuY3Rpb24gdG8gY3JlYXRlIGEgYmxvY2tcclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IGxpbmUgVGhlIGxpbmUgbnVtYmVyIGZvciB0aGUgYmxvY2tcclxuICogQHJldHVybnMge0Z1bmN0aW9ufSBUaGUgZnVuY3Rpb24gdG8gY3JlYXRlIHRoZSBibG9ja1xyXG4gKi9cclxuQmxvY2tNYW5hZ2VyLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihsaW5lKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGEgYmxvY2sgd2l0aCB0aGUgc3BlY2lmaWVkIGRlZmluaXRpb25cclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZGVmIFRoZSBibG9jayBkZWZpbml0aW9uXHJcbiAgICAgKiBAcmV0dXJucyB7QmxvY2t9XHJcbiAgICAgKi9cclxuICAgIHZhciByZXMgPSBmdW5jdGlvbihkZWYpIHtcclxuICAgICAgICB2YXIgc3RhcnQgPSBBcnJheS5pc0FycmF5KGRlZi5zdGFydCkgPyBkZWYuc3RhcnQgOiBbZGVmLnN0YXJ0XTtcclxuICAgICAgICB2YXIgZW5kID0gQXJyYXkuaXNBcnJheShkZWYuZW5kKSA/IGRlZi5lbmQgOiBbZGVmLmVuZF07XHJcbiAgICAgICAgdmFyIHRoZW4gPSBkZWYudGhlbiA/IChBcnJheS5pc0FycmF5KGRlZi50aGVuKSA/IGRlZi50aGVuIDogW2RlZi50aGVuXSkgOiBbXTtcclxuXHJcbiAgICAgICAgdmFyIGNoaWxkID0gbmV3IEJsb2NrKGxpbmUsIHtcclxuICAgICAgICAgICAgc3RhcnQ6IHN0YXJ0LFxyXG4gICAgICAgICAgICBlbmQ6IGVuZCxcclxuICAgICAgICAgICAgdGhlbjogdGhlblxyXG4gICAgICAgIH0sIHNlbGYpO1xyXG4gICAgICAgIHNlbGYuY2hpbGRyZW4ucHVzaChjaGlsZCk7XHJcbiAgICAgICAgcmV0dXJuIGNoaWxkO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSBsaXN0IG9mIGJsb2NrIHJlZmVyZW5jZXNcclxuICAgICAqXHJcbiAgICAgKiBAcmV0dXJucyB7QXJyYXk8QmxvY2s+fVxyXG4gICAgICovXHJcbiAgICByZXMucmVmZXJlbmNlcyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBzZWxmLmJ5TGluZVJlZltsaW5lXTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUaGUgY3VycmVudCBsaW5lXHJcbiAgICAgKlxyXG4gICAgICogQHR5cGUge051bWJlcn1cclxuICAgICAqL1xyXG4gICAgcmVzLmxpbmUgPSBsaW5lO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29udmVydHMgdGhlIGJsb2NrIGRlZmluaXRpb24gdG8gSlNPTlxyXG4gICAgICpcclxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAgICAgKi9cclxuICAgIHJlcy50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgbGluZVJlZiA9IFtdLCBpTGluZVJlZiA9IHNlbGYuYnlMaW5lUmVmW2xpbmVdO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaUxpbmVSZWYubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgbGluZVJlZi5wdXNoKGlMaW5lUmVmW2ldLnRvSlNPTigpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGxpbmU6IGxpbmUsXHJcbiAgICAgICAgICAgIGxpbmVSZWY6IGxpbmVSZWZcclxuICAgICAgICB9O1xyXG4gICAgfTtcclxuICAgIHJldHVybiByZXM7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEJsb2NrTWFuYWdlcjtcclxuXHJcbmZ1bmN0aW9uIGFkZENoaWxkVG8oYnlSZWYsIGNoaWxkLCBjaGlsZEluZGV4KSB7XHJcbiAgICBpZiAoIWJ5UmVmW2NoaWxkSW5kZXhdKSBieVJlZltjaGlsZEluZGV4XSA9IFtdO1xyXG4gICAgYnlSZWZbY2hpbGRJbmRleF0ucHVzaChjaGlsZCk7XHJcbn0iLCIvKipcclxuICogQW4gZXJyb3IgY2F1c2VkIGJ5IGludmFsaWQgc3ludGF4XHJcbiAqL1xyXG5mdW5jdGlvbiBTeW50YXhFcnJvcihtc2cpIHtcclxuICAgIHRoaXMubWVzc2FnZSA9IG1zZztcclxufVxyXG5cclxuU3ludGF4RXJyb3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5tZXNzYWdlO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBTeW50YXhFcnJvcjsiLCJ2YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBDYWxpYnJhdGVzIHRoZSBhY2NlbGVyb21ldGVyIChtb3VzZSlcclxuICovXHJcbmZ1bmN0aW9uIEFjY2VsY2FsaWJyYXRlQ29tbWFuZCgpIHsgfVxyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5BY2NlbGNhbGlicmF0ZUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6ICdhY2NlbCcsXHJcbiAgICAgICAgYXJnczoge1xyXG4gICAgICAgICAgICBjYWxpYnJhdGU6IHRydWVcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQWNjZWxjYWxpYnJhdGVDb21tYW5kOyIsIi8qKlxyXG4gKiBEb2VzIG5vdGhpbmcsIGFzIEphdmFzY3JpcHQgZG9lc250IGFsbG93IGRpc2FibGluZyBvZiBhbnRpYWxpYXNpbmdcclxuICovXHJcbmZ1bmN0aW9uIEFudGlhbGlhc0NvbW1hbmQoKSB7fVxyXG5cclxuQW50aWFsaWFzQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHsgbmV4dCgpOyB9O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBbnRpYWxpYXNDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIHRoZSBjb2xvciBvZiB0aGUgYmFja2dyb3VuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqL1xyXG5mdW5jdGlvbiBCY29sb3JDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgMykgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdCQ09MT1IgY29tbWFuZCByZXF1aXJlcyAzIGFyZ3VtZW50cycpO1xyXG4gICAgdGhpcy5yZWQgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMuZ3JlZW4gPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMuYmx1ZSA9IHBhcnNlZC5hcmdzWzJdO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5CY29sb3JDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIFt0aGlzLnJlZCwgdGhpcy5ncmVlbiwgdGhpcy5ibHVlXS5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuQmNvbG9yQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHI6IHRoaXMucmVkLnRvSlNPTigpLFxyXG4gICAgICAgIGc6IHRoaXMuZ3JlZW4udG9KU09OKCksXHJcbiAgICAgICAgYjogdGhpcy5ibHVlLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5CY29sb3JDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHJlZCA9IHRoaXMucmVkLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgZ3JlZW4gPSB0aGlzLmdyZWVuLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgYmx1ZSA9IHRoaXMuYmx1ZS5leGVjdXRlKGRhdGEpO1xyXG5cclxuICAgIGRhdGEudmFsaWRhdGUocmVkLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKGdyZWVuLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKGJsdWUsICdudW1iZXInKTtcclxuXHJcbiAgICB2YXIgb2xkUmVkID0gcmVkLCBvbGRHcmVlbiA9IGdyZWVuLCBvbGRCbHVlID0gYmx1ZTtcclxuXHJcbiAgICBpZiAocmVkID4gMSkgcmVkIC89IDI1NTtcclxuICAgIGlmIChncmVlbiA+IDEpIGdyZWVuIC89IDI1NTtcclxuICAgIGlmIChibHVlID4gMSkgYmx1ZSAvPSAyNTU7XHJcblxyXG4gICAgcmVkID0gTWF0aC5tYXgoMCwgTWF0aC5taW4ocmVkLCAxKSk7XHJcbiAgICBncmVlbiA9IE1hdGgubWF4KDAsIE1hdGgubWluKGdyZWVuLCAxKSk7XHJcbiAgICBibHVlID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oYmx1ZSwgMSkpO1xyXG5cclxuICAgIGRhdGEuc2V0Q29uc3RhbnQoJ0JDb2xvclInLCBvbGRSZWQpO1xyXG4gICAgZGF0YS5zZXRDb25zdGFudCgnQkNvbG9yRycsIG9sZEdyZWVuKTtcclxuICAgIGRhdGEuc2V0Q29uc3RhbnQoJ0JDb2xvckInLCBvbGRCbHVlKTtcclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIFwiY29tbWFuZFwiOiBcImJjb2xvclwiLFxyXG4gICAgICAgIFwiYXJnc1wiOiB7XHJcbiAgICAgICAgICAgIFwiclwiOiByZWQsXHJcbiAgICAgICAgICAgIFwiZ1wiOiBncmVlbixcclxuICAgICAgICAgICAgXCJiXCI6IGJsdWVcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQmNvbG9yQ29tbWFuZDsiLCJ2YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBCZWdpbnMgY2FudmFzIGNhY2hpbmdcclxuICpcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBCZWdpbmRyYXdDb21tYW5kKCkge31cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuQmVnaW5kcmF3Q29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogXCJzdGFydENhY2hlXCJcclxuICAgIH0pO1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBCZWdpbmRyYXdDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBEcmF3cyBhIGZpbGxlZCBvciBzdHJva2VkIGNpcmNsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqL1xyXG5mdW5jdGlvbiBDaXJjbGVDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgMykgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdDSVJDTEUgY29tbWFuZCByZXF1aXJlcyAzIGFyZ3VtZW50cycpO1xyXG4gICAgdGhpcy54ID0gcGFyc2VkLmFyZ3NbMF07XHJcbiAgICB0aGlzLnkgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMucmFkaXVzID0gcGFyc2VkLmFyZ3NbMl07XHJcbiAgICB0aGlzLnN0cm9rZSA9IHBhcnNlZC5hcmdzLmxlbmd0aCA+IDMgPyBwYXJzZWQuYXJnc1szXSA6IGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5DaXJjbGVDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGFyZ3MgPSBbdGhpcy54LCB0aGlzLnksIHRoaXMucmFkaXVzXTtcclxuICAgIGlmICh0aGlzLnN0cm9rZSkgYXJncy5wdXNoKHRoaXMuc3Ryb2tlKTtcclxuICAgIHJldHVybiBhcmdzLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5DaXJjbGVDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgeDogdGhpcy54LnRvSlNPTigpLFxyXG4gICAgICAgIHk6IHRoaXMueS50b0pTT04oKSxcclxuICAgICAgICByYWRpdXM6IHRoaXMucmFkaXVzLnRvSlNPTigpLFxyXG4gICAgICAgIHN0cm9rZTogdGhpcy5zdHJva2UgPyB0aGlzLnN0cm9rZS50b0pTT04oKSA6IGZhbHNlXHJcbiAgICB9O1xyXG59O1xyXG5cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuQ2lyY2xlQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciB4ID0gdGhpcy54LmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeSA9IHRoaXMueS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHJhZGl1cyA9IHRoaXMucmFkaXVzLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgc3Ryb2tlID0gdGhpcy5zdHJva2UgPyB0aGlzLnN0cm9rZS5leGVjdXRlKGRhdGEpIDogMDtcclxuXHJcbiAgICBkYXRhLnZhbGlkYXRlKHgsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoeSwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShyYWRpdXMsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoc3Ryb2tlLCAnbnVtYmVyJyk7XHJcblxyXG4gICAgY3R4LndyaXRlKHtcclxuICAgICAgICBjb21tYW5kOiBcImNpcmNsZVwiLFxyXG4gICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgeDogeCxcclxuICAgICAgICAgICAgeTogeSxcclxuICAgICAgICAgICAgcmFkaXVzOiByYWRpdXMsXHJcbiAgICAgICAgICAgIHN0cm9rZTogc3Ryb2tlXHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBDaXJjbGVDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgZmlsZXN5c3RlbSA9IHJlcXVpcmUoJy4uLy4uL2ZpbGVzeXN0ZW0nKTtcclxuXHJcbi8qKlxyXG4gKiBDbG9zZXMgYSBmaWxlIGluIGEgcG9pbnRlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluZVxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIENsb3NlQ29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KGFyZ3MsIGRlZmluZSk7XHJcbiAgICBpZiAoIShwYXJzZWQuY2hpbGQgaW5zdGFuY2VvZiBzdGF0ZW1lbnRzLlBvaW50ZXJTdGF0ZW1lbnQpKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0V4cGVjdGVkIHBvaW50ZXInKTtcclxuXHJcbiAgICB0aGlzLnBvaW50ZXIgPSBwYXJzZWQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkNsb3NlQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLnBvaW50ZXIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5DbG9zZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBwb2ludGVyOiB0aGlzLnBvaW50ZXIudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkNsb3NlQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciBmaWxlID0gdGhpcy5wb2ludGVyLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgZmlsZXN5c3RlbS5GaWxlKSkgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBmaWxlJyk7XHJcbiAgICBkYXRhLnNldFBvaW50ZXIodGhpcy5wb2ludGVyLmNoaWxkLCBmYWxzZSk7XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBDbG9zZUNvbW1hbmQ7IiwidmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogQ2xlYXJzIHRoZSBzY3JlZW5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKi9cclxuZnVuY3Rpb24gQ2xzQ29tbWFuZChhcmdzKSB7XHJcbiAgICB2YXIgbG93ZXJBcmdzID0gYXJncy50b0xvd2VyQ2FzZSgpO1xyXG4gICAgdGhpcy50dHkgPSBsb3dlckFyZ3MgIT09ICdnZngnO1xyXG4gICAgdGhpcy5nZnggPSBsb3dlckFyZ3MgIT09ICd0dHknO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5DbHNDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYgKHRoaXMudHR5ICYmICF0aGlzLmdmeCkgcmV0dXJuICdUVFknO1xyXG4gICAgaWYgKHRoaXMuZ2Z4ICYmICF0aGlzLnR0eSkgcmV0dXJuICdHRlgnO1xyXG4gICAgcmV0dXJuICcnO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkNsc0NvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0dHk6IHRoaXMudHR5LFxyXG4gICAgICAgIGdmeDogdGhpcy5nZnhcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkNsc0NvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICBpZiAodGhpcy50dHkpIHtcclxuICAgICAgICBpZiAocHJvY2Vzcy5icm93c2VyKSB7XHJcbiAgICAgICAgICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgICAgICAgICBjb21tYW5kOiBcImNsZWFyXCIsXHJcbiAgICAgICAgICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJ0dHlcIlxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9IGVsc2UgY29uc29sZS5sb2coKG5ldyBBcnJheShwcm9jZXNzLnN0ZG91dC5yb3dzICsgMSkpLmpvaW4oXCJcXG5cIikpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuZ2Z4ICYmIHByb2Nlc3MuYnJvd3Nlcikge1xyXG4gICAgICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgICAgIGNvbW1hbmQ6IFwiY2xlYXJcIixcclxuICAgICAgICAgICAgYXJnczoge1xyXG4gICAgICAgICAgICAgICAgdHlwZTogXCJnZnhcIlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBDbHNDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIHRoZSBkcmF3IGNvbG9yIG9mIHRoZSBjYW52YXNcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIENvbG9yQ29tbWFuZChhcmdzKSB7XHJcbiAgICB2YXIgcGFyc2VkID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJncyk7XHJcblxyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA8IDMpIHRocm93IG5ldyBTeW50YXhFcnJvcignQ09MT1IgY29tbWFuZCByZXF1aXJlcyAzIGFyZ3VtZW50cycpO1xyXG4gICAgdGhpcy5yZWQgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMuZ3JlZW4gPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMuYmx1ZSA9IHBhcnNlZC5hcmdzWzJdO1xyXG4gICAgdGhpcy5hbHBoYSA9IHBhcnNlZC5hcmdzLmxlbmd0aCA+IDMgPyBwYXJzZWQuYXJnc1szXSA6IGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Db2xvckNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFt0aGlzLnJlZCwgdGhpcy5ncmVlbiwgdGhpcy5ibHVlXTtcclxuICAgIGlmICh0aGlzLmFscGhhKSBhcmdzLnB1c2godGhpcy5hbHBoYSk7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuQ29sb3JDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcjogdGhpcy5yZWQudG9KU09OKCksXHJcbiAgICAgICAgZzogdGhpcy5ncmVlbi50b0pTT04oKSxcclxuICAgICAgICBiOiB0aGlzLmJsdWUudG9KU09OKCksXHJcbiAgICAgICAgYTogdGhpcy5hbHBoYSA/IHRoaXMuYWxwaGEudG9KU09OKCkgOiBmYWxzZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuQ29sb3JDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHJlZCA9IHRoaXMucmVkLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgZ3JlZW4gPSB0aGlzLmdyZWVuLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgYmx1ZSA9IHRoaXMuYmx1ZS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIGFscGhhID0gdGhpcy5hbHBoYSA/IHRoaXMuYWxwaGEuZXhlY3V0ZShkYXRhKSA6IGZhbHNlO1xyXG5cclxuICAgIGRhdGEudmFsaWRhdGUocmVkLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKGdyZWVuLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKGJsdWUsICdudW1iZXInKTtcclxuICAgIGlmIChhbHBoYSAhPT0gZmFsc2UpIGRhdGEudmFsaWRhdGUoYWxwaGEsICdudW1iZXInKTtcclxuICAgIGVsc2UgYWxwaGEgPSBkYXRhLmNvbnN0YW50c1snQ29sb3JBJ107XHJcblxyXG4gICAgdmFyIG9sZFJlZCA9IHJlZCwgb2xkR3JlZW4gPSBncmVlbiwgb2xkQmx1ZSA9IGJsdWUsIG9sZEFscGhhID0gYWxwaGE7XHJcblxyXG4gICAgaWYgKHJlZCA+IDEpIHJlZCAvPSAyNTU7XHJcbiAgICBpZiAoZ3JlZW4gPiAxKSBncmVlbiAvPSAyNTU7XHJcbiAgICBpZiAoYmx1ZSA+IDEpIGJsdWUgLz0gMjU1O1xyXG4gICAgaWYgKGFscGhhID4gMSkgYWxwaGEgLz0gMjU1O1xyXG5cclxuICAgIHJlZCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHJlZCwgMSkpO1xyXG4gICAgZ3JlZW4gPSBNYXRoLm1heCgwLCBNYXRoLm1pbihncmVlbiwgMSkpO1xyXG4gICAgYmx1ZSA9IE1hdGgubWF4KDAsIE1hdGgubWluKGJsdWUsIDEpKTtcclxuICAgIGFscGhhID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oYWxwaGEsIDEpKTtcclxuXHJcbiAgICBkYXRhLnNldENvbnN0YW50KCdDb2xvclInLCBvbGRSZWQpO1xyXG4gICAgZGF0YS5zZXRDb25zdGFudCgnQ29sb3JHJywgb2xkR3JlZW4pO1xyXG4gICAgZGF0YS5zZXRDb25zdGFudCgnQ29sb3JCJywgb2xkQmx1ZSk7XHJcbiAgICBkYXRhLnNldENvbnN0YW50KCdDb2xvckEnLCBvbGRBbHBoYSk7XHJcblxyXG4gICAgY3R4LndyaXRlKHtcclxuICAgICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICBcInJcIjogcmVkLFxyXG4gICAgICAgICAgICBcImdcIjogZ3JlZW4sXHJcbiAgICAgICAgICAgIFwiYlwiOiBibHVlLFxyXG4gICAgICAgICAgICBcImFcIjogYWxwaGFcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQ29sb3JDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG5cclxuLyoqXHJcbiAqIERlY2xhcmVzIG9uZSBvciBtb3JlIGFycmF5c1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gRGltQ29tbWFuZChhcmdzKSB7XHJcbiAgICB2YXIgcGFyc2VkID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJncywge1xyXG4gICAgICAgIHBhcnNlQXJnczogZmFsc2VcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuY3JlYXRlcyA9IFtdO1xyXG5cclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGFyc2VkLmFyZ3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgZGltRGVmID0gcGFyc2VkLmFyZ3NbaV07XHJcbiAgICAgICAgdmFyIHN0YXJ0QnJhY2tldCA9IGRpbURlZi5pbmRleE9mKCcoJyk7XHJcbiAgICAgICAgdmFyIGVuZEJyYWNrZXQgPSBkaW1EZWYuaW5kZXhPZignKScpO1xyXG5cclxuICAgICAgICBpZiAoc3RhcnRCcmFja2V0ID09PSAtMSkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdFeHBlY3RlZCBzdGFydCBicmFja2V0Jyk7XHJcbiAgICAgICAgaWYgKGVuZEJyYWNrZXQgPT09IC0xKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0V4cGVjdGVkIGVuZCBicmFja2V0Jyk7XHJcblxyXG4gICAgICAgIHZhciBhcnJheU5hbWUgPSBkaW1EZWYuc3Vic3RyaW5nKDAsIHN0YXJ0QnJhY2tldCkudHJpbSgpO1xyXG4gICAgICAgIHZhciBhcnJheUxlbmd0aE5hbWUgPSBkaW1EZWYuc3Vic3RyaW5nKHN0YXJ0QnJhY2tldCArIDEsIGVuZEJyYWNrZXQpO1xyXG4gICAgICAgIHZhciBhcnJheUxlbmd0aEFyZyA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFycmF5TGVuZ3RoTmFtZSk7XHJcblxyXG4gICAgICAgIHRoaXMuY3JlYXRlcy5wdXNoKHtcclxuICAgICAgICAgICAgbmFtZTogYXJyYXlOYW1lLFxyXG4gICAgICAgICAgICBsZW5ndGhzOiBhcnJheUxlbmd0aEFyZy5hcmdzXHJcbiAgICAgICAgfSlcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuRGltQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBjcmVhdGVzID0gW107XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY3JlYXRlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBjcmVhdGUgPSB0aGlzLmNyZWF0ZXNbaV07XHJcbiAgICAgICAgY3JlYXRlcy5wdXNoKGNyZWF0ZS5uYW1lICsgJygnICsgY3JlYXRlLmxlbmd0aHMuam9pbignLCAnKSArICcpJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gY3JlYXRlcy5qb2luKCcsICcpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkRpbUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGNyZWF0ZXMgPSBbXTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jcmVhdGVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGxlbmd0aHMgPSBbXSwgY3JlYXRlID0gdGhpcy5jcmVhdGVzW2ldO1xyXG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgY3JlYXRlLmxlbmd0aHMubGVuZ3RoOyB4KyspIHtcclxuICAgICAgICAgICAgbGVuZ3Rocy5wdXNoKGNyZWF0ZS5sZW5ndGhzW3hdLnRvSlNPTigpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNyZWF0ZXMucHVzaCh7XHJcbiAgICAgICAgICAgIG5hbWU6IGNyZWF0ZS5uYW1lLnRvSlNPTigpLFxyXG4gICAgICAgICAgICBsZW5ndGhzOiBsZW5ndGhzXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBjcmVhdGVzOiBjcmVhdGVzXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5EaW1Db21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNyZWF0ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgZGltRGVmID0gdGhpcy5jcmVhdGVzW2ldO1xyXG5cclxuICAgICAgICB2YXIgbGVuZ3RocyA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgZGltRGVmLmxlbmd0aHMubGVuZ3RoOyB4KyspIHtcclxuICAgICAgICAgICAgdmFyIGxlbmd0aCA9IGRpbURlZi5sZW5ndGhzW3hdLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICAgICAgICAgIGRhdGEudmFsaWRhdGUobGVuZ3RoLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGxlbmd0aHMucHVzaChsZW5ndGgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZGF0YS5kZWZpbmVBcnJheShkaW1EZWYubmFtZSwgbGVuZ3Rocyk7XHJcbiAgICB9XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IERpbUNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIERyYXdzIGEgc3ByaXRlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBEcmF3c3ByaXRlQ29tbWFuZChhcmdzKSB7XHJcbiAgICB2YXIgcGFyc2VkID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJncyk7XHJcblxyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA8IDMpIHRocm93IG5ldyBTeW50YXhFcnJvcignRFJBV1NQUklURSBjb21tYW5kIHJlcXVpcmVzIDMgYXJndW1lbnRzJyk7XHJcbiAgICB0aGlzLmlkID0gcGFyc2VkLmFyZ3NbMF07XHJcbiAgICB0aGlzLnggPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMueSA9IHBhcnNlZC5hcmdzWzJdO1xyXG4gICAgdGhpcy5zY2FsZSA9IHBhcnNlZC5hcmdzLmxlbmd0aCA9PT0gNCA/IHBhcnNlZC5hcmdzWzNdIDogZmFsc2U7XHJcbiAgICB0aGlzLnJvdGF0aW9uID0gcGFyc2VkLmFyZ3MubGVuZ3RoID09PSA1ID8gcGFyc2VkLmFyZ3NbNF0gOiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuRHJhd3Nwcml0ZUNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFt0aGlzLmlkLCB0aGlzLngsIHRoaXMueV07XHJcbiAgICBpZiAodGhpcy5zY2FsZSkgYXJncy5wdXNoKHRoaXMuc2NhbGUpO1xyXG4gICAgaWYgKHRoaXMucm90YXRpb24pIGFyZ3MucHVzaCh0aGlzLnJvdGF0aW9uKTtcclxuICAgIHJldHVybiBhcmdzLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5EcmF3c3ByaXRlQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGlkOiB0aGlzLmlkLnRvSlNPTigpLFxyXG4gICAgICAgIHg6IHRoaXMueC50b0pTT04oKSxcclxuICAgICAgICB5OiB0aGlzLnkudG9KU09OKCksXHJcbiAgICAgICAgc2NhbGU6IHRoaXMuc2NhbGUgPyB0aGlzLnNjYWxlLnRvSlNPTigpIDogZmFsc2UsXHJcbiAgICAgICAgcm90YXRpb246IHRoaXMucm90YXRpb24gPyB0aGlzLnJvdGF0aW9uLnRvSlNPTigpIDogZmFsc2VcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkRyYXdzcHJpdGVDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIGlkID0gdGhpcy5pZC5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHggPSB0aGlzLnguZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciB5ID0gdGhpcy55LmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgc2NhbGUgPSB0aGlzLnNjYWxlID8gdGhpcy5zY2FsZS5leGVjdXRlKGRhdGEpIDogMTtcclxuICAgIHZhciByb3RhdGlvbiA9IHRoaXMucm90YXRpb24gPyB0aGlzLnJvdGF0aW9uLmV4ZWN1dGUoZGF0YSkgOiAwO1xyXG5cclxuICAgIGRhdGEudmFsaWRhdGUoaWQsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoeCwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5LCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHNjYWxlLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHJvdGF0aW9uLCAnbnVtYmVyJyk7XHJcblxyXG4gICAgaWYgKCFkYXRhLnByaXZhdGUuc3ByaXRlc1tpZF0pIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzcHJpdGUgSUQnKTtcclxuICAgIHZhciBpbWcgPSBkYXRhLnByaXZhdGUuc3ByaXRlc1tpZF07XHJcblxyXG4gICAgY3R4LnByaW50KHtcclxuICAgICAgICBjb21tYW5kOiAnc3ByaXRlJyxcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIHg6IHgsXHJcbiAgICAgICAgICAgIHk6IHksXHJcbiAgICAgICAgICAgIHNjYWxlOiBzY2FsZSxcclxuICAgICAgICAgICAgcm90YXRpb246IHJvdGF0aW9uLFxyXG4gICAgICAgICAgICBzcHJpdGU6IGltZ1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRHJhd3Nwcml0ZUNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIERyYXdzIHRleHQgZWl0aGVyIGF0IGEgcG9pbnQgb3IgaW5zaWRlIGEgcmVjdGFuZ2xlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIERyYXd0ZXh0Q29tbWFuZChhcmdzKSB7XHJcbiAgICB2YXIgcGFyc2VkID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJncyk7XHJcblxyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA8IDMpIHRocm93IG5ldyBTeW50YXhFcnJvcignRFJBV1RFWFQgY29tbWFuZCByZXF1aXJlcyAzIGFyZ3VtZW50cycpO1xyXG4gICAgZWxzZSBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoID4gMyAmJiBwYXJzZWQuYXJncy5sZW5ndGggPCA1KSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0RSQVdURVhUIGNvbW1hbmQgcmVxdWlyZXMgNSBhcmd1bWVudHMnKTtcclxuXHJcbiAgICB0aGlzLnRleHQgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueDEgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMueTEgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPiAzKSB7XHJcbiAgICAgICAgdGhpcy54MiA9IHBhcnNlZC5hcmdzWzNdO1xyXG4gICAgICAgIHRoaXMueTIgPSBwYXJzZWQuYXJnc1s0XTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy54MiA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMueTIgPSBmYWxzZTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuRHJhd3RleHRDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGFyZ3MgPSBbdGhpcy50ZXh0LCB0aGlzLngxLCB0aGlzLnkxXTtcclxuICAgIGlmICh0aGlzLngyKSBhcmdzLnB1c2godGhpcy54MiwgdGhpcy55Mik7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuRHJhd3RleHRDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdGV4dDogdGhpcy50ZXh0LnRvSlNPTigpLFxyXG4gICAgICAgIHgxOiB0aGlzLngxLnRvSlNPTigpLFxyXG4gICAgICAgIHkxOiB0aGlzLnkxLnRvSlNPTigpLFxyXG4gICAgICAgIHgyOiB0aGlzLngyID8gdGhpcy54Mi50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIHkyOiB0aGlzLnkyID8gdGhpcy55Mi50b0pTT04oKSA6IGZhbHNlXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5EcmF3dGV4dENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgdGV4dCA9IHRoaXMudGV4dC5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHgxID0gdGhpcy54MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkxID0gdGhpcy55MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh0ZXh0LCAnc3RyaW5nJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHgxLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHkxLCAnbnVtYmVyJyk7XHJcblxyXG4gICAgdmFyIHgyLCB5MiA9IGZhbHNlO1xyXG4gICAgaWYgKHRoaXMueDIpIHtcclxuICAgICAgICB4MiA9IHRoaXMueDIuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICB5MiA9IHRoaXMueTIuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKHgyLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZSh5MiwgJ251bWJlcicpO1xyXG4gICAgfVxyXG5cclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogXCJ0ZXh0XCIsXHJcbiAgICAgICAgYXJnczoge1xyXG4gICAgICAgICAgICB0ZXh0OiB0ZXh0LFxyXG4gICAgICAgICAgICB4MTogeDEsXHJcbiAgICAgICAgICAgIHkxOiB5MSxcclxuICAgICAgICAgICAgeDI6IHgyLFxyXG4gICAgICAgICAgICB5MjogeTJcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IERyYXd0ZXh0Q29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogRHJhd3MgYSBmaWxsZWQgb3Igc3Ryb2tlZCBlbGxpcHNlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIEVsbGlwc2VDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgNCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdFTExJUFNFIGNvbW1hbmQgcmVxdWlyZXMgNCBhcmd1bWVudHMnKTtcclxuICAgIHRoaXMueDEgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueTEgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMueDIgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIHRoaXMueTIgPSBwYXJzZWQuYXJnc1szXTtcclxuICAgIHRoaXMuc3Ryb2tlID0gcGFyc2VkLmFyZ3MubGVuZ3RoID4gNCA/IHBhcnNlZC5hcmdzWzRdIDogZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkVsbGlwc2VDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGFyZ3MgPSBbdGhpcy54MSwgdGhpcy55MSwgdGhpcy54MiwgdGhpcy55Ml07XHJcbiAgICBpZiAodGhpcy5zdHJva2UpIGFyZ3MucHVzaCh0aGlzLnN0cm9rZSk7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuRWxsaXBzZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4MSA6IHRoaXMueDEudG9KU09OKCksXHJcbiAgICAgICAgeTE6IHRoaXMueTEudG9KU09OKCksXHJcbiAgICAgICAgeDI6IHRoaXMueDIudG9KU09OKCksXHJcbiAgICAgICAgeTI6IHRoaXMueTIudG9KU09OKCksXHJcbiAgICAgICAgc3Ryb2tlOiB0aGlzLnN0cm9rZSA/IHRoaXMuc3Ryb2tlLnRvSlNPTigpIDogZmFsc2VcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkVsbGlwc2VDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHgxID0gdGhpcy54MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkxID0gdGhpcy55MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHgyID0gdGhpcy54Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkyID0gdGhpcy55Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHN0cm9rZSA9IHRoaXMuc3Ryb2tlID8gdGhpcy5zdHJva2UuZXhlY3V0ZShkYXRhKSA6IDA7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZSh4MSwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5MSwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh4MiwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5MiwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShzdHJva2UsICdudW1iZXInKTtcclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6IFwiZWxsaXBzZVwiLFxyXG4gICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgeDE6IHgxLFxyXG4gICAgICAgICAgICB5MTogeTEsXHJcbiAgICAgICAgICAgIHgyOiB4MixcclxuICAgICAgICAgICAgeTI6IHkyLFxyXG4gICAgICAgICAgICBzdHJva2U6IHN0cm9rZVxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRWxsaXBzZUNvbW1hbmQ7IiwiLyoqXHJcbiAqIFNraXBzIHRvIHRoZSBuZXh0IG1hdGNoaW5nIEVORElGIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBkZWZpbmVcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBFbHNlQ29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIHRoaXMuYmxvY2sgPSBkZWZpbmU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5FbHNlQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGJsb2NrOiB0aGlzLmJsb2NrLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5FbHNlQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciByZWZzID0gdGhpcy5ibG9jay5yZWZlcmVuY2VzKCk7XHJcbiAgICBpZiAoIXJlZnMubGVuZ3RoKSB0aHJvdyBuZXcgRXJyb3IoJ0VMU0Ugd2l0aG91dCBJRicpO1xyXG5cclxuICAgIGRhdGEuY3Vyc29yID0gcmVmc1swXS5lbmQ7XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEVsc2VDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG5cclxuLyoqXHJcbiAqIFRlcm1pbmF0ZXMgdGhlIHByb2dyYW1cclxuICpcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBFbmRDb21tYW5kKCkge31cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuRW5kQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIGRhdGEudGVybWluYXRlKCk7XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEVuZENvbW1hbmQ7IiwidmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogQmVnaW5zIGNhbnZhcyBjYWNoaW5nXHJcbiAqXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gRW5kZHJhd0NvbW1hbmQoKSB7fVxyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5FbmRkcmF3Q29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogXCJmbHVzaENhY2hlXCJcclxuICAgIH0pO1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBFbmRkcmF3Q29tbWFuZDsiLCIvKipcclxuICogRW5kIG9mIGFuIElGIGJsb2NrXHJcbiAqXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gRW5kaWZDb21tYW5kKCkge31cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuRW5kaWZDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBFbmRpZkNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciB1dGlsID0gcmVxdWlyZSgnLi4vLi4vdXRpbCcpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgc2V0SW1tZWRpYXRlID0gdXRpbC5zZXRJbW1lZGlhdGU7XHJcblxyXG4vKipcclxuICogSXRlcmF0ZXMgb3ZlciB0aGUgYm9keSBhIGNlcnRhaW4gYW1vdW50IG9mIHRpbWVzXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5lXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gRm9yQ29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIHZhciBsb3dlckFyZ3MgPSBhcmdzLnRvTG93ZXJDYXNlKCk7XHJcbiAgICB2YXIgdG9JbmRleCA9IGxvd2VyQXJncy5pbmRleE9mKCcgdG8gJyk7XHJcbiAgICBpZiAodG9JbmRleCA9PT0gLTEpIHRocm93IG5ldyBTeW50YXhFcnJvcignRk9SIGhhcyBubyBUTycpO1xyXG4gICAgdmFyIGFzc2lnbm1lbnRUZXh0ID0gYXJncy5zdWJzdHJpbmcoMCwgdG9JbmRleCkudHJpbSgpO1xyXG5cclxuICAgIHZhciBzdGVwSW5kZXggPSBsb3dlckFyZ3MuaW5kZXhPZignIHN0ZXAgJyk7XHJcbiAgICB2YXIgdXBwZXJMaW1pdFRleHQsIHN0ZXBUZXh0O1xyXG4gICAgaWYgKHN0ZXBJbmRleCA9PT0gLTEpIHtcclxuICAgICAgICB1cHBlckxpbWl0VGV4dCA9IGFyZ3Muc3Vic3RyaW5nKHRvSW5kZXggKyA0KS50cmltKCk7XHJcbiAgICAgICAgc3RlcFRleHQgPSAnMSc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHVwcGVyTGltaXRUZXh0ID0gYXJncy5zdWJzdHJpbmcodG9JbmRleCArIDQsIHN0ZXBJbmRleCkudHJpbSgpO1xyXG4gICAgICAgIHN0ZXBUZXh0ID0gYXJncy5zdWJzdHJpbmcoc3RlcEluZGV4ICsgNikudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBhc3NpZ25tZW50RXF1YWxzID0gYXNzaWdubWVudFRleHQuaW5kZXhPZignPScpO1xyXG4gICAgaWYgKGFzc2lnbm1lbnRFcXVhbHMgPT09IC0xKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0V4cGVjdGVkIGFzc2lnbm1lbnQnKTtcclxuICAgIHZhciB2YXJpYWJsZU5hbWUgPSBhc3NpZ25tZW50VGV4dC5zdWJzdHJpbmcoMCwgYXNzaWdubWVudEVxdWFscykudHJpbSgpO1xyXG4gICAgdmFyIGVxdWFsc0V4cHJlc3Npb24gPSBhc3NpZ25tZW50VGV4dC5zdWJzdHJpbmcoYXNzaWdubWVudEVxdWFscyArIDEpLnRyaW0oKTtcclxuICAgIHZhciBhc3NpZ25tZW50RXhwciA9IG5ldyBzdGF0ZW1lbnRzLkFzc2lnbm1lbnRTdGF0ZW1lbnQoXHJcbiAgICAgICAgICAgIG5ldyBzdGF0ZW1lbnRzLlZhcmlhYmxlU3RhdGVtZW50KHZhcmlhYmxlTmFtZSksXHJcbiAgICAgICAgICAgIG5ldyBzdGF0ZW1lbnRzLkV4cHJlc3Npb25TdGF0ZW1lbnQoZXF1YWxzRXhwcmVzc2lvbiwgZGVmaW5lKVxyXG4gICAgKTtcclxuXHJcbiAgICB2YXIgdXBwZXJMaW1pdEV4cHIgPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KHVwcGVyTGltaXRUZXh0LCBkZWZpbmUpO1xyXG4gICAgaWYgKHVwcGVyTGltaXRFeHByLmVycm9yKSB0aHJvdyB1cHBlckxpbWl0RXhwci5lcnJvcjtcclxuXHJcbiAgICB2YXIgc3RlcEV4cHIgPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KHN0ZXBUZXh0LCBkZWZpbmUpO1xyXG4gICAgaWYgKHN0ZXBFeHByLmVycm9yKSB0aHJvdyBzdGVwRXhwci5lcnJvcjtcclxuXHJcbiAgICB0aGlzLmFzc2lnbm1lbnRFeHByID0gYXNzaWdubWVudEV4cHI7XHJcbiAgICB0aGlzLnVwcGVyTGltaXRFeHByID0gdXBwZXJMaW1pdEV4cHI7XHJcbiAgICB0aGlzLnN0ZXBFeHByID0gc3RlcEV4cHI7XHJcblxyXG4gICAgdGhpcy5ibG9jayA9IGRlZmluZSh7XHJcbiAgICAgICAgc3RhcnQ6ICdGT1InLFxyXG4gICAgICAgIGVuZDogJ05FWFQnXHJcbiAgICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuRm9yQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmFzc2lnbm1lbnRFeHByLnRvU3RyaW5nKCkgKyAnIFRPICcgKyB0aGlzLnVwcGVyTGltaXRFeHByLnRvU3RyaW5nKCkgKyAnIFNURVAgJyArIHRoaXMuc3RlcEV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5Gb3JDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgYXNzaWdubWVudDogdGhpcy5hc3NpZ25tZW50RXhwci50b0pTT04oKSxcclxuICAgICAgICB1cHBlckxpbWl0OiB0aGlzLnVwcGVyTGltaXRFeHByLnRvSlNPTigpLFxyXG4gICAgICAgIHN0ZXA6IHRoaXMuc3RlcEV4cHIudG9KU09OKCksXHJcbiAgICAgICAgYmxvY2s6IHRoaXMuYmxvY2sudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkZvckNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgdHJhY2tWYWx1ZTtcclxuXHJcbiAgICBpZiAoIXRoaXMuaGFzUnVuKSB7XHJcbiAgICAgICAgdGhpcy5oYXNSdW4gPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuYXNzaWdubWVudEV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICB0aGlzLnRyYWNrVmFyID0gdGhpcy5hc3NpZ25tZW50RXhwci52YXJpYWJsZTtcclxuICAgICAgICB0cmFja1ZhbHVlID0gZGF0YS5nZXRWYXJpYWJsZSh0aGlzLnRyYWNrVmFyKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIGluY3JlbWVudCA9IHRoaXMuc3RlcEV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKGluY3JlbWVudCwgJ251bWJlcicpO1xyXG4gICAgICAgIHRyYWNrVmFsdWUgPSBkYXRhLmdldFZhcmlhYmxlKHRoaXMudHJhY2tWYXIpO1xyXG4gICAgICAgIGRhdGEudmFsaWRhdGUodHJhY2tWYWx1ZSwgJ251bWJlcicpO1xyXG4gICAgICAgIHRyYWNrVmFsdWUgKz0gaW5jcmVtZW50O1xyXG4gICAgICAgIGRhdGEuc2V0VmFyaWFibGUodGhpcy50cmFja1ZhciwgdHJhY2tWYWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIG1heFZhbHVlID0gdGhpcy51cHBlckxpbWl0RXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShtYXhWYWx1ZSwgJ251bWJlcicpO1xyXG4gICAgaWYgKChtYXhWYWx1ZSA+IDAgJiYgdHJhY2tWYWx1ZSA+IG1heFZhbHVlKSB8fCAobWF4VmFsdWUgPCAwICYmIHRyYWNrVmFsdWUgPCBtYXhWYWx1ZSkpIHtcclxuICAgICAgICB0aGlzLmhhc1J1biA9IGZhbHNlO1xyXG4gICAgICAgIGRhdGEuY3Vyc29yID0gdGhpcy5ibG9jay5lbmQgKyAxO1xyXG4gICAgfVxyXG5cclxuICAgIHNldEltbWVkaWF0ZShuZXh0KTtcclxuICAgIC8vbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBGb3JDb21tYW5kOyIsInZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciB1dGlsID0gcmVxdWlyZSgnLi4vLi4vdXRpbCcpO1xyXG52YXIgc2V0SW1tZWRpYXRlID0gdXRpbC5zZXRJbW1lZGlhdGU7XHJcblxyXG4vKipcclxuICogR29lcyB0byBhIGxhYmVsIGFuZCByZXR1cm5zIG9uIFJFVFVSTlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyB0aGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gR29zdWJDb21tYW5kKGFyZ3MpIHtcclxuICAgIGlmICghYXJncy5sZW5ndGgpIHRocm93IG5ldyBTeW50YXhFcnJvcignTGFiZWwgcmVxdWlyZWQnKTtcclxuICAgIHRoaXMubGFiZWwgPSBhcmdzO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Hb3N1YkNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sYWJlbDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5Hb3N1YkNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBsYWJlbDogdGhpcy5sYWJlbFxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuR29zdWJDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgZGF0YS5nb3N1YkxhYmVsKHRoaXMubGFiZWwpO1xyXG4gICAgc2V0SW1tZWRpYXRlKG5leHQpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBHb3N1YkNvbW1hbmQ7IiwidmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIHV0aWwgPSByZXF1aXJlKCcuLi8uLi91dGlsJyk7XHJcbnZhciBzZXRJbW1lZGlhdGUgPSB1dGlsLnNldEltbWVkaWF0ZTtcclxuXHJcbi8qKlxyXG4gKiBHb2VzIHRvIGEgbGFiZWxcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIEdvdG9Db21tYW5kKGFyZ3MpIHtcclxuICAgIGlmICghYXJncy5sZW5ndGgpIHRocm93IG5ldyBTeW50YXhFcnJvcignTGFiZWwgcmVxdWlyZWQnKTtcclxuICAgIHRoaXMubGFiZWwgPSBhcmdzO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Hb3RvQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmxhYmVsO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkdvdG9Db21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgbGFiZWw6IHRoaXMubGFiZWxcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkdvdG9Db21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgZGF0YS5nb3RvTGFiZWwodGhpcy5sYWJlbCk7XHJcbiAgICBzZXRJbW1lZGlhdGUobmV4dCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEdvdG9Db21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4uLy4uL3V0aWwnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBib2R5IGlmIHRoZSBjb25kaXRpb24gaXMgdHJ1ZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluZVxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIElmQ29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIGlmICh1dGlsLmVuZHNXaXRoKGFyZ3MudG9Mb3dlckNhc2UoKSwgJyB0aGVuJykpIGFyZ3MgPSBhcmdzLnNsaWNlKDAsIGFyZ3MubGVuZ3RoIC0gNSkudHJpbSgpO1xyXG4gICAgZWxzZSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0lGIGhhcyBubyBUSEVOJyk7XHJcblxyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MsIHtcclxuICAgICAgICBzZXBhcmF0b3I6IGZhbHNlXHJcbiAgICB9LCBkZWZpbmUpO1xyXG5cclxuICAgIHRoaXMuY29uZGl0aW9uID0gcGFyc2VkLmFyZ3NbMF07XHJcbiAgICB0aGlzLmJsb2NrID0gZGVmaW5lKHtcclxuICAgICAgICBzdGFydDogJ0lGJyxcclxuICAgICAgICB0aGVuOiAnRUxTRScsXHJcbiAgICAgICAgZW5kOiAnRU5ESUYnXHJcbiAgICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuSWZDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuY29uZGl0aW9uLnRvU3RyaW5nKCkgKyBcIiBUSEVOXCI7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuSWZDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgY29uZGl0aW9uOiB0aGlzLmNvbmRpdGlvbi50b0pTT04oKSxcclxuICAgICAgICBibG9jazogdGhpcy5ibG9jay50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuSWZDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHNob3VsZFJ1biA9IHRoaXMuY29uZGl0aW9uLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBpZiAoIXNob3VsZFJ1bikge1xyXG4gICAgICAgIGlmICh0aGlzLmJsb2NrLmhhcygnRUxTRScpKSBkYXRhLmN1cnNvciA9IHRoaXMuYmxvY2submV4dCgnRUxTRScpICsgMTtcclxuICAgICAgICBlbHNlIGRhdGEuY3Vyc29yID0gdGhpcy5ibG9jay5lbmQ7XHJcbiAgICB9XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IElmQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGZpbGVzeXN0ZW0gPSByZXF1aXJlKCcuLi8uLi9maWxlc3lzdGVtJyk7XHJcbnZhciBybCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0RGVmYXVsdCgpO1xyXG5cclxuLyoqXHJcbiAqIElucHV0cyBhIGxpbmUgZnJvbSB0aGUgdXNlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gSW5wdXRDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuICAgIGlmICghcGFyc2VkLmFyZ3MubGVuZ3RoKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0lOUFVUIHJlcXVpcmVzIGF0IGxlYXN0IG9uZSBhcmd1bWVudCcpO1xyXG5cclxuICAgIHZhciBxdWVzdGlvbiA9IFwiXCIsIHBsYWNlVmFyLCBmaWxlO1xyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA9PT0gMSkgcGxhY2VWYXIgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIGVsc2Uge1xyXG4gICAgICAgIGlmIChwYXJzZWQuYXJnc1swXS5jaGlsZCBpbnN0YW5jZW9mIHN0YXRlbWVudHMuUG9pbnRlclN0YXRlbWVudCkgZmlsZSA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgICAgIGVsc2UgcXVlc3Rpb24gPSBwYXJzZWQuYXJnc1swXTtcclxuXHJcbiAgICAgICAgcGxhY2VWYXIgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIShwbGFjZVZhci5jaGlsZCBpbnN0YW5jZW9mIHN0YXRlbWVudHMuVmFyaWFibGVTdGF0ZW1lbnQgfHwgcGxhY2VWYXIuY2hpbGQgaW5zdGFuY2VvZiBzdGF0ZW1lbnRzLkZ1bmN0aW9uU3RhdGVtZW50KSlcclxuICAgICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0V4cGVjdGVkIHZhcmlhYmxlJyk7XHJcblxyXG4gICAgdGhpcy5maWxlID0gZmlsZTtcclxuICAgIHRoaXMucXVlc3Rpb24gPSBxdWVzdGlvbjtcclxuICAgIHRoaXMucGxhY2VWYXIgPSBwbGFjZVZhcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuSW5wdXRDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuICAodGhpcy5maWxlID8gdGhpcy5maWxlLnRvU3RyaW5nKCkgKyAnLCAnIDogJycpICtcclxuICAgICAgICAgICAgKHRoaXMucXVlc3Rpb24gPyB0aGlzLnF1ZXN0aW9uLnRvU3RyaW5nKCkgKyAnLCAnIDogJycpICtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZVZhci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbklucHV0Q29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGZpbGU6IHRoaXMuZmlsZSA/IHRoaXMuZmlsZS50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIHF1ZXN0aW9uOiB0aGlzLnF1ZXN0aW9uID8gdGhpcy5xdWVzdGlvbi50b0pTT04oKSA6IGZhbHNlLFxyXG4gICAgICAgIHZhcmlhYmxlOiB0aGlzLnBsYWNlVmFyLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5JbnB1dENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgcGxhY2VWYXIgPSB0aGlzLnBsYWNlVmFyO1xyXG5cclxuICAgIGlmICh0aGlzLmZpbGUpIHtcclxuICAgICAgICB2YXIgZmlsZSA9IHRoaXMuZmlsZS5leGVjdXRlKGRhdGEpO1xyXG4gICAgICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBmaWxlc3lzdGVtLkZpbGUpKSB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIGZpbGUnKTtcclxuXHJcbiAgICAgICAgaWYgKGZpbGUubW9kZSAhPT0gJ2lucHV0JykgdGhyb3cgbmV3IEVycm9yKCdGaWxlIG5vdCByZWFkYWJsZScpO1xyXG5cclxuICAgICAgICB2YXIgdmFsdWUgPSBmaWxlLm5leHRMaW5lKCk7XHJcbiAgICAgICAgaWYgKGZpbGUuZW9mICYmIHBsYWNlVmFyLmNoaWxkLnR5cGUgPT09IFwibnVtYmVyXCIpIHZhbHVlID0gMDtcclxuXHJcbiAgICAgICAgZGF0YS5zZXRWYXJpYWJsZShwbGFjZVZhci5jaGlsZCwgdmFsdWUpO1xyXG4gICAgICAgIGRhdGEuc2V0Q29uc3RhbnQoJ0VPRicsIGZpbGUuZW9mID8gMSA6IDApO1xyXG4gICAgICAgIG5leHQoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIHF1ZXN0aW9uID0gdGhpcy5xdWVzdGlvbiA/IHRoaXMucXVlc3Rpb24uZXhlY3V0ZShkYXRhKSA6ICcnO1xyXG5cclxuICAgICAgICBybC5xdWVzdGlvbihxdWVzdGlvbiArIFwiPiBcIiwgZnVuY3Rpb24gKGFuc3dlcikge1xyXG4gICAgICAgICAgICBkYXRhLnNldFZhcmlhYmxlKHBsYWNlVmFyLmNoaWxkLCBhbnN3ZXIpO1xyXG4gICAgICAgICAgICBuZXh0KCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IElucHV0Q29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogRHJhd3MgYSBsaW5lXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIExpbmVDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgNCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdMSU5FIGNvbW1hbmQgcmVxdWlyZXMgNCBhcmd1bWVudHMnKTtcclxuICAgIHRoaXMueDEgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueTEgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMueDIgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIHRoaXMueTIgPSBwYXJzZWQuYXJnc1szXTtcclxuICAgIHRoaXMud2lkdGggPSBwYXJzZWQuYXJncy5sZW5ndGggPiA0ID8gcGFyc2VkLmFyZ3NbNF0gOiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuTGluZUNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFt0aGlzLngxLCB0aGlzLnkxLCB0aGlzLngyLCB0aGlzLnkyXTtcclxuICAgIGlmICh0aGlzLndpZHRoKSBhcmdzLnB1c2godGhpcy53aWR0aCk7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuTGluZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4MTogdGhpcy54MS50b0pTT04oKSxcclxuICAgICAgICB5MTogdGhpcy55MS50b0pTT04oKSxcclxuICAgICAgICB4MjogdGhpcy54Mi50b0pTT04oKSxcclxuICAgICAgICB5MjogdGhpcy55Mi50b0pTT04oKSxcclxuICAgICAgICB3aWR0aDogdGhpcy53aWR0aCA/IHRoaXMud2lkdGgudG9KU09OKCkgOiBmYWxzZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuTGluZUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgeDEgPSB0aGlzLngxLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeTEgPSB0aGlzLnkxLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeDIgPSB0aGlzLngyLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeTIgPSB0aGlzLnkyLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgd2lkdGggPSB0aGlzLndpZHRoID8gdGhpcy53aWR0aC5leGVjdXRlKGRhdGEpIDogMTtcclxuXHJcbiAgICBkYXRhLnZhbGlkYXRlKHgxLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHkxLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHgyLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHkyLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHdpZHRoLCAnbnVtYmVyJyk7XHJcblxyXG4gICAgLy9pZiAod2lkdGggPCAxKSB0aHJvdyBuZXcgRXJyb3IoJ1dpZHRoIG91dCBvZiBib3VuZHMnKTtcclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogXCJsaW5lXCIsXHJcbiAgICAgICAgYXJnczoge1xyXG4gICAgICAgICAgICB4MTogeDEsXHJcbiAgICAgICAgICAgIHkxOiB5MSxcclxuICAgICAgICAgICAgeDI6IHgyLFxyXG4gICAgICAgICAgICB5MjogeTIsXHJcbiAgICAgICAgICAgIHdpZHRoOiB3aWR0aFxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTGluZUNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBmaWxlc3lzdGVtID0gcmVxdWlyZSgnLi4vLi4vZmlsZXN5c3RlbScpO1xyXG52YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBMb2FkcyBhIHNwcml0ZSBmcm9tIGEgZmlsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gTG9hZHNwcml0ZUNvbW1hbmQoYXJncykge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MpO1xyXG5cclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPCAyKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0xPQURTUFJJVEUgY29tbWFuZCByZXF1aXJlcyAyIGFyZ3VtZW50cycpO1xyXG4gICAgZWxzZSBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoID4gMiAmJiBwYXJzZWQuYXJncy5sZW5ndGggPCA1KSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0xPQURTUFJJVEUgY29tbWFuZCByZXF1aXJlcyA1IGFyZ3VtZW50cycpO1xyXG5cclxuICAgIHRoaXMuaWQgPSBwYXJzZWQuYXJnc1swXTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoID4gMikge1xyXG4gICAgICAgIHRoaXMueDEgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgICAgICB0aGlzLnkxID0gcGFyc2VkLmFyZ3NbMl07XHJcbiAgICAgICAgdGhpcy54MiA9IHBhcnNlZC5hcmdzWzNdO1xyXG4gICAgICAgIHRoaXMueTIgPSBwYXJzZWQuYXJnc1s0XTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5maWxlTmFtZSA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Mb2Fkc3ByaXRlQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIGlmICh0aGlzLngxKSB7XHJcbiAgICAgICAgdmFyIGFyZ3MgPSBbdGhpcy5pZCwgdGhpcy54MSwgdGhpcy55MSwgdGhpcy54MiwgdGhpcy55Ml07XHJcbiAgICAgICAgcmV0dXJuIGFyZ3Muam9pbihcIiwgXCIpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuaWQgKyBcIiwgXCIgKyB0aGlzLmZpbGVOYW1lO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkxvYWRzcHJpdGVDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgaWQ6IHRoaXMuaWQudG9KU09OKCksXHJcbiAgICAgICAgeDE6IHRoaXMueDEgPyB0aGlzLngxLnRvSlNPTigpIDogZmFsc2UsXHJcbiAgICAgICAgeTE6IHRoaXMueTEgPyB0aGlzLnkxLnRvSlNPTigpIDogZmFsc2UsXHJcbiAgICAgICAgeDI6IHRoaXMueDIgPyB0aGlzLngyLnRvSlNPTigpIDogZmFsc2UsXHJcbiAgICAgICAgeTI6IHRoaXMueTIgPyB0aGlzLnkyLnRvSlNPTigpIDogZmFsc2UsXHJcbiAgICAgICAgZmlsZU5hbWU6IHRoaXMuZmlsZU5hbWUgPyB0aGlzLmZpbGVOYW1lLnRvSlNPTigpIDogZmFsc2VcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbkxvYWRzcHJpdGVDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIGlkID0gdGhpcy5pZC5leGVjdXRlKGRhdGEpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShpZCwgJ251bWJlcicpO1xyXG5cclxuICAgIGlmICh0aGlzLngxKSB7XHJcbiAgICAgICAgdmFyIHgxID0gdGhpcy54MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgICAgIHZhciB5MSA9IHRoaXMueTEuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICB2YXIgeDIgPSB0aGlzLngyLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICAgICAgdmFyIHkyID0gdGhpcy55Mi5leGVjdXRlKGRhdGEpO1xyXG5cclxuICAgICAgICBkYXRhLnZhbGlkYXRlKHgxLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZSh5MSwgJ251bWJlcicpO1xyXG4gICAgICAgIGRhdGEudmFsaWRhdGUoeDIsICdudW1iZXInKTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKHkyLCAnbnVtYmVyJyk7XHJcblxyXG4gICAgICAgIGN0eC5yZWFkKGZ1bmN0aW9uKHJlc3BvbnNlLCBjYW5jZWwpIHtcclxuICAgICAgICAgICAgaWYgKHJlc3BvbnNlLmNvbW1hbmQgIT09ICdjYXB0dXJlJykgcmV0dXJuO1xyXG4gICAgICAgICAgICBjYW5jZWwoKTtcclxuXHJcbiAgICAgICAgICAgIGRhdGEucHJpdmF0ZS5zcHJpdGVzW2lkXSA9IHJlc3BvbnNlLmRhdGE7XHJcbiAgICAgICAgICAgIG5leHQoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgICAgICBjb21tYW5kOiAnY2FwdHVyZScsXHJcbiAgICAgICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgICAgIHgxOiB4MSxcclxuICAgICAgICAgICAgICAgIHkxOiB5MSxcclxuICAgICAgICAgICAgICAgIHgyOiB4MixcclxuICAgICAgICAgICAgICAgIHkyOiB5MlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBmaWxlbmFtZSA9IHRoaXMuZmlsZU5hbWUuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKGZpbGVuYW1lLCAnc3RyaW5nJyk7XHJcblxyXG4gICAgICAgIHZhciBkcml2ZUluZGV4ID0gZmlsZW5hbWUuaW5kZXhPZignOicpO1xyXG4gICAgICAgIHZhciBkcml2ZSA9ICdBJztcclxuICAgICAgICBpZiAoZHJpdmVJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgZHJpdmUgPSBmaWxlbmFtZS5zdWJzdHJpbmcoMCwgZHJpdmVJbmRleCk7XHJcbiAgICAgICAgICAgIGZpbGVuYW1lID0gZmlsZW5hbWUuc3Vic3RyaW5nKGRyaXZlSW5kZXggKyAxKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZpbGVzeXN0ZW0uZHJpdmUoZHJpdmUsIGZ1bmN0aW9uIChmcykge1xyXG4gICAgICAgICAgICB2YXIgZmlsZSA9IGZzLm9wZW4oZmlsZW5hbWUpO1xyXG4gICAgICAgICAgICB2YXIgaW1hZ2VMaW5lID0gZmlsZS5uZXh0TGluZSgpO1xyXG4gICAgICAgICAgICBpZiAoZmlsZS5lb2YgfHwgIWltYWdlTGluZS5sZW5ndGgpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBpbWFnZSBmaWxlJyk7XHJcblxyXG4gICAgICAgICAgICB2YXIgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBpbWFnZUxpbmU7XHJcblxyXG4gICAgICAgICAgICBkYXRhLnByaXZhdGUuc3ByaXRlc1tpZF0gPSBpbWc7XHJcbiAgICAgICAgICAgIG5leHQoKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTG9hZHNwcml0ZUNvbW1hbmQ7IiwidmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogTG9ja3MgdGhlIHNpemUgb2YgdGhlIGNhbnZhc1xyXG4gKi9cclxuZnVuY3Rpb24gTG9ja29yaWVudGF0aW9uQ29tbWFuZCgpIHsgfVxyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5Mb2Nrb3JpZW50YXRpb25Db21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgY3R4LndyaXRlKHtcclxuICAgICAgICBjb21tYW5kOiAnbG9ja3NpemUnXHJcbiAgICB9KTtcclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTG9ja29yaWVudGF0aW9uQ29tbWFuZDsiLCIvKipcclxuICogRW5kIG9mIGEgRk9SIGJsb2NrXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5lXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gTmV4dENvbW1hbmQoYXJncywgZGVmaW5lKSB7XHJcbiAgICB0aGlzLmJsb2NrID0gZGVmaW5lO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuTmV4dENvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBibG9jazogdGhpcy5ibG9jay50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuTmV4dENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgcmVmcyA9IHRoaXMuYmxvY2sucmVmZXJlbmNlcygpO1xyXG4gICAgaWYgKCFyZWZzLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdORVhUIHdpdGhvdXQgRk9SJyk7XHJcblxyXG4gICAgZGF0YS5jdXJzb3IgPSByZWZzWzBdLnN0YXJ0O1xyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBOZXh0Q29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGZpbGVzeXN0ZW0gPSByZXF1aXJlKCcuLi8uLi9maWxlc3lzdGVtJyk7XHJcblxyXG4vKipcclxuICogT3BlbnMgYSBmaWxlIGluIGEgcG9pbnRlclxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluZVxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIE9wZW5Db21tYW5kKGFyZ3MsIGRlZmluZSkge1xyXG4gICAgdmFyIGxvd2VyQXJncyA9IGFyZ3MudG9Mb3dlckNhc2UoKTtcclxuICAgIHZhciBmb3JJbmRleCA9IGxvd2VyQXJncy5pbmRleE9mKCcgZm9yICcpO1xyXG4gICAgaWYgKGZvckluZGV4ID09PSAtMSkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdPUEVOIHdpdGhvdXQgRk9SJyk7XHJcbiAgICB2YXIgZmlsZW5hbWUgPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KGFyZ3Muc3Vic3RyaW5nKDAsIGZvckluZGV4KS50cmltKCksIGRlZmluZSk7XHJcblxyXG4gICAgdmFyIGFzSW5kZXggPSBsb3dlckFyZ3MuaW5kZXhPZignIGFzICcpO1xyXG4gICAgaWYgKGFzSW5kZXggPT09IC0xKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ09QRU4gd2l0aG91dCBBUycpO1xyXG4gICAgdmFyIHR5cGUgPSBhcmdzLnN1YnN0cmluZyhmb3JJbmRleCArIDUsIGFzSW5kZXgpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKHR5cGUgIT09ICdpbnB1dCcgJiYgdHlwZSAhPT0gJ291dHB1dCcgJiYgdHlwZSAhPT0gJ2FwcGVuZCcpIHRocm93IG5ldyBTeW50YXhFcnJvcignSW52YWxpZCBtb2RlJyk7XHJcblxyXG4gICAgdmFyIHBvaW50ZXIgPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KGFyZ3Muc3Vic3RyaW5nKGFzSW5kZXggKyA0KS50cmltKCksIGRlZmluZSk7XHJcbiAgICBpZiAoIShwb2ludGVyLmNoaWxkIGluc3RhbmNlb2Ygc3RhdGVtZW50cy5Qb2ludGVyU3RhdGVtZW50KSkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdFeHBlY3RlZCBwb2ludGVyJyk7XHJcblxyXG4gICAgdGhpcy5maWxlbmFtZSA9IGZpbGVuYW1lO1xyXG4gICAgdGhpcy50eXBlID0gdHlwZTtcclxuICAgIHRoaXMucG9pbnRlciA9IHBvaW50ZXI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbk9wZW5Db21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuZmlsZW5hbWUudG9TdHJpbmcoKSArIFwiIEZPUiBcIiArIHRoaXMudHlwZS50b1VwcGVyQ2FzZSgpICsgXCIgQVMgXCIgKyB0aGlzLnBvaW50ZXIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5PcGVuQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGZpbGVuYW1lOiB0aGlzLmZpbGVuYW1lLnRvSlNPTigpLFxyXG4gICAgICAgIHR5cGU6IHRoaXMudHlwZSxcclxuICAgICAgICBwb2ludGVyOiB0aGlzLnBvaW50ZXIudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcbk9wZW5Db21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIGZpbGVuYW1lID0gdGhpcy5maWxlbmFtZS5leGVjdXRlKGRhdGEpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShmaWxlbmFtZSwgJ3N0cmluZycpO1xyXG5cclxuICAgIHZhciBkcml2ZUluZGV4ID0gZmlsZW5hbWUuaW5kZXhPZignOicpO1xyXG4gICAgdmFyIGRyaXZlID0gJ0EnO1xyXG4gICAgaWYgKGRyaXZlSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgZHJpdmUgPSBmaWxlbmFtZS5zdWJzdHJpbmcoMCwgZHJpdmVJbmRleCk7XHJcbiAgICAgICAgZmlsZW5hbWUgPSBmaWxlbmFtZS5zdWJzdHJpbmcoZHJpdmVJbmRleCArIDEpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBwb2ludGVyID0gdGhpcy5wb2ludGVyLmNoaWxkLCBtb2RlID0gdGhpcy50eXBlO1xyXG4gICAgZmlsZXN5c3RlbS5kcml2ZShkcml2ZSwgZnVuY3Rpb24oZnMpIHtcclxuICAgICAgICB2YXIgZmlsZSA9IGZzLm9wZW4oZmlsZW5hbWUpO1xyXG4gICAgICAgIGZpbGUubW9kZSA9IG1vZGU7XHJcbiAgICAgICAgaWYgKG1vZGUgPT09ICdvdXRwdXQnKSBmaWxlLmNsZWFyKCk7XHJcbiAgICAgICAgZGF0YS5zZXRQb2ludGVyKHBvaW50ZXIsIGZpbGUpO1xyXG4gICAgICAgIG5leHQoKTtcclxuICAgIH0pO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBPcGVuQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIHJsID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXREZWZhdWx0KCk7XHJcblxyXG4vKipcclxuICogUGF1c2VzIGV4ZWN1dGlvbiB1bnRpbCBSRVRVUk4gaXMgcHJlc3NlZFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluZVxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIFBhdXNlQ29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIGlmIChhcmdzLmxlbmd0aCkge1xyXG4gICAgICAgIHRoaXMubWVzc2FnZSA9IG5ldyBzdGF0ZW1lbnRzLkV4cHJlc3Npb25TdGF0ZW1lbnQoYXJncywgZGVmaW5lKTtcclxuICAgICAgICBpZiAodGhpcy5tZXNzYWdlLmVycm9yKSB0aHJvdyB0aGlzLm1lc3NhZ2UuZXJyb3I7XHJcbiAgICB9IGVsc2UgdGhpcy5tZXNzYWdlID0gbmV3IHN0YXRlbWVudHMuU3RyaW5nU3RhdGVtZW50KFwiWzw8IFBhdXNlZCwgUHJlc3MgUkVUVVJOIHRvIENvbnRpbnVlID4+XVwiKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuUGF1c2VDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubWVzc2FnZS50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcblBhdXNlQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIG1lc3NhZ2U6IHRoaXMubWVzc2FnZS50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuUGF1c2VDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIG1lc3NhZ2UgPSB0aGlzLm1lc3NhZ2UuZXhlY3V0ZShkYXRhKTtcclxuICAgIGRhdGEudmFsaWRhdGUobWVzc2FnZSwgJ3N0cmluZycpO1xyXG5cclxuICAgIHJsLnF1ZXN0aW9uKG1lc3NhZ2UsIGZ1bmN0aW9uKGFuc3dlcikge1xyXG4gICAgICAgIG5leHQoKTtcclxuICAgIH0pO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBQYXVzZUNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIERyYXdzIGEgcGllY2hhcnRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKi9cclxuZnVuY3Rpb24gUGllY2hhcnRDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgOCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdQSUVDSEFSVCBjb21tYW5kIHJlcXVpcmVzIDggYXJndW1lbnRzJyk7XHJcbiAgICB0aGlzLnggPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueSA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgdGhpcy5yID0gcGFyc2VkLmFyZ3NbMl07XHJcbiAgICB0aGlzLml0ZW1zTGVuZ3RoID0gcGFyc2VkLmFyZ3NbM107XHJcbiAgICB0aGlzLnBlcmNlbnRhZ2VzID0gcGFyc2VkLmFyZ3NbNF07XHJcbiAgICB0aGlzLml0ZW1zUmVkID0gcGFyc2VkLmFyZ3NbNV07XHJcbiAgICB0aGlzLml0ZW1zR3JlZW4gPSBwYXJzZWQuYXJnc1s2XTtcclxuICAgIHRoaXMuaXRlbXNCbHVlID0gcGFyc2VkLmFyZ3NbN107XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblBpZWNoYXJ0Q29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBhcmdzID0gW3RoaXMueCwgdGhpcy55LCB0aGlzLnIsIHRoaXMuaXRlbXNMZW5ndGgsIHRoaXMucGVyY2VudGFnZXMsIHRoaXMuaXRlbXNSZWQsIHRoaXMuaXRlbXNHcmVlbiwgdGhpcy5pdGVtc0JsdWVdO1xyXG4gICAgcmV0dXJuIGFyZ3Muam9pbihcIiwgXCIpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcblBpZWNoYXJ0Q29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHg6IHRoaXMueC50b0pTT04oKSxcclxuICAgICAgICB5OiB0aGlzLnkudG9KU09OKCksXHJcbiAgICAgICAgcjogdGhpcy5yLnRvSlNPTigpLFxyXG4gICAgICAgIGl0ZW1zTGVuZ3RoOiB0aGlzLml0ZW1zTGVuZ3RoLnRvSlNPTigpLFxyXG4gICAgICAgIHBlcmNlbnRhZ2VzOiB0aGlzLnBlcmNlbnRhZ2VzLnRvSlNPTigpLFxyXG4gICAgICAgIGl0ZW1zUmVkOiB0aGlzLml0ZW1zUmVkLnRvSlNPTigpLFxyXG4gICAgICAgIGl0ZW1zR3JlZW46IHRoaXMuaXRlbXNHcmVlbi50b0pTT04oKSxcclxuICAgICAgICBpdGVtc0JsdWU6IHRoaXMuaXRlbXNCbHVlLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5QaWVjaGFydENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgeCA9IHRoaXMueC5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkgPSB0aGlzLnkuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciByID0gdGhpcy5yLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgaXRlbXNMZW5ndGggPSB0aGlzLml0ZW1zTGVuZ3RoLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgcGVyY2VudGFnZXMgPSB0aGlzLnBlcmNlbnRhZ2VzLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgaXRlbXNSZWQgPSB0aGlzLml0ZW1zUmVkLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgaXRlbXNHcmVlbiA9IHRoaXMuaXRlbXNHcmVlbi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIGl0ZW1zQmx1ZSA9IHRoaXMuaXRlbXNCbHVlLmV4ZWN1dGUoZGF0YSk7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZSh4LCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHksICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUociwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShpdGVtc0xlbmd0aCwgJ251bWJlcicpO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHBlcmNlbnRhZ2VzKSkgdGhyb3cgbmV3IEVycm9yKCdUeXBlcyBtaXNtYXRjaCcpO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zUmVkKSkgdGhyb3cgbmV3IEVycm9yKCdUeXBlcyBtaXNtYXRjaCcpO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zR3JlZW4pKSB0aHJvdyBuZXcgRXJyb3IoJ1R5cGVzIG1pc21hdGNoJyk7XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbXNCbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdUeXBlcyBtaXNtYXRjaCcpO1xyXG5cclxuICAgIGlmIChpdGVtc0xlbmd0aCA+IHBlcmNlbnRhZ2VzLmxlbmd0aCB8fFxyXG4gICAgICAgICAgICBpdGVtc0xlbmd0aCA+IGl0ZW1zUmVkLmxlbmd0aCB8fFxyXG4gICAgICAgICAgICBpdGVtc0xlbmd0aCA+IGl0ZW1zR3JlZW4ubGVuZ3RoIHx8XHJcbiAgICAgICAgICAgIGl0ZW1zTGVuZ3RoID4gaXRlbXNCbHVlLmxlbmd0aCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcnJheSBib3VuZHMnKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgaXRlbXMgPSBbXTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaXRlbXNMZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBzaXplID0gcGVyY2VudGFnZXNbaV07XHJcbiAgICAgICAgdmFyIHJlZCA9IGl0ZW1zUmVkW2ldO1xyXG4gICAgICAgIHZhciBncmVlbiA9IGl0ZW1zR3JlZW5baV07XHJcbiAgICAgICAgdmFyIGJsdWUgPSBpdGVtc0JsdWVbaV07XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZShzaXplLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZShyZWQsICdudW1iZXInKTtcclxuICAgICAgICBkYXRhLnZhbGlkYXRlKGdyZWVuLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZShibHVlLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgaXRlbXMucHVzaCh7XHJcbiAgICAgICAgICAgIHNpemU6IHNpemUsXHJcbiAgICAgICAgICAgIHI6IHJlZCxcclxuICAgICAgICAgICAgZzogZ3JlZW4sXHJcbiAgICAgICAgICAgIGI6IGJsdWVcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6IFwicGllY2hhcnRcIixcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIGl0ZW1zOiBpdGVtcyxcclxuICAgICAgICAgICAgeDogeCxcclxuICAgICAgICAgICAgeTogeSxcclxuICAgICAgICAgICAgcjogclxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUGllY2hhcnRDb21tYW5kOyIsIi8qKlxyXG4gKiBUT0RPXHJcbiAqL1xyXG5mdW5jdGlvbiBQbGF5Q29tbWFuZCgpIHt9XHJcblxyXG5QbGF5Q29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHsgbmV4dCgpOyB9O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBQbGF5Q29tbWFuZDsiLCIvKipcclxuICogVE9ET1xyXG4gKi9cclxuZnVuY3Rpb24gUGxheXNwZWVkQ29tbWFuZCgpIHt9XHJcblxyXG5QbGF5c3BlZWRDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkgeyBuZXh0KCk7IH07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFBsYXlzcGVlZENvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIERyYXdzIGEgcG9pbnRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKi9cclxuZnVuY3Rpb24gUG9pbnRDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgMikgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdQT0lOVCBjb21tYW5kIHJlcXVpcmVzIDIgYXJndW1lbnRzJyk7XHJcbiAgICB0aGlzLnggPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueSA9IHBhcnNlZC5hcmdzWzFdO1xyXG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA+IDIpIHRoaXMuc2l6ZSA9IHBhcnNlZC5hcmdzWzJdO1xyXG4gICAgZWxzZSB0aGlzLnNpemUgPSBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuUG9pbnRDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGFyZ3MgPSBbdGhpcy54LCB0aGlzLnldO1xyXG4gICAgaWYgKHRoaXMuc2l6ZSkgYXJncy5wdXNoKHRoaXMuc2l6ZSk7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuUG9pbnRDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgeDogdGhpcy54LnRvSlNPTigpLFxyXG4gICAgICAgIHk6IHRoaXMueS50b0pTT04oKSxcclxuICAgICAgICBzaXplOiB0aGlzLnNpemUgPyB0aGlzLnNpemUudG9KU09OKCkgOiBmYWxzZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuUG9pbnRDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHggPSB0aGlzLnguZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciB5ID0gdGhpcy55LmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgc2l6ZSA9IHRoaXMuc2l6ZSA/IHRoaXMuc2l6ZS5leGVjdXRlKGRhdGEpIDogMTtcclxuXHJcbiAgICBkYXRhLnZhbGlkYXRlKHgsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUoeSwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShzaXplLCAnbnVtYmVyJyk7XHJcblxyXG4gICAgLy9pZiAoc2l6ZSA8IDEpIHRocm93IG5ldyBFcnJvcignU2l6ZSBvdXQgb2YgYm91bmRzJyk7XHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6IFwicG9pbnRcIixcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIFwieFwiOiB4LFxyXG4gICAgICAgICAgICBcInlcIjogeSxcclxuICAgICAgICAgICAgXCJzaXplXCI6IHNpemVcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFBvaW50Q29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGZpbGVzeXN0ZW0gPSByZXF1aXJlKCcuLi8uLi9maWxlc3lzdGVtJyk7XHJcbnZhciBybCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0RGVmYXVsdCgpO1xyXG5cclxuLyoqXHJcbiAqIE91dHB1dHMgb3IgZm9ybWF0cyBhbmQgb3V0cHV0cyBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluZVxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIFByaW50Q29tbWFuZChhcmdzLCBkZWZpbmUpIHtcclxuICAgIGlmIChhcmdzW2FyZ3MubGVuZ3RoIC0gMV0gPT09IFwiO1wiKSB7XHJcbiAgICAgICAgdGhpcy5ub0xpbmUgPSB0cnVlO1xyXG4gICAgICAgIGFyZ3MgPSBhcmdzLnN1YnN0cigtMSk7XHJcbiAgICB9IGVsc2UgdGhpcy5ub0xpbmUgPSBmYWxzZTtcclxuXHJcbiAgICB2YXIgcGFyc2VkID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJncywge1xyXG4gICAgICAgIGZsYWdzOiBbJ1VTSU5HJ10sXHJcbiAgICAgICAgcGFyc2VBcmdzOiBmYWxzZVxyXG4gICAgfSk7XHJcblxyXG4gICAgaWYgKHBhcnNlZC5mbGFncy5VU0lORykge1xyXG4gICAgICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggIT09IDEpIHRocm93IG5ldyBTeW50YXhFcnJvcignUFJJTlQgVVNJTkcgY29tbWFuZCByZXF1aXJlcyAxIGFyZ3VtZW50Jyk7XHJcbiAgICAgICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA+IDEpIHRocm93IG5ldyBTeW50YXhFcnJvcignVW5leHBlY3RlZCBjb21tYScpO1xyXG5cclxuICAgICAgICB2YXIgc2VtaWNvbG9uSW5kZXggPSBwYXJzZWQuYXJnc1swXS5pbmRleE9mKCc7Jyk7XHJcbiAgICAgICAgaWYgKHNlbWljb2xvbkluZGV4ID09PSAtMSkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdFeHBlY3RlZCBzZW1pY29sb24nKTtcclxuXHJcbiAgICAgICAgdmFyIGZvcm1hdEV4cHJlc3Npb24gPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KHBhcnNlZC5hcmdzWzBdLnN1YnN0cmluZygwLCBzZW1pY29sb25JbmRleCkudHJpbSgpLCBkZWZpbmUpO1xyXG4gICAgICAgIHZhciBudW1iZXJFeHByZXNzaW9uID0gbmV3IHN0YXRlbWVudHMuRXhwcmVzc2lvblN0YXRlbWVudChwYXJzZWQuYXJnc1swXS5zdWJzdHJpbmcoc2VtaWNvbG9uSW5kZXggKyAxKS50cmltKCksIGRlZmluZSk7XHJcbiAgICAgICAgaWYgKGZvcm1hdEV4cHJlc3Npb24uZXJyb3IgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikgdGhyb3cgZm9ybWF0RXhwcmVzc2lvbi5lcnJvcjtcclxuICAgICAgICBpZiAobnVtYmVyRXhwcmVzc2lvbi5lcnJvciBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB0aHJvdyBudW1iZXJFeHByZXNzaW9uLmVycm9yO1xyXG5cclxuICAgICAgICB0aGlzLmZvcm1hdEV4cHIgPSBmb3JtYXRFeHByZXNzaW9uO1xyXG4gICAgICAgIHRoaXMubnVtYmVyRXhwciA9IG51bWJlckV4cHJlc3Npb247XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBpdGVtcyA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGFyc2VkLmFyZ3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIGV4cHIgPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KHBhcnNlZC5hcmdzW2ldLCBkZWZpbmUpO1xyXG4gICAgICAgICAgICBpZiAoZXhwci5lcnJvciBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB0aHJvdyBleHByLmVycm9yO1xyXG4gICAgICAgICAgICBpdGVtcy5wdXNoKGV4cHIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLml0ZW1zID0gaXRlbXM7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblByaW50Q29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIGlmICh0aGlzLmZvcm1hdEV4cHIpIHtcclxuICAgICAgICByZXR1cm4gJ1VTSU5HICcgKyB0aGlzLmZvcm1hdEV4cHIudG9TdHJpbmcoKSArICc7ICcgKyB0aGlzLm51bWJlckV4cHIudG9TdHJpbmcoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMuam9pbignLCAnKTtcclxuICAgIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5QcmludENvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGl0ZW1zID0gW107XHJcbiAgICBpZiAodGhpcy5pdGVtcykge1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5pdGVtcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpdGVtcy5wdXNoKHRoaXMuaXRlbXNbaV0udG9KU09OKCkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGZvcm1hdDogdGhpcy5mb3JtYXRFeHByID8gdGhpcy5mb3JtYXRFeHByLnRvSlNPTigpIDogZmFsc2UsXHJcbiAgICAgICAgbnVtYmVyOiB0aGlzLm51bWJlckV4cHIgPyB0aGlzLm51bWJlckV4cHIudG9KU09OKCkgOiBmYWxzZSxcclxuICAgICAgICBpdGVtczogaXRlbXMsXHJcbiAgICAgICAgbm9MaW5lOiB0aGlzLm5vTGluZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuUHJpbnRDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgaWYgKHRoaXMuZm9ybWF0RXhwcikge1xyXG4gICAgICAgIHZhciBmb3JtYXQgPSB0aGlzLmZvcm1hdEV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICB2YXIgbnVtYmVyID0gdGhpcy5udW1iZXJFeHByLmV4ZWN1dGUoZGF0YSk7XHJcblxyXG4gICAgICAgIGRhdGEudmFsaWRhdGUoZm9ybWF0LCAnc3RyaW5nJyk7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZShudW1iZXIsICdudW1iZXInKTtcclxuXHJcbiAgICAgICAgdmFyIHN0cmluZ051bWJlciA9IG51bWJlci50b1N0cmluZygpLnNwbGl0KCcuJyk7XHJcbiAgICAgICAgdmFyIHByZURlY2ltYWwgPSBzdHJpbmdOdW1iZXJbMF07XHJcbiAgICAgICAgdmFyIHBvc3REZWNpbWFsID0gc3RyaW5nTnVtYmVyLmxlbmd0aCA+IDEgPyBzdHJpbmdOdW1iZXJbMV0gOiAnJztcclxuXHJcbiAgICAgICAgdmFyIGZvcm1hdFNwbGl0ID0gZm9ybWF0LnNwbGl0KCcuJyk7XHJcbiAgICAgICAgdmFyIHByZURlY2ltYWxGb3JtYXQgPSBmb3JtYXRTcGxpdFswXTtcclxuICAgICAgICB2YXIgcG9zdERlY2ltYWxGb3JtYXQgPSBmb3JtYXRTcGxpdC5sZW5ndGggPiAxID8gZm9ybWF0U3BsaXRbMV0gOiAnJztcclxuXHJcbiAgICAgICAgdmFyIHByZURlY2ltYWxSZXN1bHQgPSAnJywgcG9zdERlY2ltYWxSZXN1bHQgPSAnJztcclxuXHJcbiAgICAgICAgdmFyIHByZURlY2ltYWxTdGFydCA9IHByZURlY2ltYWwubGVuZ3RoIC0gcHJlRGVjaW1hbEZvcm1hdC5sZW5ndGg7XHJcbiAgICAgICAgdmFyIHByZURlY2ltYWxUZXh0ID0gcHJlRGVjaW1hbC5zdWJzdHJpbmcocHJlRGVjaW1hbFN0YXJ0IDwgMCA/IDAgOiBwcmVEZWNpbWFsU3RhcnQpO1xyXG4gICAgICAgIGlmIChwcmVEZWNpbWFsU3RhcnQgPCAwKSB7XHJcbiAgICAgICAgICAgIHZhciBwcmVEZWNpbWFsRGlmZiA9IHByZURlY2ltYWxTdGFydCAqIC0xO1xyXG4gICAgICAgICAgICBwcmVEZWNpbWFsVGV4dCA9IChuZXcgQXJyYXkocHJlRGVjaW1hbERpZmYgKyAxKSkuam9pbihcIiBcIikgKyBwcmVEZWNpbWFsVGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yICh2YXIgcHJlID0gMDsgcHJlIDwgcHJlRGVjaW1hbEZvcm1hdC5sZW5ndGg7IHByZSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBwcmVDaGFyID0gcHJlRGVjaW1hbEZvcm1hdFtwcmVdO1xyXG4gICAgICAgICAgICBpZiAocHJlQ2hhciAhPT0gJyMnKSBwcmVEZWNpbWFsUmVzdWx0ICs9IHByZUNoYXI7XHJcbiAgICAgICAgICAgIGVsc2UgcHJlRGVjaW1hbFJlc3VsdCArPSBwcmVEZWNpbWFsVGV4dFtwcmVdO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIHBvc3REZWNpbWFsVGV4dCA9IHBvc3REZWNpbWFsLnN1YnN0cmluZygwLCBwb3N0RGVjaW1hbEZvcm1hdC5sZW5ndGgpO1xyXG4gICAgICAgIGlmIChwb3N0RGVjaW1hbFRleHQubGVuZ3RoIDwgcG9zdERlY2ltYWxGb3JtYXQubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHZhciBwb3N0RGVjaW1hbERpZmYgPSBwb3N0RGVjaW1hbEZvcm1hdC5sZW5ndGggLSBwb3N0RGVjaW1hbFRleHQubGVuZ3RoO1xyXG4gICAgICAgICAgICBwb3N0RGVjaW1hbFRleHQgKz0gKG5ldyBBcnJheShwb3N0RGVjaW1hbERpZmYgKyAxKSkuam9pbihcIiBcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZvciAodmFyIHBvc3QgPSAwOyBwb3N0IDwgcG9zdERlY2ltYWxGb3JtYXQubGVuZ3RoOyBwb3N0KyspIHtcclxuICAgICAgICAgICAgdmFyIHBvc3RDaGFyID0gcG9zdERlY2ltYWxGb3JtYXRbcG9zdF07XHJcbiAgICAgICAgICAgIGlmIChwb3N0Q2hhciAhPT0gJyMnKSBwb3N0RGVjaW1hbFJlc3VsdCArPSBwb3N0Q2hhcjtcclxuICAgICAgICAgICAgZWxzZSBwb3N0RGVjaW1hbFJlc3VsdCArPSBwb3N0RGVjaW1hbFRleHRbcG9zdF07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBybC53cml0ZShwcmVEZWNpbWFsUmVzdWx0ICsgKHBvc3REZWNpbWFsUmVzdWx0Lmxlbmd0aCA/ICcuJyArIHBvc3REZWNpbWFsUmVzdWx0IDogJycpICsgJ1xcbicpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgaXRlbXMgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuaXRlbXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHRoaXMuaXRlbXNbaV0uZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgIT09ICdzdHJpbmcnICYmIHR5cGVvZiByZXN1bHQgIT09ICdudW1iZXInICYmICEocmVzdWx0IGluc3RhbmNlb2YgZmlsZXN5c3RlbS5GaWxlICYmIGkgPT09IDApKSB0aHJvdyBuZXcgRXJyb3IoJ1R5cGVzIG1pc21hdGNoJyk7XHJcbiAgICAgICAgICAgIGl0ZW1zLnB1c2gocmVzdWx0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGl0ZW1zWzBdIGluc3RhbmNlb2YgZmlsZXN5c3RlbS5GaWxlKSB7XHJcbiAgICAgICAgICAgIHZhciBmaWxlID0gaXRlbXNbMF07XHJcbiAgICAgICAgICAgIGlmIChmaWxlLm1vZGUgIT09ICdvdXRwdXQnICYmIGZpbGUubW9kZSAhPT0gJ2FwcGVuZCcpIHRocm93IG5ldyBFcnJvcignRmlsZSBub3Qgd3JpdGFibGUnKTtcclxuICAgICAgICAgICAgZmlsZS53cml0ZShpdGVtcy5zbGljZSgxKS5qb2luKCcgJykpO1xyXG4gICAgICAgICAgICBmaWxlLnNhdmUoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICBuZXh0KCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfSBlbHNlIHJsLndyaXRlKGl0ZW1zLmpvaW4oJyAnKSArICh0aGlzLm5vTGluZSA/ICcnIDogJ1xcbicpKTtcclxuICAgIH1cclxuXHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFByaW50Q29tbWFuZDsiLCIvKipcclxuICogU2V0cyBhIHJhbmRvbSBzZWVkXHJcbiAqXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gUmFuZG9taXplQ29tbWFuZCgpIHt9XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcblJhbmRvbWl6ZUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICBkYXRhLnNldFByaXZhdGUoJ3JuZF9zZWVkJywgTWF0aC5yYW5kb20oKSk7XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFJhbmRvbWl6ZUNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIERyYXdzIGEgZmlsbGVkIG9yIHN0cm9rZWQgcmVjdGFuZ2xlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICovXHJcbmZ1bmN0aW9uIFJlY3RDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgNCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdSRUNUIGNvbW1hbmQgcmVxdWlyZXMgNCBhcmd1bWVudHMnKTtcclxuICAgIHRoaXMueDEgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueTEgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMueDIgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIHRoaXMueTIgPSBwYXJzZWQuYXJnc1szXTtcclxuICAgIHRoaXMuc3Ryb2tlID0gcGFyc2VkLmFyZ3MubGVuZ3RoID4gNCA/IHBhcnNlZC5hcmdzWzRdIDogZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblJlY3RDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIGFyZ3MgPSBbdGhpcy54MSwgdGhpcy55MSwgdGhpcy54MiwgdGhpcy55Ml07XHJcbiAgICBpZiAodGhpcy5zdHJva2UpIGFyZ3MucHVzaCh0aGlzLnN0cm9rZSk7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuUmVjdENvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4MTogdGhpcy54MS50b0pTT04oKSxcclxuICAgICAgICB5MTogdGhpcy55MS50b0pTT04oKSxcclxuICAgICAgICB4MjogdGhpcy54Mi50b0pTT04oKSxcclxuICAgICAgICB5MjogdGhpcy55Mi50b0pTT04oKSxcclxuICAgICAgICBzdHJva2U6IHRoaXMuc3Ryb2tlID8gdGhpcy5zdHJva2UudG9KU09OKCkgOiBmYWxzZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuUmVjdENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgeDEgPSB0aGlzLngxLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeTEgPSB0aGlzLnkxLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeDIgPSB0aGlzLngyLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgeTIgPSB0aGlzLnkyLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgc3Ryb2tlID0gdGhpcy5zdHJva2UgPyB0aGlzLnN0cm9rZS5leGVjdXRlKGRhdGEpIDogMDtcclxuXHJcbiAgICBkYXRhLnZhbGlkYXRlKHgxLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHkxLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHgyLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHkyLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHN0cm9rZSwgJ251bWJlcicpO1xyXG5cclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogXCJyZWN0XCIsXHJcbiAgICAgICAgYXJnczoge1xyXG4gICAgICAgICAgICB4MTogeDEsXHJcbiAgICAgICAgICAgIHkxOiB5MSxcclxuICAgICAgICAgICAgeDI6IHgyLFxyXG4gICAgICAgICAgICB5MjogeTIsXHJcbiAgICAgICAgICAgIHN0cm9rZTogc3Ryb2tlXHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBSZWN0Q29tbWFuZDsiLCJ2YXIgY3R4ID0gcmVxdWlyZSgnLi4vLi4vSU9JbnRlcmZhY2UnKS5nZXQoJ2RyYXcnKTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIHRoZSBjYW52YXMgdG8gbGFuZHNjYXBlIGFuZCBsb2NrcyBpdFxyXG4gKi9cclxuZnVuY3Rpb24gUmVxdWlyZWxhbmRzY2FwZUNvbW1hbmQoKSB7IH1cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuUmVxdWlyZWxhbmRzY2FwZUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgd2lkdGggPSBkYXRhLmNvbnN0YW50c1snU2NyZWVuV2lkdGgnXSgpO1xyXG4gICAgdmFyIGhlaWdodCA9IGRhdGEuY29uc3RhbnRzWydTY3JlZW5IZWlnaHQnXSgpO1xyXG5cclxuICAgIGlmIChoZWlnaHQgPiB3aWR0aCkge1xyXG4gICAgICAgIHZhciBzd2FwcGVkID0gd2lkdGg7XHJcbiAgICAgICAgd2lkdGggPSBoZWlnaHQ7XHJcbiAgICAgICAgaGVpZ2h0ID0gc3dhcHBlZDtcclxuICAgIH1cclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6ICdzZXRzaXplJyxcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcclxuICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogJ2xvY2tzaXplJ1xyXG4gICAgfSk7XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFJlcXVpcmVsYW5kc2NhcGVDb21tYW5kOyIsInZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIFNldHMgdGhlIGNhbnZhcyB0byBwb3J0cmFpdCBhbmQgbG9ja3MgaXRcclxuICovXHJcbmZ1bmN0aW9uIFJlcXVpcmVwb3J0cmFpdENvbW1hbmQoKSB7IH1cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuUmVxdWlyZXBvcnRyYWl0Q29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciB3aWR0aCA9IGRhdGEuY29uc3RhbnRzWydTY3JlZW5XaWR0aCddKCk7XHJcbiAgICB2YXIgaGVpZ2h0ID0gZGF0YS5jb25zdGFudHNbJ1NjcmVlbkhlaWdodCddKCk7XHJcblxyXG4gICAgaWYgKHdpZHRoID4gaGVpZ2h0KSB7XHJcbiAgICAgICAgdmFyIHN3YXBwZWQgPSB3aWR0aDtcclxuICAgICAgICB3aWR0aCA9IGhlaWdodDtcclxuICAgICAgICBoZWlnaHQgPSBzd2FwcGVkO1xyXG4gICAgfVxyXG5cclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogJ3NldHNpemUnLFxyXG4gICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgY3R4LndyaXRlKHtcclxuICAgICAgICBjb21tYW5kOiAnbG9ja3NpemUnXHJcbiAgICB9KTtcclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUmVxdWlyZXBvcnRyYWl0Q29tbWFuZDsiLCIvKipcclxuICogRG9lcyBub3RoaW5nLCBhcyByZXRpbmEgaXMgbm90IHBvc3NpYmxlIG9uIGRlc2t0b3BcclxuICovXHJcbmZ1bmN0aW9uIFJldGluYUNvbW1hbmQoKSB7fVxyXG5cclxuUmV0aW5hQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHsgbmV4dCgpOyB9O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBSZXRpbmFDb21tYW5kOyIsIi8qKlxyXG4gKiBSZXR1cm5zIHRvIGEgR09TVUJcclxuICpcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBSZXR1cm5Db21tYW5kKCkge31cclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuUmV0dXJuQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIGRhdGEucmV0dXJuTGFiZWwoKTtcclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUmV0dXJuQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogRHJhd3MgYSBmaWxsZWQgb3Igc3Ryb2tlZCByb3VuZGVkIHJlY3RhbmdsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqL1xyXG5mdW5jdGlvbiBScmVjdENvbW1hbmQoYXJncykge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MpO1xyXG5cclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPCA1KSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ1JSRUNUIGNvbW1hbmQgcmVxdWlyZXMgNSBhcmd1bWVudHMnKTtcclxuICAgIHRoaXMueDEgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMueTEgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMueDIgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIHRoaXMueTIgPSBwYXJzZWQuYXJnc1szXTtcclxuICAgIHRoaXMucmFkaXVzID0gcGFyc2VkLmFyZ3NbNF07XHJcbiAgICB0aGlzLnN0cm9rZSA9IHBhcnNlZC5hcmdzLmxlbmd0aCA+IDUgPyBwYXJzZWQuYXJnc1s1XSA6IGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5ScmVjdENvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFt0aGlzLngxLCB0aGlzLnkxLCB0aGlzLngyLCB0aGlzLnkyLCB0aGlzLnJhZGl1c107XHJcbiAgICBpZiAodGhpcy5zdHJva2UpIGFyZ3MucHVzaCh0aGlzLnN0cm9rZSk7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuUnJlY3RDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgeDE6IHRoaXMueDEudG9KU09OKCksXHJcbiAgICAgICAgeTE6IHRoaXMueTEudG9KU09OKCksXHJcbiAgICAgICAgeDI6IHRoaXMueDIudG9KU09OKCksXHJcbiAgICAgICAgeTI6IHRoaXMueTIudG9KU09OKCksXHJcbiAgICAgICAgcmFkaXVzOiB0aGlzLnJhZGl1cy50b0pTT04oKSxcclxuICAgICAgICBzdHJva2U6IHRoaXMuc3Ryb2tlID8gdGhpcy5zdHJva2UudG9KU09OKCkgOiBmYWxzZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuUnJlY3RDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHgxID0gdGhpcy54MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkxID0gdGhpcy55MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHgyID0gdGhpcy54Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkyID0gdGhpcy55Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHJhZGl1cyA9IHRoaXMucmFkaXVzLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgc3Ryb2tlID0gdGhpcy5zdHJva2UgPyB0aGlzLnN0cm9rZS5leGVjdXRlKGRhdGEpIDogMDtcclxuXHJcbiAgICBkYXRhLnZhbGlkYXRlKHgxLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHkxLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHgyLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHkyLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHJhZGl1cywgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShzdHJva2UsICdudW1iZXInKTtcclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6IFwicnJlY3RcIixcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIHgxOiB4MSxcclxuICAgICAgICAgICAgeTE6IHkxLFxyXG4gICAgICAgICAgICB4MjogeDIsXHJcbiAgICAgICAgICAgIHkyOiB5MixcclxuICAgICAgICAgICAgcmFkaXVzOiByYWRpdXMsXHJcbiAgICAgICAgICAgIHN0cm9rZTogc3Ryb2tlXHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBScmVjdENvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBmaWxlc3lzdGVtID0gcmVxdWlyZSgnLi4vLi4vZmlsZXN5c3RlbScpO1xyXG5cclxuLyoqXHJcbiAqIFNhdmVzIGEgc3ByaXRlIHRvIGEgZmlsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gU2F2ZXNwcml0ZUNvbW1hbmQoYXJncykge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MpO1xyXG5cclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPCAyKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ1NBVkVTUFJJVEUgY29tbWFuZCByZXF1aXJlcyAyIGFyZ3VtZW50cycpO1xyXG5cclxuICAgIHRoaXMuaWQgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMuZmlsZU5hbWUgPSBwYXJzZWQuYXJnc1sxXTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBjb21tYW5kIGFyZ3VtZW50cyB0byBhIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuU2F2ZXNwcml0ZUNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5pZCArIFwiLCBcIiArIHRoaXMuZmlsZU5hbWU7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuU2F2ZXNwcml0ZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBpZDogdGhpcy5pZC50b0pTT04oKSxcclxuICAgICAgICBmaWxlTmFtZTogdGhpcy5maWxlTmFtZS50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuU2F2ZXNwcml0ZUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgaWQgPSB0aGlzLmlkLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgZmlsZW5hbWUgPSB0aGlzLmZpbGVOYW1lLmV4ZWN1dGUoZGF0YSk7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZShpZCwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShmaWxlbmFtZSwgJ3N0cmluZycpO1xyXG5cclxuICAgIGlmICghZGF0YS5wcml2YXRlLnNwcml0ZXNbaWRdKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3ByaXRlIElEJyk7XHJcbiAgICB2YXIgaW1nID0gZGF0YS5wcml2YXRlLnNwcml0ZXNbaWRdO1xyXG4gICAgdmFyIGRhdGFDb2RlID0gaW1nLnRvRGF0YVVybCgpO1xyXG5cclxuICAgIHZhciBkcml2ZUluZGV4ID0gZmlsZW5hbWUuaW5kZXhPZignOicpO1xyXG4gICAgdmFyIGRyaXZlID0gJ0EnO1xyXG4gICAgaWYgKGRyaXZlSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgZHJpdmUgPSBmaWxlbmFtZS5zdWJzdHJpbmcoMCwgZHJpdmVJbmRleCk7XHJcbiAgICAgICAgZmlsZW5hbWUgPSBmaWxlbmFtZS5zdWJzdHJpbmcoZHJpdmVJbmRleCArIDEpO1xyXG4gICAgfVxyXG5cclxuICAgIGZpbGVzeXN0ZW0uZHJpdmUoZHJpdmUsIGZ1bmN0aW9uKGZzKSB7XHJcbiAgICAgICAgdmFyIGZpbGUgPSBmcy5vcGVuKGZpbGVuYW1lKTtcclxuICAgICAgICBmaWxlLmNsZWFyKCk7XHJcbiAgICAgICAgZmlsZS53cml0ZShkYXRhQ29kZSk7XHJcbiAgICAgICAgZmlsZS5zYXZlKCk7XHJcblxyXG4gICAgICAgIG5leHQoKTtcclxuICAgIH0pO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBTYXZlc3ByaXRlQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogRHJhd3MgYSBjdXN0b20gc2hhcGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKi9cclxuZnVuY3Rpb24gU2hhcGVDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgMykgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdTSEFQRSBjb21tYW5kIHJlcXVpcmVzIDMgYXJndW1lbnRzJyk7XHJcbiAgICB0aGlzLnBvaW50c0xlbmd0aCA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgdGhpcy5wb2ludHNYID0gcGFyc2VkLmFyZ3NbMV07XHJcbiAgICB0aGlzLnBvaW50c1kgPSBwYXJzZWQuYXJnc1syXTtcclxuICAgIHRoaXMuc3Ryb2tlID0gcGFyc2VkLmFyZ3MubGVuZ3RoID4gMyA/IHBhcnNlZC5hcmdzWzNdIDogZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblNoYXBlQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBhcmdzID0gW3RoaXMucG9pbnRzTGVuZ3RoLCB0aGlzLnBvaW50c1gsIHRoaXMucG9pbnRzWV07XHJcbiAgICBpZiAodGhpcy5zdHJva2UpIGFyZ3MucHVzaCh0aGlzLnN0cm9rZSk7XHJcbiAgICByZXR1cm4gYXJncy5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuU2hhcGVDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcG9pbnRzTGVuZ3RoOiB0aGlzLnBvaW50c0xlbmd0aC50b0pTT04oKSxcclxuICAgICAgICBwb2ludHNYOiB0aGlzLnBvaW50c1gudG9KU09OKCksXHJcbiAgICAgICAgcG9pbnRzWTogdGhpcy5wb2ludHNZLnRvSlNPTigpLFxyXG4gICAgICAgIHN0cm9rZTogdGhpcy5zdHJva2UgPyB0aGlzLnN0cm9rZS50b0pTT04oKSA6IGZhbHNlXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5TaGFwZUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgcG9pbnRzTGVuZ3RoID0gdGhpcy5wb2ludHNMZW5ndGguZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBwb2ludHNYID0gdGhpcy5wb2ludHNYLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgcG9pbnRzWSA9IHRoaXMucG9pbnRzWS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHN0cm9rZSA9IHRoaXMuc3Ryb2tlID8gdGhpcy5zdHJva2UuZXhlY3V0ZShkYXRhKSA6IDA7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZShwb2ludHNMZW5ndGgsICdudW1iZXInKTtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShwb2ludHNYKSkgdGhyb3cgbmV3IEVycm9yKCdUeXBlcyBtaXNtYXRjaCcpO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHBvaW50c1kpKSB0aHJvdyBuZXcgRXJyb3IoJ1R5cGVzIG1pc21hdGNoJyk7XHJcblxyXG4gICAgaWYgKHBvaW50c0xlbmd0aCA+IHBvaW50c1gubGVuZ3RoIHx8IHBvaW50c0xlbmd0aCA+IHBvaW50c1kubGVuZ3RoKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJyYXkgYm91bmRzJyk7XHJcblxyXG4gICAgdmFyIHBvaW50cyA9IFtdO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwb2ludHNMZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciB4ID0gcG9pbnRzWFtpXTtcclxuICAgICAgICB2YXIgeSA9IHBvaW50c1lbaV07XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZSh4LCAnbnVtYmVyJyk7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZSh5LCAnbnVtYmVyJyk7XHJcbiAgICAgICAgcG9pbnRzLnB1c2goeyB4OiB4LCB5OiB5IH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGN0eC53cml0ZSh7XHJcbiAgICAgICAgY29tbWFuZDogXCJzaGFwZVwiLFxyXG4gICAgICAgIGFyZ3M6IHtcclxuICAgICAgICAgICAgcG9pbnRzOiBwb2ludHMsXHJcbiAgICAgICAgICAgIHN0cm9rZTogc3Ryb2tlXHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBTaGFwZUNvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcblxyXG4vKipcclxuICogU2xlZXBzIGZvciBhIGNlcnRhaW4gYW1vdW50IG9mIHNlY29uZHNcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBkZWZpbmVcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBTbGVlcENvbW1hbmQoYXJncywgZGVmaW5lKSB7XHJcbiAgICB0aGlzLmR1cmF0aW9uID0gbmV3IHN0YXRlbWVudHMuRXhwcmVzc2lvblN0YXRlbWVudChhcmdzLCBkZWZpbmUpO1xyXG4gICAgaWYgKHRoaXMuZHVyYXRpb24uZXJyb3IpIHRocm93IHRoaXMuZHVyYXRpb24uZXJyb3I7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCBhcmd1bWVudHMgdG8gYSBzdHJpbmdcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcblNsZWVwQ29tbWFuZC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmR1cmF0aW9uLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuU2xlZXBDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgZHVyYXRpb246IHRoaXMuZHVyYXRpb24udG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcblNsZWVwQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciBkdXJhdGlvbiA9IHRoaXMuZHVyYXRpb24uZXhlY3V0ZShkYXRhKTtcclxuICAgIGRhdGEudmFsaWRhdGUoZHVyYXRpb24sICdudW1iZXInKTtcclxuXHJcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIG5leHQoKTtcclxuICAgIH0sIGR1cmF0aW9uICogMTAwMCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNsZWVwQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG4vKipcclxuICogU2V0cyB0aGUgY29sb3Igb2YgdGV4dFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqL1xyXG5mdW5jdGlvbiBUY29sb3JDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgMykgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdUQ09MT1IgY29tbWFuZCByZXF1aXJlcyAzIGFyZ3VtZW50cycpO1xyXG4gICAgdGhpcy5yZWQgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgIHRoaXMuZ3JlZW4gPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIHRoaXMuYmx1ZSA9IHBhcnNlZC5hcmdzWzJdO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5UY29sb3JDb21tYW5kLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIFt0aGlzLnJlZCwgdGhpcy5ncmVlbiwgdGhpcy5ibHVlXS5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuVGNvbG9yQ29tbWFuZC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHI6IHRoaXMucmVkLnRvSlNPTigpLFxyXG4gICAgICAgIGc6IHRoaXMuZ3JlZW4udG9KU09OKCksXHJcbiAgICAgICAgYjogdGhpcy5ibHVlLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5UY29sb3JDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHJlZCA9IHRoaXMucmVkLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgZ3JlZW4gPSB0aGlzLmdyZWVuLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgYmx1ZSA9IHRoaXMuYmx1ZS5leGVjdXRlKGRhdGEpO1xyXG5cclxuICAgIGRhdGEudmFsaWRhdGUocmVkLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKGdyZWVuLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKGJsdWUsICdudW1iZXInKTtcclxuXHJcbiAgICB2YXIgb2xkUmVkID0gcmVkLCBvbGRHcmVlbiA9IGdyZWVuLCBvbGRCbHVlID0gYmx1ZTtcclxuXHJcbiAgICBpZiAocmVkID4gMSkgcmVkIC89IDI1NTtcclxuICAgIGlmIChncmVlbiA+IDEpIGdyZWVuIC89IDI1NTtcclxuICAgIGlmIChibHVlID4gMSkgYmx1ZSAvPSAyNTU7XHJcblxyXG4gICAgcmVkID0gTWF0aC5tYXgoMCwgTWF0aC5taW4ocmVkLCAxKSk7XHJcbiAgICBncmVlbiA9IE1hdGgubWF4KDAsIE1hdGgubWluKGdyZWVuLCAxKSk7XHJcbiAgICBibHVlID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oYmx1ZSwgMSkpO1xyXG5cclxuICAgIGRhdGEuc2V0Q29uc3RhbnQoJ1RDb2xvclInLCBvbGRSZWQpO1xyXG4gICAgZGF0YS5zZXRDb25zdGFudCgnVENvbG9yRycsIG9sZEdyZWVuKTtcclxuICAgIGRhdGEuc2V0Q29uc3RhbnQoJ1RDb2xvckInLCBvbGRCbHVlKTtcclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIFwiY29tbWFuZFwiOiBcInRjb2xvclwiLFxyXG4gICAgICAgIFwiYXJnc1wiOiB7XHJcbiAgICAgICAgICAgIFwiclwiOiByZWQsXHJcbiAgICAgICAgICAgIFwiZ1wiOiBncmVlbixcclxuICAgICAgICAgICAgXCJiXCI6IGJsdWVcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIG5leHQoKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gVGNvbG9yQ29tbWFuZDsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4uL3N0YXRlbWVudHMnKTtcclxudmFyIFN5bnRheEVycm9yID0gcmVxdWlyZSgnLi4vU3ludGF4RXJyb3InKTtcclxudmFyIGN0eCA9IHJlcXVpcmUoJy4uLy4uL0lPSW50ZXJmYWNlJykuZ2V0KCdkcmF3Jyk7XHJcblxyXG52YXIgc3R5bGVOYW1lcyA9IFtcclxuICAgIFwibGlnaHRcIixcclxuICAgIFwiYm9sZFwiLFxyXG4gICAgXCJpdGFsaWNcIlxyXG5dO1xyXG52YXIgZm9udE5hbWVzID0gW1xyXG4gICAgXCJBbWVyaWNhbiBUeXBld3JpdGVyXCIsXHJcbiAgICBcIkFwcGxlR290aGljXCIsXHJcbiAgICBcIkFyaWFsXCIsXHJcbiAgICBcIkFyaWFsIFJvdW5kZWRcIixcclxuICAgIFwiQ291cmllclwiLFxyXG4gICAgXCJDb3VyaWVyIE5ld1wiLFxyXG4gICAgXCJHZW9yZ2lhXCIsXHJcbiAgICBcIkhlbHZldGljYVwiLFxyXG4gICAgXCJNYXJrZXIgRmVsdFwiLFxyXG4gICAgXCJUaW1lc1wiLFxyXG4gICAgXCJUcmVidWNoZXRcIixcclxuICAgIFwiVmVyZGFuYVwiLFxyXG4gICAgXCJaYXBmaW5vXCJcclxuXTtcclxuXHJcbi8qKlxyXG4gKiBNb2RpZmllcyB0aGUgRFJBV1RFWFQgZm9udFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqL1xyXG5mdW5jdGlvbiBUZXh0Zm9udENvbW1hbmQoYXJncykge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MpO1xyXG5cclxuICAgIGlmIChwYXJzZWQuYXJncy5sZW5ndGggPiAyKSB7XHJcbiAgICAgICAgdGhpcy5mYW1pbHkgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgICAgICB0aGlzLnN0eWxlID0gcGFyc2VkLmFyZ3NbMV07XHJcbiAgICAgICAgdGhpcy5zaXplID0gcGFyc2VkLmFyZ3NbMl07XHJcbiAgICB9IGVsc2UgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICB0aGlzLmZhbWlseU9yU3R5bGUgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgICAgICB0aGlzLnNpemUgPSBwYXJzZWQuYXJnc1sxXTtcclxuICAgIH0gZWxzZSBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHZhciBhcmcgPSBwYXJzZWQuYXJnc1swXTtcclxuICAgICAgICBpZiAoYXJnLmNoaWxkLnR5cGUgPT09ICdzdHJpbmcnIHx8IGFyZy5jaGlsZCBpbnN0YW5jZW9mIHN0YXRlbWVudHMuU3RyaW5nU3RhdGVtZW50KSB0aGlzLmZhbWlseU9yU3R5bGUgPSBhcmc7XHJcbiAgICAgICAgZWxzZSB0aGlzLnNpemUgPSBhcmc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMucmVzZXQgPSB0cnVlO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5UZXh0Zm9udENvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gW107XHJcbiAgICBpZiAodGhpcy5mYW1pbHkpIHJlc3VsdC5wdXNoKHRoaXMuZmFtaWx5LCB0aGlzLnN0eWxlKTtcclxuICAgIGVsc2UgaWYgKHRoaXMuZmFtaWx5T3JTdHlsZSkgcmVzdWx0LnB1c2godGhpcy5mYW1pbHlPclN0eWxlKTtcclxuICAgIGlmICh0aGlzLnNpemUpIHJlc3VsdC5wdXNoKHRoaXMuc2l6ZSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdC5qb2luKFwiLCBcIik7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuVGV4dGZvbnRDb21tYW5kLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcmVzZXQ6IHRoaXMucmVzZXQsXHJcbiAgICAgICAgZmFtaWx5OiB0aGlzLmZhbWlseSA/IHRoaXMuZmFtaWx5LnRvSlNPTigpIDogZmFsc2UsXHJcbiAgICAgICAgc3R5bGU6IHRoaXMuc3R5bGUgPyB0aGlzLnN0eWxlLnRvSlNPTigpIDogZmFsc2UsXHJcbiAgICAgICAgc2l6ZTogdGhpcy5zaXplID8gdGhpcy5zaXplLnRvSlNPTigpIDogZmFsc2UsXHJcbiAgICAgICAgZmFtaWx5T3JTdHlsZTogdGhpcy5mYW1pbHlPclN0eWxlID8gdGhpcy5mYW1pbHlPclN0eWxlLnRvSlNPTigpIDogZmFsc2VcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHRcclxuICovXHJcblRleHRmb250Q29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHtcclxuICAgIHZhciBmYW1pbHkgPSBmYWxzZSwgc3R5bGUgPSBmYWxzZSwgaGVpZ2h0ID0gZmFsc2U7XHJcblxyXG4gICAgaWYgKHRoaXMucmVzZXQpIHtcclxuICAgICAgICBmYW1pbHkgPSBcIlphcGZpbm9cIjtcclxuICAgICAgICBzdHlsZSA9IFwiXCI7XHJcbiAgICAgICAgaGVpZ2h0ID0gMTQ7XHJcbiAgICB9IGVsc2UgaWYgKHRoaXMuZmFtaWx5KSB7XHJcbiAgICAgICAgZmFtaWx5ID0gdGhpcy5mYW1pbHkuZXhlY3V0ZShkYXRhKTtcclxuICAgICAgICBzdHlsZSA9IHRoaXMuc3R5bGUuZXhlY3V0ZShkYXRhKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgfSBlbHNlIGlmICh0aGlzLmZhbWlseU9yU3R5bGUpIHtcclxuICAgICAgICB2YXIgZmFtaWx5T3JTdHlsZSA9IHRoaXMuZmFtaWx5T3JTdHlsZS5leGVjdXRlKGRhdGEpO1xyXG4gICAgICAgIHZhciBsb3dlclN0eWxlID0gZmFtaWx5T3JTdHlsZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIHZhciBzcGxpdFN0eWxlID0gbG93ZXJTdHlsZS5zcGxpdChcIiBcIik7XHJcblxyXG4gICAgICAgIHZhciBpc1N0eWxlID0gdHJ1ZTtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNwbGl0U3R5bGUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKHN0eWxlTmFtZXMuaW5kZXhPZihzcGxpdFN0eWxlW2ldKSA9PT0gLTEpIHtcclxuICAgICAgICAgICAgICAgIGlzU3R5bGUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoaXNTdHlsZSkgc3R5bGUgPSBsb3dlclN0eWxlO1xyXG4gICAgICAgIGVsc2UgZmFtaWx5ID0gZmFtaWx5T3JTdHlsZTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnNpemUpIHtcclxuICAgICAgICBoZWlnaHQgPSB0aGlzLnNpemUuZXhlY3V0ZShkYXRhKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZmFtaWx5ICE9PSBmYWxzZSkge1xyXG4gICAgICAgIGRhdGEudmFsaWRhdGUoZmFtaWx5LCAnc3RyaW5nJyk7XHJcbiAgICAgICAgaWYgKGZvbnROYW1lcy5pbmRleE9mKGZhbWlseSkgPT09IC0xKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZm9udCBuYW1lJyk7XHJcbiAgICB9XHJcbiAgICBpZiAoc3R5bGUgIT09IGZhbHNlKSB7XHJcbiAgICAgICAgZGF0YS52YWxpZGF0ZShzdHlsZSwgJ3N0cmluZycpO1xyXG4gICAgICAgIHN0eWxlID0gc3R5bGUudHJpbSgpO1xyXG4gICAgICAgIHZhciBzdHlsZXMgPSBzdHlsZS5zcGxpdChcIiBcIik7XHJcbiAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCBzdHlsZXMubGVuZ3RoOyB4KyspIHtcclxuICAgICAgICAgICAgdmFyIHN0bCA9IHN0eWxlc1t4XS50cmltKCk7XHJcbiAgICAgICAgICAgIGlmIChzdGwubGVuZ3RoICYmIHN0eWxlTmFtZXMuaW5kZXhPZihzdGwpID09PSAtMSkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGZvbnQgc3R5bGUnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoaGVpZ2h0ICE9PSBmYWxzZSkge1xyXG4gICAgICAgIGRhdGEudmFsaWRhdGUoaGVpZ2h0LCAnbnVtYmVyJyk7XHJcbiAgICAgICAgLy9pZiAoaGVpZ2h0IDw9IDApIHRocm93IG5ldyBFcnJvcignSGVpZ2h0IG91dCBvZiBib3VuZHMnKTtcclxuICAgIH1cclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6ICdmb250JyxcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIGZhbWlseTogZmFtaWx5LFxyXG4gICAgICAgICAgICBzdHlsZTogc3R5bGUsXHJcbiAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBUZXh0Zm9udENvbW1hbmQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLi9zdGF0ZW1lbnRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcbnZhciBjdHggPSByZXF1aXJlKCcuLi8uLi9JT0ludGVyZmFjZScpLmdldCgnZHJhdycpO1xyXG5cclxuLyoqXHJcbiAqIERyYXdzIGEgZmlsbGVkIG9yIHN0cm9rZWQgdHJpYW5nbGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgY29tbWFuZFxyXG4gKi9cclxuZnVuY3Rpb24gVHJpYW5nbGVDb21tYW5kKGFyZ3MpIHtcclxuICAgIHZhciBwYXJzZWQgPSBuZXcgc3RhdGVtZW50cy5Bcmd1bWVudFN0YXRlbWVudChhcmdzKTtcclxuXHJcbiAgICBpZiAocGFyc2VkLmFyZ3MubGVuZ3RoIDwgNikgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdUUklBTkdMRSBjb21tYW5kIHJlcXVpcmVzIDYgYXJndW1lbnRzJyk7XHJcbiAgICB0aGlzLngxID0gcGFyc2VkLmFyZ3NbMF07XHJcbiAgICB0aGlzLnkxID0gcGFyc2VkLmFyZ3NbMV07XHJcbiAgICB0aGlzLngyID0gcGFyc2VkLmFyZ3NbMl07XHJcbiAgICB0aGlzLnkyID0gcGFyc2VkLmFyZ3NbM107XHJcbiAgICB0aGlzLngzID0gcGFyc2VkLmFyZ3NbNF07XHJcbiAgICB0aGlzLnkzID0gcGFyc2VkLmFyZ3NbNV07XHJcbiAgICB0aGlzLnN0cm9rZSA9IHBhcnNlZC5hcmdzLmxlbmd0aCA+IDYgPyBwYXJzZWQuYXJnc1s2XSA6IGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5UcmlhbmdsZUNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFt0aGlzLngxLCB0aGlzLnkxLCB0aGlzLngyLCB0aGlzLnkyLCB0aGlzLngzLCB0aGlzLnkzXTtcclxuICAgIGlmICh0aGlzLnN0cm9rZSkgYXJncy5wdXNoKHRoaXMuc3Ryb2tlKTtcclxuICAgIHJldHVybiBhcmdzLmpvaW4oXCIsIFwiKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5UcmlhbmdsZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4MTogdGhpcy54MS50b0pTT04oKSxcclxuICAgICAgICB5MTogdGhpcy55MS50b0pTT04oKSxcclxuICAgICAgICB4MjogdGhpcy54Mi50b0pTT04oKSxcclxuICAgICAgICB5MjogdGhpcy55Mi50b0pTT04oKSxcclxuICAgICAgICB4MzogdGhpcy54My50b0pTT04oKSxcclxuICAgICAgICB5MzogdGhpcy55My50b0pTT04oKSxcclxuICAgICAgICBzdHJva2U6IHRoaXMuc3Ryb2tlID8gdGhpcy5zdHJva2UudG9KU09OKCkgOiBmYWxzZVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuVHJpYW5nbGVDb21tYW5kLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSwgbmV4dCkge1xyXG4gICAgdmFyIHgxID0gdGhpcy54MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkxID0gdGhpcy55MS5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHgyID0gdGhpcy54Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkyID0gdGhpcy55Mi5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHgzID0gdGhpcy54My5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHkzID0gdGhpcy55My5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHN0cm9rZSA9IHRoaXMuc3Ryb2tlID8gdGhpcy5zdHJva2UuZXhlY3V0ZShkYXRhKSA6IDA7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZSh4MSwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5MSwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh4MiwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5MiwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh4MywgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZSh5MywgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShzdHJva2UsICdudW1iZXInKTtcclxuXHJcbiAgICBjdHgud3JpdGUoe1xyXG4gICAgICAgIGNvbW1hbmQ6IFwidHJpYW5nbGVcIixcclxuICAgICAgICBhcmdzOiB7XHJcbiAgICAgICAgICAgIHgxOiB4MSxcclxuICAgICAgICAgICAgeTE6IHkxLFxyXG4gICAgICAgICAgICB4MjogeDIsXHJcbiAgICAgICAgICAgIHkyOiB5MixcclxuICAgICAgICAgICAgeDM6IHgzLFxyXG4gICAgICAgICAgICB5MzogeTMsXHJcbiAgICAgICAgICAgIHN0cm9rZTogc3Ryb2tlXHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV4dCgpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBUcmlhbmdsZUNvbW1hbmQ7IiwiLyoqXHJcbiAqIFRPRE9cclxuICovXHJcbmZ1bmN0aW9uIFZvbHVtZUNvbW1hbmQoKSB7fVxyXG5cclxuVm9sdW1lQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEsIG5leHQpIHsgbmV4dCgpOyB9O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBWb2x1bWVDb21tYW5kOyIsIi8qKlxyXG4gKiBSZXR1cm5zIHRvIHRoZSBtYXRjaGluZyBXSElMRSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5lXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gV2VuZENvbW1hbmQoYXJncywgZGVmaW5lKSB7XHJcbiAgICB0aGlzLmJsb2NrID0gZGVmaW5lO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuV2VuZENvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBibG9jazogdGhpcy5ibG9jay50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgY29tbWFuZFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dFxyXG4gKi9cclxuV2VuZENvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgcmVmcyA9IHRoaXMuYmxvY2sucmVmZXJlbmNlcygpO1xyXG4gICAgaWYgKCFyZWZzLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdXRU5EIHdpdGhvdXQgV0hJTEUnKTtcclxuXHJcbiAgICBkYXRhLmN1cnNvciA9IHJlZnNbMF0uc3RhcnQ7XHJcbiAgICBuZXh0KCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFdlbmRDb21tYW5kOyIsInZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi4vc3RhdGVtZW50cycpO1xyXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4uLy4uL3V0aWwnKTtcclxudmFyIHNldEltbWVkaWF0ZSA9IHV0aWwuc2V0SW1tZWRpYXRlO1xyXG5cclxuLyoqXHJcbiAqIEl0ZXJhdGVzIG92ZXIgdGhlIGNvbW1hbmRzIGJvZHkgdW50aWwgdGhlIGNvbmRpdGlvbiBpcyB0cnVlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gdGhlIGNvbW1hbmRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5lXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gV2hpbGVDb21tYW5kKGFyZ3MsIGRlZmluZSkge1xyXG4gICAgdmFyIHBhcnNlZCA9IG5ldyBzdGF0ZW1lbnRzLkFyZ3VtZW50U3RhdGVtZW50KGFyZ3MsIHtcclxuICAgICAgICBzZXBhcmF0b3I6IGZhbHNlXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmNvbmRpdGlvbiA9IHBhcnNlZC5hcmdzWzBdO1xyXG4gICAgdGhpcy5ibG9jayA9IGRlZmluZSh7XHJcbiAgICAgICAgc3RhcnQ6ICdXSElMRScsXHJcbiAgICAgICAgZW5kOiAnV0VORCdcclxuICAgIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGNvbW1hbmQgYXJndW1lbnRzIHRvIGEgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5XaGlsZUNvbW1hbmQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5jb25kaXRpb24udG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgY29tbWFuZCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5XaGlsZUNvbW1hbmQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBjb25kaXRpb246IHRoaXMuY29uZGl0aW9uLnRvSlNPTigpLFxyXG4gICAgICAgIGJsb2NrOiB0aGlzLmJsb2NrLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tYW5kXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0XHJcbiAqL1xyXG5XaGlsZUNvbW1hbmQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhLCBuZXh0KSB7XHJcbiAgICB2YXIgc2hvdWxkUnVuID0gdGhpcy5jb25kaXRpb24uZXhlY3V0ZShkYXRhKTtcclxuICAgIGlmICghc2hvdWxkUnVuKSB7XHJcbiAgICAgICAgZGF0YS5jdXJzb3IgPSB0aGlzLmJsb2NrLmVuZCArIDE7XHJcbiAgICAgICAgbmV4dCgpO1xyXG4gICAgfSBlbHNlIHNldEltbWVkaWF0ZShuZXh0KTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gV2hpbGVDb21tYW5kOyIsIi8qKlxyXG4gKiBDb21tYW5kIGxpc3RcclxuICovXHJcblxyXG5leHBvcnRzLmRpbSAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0RpbUNvbW1hbmQnKTtcclxuZXhwb3J0cy5lbmQgICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9FbmRDb21tYW5kJyk7XHJcbmV4cG9ydHMuZ29zdWIgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vR29zdWJDb21tYW5kJyk7XHJcbmV4cG9ydHMuZ290byAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vR290b0NvbW1hbmQnKTtcclxuZXhwb3J0cy5pbnB1dCAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9JbnB1dENvbW1hbmQnKTtcclxuZXhwb3J0cy5wcmludCAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9QcmludENvbW1hbmQnKTtcclxuZXhwb3J0cy5yYW5kb21pemUgICAgICAgICAgID0gcmVxdWlyZSgnLi9SYW5kb21pemVDb21tYW5kJyk7XHJcbmV4cG9ydHMucmV0dXJuICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vUmV0dXJuQ29tbWFuZCcpO1xyXG5leHBvcnRzLnBhdXNlICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL1BhdXNlQ29tbWFuZCcpO1xyXG5leHBvcnRzLnNsZWVwICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL1NsZWVwQ29tbWFuZCcpO1xyXG5leHBvcnRzLmNscyAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0Nsc0NvbW1hbmQnKTtcclxuZXhwb3J0cy5wbGF5ICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9QbGF5Q29tbWFuZCcpO1xyXG5leHBvcnRzLnZvbHVtZSAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL1ZvbHVtZUNvbW1hbmQnKTtcclxuZXhwb3J0cy5wbGF5c3BlZWQgICAgICAgICAgID0gcmVxdWlyZSgnLi9QbGF5c3BlZWRDb21tYW5kJyk7XHJcblxyXG4vLyBHcmFwaGljIGNvbW1hbmRzXHJcbmV4cG9ydHMuY29sb3IgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vQ29sb3JDb21tYW5kJyk7XHJcbmV4cG9ydHMudGNvbG9yICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vVGNvbG9yQ29tbWFuZCcpO1xyXG5leHBvcnRzLmJjb2xvciAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0Jjb2xvckNvbW1hbmQnKTtcclxuZXhwb3J0cy5iZWdpbmRyYXcgICAgICAgICAgID0gcmVxdWlyZSgnLi9CZWdpbmRyYXdDb21tYW5kJyk7XHJcbmV4cG9ydHMuZW5kZHJhdyAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vRW5kZHJhd0NvbW1hbmQnKTtcclxuZXhwb3J0cy5wb2ludCAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9Qb2ludENvbW1hbmQnKTtcclxuZXhwb3J0cy5saW5lICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9MaW5lQ29tbWFuZCcpO1xyXG5leHBvcnRzLnJlY3QgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL1JlY3RDb21tYW5kJyk7XHJcbmV4cG9ydHMucnJlY3QgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vUnJlY3RDb21tYW5kJyk7XHJcbmV4cG9ydHMuY2lyY2xlICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vQ2lyY2xlQ29tbWFuZCcpO1xyXG5leHBvcnRzLmVsbGlwc2UgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0VsbGlwc2VDb21tYW5kJyk7XHJcbmV4cG9ydHMuc2hhcGUgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vU2hhcGVDb21tYW5kJyk7XHJcbmV4cG9ydHMudHJpYW5nbGUgICAgICAgICAgICA9IHJlcXVpcmUoJy4vVHJpYW5nbGVDb21tYW5kJyk7XHJcbmV4cG9ydHMucGllY2hhcnQgICAgICAgICAgICA9IHJlcXVpcmUoJy4vUGllY2hhcnRDb21tYW5kJyk7XHJcbmV4cG9ydHMuZHJhd3RleHQgICAgICAgICAgICA9IHJlcXVpcmUoJy4vRHJhd3RleHRDb21tYW5kJyk7XHJcbmV4cG9ydHMudGV4dGZvbnQgICAgICAgICAgICA9IHJlcXVpcmUoJy4vVGV4dGZvbnRDb21tYW5kJyk7XHJcbmV4cG9ydHMubG9hZHNwcml0ZSAgICAgICAgICA9IHJlcXVpcmUoJy4vTG9hZHNwcml0ZUNvbW1hbmQnKTtcclxuZXhwb3J0cy5kcmF3c3ByaXRlICAgICAgICAgID0gcmVxdWlyZSgnLi9EcmF3c3ByaXRlQ29tbWFuZCcpO1xyXG5leHBvcnRzLnNhdmVzcHJpdGUgICAgICAgICAgPSByZXF1aXJlKCcuL1NhdmVzcHJpdGVDb21tYW5kJyk7XHJcbmV4cG9ydHMucmV0aW5hICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vUmV0aW5hQ29tbWFuZCcpO1xyXG5leHBvcnRzLmFudGlhbGlhcyAgICAgICAgICAgPSByZXF1aXJlKCcuL0FudGlhbGlhc0NvbW1hbmQnKTtcclxuXHJcbmV4cG9ydHMubG9ja29yaWVudGF0aW9uICAgICA9IHJlcXVpcmUoJy4vTG9ja29yaWVudGF0aW9uQ29tbWFuZCcpO1xyXG5leHBvcnRzLnJlcXVpcmVwb3J0cmFpdCAgICAgPSByZXF1aXJlKCcuL1JlcXVpcmVwb3J0cmFpdENvbW1hbmQnKTtcclxuZXhwb3J0cy5yZXF1aXJlbGFuZHNjYXBlICAgID0gcmVxdWlyZSgnLi9SZXF1aXJlbGFuZHNjYXBlQ29tbWFuZCcpO1xyXG5leHBvcnRzLmFjY2VsY2FsaWJyYXRlICAgICAgPSByZXF1aXJlKCcuL0FjY2VsY2FsaWJyYXRlQ29tbWFuZCcpO1xyXG5cclxuLy8gRmlsZSBjb21tYW5kc1xyXG5leHBvcnRzLm9wZW4gICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL09wZW5Db21tYW5kJyk7XHJcbmV4cG9ydHMuY2xvc2UgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vQ2xvc2VDb21tYW5kJyk7XHJcblxyXG4vLyBDb250cm9sIHN0YXRlbWVudHNcclxuZXhwb3J0cy53aGlsZSAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9XaGlsZUNvbW1hbmQnKTtcclxuZXhwb3J0cy53ZW5kICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9XZW5kQ29tbWFuZCcpO1xyXG5leHBvcnRzLmlmICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0lmQ29tbWFuZCcpO1xyXG5leHBvcnRzLmVsc2UgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL0Vsc2VDb21tYW5kJyk7XHJcbmV4cG9ydHMuZW5kaWYgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vRW5kaWZDb21tYW5kJyk7XHJcbmV4cG9ydHMuZm9yICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vRm9yQ29tbWFuZCcpO1xyXG5leHBvcnRzLm5leHQgICAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL05leHRDb21tYW5kJyk7IiwiLyoqXHJcbiAqIFBhcnNlcyBCQVNJQyBjb2RlIGFuZCBjcmVhdGVzIGFuIGFic3RyYWN0IHN5bnRheCB0cmVlXHJcbiAqL1xyXG5cclxudmFyIEFic3RyYWN0U3ludGF4VHJlZSA9IHJlcXVpcmUoJy4vQWJzdHJhY3RTeW50YXhUcmVlJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4vU3ludGF4RXJyb3InKTtcclxudmFyIEJsb2NrTWFuYWdlciA9IHJlcXVpcmUoJy4vQmxvY2snKTtcclxudmFyIHV0aWwgPSByZXF1aXJlKCcuLi91dGlsJyk7XHJcblxyXG52YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4vc3RhdGVtZW50cycpO1xyXG52YXIgQXNzaWdubWVudFN0YXRlbWVudCA9IHN0YXRlbWVudHMuQXNzaWdubWVudFN0YXRlbWVudDtcclxudmFyIENvbW1lbnRTdGF0ZW1lbnQgPSBzdGF0ZW1lbnRzLkNvbW1lbnRTdGF0ZW1lbnQ7XHJcbnZhciBDb21tYW5kU3RhdGVtZW50ID0gc3RhdGVtZW50cy5Db21tYW5kU3RhdGVtZW50O1xyXG52YXIgVmFyaWFibGVTdGF0ZW1lbnQgPSBzdGF0ZW1lbnRzLlZhcmlhYmxlU3RhdGVtZW50O1xyXG52YXIgRXhwcmVzc2lvblN0YXRlbWVudCA9IHN0YXRlbWVudHMuRXhwcmVzc2lvblN0YXRlbWVudDtcclxudmFyIEVtcHR5U3RhdGVtZW50ID0gc3RhdGVtZW50cy5FbXB0eVN0YXRlbWVudDtcclxudmFyIEZ1bmN0aW9uU3RhdGVtZW50ID0gc3RhdGVtZW50cy5GdW5jdGlvblN0YXRlbWVudDtcclxuXHJcbmV4cG9ydHMuQmxvY2sgPSBCbG9ja01hbmFnZXI7XHJcbmV4cG9ydHMuY29tbWFuZHMgPSByZXF1aXJlKCcuL2NvbW1hbmRzJyk7XHJcbmV4cG9ydHMuc3RhdGVtZW50cyA9IHN0YXRlbWVudHM7XHJcbmV4cG9ydHMuQWJzdHJhY3RTeW50YXhUcmVlID0gcmVxdWlyZSgnLi9BYnN0cmFjdFN5bnRheFRyZWUnKTtcclxuZXhwb3J0cy5TeW50YXhFcnJvciA9IHJlcXVpcmUoJy4vU3ludGF4RXJyb3InKTtcclxuXHJcbi8qKlxyXG4gKiBQYXJzZXMgQkFTSUMgY29kZSBhbmQgcmV0dXJucyBhbiBhYnN0cmFjdCBzeW50YXggdHJlZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gY29kZVxyXG4gKiBAcmV0dXJucyB7QWJzdHJhY3RTeW50YXhUcmVlfHtlcnJvcjogU3RyaW5nfX0gVGhlIHJlc3VsdGluZyBBU1RcclxuICovXHJcbmZ1bmN0aW9uIHBhcnNlKGNvZGUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgdmFyIGxhYmVscyA9IHt9O1xyXG4gICAgICAgIHZhciByb290ID0gW107XHJcbiAgICAgICAgdmFyIG1hbmFnZXIgPSBuZXcgQmxvY2tNYW5hZ2VyKCk7XHJcblxyXG4gICAgICAgIHZhciBsaW5lcyA9IGNvZGUuc3BsaXQoJ1xcbicpO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIHZhciBsaW5lID0gcGFyc2VMaW5lKGxpbmVzW2ldLnRyaW0oKSwgaSwgbGFiZWxzLCBmYWxzZSwgbWFuYWdlcik7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGxpbmUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikgdGhyb3cgbGluZTsvL3JldHVybiB7XCJlcnJvclwiOiBsaW5lfTtcclxuICAgICAgICAgICAgICAgIGlmIChsaW5lLmVycm9yIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHRocm93IGxpbmUuZXJyb3I7Ly9yZXR1cm4ge1wiZXJyb3JcIjogbGluZS5lcnJvcn07XHJcbiAgICAgICAgICAgICAgICByb290W2ldID0gbGluZTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXgpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihleC5tZXNzYWdlICsgJyBvbiBsaW5lICcgKyAoaSArIDEpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIG5ldyBBYnN0cmFjdFN5bnRheFRyZWUocm9vdCwgbGFiZWxzLCBtYW5hZ2VyKTtcclxuICAgIH0gY2F0Y2ggKGV4KSB7XHJcbiAgICAgICAgcmV0dXJuIHsgXCJlcnJvclwiOiBleCB9O1xyXG4gICAgfVxyXG59XHJcbmV4cG9ydHMucGFyc2UgPSBwYXJzZTtcclxuXHJcbi8qKlxyXG4gKiBQYXJzZXMgYSBsaW5lIGFuZCByZXR1cm5zIHRoZSBzdGF0ZW1lbnRcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGxpbmUgVGhlIGxpbmUgdG8gcGFyc2VcclxuICogQHBhcmFtIHtOdW1iZXJ9IGkgVGhlIGxpbmUgaW5kZXhcclxuICogQHBhcmFtIHtPYmplY3R9IGxhYmVscyBUaGUgbGlzdCBvZiBsYWJlbHNcclxuICogQHBhcmFtIHtCb29sZWFufSBub3RMaW5lTnVtYmVyIElmIHRydWUsIHdvbnQgc2VlIGlmIGl0IHN0YXJ0cyB3aXRoIGEgbGluZSBudW1iZXJcclxuICogQHBhcmFtIHtCbG9ja01hbmFnZXJ9IG1hbmFnZXIgVGhlIGJsb2NrIG1hbmFnZXJcclxuICogQHJldHVybnMge0Fzc2lnbm1lbnRTdGF0ZW1lbnR8Q29tbWVudFN0YXRlbWVudHxDb21tYW5kU3RhdGVtZW50fEVtcHR5U3RhdGVtZW50fEZ1bmN0aW9uU3RhdGVtZW50fFN5bnRheEVycm9yfVxyXG4gKi9cclxuZnVuY3Rpb24gcGFyc2VMaW5lKGxpbmUsIGksIGxhYmVscywgbm90TGluZU51bWJlciwgbWFuYWdlcikge1xyXG4gICAgbGluZSA9IGxpbmUudHJpbSgpO1xyXG5cclxuICAgIC8vIElzIGl0IGFuIGVtcHR5IGxpbmU/XHJcbiAgICBpZiAobGluZSA9PT0gXCJcIikgcmV0dXJuIG5ldyBFbXB0eVN0YXRlbWVudCgpO1xyXG5cclxuICAgIGlmIChsaW5lLmluZGV4T2YoXCInXCIpID09PSAwIHx8IGxpbmUudG9VcHBlckNhc2UoKSA9PT0gXCJSRU1cIiB8fCBsaW5lLnRvVXBwZXJDYXNlKCkuaW5kZXhPZihcIlJFTSBcIikgPT09IDApIHtcclxuICAgICAgICByZXR1cm4gbmV3IENvbW1lbnRTdGF0ZW1lbnQobGluZS5zdWJzdHJpbmcobGluZS5pbmRleE9mKFwiIFwiKSkudHJpbSgpKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgYnJhY2tldFBvc2l0aW9ucztcclxuICAgIGZ1bmN0aW9uIGdldFBvc2l0aW9ucyhsbikge1xyXG4gICAgICAgIHJldHVybiB1dGlsLmZpbmRQb3NpdGlvbnMobG4sIFtcclxuICAgICAgICAgICAgeyBzdGFydDogJygnLCBlbmQ6ICcpJyB9LFxyXG4gICAgICAgICAgICB7IHN0YXJ0OiAnXCInLCBlbmQ6ICdcIicgfVxyXG4gICAgICAgIF0pO1xyXG4gICAgfVxyXG4gICAgYnJhY2tldFBvc2l0aW9ucyA9IGdldFBvc2l0aW9ucyhsaW5lKTtcclxuXHJcbiAgICAvLyBTZWUgaWYgdGhlcmUgaXMgYSBjb21tZW50XHJcbiAgICB2YXIgc3RhcnRDb21tZW50SW5kZXggPSB1dGlsLmluZGV4T2ZPdXRzaWRlKGxpbmUsIFwiJ1wiLCAwLCBicmFja2V0UG9zaXRpb25zKTtcclxuICAgIGlmIChzdGFydENvbW1lbnRJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICBsaW5lID0gbGluZS5zdWJzdHJpbmcoMCwgc3RhcnRDb21tZW50SW5kZXgpLnRyaW0oKTtcclxuICAgICAgICBicmFja2V0UG9zaXRpb25zID0gZ2V0UG9zaXRpb25zKGxpbmUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIElzIGl0IGEgbGFiZWw/XHJcbiAgICBpZiAobGluZVtsaW5lLmxlbmd0aCAtIDFdID09PSAnOicpIHtcclxuICAgICAgICB2YXIgbGFiZWxOYW1lID0gbGluZS5zdWJzdHJpbmcoMCwgbGluZS5sZW5ndGggLSAxKTtcclxuICAgICAgICBsYWJlbHNbbGFiZWxOYW1lXSA9IGk7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBFbXB0eVN0YXRlbWVudCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChsaW5lLmluZGV4T2YoJ0VORCBJRicpID09PSAwKSBsaW5lID0gJ0VORElGJztcclxuXHJcbiAgICAvLyBGaW5kIGZpcnN0IHNwYWNlLCBidXQgb25seSBvdXRzaWRlIG9mIGJyYWNrZXRzXHJcbiAgICB2YXIgc3BhY2VJbmRleCA9IHV0aWwuaW5kZXhPZk91dHNpZGUobGluZSwgJyAnLCAwLCBicmFja2V0UG9zaXRpb25zKTtcclxuXHJcbiAgICAvLyBJZiB0aGUgbGluZSBpcyBvbmx5IGEgbGluZSBudW1iZXJcclxuICAgIGlmIChzcGFjZUluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIHZhciBwYXJzZWRMaW5lID0gcGFyc2VJbnQobGluZSk7XHJcbiAgICAgICAgaWYgKCFub3RMaW5lTnVtYmVyICYmICFpc05hTihwYXJzZUludChsaW5lKSkpIHtcclxuICAgICAgICAgICAgbGFiZWxzW2xpbmVdID0gaTtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBFbXB0eVN0YXRlbWVudCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgY29tbWFuZFNlY3Rpb24sIGFyZ3VtZW50U2VjdGlvbjtcclxuICAgIGlmIChzcGFjZUluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgIGNvbW1hbmRTZWN0aW9uID0gbGluZS5zdWJzdHJpbmcoMCwgc3BhY2VJbmRleCkudHJpbSgpO1xyXG4gICAgICAgIGFyZ3VtZW50U2VjdGlvbiA9IGxpbmUuc3Vic3RyaW5nKHNwYWNlSW5kZXgpLnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gSXMgaXQgYSBsaW5lIG51bWJlcj9cclxuICAgICAgICBpZiAoIW5vdExpbmVOdW1iZXIgJiYgIWlzTmFOKHBhcnNlSW50KGNvbW1hbmRTZWN0aW9uKSkpIHtcclxuICAgICAgICAgICAgbGFiZWxzW2NvbW1hbmRTZWN0aW9uXSA9IGk7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUxpbmUoYXJndW1lbnRTZWN0aW9uLCBpLCBsYWJlbHMsIHRydWUsIG1hbmFnZXIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgaXQgZm9sbG93cyB0aGUgcGF0dGVybiB4ID0geSBvciB4ID15LCBpdCBtdXN0IGJlIGFuIGFzc2lnbm1lbnRcclxuICAgICAgICBpZiAoYXJndW1lbnRTZWN0aW9uWzBdID09PSAnPScpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBBc3NpZ25tZW50U3RhdGVtZW50KG5ldyBWYXJpYWJsZVN0YXRlbWVudChjb21tYW5kU2VjdGlvbiksIG5ldyBFeHByZXNzaW9uU3RhdGVtZW50KGFyZ3VtZW50U2VjdGlvbi5zdWJzdHJpbmcoMSkudHJpbSgpKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBhbiBlcXVhbCBzaWduIGluIHRoZSBjb21tYW5kLCBpdCBtdXN0IGJlIGFuIGFzc2lnbm1lbnRcclxuICAgICAgICB2YXIgY21kRXF1YWxJbmRleCA9IGNvbW1hbmRTZWN0aW9uLmluZGV4T2YoJz0nKTtcclxuICAgICAgICBpZiAoY21kRXF1YWxJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgdmFyIGVxdWFsTGluZSA9IGNvbW1hbmRTZWN0aW9uICsgJyAnICsgYXJndW1lbnRTZWN0aW9uO1xyXG4gICAgICAgICAgICB2YXIgdmFyTmFtZSA9IGVxdWFsTGluZS5zdWJzdHJpbmcoMCwgY21kRXF1YWxJbmRleCkudHJpbSgpO1xyXG4gICAgICAgICAgICB2YXIgdmFyRXhwciA9IGVxdWFsTGluZS5zdWJzdHJpbmcoY21kRXF1YWxJbmRleCArIDEpLnRyaW0oKTtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBBc3NpZ25tZW50U3RhdGVtZW50KG5ldyBWYXJpYWJsZVN0YXRlbWVudCh2YXJOYW1lKSwgbmV3IEV4cHJlc3Npb25TdGF0ZW1lbnQodmFyRXhwcikpO1xyXG4gICAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29tbWFuZFNlY3Rpb24gPSBsaW5lO1xyXG4gICAgICAgIGFyZ3VtZW50U2VjdGlvbiA9ICcnO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBhbiBlcXVhbCBzaWduLCBpdCBtdXN0IGJlIGFuIGFzc2lnbm1lbnQgKHdpdGggbm8gc3BhY2UsIGUuZy4geD15KVxyXG4gICAgICAgIHZhciBlcXVhbEluZGV4ID0gY29tbWFuZFNlY3Rpb24uaW5kZXhPZignPScpO1xyXG4gICAgICAgIGlmIChlcXVhbEluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICB2YXIgdmFyaWFibGVOYW1lID0gY29tbWFuZFNlY3Rpb24uc3Vic3RyaW5nKDAsIGVxdWFsSW5kZXgpO1xyXG4gICAgICAgICAgICB2YXIgdmFyaWFibGVFeHByID0gY29tbWFuZFNlY3Rpb24uc3Vic3RyaW5nKGVxdWFsSW5kZXggKyAxKTtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBBc3NpZ25tZW50U3RhdGVtZW50KG5ldyBWYXJpYWJsZVN0YXRlbWVudCh2YXJpYWJsZU5hbWUpLCBuZXcgRXhwcmVzc2lvblN0YXRlbWVudCh2YXJpYWJsZUV4cHIpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIElzIGl0IGEgcm9vdC1sZXZlbCBmdW5jdGlvbiBjYWxsP1xyXG4gICAgICAgIHZhciBicmFja2V0SW5kZXggPSBjb21tYW5kU2VjdGlvbi5pbmRleE9mKCcoJyk7XHJcbiAgICAgICAgaWYgKGJyYWNrZXRJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgdmFyIGVuZEJyYWNrZXRJbmRleCA9IGNvbW1hbmRTZWN0aW9uLmluZGV4T2YoJyknKTtcclxuICAgICAgICAgICAgaWYgKGVuZEJyYWNrZXRJbmRleCA9PT0gLTEpIHJldHVybiBuZXcgU3ludGF4RXJyb3IoJ1VuZXhwZWN0ZWQgb3BlbiBicmFja2V0Jyk7XHJcbiAgICAgICAgICAgIHZhciBmdW5jdGlvbk5hbWUgPSBjb21tYW5kU2VjdGlvbi5zdWJzdHJpbmcoMCwgYnJhY2tldEluZGV4KTtcclxuICAgICAgICAgICAgaWYgKCFpc05hTihwYXJzZUludChmdW5jdGlvbk5hbWUpKSkgcmV0dXJuIG5ldyBTeW50YXhFcnJvcignRXhwZWN0ZWQgZnVuY3Rpb24gbmFtZScpO1xyXG4gICAgICAgICAgICB2YXIgYXJncyA9IGNvbW1hbmRTZWN0aW9uLnN1YnN0cmluZyhicmFja2V0SW5kZXggKyAxLCBlbmRCcmFja2V0SW5kZXgpO1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IEZ1bmN0aW9uU3RhdGVtZW50KGZ1bmN0aW9uTmFtZSwgYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbW1hbmRTZWN0aW9uID0gY29tbWFuZFNlY3Rpb24udG9VcHBlckNhc2UoKTtcclxuICAgIHJldHVybiBuZXcgQ29tbWFuZFN0YXRlbWVudChjb21tYW5kU2VjdGlvbi50b0xvd2VyQ2FzZSgpLCBhcmd1bWVudFNlY3Rpb24sIG1hbmFnZXIsIGkpO1xyXG59XHJcblxyXG5leHBvcnRzLnBhcnNlTGluZSA9IHBhcnNlTGluZTsiLCJ2YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4vJyk7XHJcbnZhciB1dGlsID0gcmVxdWlyZSgnLi4vLi4vdXRpbCcpO1xyXG5cclxuLyoqXHJcbiAqIFJlcHJlc2VudHMgYSBzZXQgb2YgYXJndW1lbnRzIHRvIGEgY29tbWFuZCBjYWxsXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBhcmdzIFRoZSBhcmd1bWVudHMgdG8gcGFyc2VcclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgQ29tbWFuZCBvcHRpb25zXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb24/fSBkZWZpbmVcclxuICovXHJcbmZ1bmN0aW9uIEFyZ3VtZW50U3RhdGVtZW50KGFyZ3MsIG9wdGlvbnMsIGRlZmluZSkge1xyXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcbiAgICB0aGlzLnZhbHVlID0gYXJncztcclxuICAgIHRoaXMuZmxhZ3MgPSB7fTtcclxuICAgIHRoaXMuYXJncyA9IFtdO1xyXG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcclxuXHJcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMucGFyc2UgPT09ICd1bmRlZmluZWQnKSBvcHRpb25zLnBhcnNlID0gdHJ1ZTtcclxuICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5zZXBhcmF0b3IgPT09ICd1bmRlZmluZWQnKSBvcHRpb25zLnNlcGFyYXRvciA9ICcsJztcclxuICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5wYXJzZUFyZ3MgPT09ICd1bmRlZmluZWQnKSBvcHRpb25zLnBhcnNlQXJncyA9IHRydWU7XHJcblxyXG4gICAgaWYgKG9wdGlvbnMucGFyc2UpIHtcclxuICAgICAgICBpZiAob3B0aW9ucy5mbGFncykge1xyXG4gICAgICAgICAgICB2YXIgaXNGbGFnID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgICAgIC8vIEZpbmQgYWxsIG1hdGNoaW5nIGZsYWdzICB1bnRpbCBubyBmbGFnIGlzIGZvdW5kXHJcbiAgICAgICAgICAgIHdoaWxlKGlzRmxhZykge1xyXG4gICAgICAgICAgICAgICAgdmFyIGZpcnN0RmxhZ0VuZCA9IGFyZ3MuaW5kZXhPZignICcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGZpcnN0RmxhZ0VuZCA9PT0gLTEpIGZpcnN0RmxhZ0VuZCA9IGFyZ3MubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgdmFyIGZpcnN0RmxhZyA9IGFyZ3Muc3Vic3RyaW5nKDAsIGZpcnN0RmxhZ0VuZCkudHJpbSgpLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuZmxhZ3MuaW5kZXhPZihmaXJzdEZsYWcpICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmxhZ3NbZmlyc3RGbGFnXSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXJncyA9IGFyZ3Muc3Vic3RyaW5nKGZpcnN0RmxhZ0VuZCkudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSBpc0ZsYWcgPSBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yYXdBcmdzID0gYXJncztcclxuXHJcbiAgICAgICAgYXJncyA9IGFyZ3MudHJpbSgpO1xyXG4gICAgICAgIHZhciBhcmdMaXN0ID0gW2FyZ3NdO1xyXG4gICAgICAgIGlmIChvcHRpb25zLnNlcGFyYXRvcikge1xyXG4gICAgICAgICAgICBpZiAoIWFyZ3MubGVuZ3RoKSBhcmdMaXN0ID0gW107XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdmFyIHBvc2l0aW9ucyA9IHV0aWwuZmluZFBvc2l0aW9ucyhhcmdzLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgeydzdGFydCc6ICdcIicsICdlbmQnOiAnXCInfSxcclxuICAgICAgICAgICAgICAgICAgICB7J3N0YXJ0JzogJygnLCAnZW5kJzogJyknfVxyXG4gICAgICAgICAgICAgICAgXSk7XHJcbiAgICAgICAgICAgICAgICBhcmdMaXN0ID0gdXRpbC5zcGxpdE91dHNpZGUoYXJncywgb3B0aW9ucy5zZXBhcmF0b3IsIHBvc2l0aW9ucyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmdMaXN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBhcmcgPSBhcmdMaXN0W2ldLnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKG9wdGlvbnMucGFyc2VBcmdzKSBhcmcgPSBuZXcgc3RhdGVtZW50cy5FeHByZXNzaW9uU3RhdGVtZW50KGFyZywgZGVmaW5lKTtcclxuICAgICAgICAgICAgdGhpcy5hcmdzLnB1c2goYXJnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgc3RhdGVtZW50IHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkFyZ3VtZW50U3RhdGVtZW50LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogJ0FyZ3VtZW50U3RhdGVtZW50JyxcclxuICAgICAgICB2YWx1ZTogdGhpcy52YWx1ZSxcclxuICAgICAgICBmbGFnczogdGhpcy5mbGFncyxcclxuICAgICAgICBhcmdzOiB0aGlzLmFyZ3MsXHJcbiAgICAgICAgb3B0aW9uczogdGhpcy5vcHRpb25zXHJcbiAgICB9O1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBcmd1bWVudFN0YXRlbWVudDsiLCIvKipcclxuICogUmVwcmVzZW50cyBhbiBhc3NpZ25tZW50IG9mIGEgdmFsdWUgdG8gYSB2YXJpYWJsZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1ZhcmlhYmxlU3RhdGVtZW50fSB2YXJpYWJsZSBUaGUgdmFyaWFibGUgdG8gYXNzaWduXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gZXhwcmVzc2lvbiBUaGUgZXhwcmVzc2lvbiB0byBldmFsdWF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gQXNzaWdubWVudFN0YXRlbWVudCh2YXJpYWJsZSwgZXhwcmVzc2lvbikge1xyXG4gICAgdGhpcy52YXJpYWJsZSA9IHZhcmlhYmxlO1xyXG4gICAgdGhpcy5leHByZXNzaW9uID0gZXhwcmVzc2lvbjtcclxufVxyXG5cclxuLyoqXHJcbiAqIE91dHB1dHMgZXhlY3V0YWJsZSBjb2RlIHRoYXQgcmVwcmVzZW50cyB0aGUgYXNzaWdubWVudFxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuQXNzaWdubWVudFN0YXRlbWVudC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLnZhcmlhYmxlLnRvU3RyaW5nKCkgKyBcIiA9IFwiICsgdGhpcy5leHByZXNzaW9uLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIGFzc2lnbm1lbnQgdG8gc2VyaWFsaXphYmxlIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkFzc2lnbm1lbnRTdGF0ZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIkFzc2lnbm1lbnRTdGF0ZW1lbnRcIixcclxuICAgICAgICB2YXJpYWJsZTogdGhpcy52YXJpYWJsZS50b0pTT04oKSxcclxuICAgICAgICBleHByZXNzaW9uOiB0aGlzLmV4cHJlc3Npb24udG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGFzc2lnbm1lbnRcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhIFRoZSBleGVjdXRpb24gZGF0YSBjb250ZXh0XHJcbiAqL1xyXG5Bc3NpZ25tZW50U3RhdGVtZW50LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgZGF0YS5zZXRWYXJpYWJsZSh0aGlzLnZhcmlhYmxlLCB0aGlzLmV4cHJlc3Npb24pO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBc3NpZ25tZW50U3RhdGVtZW50OyIsInZhciBjb21tYW5kcyA9IHJlcXVpcmUoJy4uL2NvbW1hbmRzJyk7XHJcbnZhciBTeW50YXhFcnJvciA9IHJlcXVpcmUoJy4uL1N5bnRheEVycm9yJyk7XHJcblxyXG4vKipcclxuICogUmVwcmVzZW50cyBhIGNvbW1hbmQgY2FsbFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgY29tbWFuZFxyXG4gKiBAcGFyYW0ge1N0cmluZ30gYXJncyBUaGUgYXJndW1lbnRzIHRvIHRoZSBjb21tYW5kXHJcbiAqIEBwYXJhbSB7QmxvY2tNYW5hZ2VyfSBtYW5hZ2VyIFRoZSBibG9jayBtYW5hZ2VyXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lIFRoZSBsaW5lIG51bWJlclxyXG4gKi9cclxuZnVuY3Rpb24gQ29tbWFuZFN0YXRlbWVudChuYW1lLCBhcmdzLCBtYW5hZ2VyLCBsaW5lKSB7XHJcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xyXG4gICAgdGhpcy5hcmdzID0gYXJncztcclxuXHJcbiAgICBpZiAoIWNvbW1hbmRzW25hbWVdKSB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ1Vua25vd24gY29tbWFuZDogJyArIG5hbWUpO1xyXG4gICAgdGhpcy5jb21tYW5kID0gbmV3IGNvbW1hbmRzW25hbWVdKGFyZ3MsIG1hbmFnZXIuY3JlYXRlKGxpbmUpKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE91dHB1dHMgZXhlY3V0YWJsZSBjZGUgdGhhdCByZXByZXNlbnRzIHRoZSBjb21tYW5kIGNhbGxcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkNvbW1hbmRTdGF0ZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgc3RyaW5nQXJncyA9IHRoaXMuY29tbWFuZC50b1N0cmluZygpO1xyXG4gICAgcmV0dXJuIHRoaXMubmFtZS50b1VwcGVyQ2FzZSgpICsgKHN0cmluZ0FyZ3MgPT09ICdbb2JqZWN0IE9iamVjdF0nID8gJycgOiAnICcgKyBzdHJpbmdBcmdzKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgYXNzaWdubWVudCB0byBzZXJpYWxpemFibGUgSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuQ29tbWFuZFN0YXRlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiQ29tbWFuZFN0YXRlbWVudFwiLFxyXG4gICAgICAgIG5hbWU6IHRoaXMubmFtZSxcclxuICAgICAgICBjb21tYW5kOiB0aGlzLmNvbW1hbmQudG9KU09OID8gdGhpcy5jb21tYW5kLnRvSlNPTigpIDoge31cclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIGNvbW1hbmQgY2FsbFxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGEgVGhlIGV4ZWN1dGlvbiBkYXRhIGNvbnRleHRcclxuICovXHJcbkNvbW1hbmRTdGF0ZW1lbnQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICByZXR1cm4gZGF0YS5jYWxsQ29tbWFuZCh0aGlzLmNvbW1hbmQpO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBDb21tYW5kU3RhdGVtZW50OyIsIi8qKlxyXG4gKiBSZXByZXNlbnRzIGEgY29tbWVudCwgd2hpY2ggZG9lcyBub3RoaW5nXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBjb21tZW50IHRleHRcclxuICovXHJcbmZ1bmN0aW9uIENvbW1lbnRTdGF0ZW1lbnQodGV4dCkge1xyXG4gICAgdGhpcy50ZXh0ID0gdGV4dDtcclxufVxyXG5cclxuLyoqXHJcbiAqIE91dHB1dHMgZXhlY3V0YWJsZSBjb2RlIHJlcHJlc2VudGluZyB0aGUgc3RhdGVtZW50XHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Db21tZW50U3RhdGVtZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIFwiJyBcIiArIHRoaXMudGV4dDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgc3RhdGVtZW50IHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkNvbW1lbnRTdGF0ZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiAnQ29tbWVudFN0YXRlbWVudCcsXHJcbiAgICAgICAgdGV4dDogdGhpcy50ZXh0XHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tZW50IChpLmUgZG9lcyBub3RoaW5nKVxyXG4gKi9cclxuQ29tbWVudFN0YXRlbWVudC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKCkgeyB9O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBDb21tZW50U3RhdGVtZW50OyIsIi8qKlxyXG4gKiBBbiBlbXB0eSBzdGF0ZW1lbnQgdGhhdCBkb2VzIG5vdGhpbmdcclxuICpcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBFbXB0eVN0YXRlbWVudCgpIHsgfVxyXG5cclxuLyoqXHJcbiAqIE91dHB1dHMgZXhlY3V0YWJsZSBjb2RlIHJlcHJlc2VudGluZyB0aGUgc3RhdGVtZW50XHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5FbXB0eVN0YXRlbWVudC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiBcIlwiO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBzdGF0ZW1lbnQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuRW1wdHlTdGF0ZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHsgdHlwZTogJ0VtcHR5U3RhdGVtZW50JyB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBjb21tZW50IChpLmUgZG9lcyBub3RoaW5nKVxyXG4gKi9cclxuRW1wdHlTdGF0ZW1lbnQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbigpIHsgfTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRW1wdHlTdGF0ZW1lbnQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLycpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgb3BlcmF0b3JzID0gcmVxdWlyZSgnLi9vcGVyYXRvcnMnKTtcclxudmFyIHV0aWwgPSByZXF1aXJlKCcuLi8uLi91dGlsJyk7XHJcblxyXG52YXIgYWxsT3BlcmF0b3JzID0gW107XHJcbmZvciAodmFyIGkgPSAwOyBpIDwgb3BlcmF0b3JzLmxlbmd0aDsgaSsrKSBhbGxPcGVyYXRvcnMgPSBhbGxPcGVyYXRvcnMuY29uY2F0KE9iamVjdC5rZXlzKG9wZXJhdG9yc1tpXSkpO1xyXG5cclxuLyoqXHJcbiAqIFJlcHJlc2VudHMgc29tZSBmb3JtIG9mIGV4cHJlc3Npb24gdG8gZmluZCBhIHZhbHVlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhIFRoZSBjb2RlIHRvIHBhcnNlXHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluZVxyXG4gKi9cclxuZnVuY3Rpb24gRXhwcmVzc2lvblN0YXRlbWVudChkYXRhLCBkZWZpbmUpIHtcclxuICAgIHRoaXMuY2hpbGQgPSBwYXJzZUV4cHJlc3Npb24oZGF0YSwgZGVmaW5lID8gZGVmaW5lLmxpbmUgOiAndW5rbm93bicpO1xyXG5cclxuICAgIGlmICh0aGlzLmNoaWxkIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHRocm93IHRoaXMuY2hpbGQ7XHJcbiAgICBlbHNlIGlmICh0aGlzLmNoaWxkLmVycm9yKSB0aHJvdyB0aGlzLmNoaWxkLmVycm9yO1xyXG59XHJcblxyXG4vKipcclxuICogT3V0cHV0cyBleGVjdXRhYmxlIGNvZGUgdGhhdCByZXByZXNlbnRzIHRoZSBleHByZXNzaW9uXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5FeHByZXNzaW9uU3RhdGVtZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuY2hpbGQudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgc3RhdGVtZW50IHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkV4cHJlc3Npb25TdGF0ZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIkV4cHJlc3Npb25TdGF0ZW1lbnRcIixcclxuICAgICAgICBjaGlsZDogdGhpcy5jaGlsZC50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgZXhwcmVzc2lvblxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGEgVGhlIGV4ZWN1dGlvbiBkYXRhIGNvbnRleHRcclxuICogQHJldHVybnMge1N0cmluZ3xOdW1iZXJ9IFRoZSB2YWx1ZSBvZiB0aGUgZXhwcmVzc2lvblxyXG4gKi9cclxuRXhwcmVzc2lvblN0YXRlbWVudC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIGlmICh0aGlzLmVycm9yKSB0aHJvdyB0aGlzLmVycm9yO1xyXG5cclxuICAgIHJldHVybiB0aGlzLmNoaWxkLmV4ZWN1dGUoZGF0YSk7XHJcbn07XHJcblxyXG4vKipcclxuICogUGFyc2VzIGEgZ2l2ZW4gZXhwcmVzc2lvbiwgZm9sbG93aW5nIEJPQ01EQVNcclxuICogKEJyYWNrZXRzLCBDb21wYXJhdG9ycywgTXVsdGlwbGljYXRpb24vRGl2aXNpb24sIEFkZGl0aW9uL1N1YnRyYWN0aW9uL2JpbmFyeSBvcGVyYXRvcnMpXHJcbiAqIFRvIGNvbmZpZ3VyZSB0aGUgb3JkZXIgQHNlZSBvcGVyYXRvcnMvaW5kZXguanNcclxuICpcclxuICogVHdvIG9wZXJhdG9ycyBvZiB0aGUgc2FtZSBwcmVjZWRlbmNlIHdpbGwgZXhlY3V0ZSBsZWZ0IHRvIHJpZ2h0LCBqdXN0IGFzIGV4cGVjdGVkXHJcbiAqXHJcbiAqIEBwYXJhbSBkYXRhXHJcbiAqIEBwYXJhbSBsaW5lXHJcbiAqL1xyXG5mdW5jdGlvbiBwYXJzZUV4cHJlc3Npb24oZGF0YSwgbGluZSkge1xyXG4gICAgZGF0YSA9IGRhdGEudHJpbSgpO1xyXG5cclxuICAgIHZhciBsb3dlckRhdGEgPSBkYXRhLnRvTG93ZXJDYXNlKCk7XHJcbiAgICB2YXIgcG9zaXRpb25zID0gdXRpbC5maW5kUG9zaXRpb25zKGxvd2VyRGF0YSwgW1xyXG4gICAgICAgIHsgJ3N0YXJ0JzogJ1wiJywgJ2VuZCc6ICdcIicgfSxcclxuICAgICAgICB7ICdzdGFydCc6ICcoJywgJ2VuZCc6ICcpJyB9XHJcbiAgICBdKTtcclxuXHJcbiAgICAvLyBUcnkgdG8gZmluZCBhbiBvcGVyYXRvciBpbiB0aGUgcm9vdCBvZiB0aGUgZGF0YVxyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvcGVyYXRvcnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgb3BlcmF0b3JMaXN0ID0gb3BlcmF0b3JzW2ldO1xyXG4gICAgICAgIHZhciBvcGVyYXRvck5hbWVzID0gT2JqZWN0LmtleXMob3BlcmF0b3JMaXN0KTtcclxuXHJcbiAgICAgICAgLy8gV2UgZ28gYmFja3dhcmRzIHNvIHRoYXQgdGhlIHJlc3VsdGluZyBvYmplY3QgbmVzdGluZyBnb2VzIGZyb20gbGVmdCB0byByaWdodFxyXG4gICAgICAgIC8vIGluIHRoZSBjYXNlIG9mIHR3byBvcGVyYXRvcnMgd2l0aCB0aGUgc2FtZSBwcmVjZWRlbmNlIGFyZSBiZXNpZGUgZWFjaCBvdGhlci5cclxuICAgICAgICAvLyBGb3IgZXhhbXBsZSwgd2l0aCB0aGUgZXhwcmVzc2lvbiAnMSAqIDIgLyAzJyB5b3Ugd291bGQgZXhwZWN0IGl0IHRvIGRvIHRoZVxyXG4gICAgICAgIC8vICcxICogMicgcGFydCBmaXJzdCwgc28gd2UgaGF2ZSB0byBnbyB0aGlzIHdheSBzbyB0aGF0IGl0IHBhcnNlcyBhc1xyXG4gICAgICAgIC8vIERpdmlzaW9uT3BlcmF0b3IoJzEgKiAyJywgJzMnKSBpbnN0ZWFkIG9mIE11bHRpcGxpY2F0aW9uT3BlcmF0b3IoJzEnLCAnMiAvIDMnKVxyXG4gICAgICAgIHZhciBmb3VuZCA9IHV0aWwuZmluZExhc3RPdXRzaWRlKGxvd2VyRGF0YSwgb3BlcmF0b3JOYW1lcywgbG93ZXJEYXRhLmxlbmd0aCwgcG9zaXRpb25zKTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgYW4gb3BlcmF0b3IsIHBhcnNlIHRoZSB0d28gc2lkZXMgYW5kIHRoZW4gcmV0dXJuIHRoZSBvcGVyYXRvclxyXG4gICAgICAgIGlmIChmb3VuZC5pbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gbnVtYmVyIGJlZm9yZSBhbmQgdGhlIGNoYXJhY3RlciBpcyAnLScgb3IgJysnLCBpZ25vcmVcclxuICAgICAgICAgICAgdmFyIGJlZm9yZVRleHQgPSBkYXRhLnN1YnN0cmluZygwLCBmb3VuZC5pbmRleCkudHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAoKGZvdW5kLmZvdW5kID09PSAnLScgfHwgZm91bmQuZm91bmQgPT09ICcrJykpIHtcclxuICAgICAgICAgICAgICAgIHZhciBwcmV2aW91c09wZXJhdG9yID0gdXRpbC5maW5kTGFzdChiZWZvcmVUZXh0LCBhbGxPcGVyYXRvcnMpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHByZXZpb3VzT3BlcmF0b3IuaW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1pZGRsZUNvbnRlbnQgPSBiZWZvcmVUZXh0LnN1YnN0cmluZyhwcmV2aW91c09wZXJhdG9yLmluZGV4ICsgcHJldmlvdXNPcGVyYXRvci5mb3VuZC5sZW5ndGgpLnRyaW0oKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIW1pZGRsZUNvbnRlbnQubGVuZ3RoKSBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdmFyIGJlZm9yZSA9IHBhcnNlRXhwcmVzc2lvbihiZWZvcmVUZXh0KTtcclxuICAgICAgICAgICAgdmFyIGFmdGVyID0gcGFyc2VFeHByZXNzaW9uKGRhdGEuc3Vic3RyaW5nKGZvdW5kLmluZGV4ICsgZm91bmQuZm91bmQubGVuZ3RoKSk7XHJcblxyXG4gICAgICAgICAgICB2YXIgb3BlcmF0b3JDb25zdHJ1Y3RvciA9IG9wZXJhdG9yTGlzdFtmb3VuZC5mb3VuZF07XHJcbiAgICAgICAgICAgIGlmICghb3BlcmF0b3JDb25zdHJ1Y3RvcikgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdVbmtub3duIG9wZXJhdG9yJyk7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgb3BlcmF0b3JDb25zdHJ1Y3RvcihiZWZvcmUsIGFmdGVyKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgbm9uZSBhcmUgZm91bmQsIGl0cyBlaXRoZXIgYSBzeW50YXggZXJyb3IsIGZ1bmN0aW9uIGNhbGwsIGJyYWNrZXQsIG9yIHNpbmd1bGFyIGV4cHJlc3Npb25cclxuICAgIHZhciBzdGFydEJyYWNrZXRJbmRleCA9IGRhdGEuaW5kZXhPZignKCcpO1xyXG4gICAgaWYgKHN0YXJ0QnJhY2tldEluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgIHZhciBlbmRCcmFja2V0SW5kZXggPSBkYXRhLmxhc3RJbmRleE9mKCcpJyk7XHJcbiAgICAgICAgaWYgKGVuZEJyYWNrZXRJbmRleCA9PT0gLTEpIHRocm93IG5ldyBTeW50YXhFcnJvcignRXhwZWN0ZWQgZW5kIGJyYWNrZXQgaW4gJyArIGRhdGEpO1xyXG4gICAgICAgIHZhciBicmFja2V0Q29udGVudCA9IGRhdGEuc3Vic3RyaW5nKHN0YXJ0QnJhY2tldEluZGV4ICsgMSwgZW5kQnJhY2tldEluZGV4KS50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIHNvbWV0aGluZyBiZWZvcmUgdGhlIGJyYWNrZXQsIGl0cyBhIGZ1bmN0aW9uIGNhbGxcclxuICAgICAgICB2YXIgYmVmb3JlQnJhY2tldCA9IGRhdGEuc3Vic3RyaW5nKDAsIHN0YXJ0QnJhY2tldEluZGV4KS50cmltKCk7XHJcbiAgICAgICAgaWYgKGJlZm9yZUJyYWNrZXQubGVuZ3RoKSByZXR1cm4gbmV3IHN0YXRlbWVudHMuRnVuY3Rpb25TdGF0ZW1lbnQoYmVmb3JlQnJhY2tldCwgYnJhY2tldENvbnRlbnQpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBzb21ldGhpbmcgYWZ0ZXIgdGhlIGJyYWNrZXQsIGl0cyBhIHN5bnRheCBlcnJvclxyXG4gICAgICAgIHZhciBhZnRlckJyYWNrZXQgPSBkYXRhLnN1YnN0cmluZyhlbmRCcmFja2V0SW5kZXggKyAxKS50cmltKCk7XHJcbiAgICAgICAgaWYgKGFmdGVyQnJhY2tldC5sZW5ndGgpIHRocm93IG5ldyBTeW50YXhFcnJvcihcIlVuZXhwZWN0ZWQgZXhwcmVzc2lvblwiKTtcclxuXHJcbiAgICAgICAgLy8gSWYgd2UndmUgZ290dGVuIHRvIGhlcmUsIGl0cyBqdXN0IGFuIGV4cHJlc3Npb24gaW4gYnJhY2tldHNcclxuICAgICAgICByZXR1cm4gcGFyc2VFeHByZXNzaW9uKGJyYWNrZXRDb250ZW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBJdCBtdXN0IGJlIGEgc2luZ3VsYXIgZXhwcmVzc2lvblxyXG4gICAgcmV0dXJuIHBhcnNlU2luZ3VsYXJFeHByZXNzaW9uKGRhdGEpO1xyXG59XHJcblxyXG4vKipcclxuICogUGFyc2VzIGEgc2luZ2xlIGV4cHJlc3Npb24gKG9uZSB3aXRob3V0IGFueSBvcGVyYXRvcnMpIGFuZCByZXR1cm5zIGEgdmFyaWFibGUsIHN0cmluZywgb3IgbnVtYmVyXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhIFRoZSBleHByZXNzaW9uIGRhdGFcclxuICogQHJldHVybnMge1N5bnRheEVycm9yfGV4cG9ydHMuU3RyaW5nU3RhdGVtZW50fGV4cG9ydHMuTnVtYmVyU3RhdGVtZW50fGV4cG9ydHMuVmFyaWFibGVTdGF0ZW1lbnR8ZXhwb3J0cy5Qb2ludGVyU3RhdGVtZW50fVxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gcGFyc2VTaW5ndWxhckV4cHJlc3Npb24oZGF0YSkge1xyXG4gICAgLy8gQSBoYXNoIHNpZ25pZmllcyBhIHBvaW50ZXJcclxuICAgIGlmIChkYXRhWzBdID09PSAnIycpIHtcclxuICAgICAgICB2YXIgcG9pbnRlcklkID0gZGF0YS5zdWJzdHJpbmcoMSk7XHJcbiAgICAgICAgaWYgKGlzTmFOKHBhcnNlSW50KHBvaW50ZXJJZCkpKSByZXR1cm4gbmV3IFN5bnRheEVycm9yKCdVbmV4cGVjdGVkIGhhc2gnKTtcclxuICAgICAgICByZXR1cm4gbmV3IHN0YXRlbWVudHMuUG9pbnRlclN0YXRlbWVudChwb2ludGVySWQpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBpc1N0cmluZyA9IGRhdGEuaW5kZXhPZignXCInKSAhPT0gLTE7XHJcblxyXG4gICAgLy8gSWYgdGhlcmUgaXMgYW55IHF1b3RlLCBpdHMgZWl0aGVyIGEgc3RyaW5nIG9yIHN5bnRheCBlcnJvclxyXG4gICAgaWYgKGlzU3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKGRhdGFbMF0gIT09ICdcIicgfHwgZGF0YVtkYXRhLmxlbmd0aCAtIDFdICE9PSAnXCInKSByZXR1cm4gbmV3IFN5bnRheEVycm9yKCdVbmV4cGVjdGVkIHF1b3RlJyk7XHJcbiAgICAgICAgdmFyIHN0cmluZ0NvbnRlbnQgPSBkYXRhLnNsaWNlKDEsIGRhdGEubGVuZ3RoIC0gMSk7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBzdGF0ZW1lbnRzLlN0cmluZ1N0YXRlbWVudChzdHJpbmdDb250ZW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBpdCBpcyBub3Qgbm90IGEgbnVtYmVyLCBpdCBtdXN0IGJlIGEgbnVtYmVyIChzZWUgbXkgbG9naWM/KVxyXG4gICAgdmFyIG51bWJlclZhbHVlID0gcGFyc2VGbG9hdChkYXRhKTtcclxuICAgIGlmICghaXNOYU4obnVtYmVyVmFsdWUpKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBzdGF0ZW1lbnRzLk51bWJlclN0YXRlbWVudChudW1iZXJWYWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT3RoZXJ3aXNlLCBpdCBtdXN0IGJlIGEgdmFyaWFibGVcclxuICAgIC8vIFRPRE86IHZhbGlkYXRlIHZhcmlhYmxlIG5hbWUgKHRoaXMgc2hvdWxkIGFjdHVhbGx5IGdvIGluIHRoZSB2YXJpYWJsZSBjb25zdHJ1Y3Rvci4uKVxyXG4gICAgcmV0dXJuIG5ldyBzdGF0ZW1lbnRzLlZhcmlhYmxlU3RhdGVtZW50KGRhdGEpO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEV4cHJlc3Npb25TdGF0ZW1lbnQ7IiwidmFyIHN0YXRlbWVudHMgPSByZXF1aXJlKCcuLycpO1xyXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4uLy4uL3V0aWwnKTtcclxuXHJcbi8qKlxyXG4gKiBSZXByZXNlbnRzIGEgZnVuY3Rpb24gY2FsbFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgZnVuY3Rpb25cclxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byB0aGUgZnVuY3Rpb25cclxuICovXHJcbmZ1bmN0aW9uIEZ1bmN0aW9uU3RhdGVtZW50KG5hbWUsIGFyZ3MpIHtcclxuICAgIGlmIChuYW1lW25hbWUubGVuZ3RoIC0gMV0gPT09ICckJykge1xyXG4gICAgICAgIHRoaXMudHlwZSA9ICdzdHJpbmcnO1xyXG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWUuc3Vic3RyaW5nKDAsIG5hbWUubGVuZ3RoIC0gMSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMudHlwZSA9ICdudW1iZXInO1xyXG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHBvc2l0aW9ucyA9IHV0aWwuZmluZFBvc2l0aW9ucyhhcmdzLCBbXHJcbiAgICAgICAgeyAnc3RhcnQnOiAnXCInLCAnZW5kJzogJ1wiJyB9LFxyXG4gICAgICAgIHsgJ3N0YXJ0JzogJygnLCAnZW5kJzogJyknIH1cclxuICAgIF0pO1xyXG4gICAgdmFyIGFyZ0xpc3QgPSB1dGlsLnNwbGl0T3V0c2lkZShhcmdzLCBcIixcIiwgcG9zaXRpb25zKTtcclxuXHJcbiAgICB0aGlzLmFyZ3MgPSBbXTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJnTGlzdC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHRoaXMuYXJncy5wdXNoKG5ldyBzdGF0ZW1lbnRzLkV4cHJlc3Npb25TdGF0ZW1lbnQoYXJnTGlzdFtpXS50cmltKCkpKTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE91dHB1dHMgZXhlY3V0YWJsZSBjb2RlIHRoYXQgcmVwcmVzZW50cyB0aGUgZnVuY3Rpb24gY2FsbFxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuRnVuY3Rpb25TdGF0ZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgYXJncyA9IFtdO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmFyZ3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBhcmdzLnB1c2godGhpcy5hcmdzW2ldLnRvU3RyaW5nKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0aGlzLm5hbWUgKyAodGhpcy50eXBlID09PSAnc3RyaW5nJyA/ICckJyA6ICcnKSArICcoJyArIGFyZ3Muam9pbignLCAnKSArICcpJztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgc3RhdGVtZW50IHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbkZ1bmN0aW9uU3RhdGVtZW50LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCJGdW5jdGlvblN0YXRlbWVudFwiLFxyXG4gICAgICAgIG5hbWU6IHRoaXMubmFtZSxcclxuICAgICAgICB2YXJUeXBlOiB0aGlzLnR5cGUsXHJcbiAgICAgICAgYXJnczogdGhpcy5hcmdzXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIHZhbHVlIG9mIHRoZSBmdW5jdGlvblxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGEgVGhlIGV4ZWN1dGlvbiBkYXRhIGNvbnRleHRcclxuICogQHJldHVybnMge1N0cmluZ3xOdW1iZXJ9IFRoZSB2YWx1ZSBvZiB0aGUgZnVuY3Rpb25cclxuICovXHJcbkZ1bmN0aW9uU3RhdGVtZW50LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgdmFyIGFyZ3MgPSBbXTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5hcmdzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGFyZyA9IHRoaXMuYXJnc1tpXTtcclxuICAgICAgICBpZiAoYXJnLmVycm9yKSB0aHJvdyBhcmcuZXJyb3I7XHJcblxyXG4gICAgICAgIGFyZ3MucHVzaChhcmcuZXhlY3V0ZShkYXRhKSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZGF0YS5jYWxsRnVuY3Rpb24odGhpcywgYXJncyk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEZ1bmN0aW9uU3RhdGVtZW50OyIsIi8qKlxyXG4gKiBSZXByZXNlbnRzIGEgbnVtYmVyIHZhbHVlXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBudW1iZXIgVGhlIG51bWJlciB0byBhc3NpZ25cclxuICovXHJcbmZ1bmN0aW9uIE51bWJlclN0YXRlbWVudChudW1iZXIpIHtcclxuICAgIHRoaXMudmFsdWUgPSBudW1iZXI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPdXRwdXRzIGV4ZWN1dGFibGUgY29kZSB0aGF0IHJlcHJlc2VudHMgdGhlIG51bWJlclxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuTnVtYmVyU3RhdGVtZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMudmFsdWUudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgc3RhdGVtZW50IHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbk51bWJlclN0YXRlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiTnVtYmVyU3RhdGVtZW50XCIsXHJcbiAgICAgICAgdmFsdWU6IHRoaXMudmFsdWVcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogR2V0cyB0aGUgbnVtYmVyXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBudW1iZXJcclxuICovXHJcbk51bWJlclN0YXRlbWVudC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMudmFsdWU7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE51bWJlclN0YXRlbWVudDsiLCIvKipcclxuICogUmVwcmVzZW50cyBhIHBvaW50ZXJcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGlkIFRoZSBpZCBvZiB0aGUgcG9pbnRlclxyXG4gKi9cclxuZnVuY3Rpb24gUG9pbnRlclN0YXRlbWVudChpZCkge1xyXG4gICAgdGhpcy5pZCA9IGlkO1xyXG59XHJcblxyXG4vKipcclxuICogT3V0cHV0cyBleGVjdXRhYmxlIGNvZGUgdGhhdCByZXByZXNlbnRzIHRoZSBwb2ludGVyXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Qb2ludGVyU3RhdGVtZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuICcjJyArIHRoaXMuaWQ7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIHN0YXRlbWVudCB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5Qb2ludGVyU3RhdGVtZW50LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCJQb2ludGVyU3RhdGVtZW50XCIsXHJcbiAgICAgICAgaWQ6IHRoaXMuaWRcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogR2V0cyB0aGUgcG9pbnRlciB2YWx1ZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7Kn0gVGhlIHZhbHVlIG9mIHRoZSBwb2ludGVyXHJcbiAqL1xyXG5Qb2ludGVyU3RhdGVtZW50LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgcmV0dXJuIGRhdGEuZ2V0UG9pbnRlcih0aGlzKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUG9pbnRlclN0YXRlbWVudDsiLCIvKipcclxuICogUmVwcmVzZW50cyBhIHN0cmluZyB2YWx1ZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsdWUgVGhlIHZhbHVlIHRvIGFzc2lnblxyXG4gKi9cclxuZnVuY3Rpb24gU3RyaW5nU3RhdGVtZW50KHZhbHVlKSB7XHJcbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPdXRwdXRzIGV4ZWN1dGFibGUgY29kZSB0aGF0IHJlcHJlc2VudHMgdGhlIHN0cmluZ1xyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuU3RyaW5nU3RhdGVtZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuICdcIicgKyB0aGlzLnZhbHVlICsgJ1wiJztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgc3RhdGVtZW50IHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcblN0cmluZ1N0YXRlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiU3RyaW5nU3RhdGVtZW50XCIsXHJcbiAgICAgICAgdmFsdWU6IHRoaXMudmFsdWVcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogR2V0cyB0aGUgc3RyaW5nXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBzdHJpbmdcclxuICovXHJcblN0cmluZ1N0YXRlbWVudC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMudmFsdWU7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFN0cmluZ1N0YXRlbWVudDsiLCJ2YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuLi9TeW50YXhFcnJvcicpO1xyXG52YXIgc3RhdGVtZW50cyA9IHJlcXVpcmUoJy4vJyk7XHJcblxyXG4vKipcclxuICogUmVwcmVzZW50cyBhIHZhcmlhYmxlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSB2YXJpYWJsZVxyXG4gKi9cclxuZnVuY3Rpb24gVmFyaWFibGVTdGF0ZW1lbnQobmFtZSkge1xyXG4gICAgdmFyIGJyYWNrZXRJbmRleCA9IG5hbWUuaW5kZXhPZignKCcpO1xyXG4gICAgaWYgKGJyYWNrZXRJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICB2YXIgZW5kQnJhY2tldEluZGV4ID0gbmFtZS5pbmRleE9mKCcpJyk7XHJcbiAgICAgICAgaWYgKGVuZEJyYWNrZXRJbmRleCA9PT0gLTEpIHRocm93IG5ldyBTeW50YXhFcnJvcignRXhwZWN0ZWQgZW5kIGJyYWNrZXQnKTtcclxuXHJcbiAgICAgICAgdmFyIGFycmF5TmFtZSA9IG5hbWUuc3Vic3RyaW5nKDAsIGJyYWNrZXRJbmRleCk7XHJcbiAgICAgICAgdmFyIGFycmF5RGltZW5zaW9uc1RleHQgPSBuYW1lLnN1YnN0cmluZyhicmFja2V0SW5kZXggKyAxLCBlbmRCcmFja2V0SW5kZXgpLnRyaW0oKTtcclxuICAgICAgICB2YXIgYXJyYXlEaW1lbnNpb25zID0gbmV3IHN0YXRlbWVudHMuQXJndW1lbnRTdGF0ZW1lbnQoYXJyYXlEaW1lbnNpb25zVGV4dCk7XHJcblxyXG4gICAgICAgIG5hbWUgPSBhcnJheU5hbWU7XHJcbiAgICAgICAgdGhpcy5pc0FycmF5ID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmRpbWVuc2lvbnMgPSBhcnJheURpbWVuc2lvbnMuYXJncztcclxuICAgIH0gZWxzZSB0aGlzLmlzQXJyYXkgPSBmYWxzZTtcclxuXHJcbiAgICBpZiAobmFtZVtuYW1lLmxlbmd0aCAtIDFdID09PSAnJCcpIHtcclxuICAgICAgICB0aGlzLnR5cGUgPSAnc3RyaW5nJztcclxuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lLnN1YnN0cmluZygwLCBuYW1lLmxlbmd0aCAtIDEpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnR5cGUgPSAnbnVtYmVyJztcclxuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogT3V0cHV0cyBleGVjdXRhYmxlIGNvZGUgdGhhdCByZXByZXNlbnRzIHRoZSB2YXJpYWJsZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuVmFyaWFibGVTdGF0ZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgbmFtZSA9IHRoaXMubmFtZSArICh0aGlzLnR5cGUgPT09ICdzdHJpbmcnID8gJyQnIDogJycpO1xyXG4gICAgaWYgKHRoaXMuaXNBcnJheSkgbmFtZSArPSAnKCcgKyB0aGlzLmRpbWVuc2lvbnMuam9pbignLCAnKSArICcpJztcclxuICAgIHJldHVybiBuYW1lO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBzdGF0ZW1lbnQgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuVmFyaWFibGVTdGF0ZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIlZhcmlhYmxlU3RhdGVtZW50XCIsXHJcbiAgICAgICAgbmFtZTogdGhpcy5uYW1lLFxyXG4gICAgICAgIHZhclR5cGU6IHRoaXMudHlwZSxcclxuICAgICAgICBkaW1lbnNpb25zOiB0aGlzLmRpbWVuc2lvbnNcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogR2V0cyB0aGUgdmFsdWUgb2YgdGhlIHZhcmlhYmxlXHJcbiAqIFNpbmNlIHRoZSBwYXJzZXIgaXMgZ29pbmcgdG8gdGhpbmsgdGhhdCBnZXR0aW5nIHRoZSB2YWx1ZSBvZiBhbiBhcnJheSBpcyBhIGZ1bmN0aW9uIGNhbGwsXHJcbiAqIHdlIGRvbid0IG5lZWQgdG8gaW1wbGVtZW50IGdldHRpbmcgb2YgdGhlIHZhbHVlIGhlcmVcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhIFRoZSBleGVjdXRpb24gZGF0YSBjb250ZXh0XHJcbiAqIEByZXR1cm5zIHtTdHJpbmd8TnVtYmVyfSBUaGUgdmFsdWUgb2YgdGhlIHZhcmlhYmxlXHJcbiAqL1xyXG5WYXJpYWJsZVN0YXRlbWVudC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHJldHVybiBkYXRhLmdldFZhcmlhYmxlKHRoaXMpO1xyXG59O1xyXG5cclxuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFZhcmlhYmxlU3RhdGVtZW50OyIsIi8qKlxyXG4gKiAnU3RhdGVtZW50cycgYXJlIHRoZSBub2RlcyBpbiB0aGUgYWJzdHJhY3Qgc3ludGF4IHRyZWUuXHJcbiAqIEVhY2ggc3RhdGVtZW50IGVpdGhlciBob2xkcyBvdGhlciBzdGF0ZW1lbnRzIG9yIGEgSmF2YXNjcmlwdCBwcmltaXRpdmUsIGFuZCBoYXNcclxuICogdGhlIGFiaWxpdHkgdG8gcGFyc2UgdGhlIGlucHV0IGFuZCBleGVjdXRlIGl0IGxhdGVyLlxyXG4gKi9cclxuXHJcbmV4cG9ydHMub3BlcmF0b3JzID0gcmVxdWlyZSgnLi9vcGVyYXRvcnMnKTtcclxuZXhwb3J0cy5Bcmd1bWVudFN0YXRlbWVudCA9IHJlcXVpcmUoJy4vQXJndW1lbnRTdGF0ZW1lbnQnKTtcclxuZXhwb3J0cy5Bc3NpZ25tZW50U3RhdGVtZW50ID0gcmVxdWlyZSgnLi9Bc3NpZ25tZW50U3RhdGVtZW50Jyk7XHJcbmV4cG9ydHMuQ29tbWFuZFN0YXRlbWVudCA9IHJlcXVpcmUoJy4vQ29tbWFuZFN0YXRlbWVudCcpO1xyXG5leHBvcnRzLkNvbW1lbnRTdGF0ZW1lbnQgPSByZXF1aXJlKCcuL0NvbW1lbnRTdGF0ZW1lbnQnKTtcclxuZXhwb3J0cy5FbXB0eVN0YXRlbWVudCA9IHJlcXVpcmUoJy4vRW1wdHlTdGF0ZW1lbnQnKTtcclxuZXhwb3J0cy5FeHByZXNzaW9uU3RhdGVtZW50ID0gcmVxdWlyZSgnLi9FeHByZXNzaW9uU3RhdGVtZW50Jyk7XHJcbmV4cG9ydHMuRnVuY3Rpb25TdGF0ZW1lbnQgPSByZXF1aXJlKCcuL0Z1bmN0aW9uU3RhdGVtZW50Jyk7XHJcbmV4cG9ydHMuTnVtYmVyU3RhdGVtZW50ID0gcmVxdWlyZSgnLi9OdW1iZXJTdGF0ZW1lbnQnKTtcclxuZXhwb3J0cy5Qb2ludGVyU3RhdGVtZW50ID0gcmVxdWlyZSgnLi9Qb2ludGVyU3RhdGVtZW50Jyk7XHJcbmV4cG9ydHMuU3RyaW5nU3RhdGVtZW50ID0gcmVxdWlyZSgnLi9TdHJpbmdTdGF0ZW1lbnQnKTtcclxuZXhwb3J0cy5WYXJpYWJsZVN0YXRlbWVudCA9IHJlcXVpcmUoJy4vVmFyaWFibGVTdGF0ZW1lbnQnKTsiLCIvKipcclxuICogQWRkcyB0d28gbnVtYmVycyBvciBzdHJpbmdzIHRvZ2V0aGVyXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gbGV4cHIgTGVmdCBleHByZXNzaW9uXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gcmV4cHIgUmlnaHQgZXhwcmVzc2lvblxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIEFkZGl0aW9uT3BlcmF0b3IobGV4cHIsIHJleHByKSB7XHJcbiAgICB0aGlzLmxleHByID0gbGV4cHI7XHJcbiAgICB0aGlzLnJleHByID0gcmV4cHI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gZXhlY3V0YWJsZSBjb2RlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5BZGRpdGlvbk9wZXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIudG9TdHJpbmcoKSArICcgKyAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5BZGRpdGlvbk9wZXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCIrXCIsXHJcbiAgICAgICAgbGV4cHI6IHRoaXMubGV4cHIudG9KU09OKCksXHJcbiAgICAgICAgcmV4cHI6IHRoaXMucmV4cHIudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfFN0cmluZ30gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKi9cclxuQWRkaXRpb25PcGVyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHZhciBsdmFsID0gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHJ2YWwgPSB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBpZiAoIWx2YWwpIHJldHVybiBydmFsO1xyXG4gICAgcmV0dXJuIGx2YWwgKyBydmFsO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBZGRpdGlvbk9wZXJhdG9yOyIsIi8qKlxyXG4gKiBSZXF1aXJlcyBib3RoIHZhbHVlcyB0byBiZSB0cnV0aHlcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gQW5kQ29tcGFyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkFuZENvbXBhcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyBBTkQgJyArIHRoaXMucmV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuQW5kQ29tcGFyYXRvci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiIGFuZCBcIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICovXHJcbkFuZENvbXBhcmF0b3IucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpICYmIHRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKSA/IDEgOiAwO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBbmRDb21wYXJhdG9yOyIsIi8qKlxyXG4gKiBCaXR3aXNlIEFORCBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBBbmRPcGVyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkFuZE9wZXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIudG9TdHJpbmcoKSArICcgQkFORCAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5BbmRPcGVyYXRvci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiIGJhbmQgXCIsXHJcbiAgICAgICAgbGV4cHI6IHRoaXMubGV4cHIudG9KU09OKCksXHJcbiAgICAgICAgcmV4cHI6IHRoaXMucmV4cHIudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgcmVzdWx0aW5nIHZhbHVlXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgZWl0aGVyIHZhbHVlIGlzIG5vdCBhIG51bWJlclxyXG4gKi9cclxuQW5kT3BlcmF0b3IucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICB2YXIgbHZhbCA9IHRoaXMubGV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBydmFsID0gdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpO1xyXG5cclxuICAgIGRhdGEudmFsaWRhdGUobHZhbCwgJ251bWJlcicpO1xyXG4gICAgZGF0YS52YWxpZGF0ZShydmFsLCAnbnVtYmVyJyk7XHJcbiAgICByZXR1cm4gbHZhbCAmIHJ2YWw7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFuZE9wZXJhdG9yOyIsIi8qKlxyXG4gKiBEaXZpZGVzIHR3byBudW1iZXJzXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gbGV4cHIgTGVmdCBleHByZXNzaW9uXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gcmV4cHIgUmlnaHQgZXhwcmVzc2lvblxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIERpdmlzaW9uT3BlcmF0b3IobGV4cHIsIHJleHByKSB7XHJcbiAgICB0aGlzLmxleHByID0gbGV4cHI7XHJcbiAgICB0aGlzLnJleHByID0gcmV4cHI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gZXhlY3V0YWJsZSBjb2RlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5EaXZpc2lvbk9wZXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIudG9TdHJpbmcoKSArICcgLyAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5EaXZpc2lvbk9wZXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCIvXCIsXHJcbiAgICAgICAgbGV4cHI6IHRoaXMubGV4cHIudG9KU09OKCksXHJcbiAgICAgICAgcmV4cHI6IHRoaXMucmV4cHIudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgcmVzdWx0aW5nIHZhbHVlXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgZWl0aGVyIGV4cHJlc3Npb24gZG9lcyBub3QgZXZhbHVhdGUgdG8gYSBudW1iZXJcclxuICovXHJcbkRpdmlzaW9uT3BlcmF0b3IucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICB2YXIgbHZhbCA9IHRoaXMubGV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBydmFsID0gdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgaWYgKHR5cGVvZiBsdmFsICE9PSAnbnVtYmVyJyB8fCB0eXBlb2YgcnZhbCAhPT0gJ251bWJlcicpIHRocm93IG5ldyBFcnJvcignVHlwZXMgbWlzbWF0Y2gnKTtcclxuICAgIHJldHVybiBsdmFsIC8gcnZhbDtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRGl2aXNpb25PcGVyYXRvcjsiLCIvKipcclxuICogUmVxdWlyZXMgYm90aCB2YWx1ZXMgdG8gYmUgZXF1YWxcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gRXF1YWxDb21wYXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuRXF1YWxDb21wYXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIudG9TdHJpbmcoKSArICcgPSAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5FcXVhbENvbXBhcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIj1cIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICovXHJcbkVxdWFsQ29tcGFyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSkgPT0gdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpID8gMSA6IDA7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEVxdWFsQ29tcGFyYXRvcjsiLCIvKipcclxuICogUmVxdWlyZXMgdGhlIGxlZnQgZXhwcmVzc2lvbiB0byBiZSBncmVhdGVyIHRoYW4gdGhlIHJpZ2h0XHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gbGV4cHIgTGVmdCBleHByZXNzaW9uXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gcmV4cHIgUmlnaHQgZXhwcmVzc2lvblxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIEd0Q29tcGFyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkd0Q29tcGFyYXRvci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLnRvU3RyaW5nKCkgKyAnID4gJyArIHRoaXMucmV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuR3RDb21wYXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCI+XCIsXHJcbiAgICAgICAgbGV4cHI6IHRoaXMubGV4cHIudG9KU09OKCksXHJcbiAgICAgICAgcmV4cHI6IHRoaXMucmV4cHIudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgcmVzdWx0aW5nIHZhbHVlXHJcbiAqL1xyXG5HdENvbXBhcmF0b3IucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpID4gdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpID8gMSA6IDA7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEd0Q29tcGFyYXRvcjsiLCIvKipcclxuICogUmVxdWlyZXMgdGhlIGxlZnQgZXhwcmVzc2lvbiB0byBiZSBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gdGhlIHJpZ2h0XHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gbGV4cHIgTGVmdCBleHByZXNzaW9uXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gcmV4cHIgUmlnaHQgZXhwcmVzc2lvblxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIEd0ZUNvbXBhcmF0b3IobGV4cHIsIHJleHByKSB7XHJcbiAgICB0aGlzLmxleHByID0gbGV4cHI7XHJcbiAgICB0aGlzLnJleHByID0gcmV4cHI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gZXhlY3V0YWJsZSBjb2RlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5HdGVDb21wYXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIudG9TdHJpbmcoKSArICcgPj0gJyArIHRoaXMucmV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuR3RlQ29tcGFyYXRvci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiPj1cIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICovXHJcbkd0ZUNvbXBhcmF0b3IucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpID49IHRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKSA/IDEgOiAwO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBHdGVDb21wYXJhdG9yOyIsIi8qKlxyXG4gKiBSZXF1aXJlcyB0aGUgbGVmdCBleHByZXNzaW9uIHRvIGJlIGxlc3MgdGhhbiB0aGUgcmlnaHRcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gTHRDb21wYXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuTHRDb21wYXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIudG9TdHJpbmcoKSArICcgPCAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5MdENvbXBhcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIjxcIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICovXHJcbkx0Q29tcGFyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSkgPCB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSkgPyAxIDogMDtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTHRDb21wYXJhdG9yOyIsIi8qKlxyXG4gKiBSZXF1aXJlcyB0aGUgbGVmdCBleHByZXNzaW9uIHRvIGJlIGxlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgcmlnaHRcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gTHRlQ29tcGFyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbkx0ZUNvbXBhcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyA8PSAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5MdGVDb21wYXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCI8PVwiLFxyXG4gICAgICAgIGxleHByOiB0aGlzLmxleHByLnRvSlNPTigpLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKi9cclxuTHRlQ29tcGFyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHJldHVybiB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSkgPD0gdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpID8gMSA6IDA7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEx0ZUNvbXBhcmF0b3I7IiwiLyoqXHJcbiAqIE11bHRpcGxpZXMgdHdvIG51bWJlcnNcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gTXVsdGlwbGljYXRpb25PcGVyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge1N0cmluZ31cclxuICovXHJcbk11bHRpcGxpY2F0aW9uT3BlcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyAqICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbk11bHRpcGxpY2F0aW9uT3BlcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIipcIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICogQHRocm93cyBFcnJvciBpZiBlaXRoZXIgZXhwcmVzc2lvbiBkb2VzIG5vdCBldmFsdWF0ZSB0byBhIG51bWJlclxyXG4gKi9cclxuTXVsdGlwbGljYXRpb25PcGVyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHZhciBsdmFsID0gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHJ2YWwgPSB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBpZiAodHlwZW9mIGx2YWwgIT09ICdudW1iZXInIHx8IHR5cGVvZiBydmFsICE9PSAnbnVtYmVyJykgdGhyb3cgbmV3IEVycm9yKCdUeXBlcyBtaXNtYXRjaCcpO1xyXG4gICAgcmV0dXJuIGx2YWwgKiBydmFsO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNdWx0aXBsaWNhdGlvbk9wZXJhdG9yOyIsIi8qKlxyXG4gKiBJbnZlcnRzIHRoZSByaWdodCB2YWx1ZVxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBOb3RDb21wYXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuTm90Q29tcGFyYXRvci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiAnTk9UICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbk5vdENvbXBhcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIm5vdCBcIixcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICovXHJcbk5vdENvbXBhcmF0b3IucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICByZXR1cm4gIXRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKSA/IDEgOiAwO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBOb3RDb21wYXJhdG9yOyIsIi8qKlxyXG4gKiBCaXR3aXNlIE5PVCBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IGxleHByIExlZnQgZXhwcmVzc2lvblxyXG4gKiBAcGFyYW0ge0V4cHJlc3Npb25TdGF0ZW1lbnR9IHJleHByIFJpZ2h0IGV4cHJlc3Npb25cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBOb3RPcGVyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbk5vdE9wZXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuICdCTk9UICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcbk5vdE9wZXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCJibm90IFwiLFxyXG4gICAgICAgIHJleHByOiB0aGlzLnJleHByLnRvSlNPTigpXHJcbiAgICB9O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIHRoZSBvcGVyYXRvclxyXG4gKlxyXG4gKiBAcGFyYW0ge0V4ZWN1dGlvbkNvbnRleHR9IGRhdGFcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIHJlc3VsdGluZyB2YWx1ZVxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIGVpdGhlciB2YWx1ZSBpcyBub3QgYSBudW1iZXJcclxuICovXHJcbk5vdE9wZXJhdG9yLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgdmFyIHJ2YWwgPSB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHJ2YWwsICdudW1iZXInKTtcclxuICAgIHJldHVybiB+cnZhbDtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTm90T3BlcmF0b3I7IiwiLyoqXHJcbiAqIFJlcXVpcmVzIGVpdGhlciB2YWx1ZSB0byBiZSB0cnV0aHlcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gT3JDb21wYXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuT3JDb21wYXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIudG9TdHJpbmcoKSArICcgT1IgJyArIHRoaXMucmV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuT3JDb21wYXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCIgb3IgXCIsXHJcbiAgICAgICAgbGV4cHI6IHRoaXMubGV4cHIudG9KU09OKCksXHJcbiAgICAgICAgcmV4cHI6IHRoaXMucmV4cHIudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgcmVzdWx0aW5nIHZhbHVlXHJcbiAqL1xyXG5PckNvbXBhcmF0b3IucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpIHx8IHRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKSA/IDEgOiAwO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBPckNvbXBhcmF0b3I7IiwiLyoqXHJcbiAqIEJpdHdpc2UgT1Igb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gT3JPcGVyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge3N0cmluZ31cclxuICovXHJcbk9yT3BlcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyBCT1IgJyArIHRoaXMucmV4cHIudG9TdHJpbmcoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gSlNPTlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxyXG4gKi9cclxuT3JPcGVyYXRvci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwiIGJvciBcIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICogQHRocm93cyBFcnJvciBpZiBlaXRoZXIgdmFsdWUgaXMgbm90IGEgbnVtYmVyXHJcbiAqL1xyXG5Pck9wZXJhdG9yLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgdmFyIGx2YWwgPSB0aGlzLmxleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICB2YXIgcnZhbCA9IHRoaXMucmV4cHIuZXhlY3V0ZShkYXRhKTtcclxuXHJcbiAgICBkYXRhLnZhbGlkYXRlKGx2YWwsICdudW1iZXInKTtcclxuICAgIGRhdGEudmFsaWRhdGUocnZhbCwgJ251bWJlcicpO1xyXG4gICAgcmV0dXJuIGx2YWwgfCBydmFsO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBPck9wZXJhdG9yOyIsIi8qKlxyXG4gKiBSYWlzZXMgb25lIG51bWJlciB0byB0aGUgcG93ZXIgb2YgdGhlIG90aGVyXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gbGV4cHIgTGVmdCBleHByZXNzaW9uXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gcmV4cHIgUmlnaHQgZXhwcmVzc2lvblxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIFBvd2VyT3BlcmF0b3IobGV4cHIsIHJleHByKSB7XHJcbiAgICB0aGlzLmxleHByID0gbGV4cHI7XHJcbiAgICB0aGlzLnJleHByID0gcmV4cHI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgb3BlcmF0b3IgdG8gZXhlY3V0YWJsZSBjb2RlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9XHJcbiAqL1xyXG5Qb3dlck9wZXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubGV4cHIudG9TdHJpbmcoKSArICcgXiAnICsgdGhpcy5yZXhwci50b1N0cmluZygpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBKU09OXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAqL1xyXG5Qb3dlck9wZXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCJeXCIsXHJcbiAgICAgICAgbGV4cHI6IHRoaXMubGV4cHIudG9KU09OKCksXHJcbiAgICAgICAgcmV4cHI6IHRoaXMucmV4cHIudG9KU09OKClcclxuICAgIH07XHJcbn07XHJcblxyXG4vKipcclxuICogRXhlY3V0ZXMgdGhlIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhlY3V0aW9uQ29udGV4dH0gZGF0YVxyXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgcmVzdWx0aW5nIHZhbHVlXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgZWl0aGVyIGV4cHJlc3Npb24gZG9lcyBub3QgZXZhbHVhdGUgdG8gYSBudW1iZXJcclxuICovXHJcblBvd2VyT3BlcmF0b3IucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICB2YXIgbHZhbCA9IHRoaXMubGV4cHIuZXhlY3V0ZShkYXRhKTtcclxuICAgIHZhciBydmFsID0gdGhpcy5yZXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgaWYgKHR5cGVvZiBsdmFsICE9PSAnbnVtYmVyJyB8fCB0eXBlb2YgcnZhbCAhPT0gJ251bWJlcicpIHRocm93IG5ldyBFcnJvcignVHlwZXMgbWlzbWF0Y2gnKTtcclxuICAgIHJldHVybiBNYXRoLnBvdyhsdmFsLCBydmFsKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUG93ZXJPcGVyYXRvcjtcclxuIiwiLyoqXHJcbiAqIFN1YnRyYWN0cyBhIG51bWJlciBmcm9tIGFub3RoZXJcclxuICpcclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSBsZXhwciBMZWZ0IGV4cHJlc3Npb25cclxuICogQHBhcmFtIHtFeHByZXNzaW9uU3RhdGVtZW50fSByZXhwciBSaWdodCBleHByZXNzaW9uXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKi9cclxuZnVuY3Rpb24gU3VidHJhY3Rpb25PcGVyYXRvcihsZXhwciwgcmV4cHIpIHtcclxuICAgIHRoaXMubGV4cHIgPSBsZXhwcjtcclxuICAgIHRoaXMucmV4cHIgPSByZXhwcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIHRoZSBvcGVyYXRvciB0byBleGVjdXRhYmxlIGNvZGVcclxuICpcclxuICogQHJldHVybnMge1N0cmluZ31cclxuICovXHJcblN1YnRyYWN0aW9uT3BlcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyAtICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcblN1YnRyYWN0aW9uT3BlcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcIi1cIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICogQHRocm93cyBFcnJvciBpZiBlaXRoZXIgZXhwcmVzc2lvbiBkb2VzIG5vdCBldmFsdWF0ZSB0byBhIG51bWJlclxyXG4gKi9cclxuU3VidHJhY3Rpb25PcGVyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHZhciBsdmFsID0gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHJ2YWwgPSB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSk7XHJcbiAgICBpZiAoIWx2YWwgJiYgdHlwZW9mIHJ2YWwgPT09ICdudW1iZXInKSByZXR1cm4gcnZhbCAqIC0xO1xyXG5cclxuICAgIGlmICh0eXBlb2YgbHZhbCAhPT0gJ251bWJlcicgfHwgdHlwZW9mIHJ2YWwgIT09ICdudW1iZXInKSB0aHJvdyBuZXcgRXJyb3IoJ1R5cGVzIG1pc21hdGNoJyk7XHJcbiAgICByZXR1cm4gbHZhbCAtIHJ2YWw7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFN1YnRyYWN0aW9uT3BlcmF0b3I7IiwiLyoqXHJcbiAqIEJpdHdpc2UgWE9SIG9wZXJhdG9yXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gbGV4cHIgTGVmdCBleHByZXNzaW9uXHJcbiAqIEBwYXJhbSB7RXhwcmVzc2lvblN0YXRlbWVudH0gcmV4cHIgUmlnaHQgZXhwcmVzc2lvblxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIFhvck9wZXJhdG9yKGxleHByLCByZXhwcikge1xyXG4gICAgdGhpcy5sZXhwciA9IGxleHByO1xyXG4gICAgdGhpcy5yZXhwciA9IHJleHByO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIGV4ZWN1dGFibGUgY29kZVxyXG4gKlxyXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxyXG4gKi9cclxuWG9yT3BlcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5sZXhwci50b1N0cmluZygpICsgJyBCWE9SICcgKyB0aGlzLnJleHByLnRvU3RyaW5nKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ29udmVydHMgdGhlIG9wZXJhdG9yIHRvIEpTT05cclxuICpcclxuICogQHJldHVybnMge09iamVjdH1cclxuICovXHJcblhvck9wZXJhdG9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCIgYnhvciBcIixcclxuICAgICAgICBsZXhwcjogdGhpcy5sZXhwci50b0pTT04oKSxcclxuICAgICAgICByZXhwcjogdGhpcy5yZXhwci50b0pTT04oKVxyXG4gICAgfTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyB0aGUgb3BlcmF0b3JcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBkYXRhXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSByZXN1bHRpbmcgdmFsdWVcclxuICogQHRocm93cyBFcnJvciBpZiBlaXRoZXIgdmFsdWUgaXMgbm90IGEgbnVtYmVyXHJcbiAqL1xyXG5Yb3JPcGVyYXRvci5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcclxuICAgIHZhciBsdmFsID0gdGhpcy5sZXhwci5leGVjdXRlKGRhdGEpO1xyXG4gICAgdmFyIHJ2YWwgPSB0aGlzLnJleHByLmV4ZWN1dGUoZGF0YSk7XHJcblxyXG4gICAgZGF0YS52YWxpZGF0ZShsdmFsLCAnbnVtYmVyJyk7XHJcbiAgICBkYXRhLnZhbGlkYXRlKHJ2YWwsICdudW1iZXInKTtcclxuICAgIHJldHVybiBsdmFsIF4gcnZhbDtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gWG9yT3BlcmF0b3I7IiwiLyoqXHJcbiAqIFByb3ZpZGVzIHRoZSBvcmRlciBvZiBvcGVyYXRpb25zLCBhbmQgdGhlIG1hcHBpbmcgb2Ygb3BlcmF0b3IgdG8gY2xhc3NcclxuICpcclxuICogTk9URTogVGhpcyAqc2hvdWxkKiBiZSBpbiB0aGUgcmV2ZXJzZSBvcmRlciBvZiBvcGVyYXRpb25zXHJcbiAqL1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBbXHJcbiAgICB7XHJcbiAgICAgICAgJyBhbmQgJzogcmVxdWlyZSgnLi9BbmRDb21wYXJhdG9yJyksXHJcbiAgICAgICAgJyBvciAnOiByZXF1aXJlKCcuL09yQ29tcGFyYXRvcicpXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICAgICdub3QgJzogcmVxdWlyZSgnLi9Ob3RDb21wYXJhdG9yJyksXHJcbiAgICAgICAgJz0nOiByZXF1aXJlKCcuL0VxdWFsQ29tcGFyYXRvcicpLFxyXG4gICAgICAgICc+JzogcmVxdWlyZSgnLi9HdENvbXBhcmF0b3InKSxcclxuICAgICAgICAnPj0nOiByZXF1aXJlKCcuL0d0ZUNvbXBhcmF0b3InKSxcclxuICAgICAgICAnPCc6IHJlcXVpcmUoJy4vTHRDb21wYXJhdG9yJyksXHJcbiAgICAgICAgJzw9JzogcmVxdWlyZSgnLi9MdGVDb21wYXJhdG9yJylcclxuICAgIH0sXHJcbiAgICB7XHJcbiAgICAgICAgJysnOiByZXF1aXJlKCcuL0FkZGl0aW9uT3BlcmF0b3InKSxcclxuICAgICAgICAnLSc6IHJlcXVpcmUoJy4vU3VidHJhY3Rpb25PcGVyYXRvcicpLFxyXG5cclxuICAgICAgICAnIGJhbmQgJzogcmVxdWlyZSgnLi9BbmRPcGVyYXRvcicpLFxyXG4gICAgICAgICcgYm9yICc6IHJlcXVpcmUoJy4vT3JPcGVyYXRvcicpLFxyXG4gICAgICAgICcgYnhvciAnOiByZXF1aXJlKCcuL1hvck9wZXJhdG9yJyksXHJcbiAgICAgICAgJyB4b3IgJzogcmVxdWlyZSgnLi9Yb3JPcGVyYXRvcicpLFxyXG4gICAgICAgICdibm90ICc6IHJlcXVpcmUoJy4vTm90T3BlcmF0b3InKVxyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgICAnLyc6IHJlcXVpcmUoJy4vRGl2aXNpb25PcGVyYXRvcicpLFxyXG4gICAgICAgICcqJzogcmVxdWlyZSgnLi9NdWx0aXBsaWNhdGlvbk9wZXJhdG9yJylcclxuICAgIH0sXHJcbiAgICB7XHJcbiAgICAgICAgJ14nOiByZXF1aXJlKCcuL1Bvd2VyT3BlcmF0b3InKVxyXG4gICAgfVxyXG5dOyIsIi8qKlxyXG4gKiBCQVNJQyBSRVBMXHJcbiAqXHJcbiAqIEltcGxlbWVudHMgYSBzaW1pbGFyIGludGVyZmFjZSB0byBOb2RlJ3MgUkVQTCBwYWNrYWdlXHJcbiAqL1xyXG52YXIgSU9JbnRlcmZhY2UgPSByZXF1aXJlKCcuL0lPSW50ZXJmYWNlJyk7XHJcbnZhciBybCA9IElPSW50ZXJmYWNlLmdldERlZmF1bHQoKTtcclxudmFyIGZzID0gcmVxdWlyZSgnZnMnKTtcclxudmFyIEV4ZWN1dGlvbkNvbnRleHQgPSByZXF1aXJlKCcuL2V4ZWN1dG9yL0V4ZWN1dGlvbkNvbnRleHQnKTtcclxudmFyIEFic3RyYWN0U3ludGF4VHJlZSA9IHJlcXVpcmUoJy4vcGFyc2VyL0Fic3RyYWN0U3ludGF4VHJlZScpO1xyXG52YXIgQmxvY2tNYW5hZ2VyID0gcmVxdWlyZSgnLi9wYXJzZXIvQmxvY2svaW5kZXgnKTtcclxudmFyIHBhcnNlciA9IHJlcXVpcmUoJy4vcGFyc2VyL2luZGV4Jyk7XHJcbnZhciBzdGF0ZW1lbnRzID0gcmVxdWlyZSgnLi9wYXJzZXIvc3RhdGVtZW50cy9pbmRleCcpO1xyXG52YXIgU3ludGF4RXJyb3IgPSByZXF1aXJlKCcuL3BhcnNlci9TeW50YXhFcnJvcicpO1xyXG52YXIgY29tbWFuZHMgPSByZXF1aXJlKCcuL3BhcnNlci9jb21tYW5kcy9pbmRleCcpO1xyXG52YXIgY29tbWFuZE5hbWVzID0gT2JqZWN0LmtleXMoY29tbWFuZHMpO1xyXG52YXIgdXBwZXJDb21tYW5kTmFtZXMgPSBbXTtcclxuZm9yICh2YXIgaSA9IDA7IGkgPCBjb21tYW5kTmFtZXMubGVuZ3RoOyBpKyspIHVwcGVyQ29tbWFuZE5hbWVzLnB1c2goY29tbWFuZE5hbWVzW2ldLnRvVXBwZXJDYXNlKCkpO1xyXG5cclxuLyoqXHJcbiAqIFN0YXJ0cyB0aGUgUkVQTC4gT3B0aW9ucyBjYW4gYmU6XHJcbiAqXHJcbiAqICAtIGBwcm9tcHRgIC0gdGhlIHByb21wdCBhbmQgYHN0cmVhbWAgZm9yIGFsbCBJL08uIERlZmF1bHRzIHRvIGA+IGAuXHJcbiAqICAtIGBldmFsYCAtIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSB1c2VkIHRvIGV2YWwgZWFjaCBnaXZlbiBsaW5lLiBEZWZhdWx0cyB0byBhbiBhc3luYyB3cmFwcGVyIGZvciBgZXhlY3V0b3IuZXhlY3V0ZWAuXHJcbiAqICAtIGBjb21wbGV0ZXJgIC0gZnVuY3Rpb24gdGhhdCB3aWxsIGJlIHVzZWQgZm9yIGF1dG8tY29tcGxldGluZy5cclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgT3B0aW9ucyBmb3IgdGhlIFJFUExcclxuICovXHJcbmZ1bmN0aW9uIHN0YXJ0KG9wdGlvbnMpIHtcclxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG5cclxuICAgIHZhciBwcm9tcHQgPSBvcHRpb25zLnByb21wdCB8fCAnPiAnO1xyXG5cclxuICAgIHZhciBldmFsID0gb3B0aW9ucy5ldmFsIHx8IHJ1bjtcclxuXHJcbiAgICB2YXIgY29udGV4dCA9IG5ldyBFeGVjdXRpb25Db250ZXh0KCk7XHJcbiAgICB2YXIgbWFuYWdlciA9IG5ldyBCbG9ja01hbmFnZXIoKTtcclxuICAgIHZhciBhc3QgPSBuZXcgQWJzdHJhY3RTeW50YXhUcmVlKFtdLCB7fSwgbWFuYWdlcik7XHJcbiAgICBuZXh0TGluZShjb250ZXh0LCBhc3QsIHByb21wdCwgcHJvbXB0LCAtMSwgZXZhbCk7XHJcbn1cclxuXHJcbmV4cG9ydHMuc3RhcnQgPSBzdGFydDtcclxuXHJcbi8qKlxyXG4gKiBUaGUgZGVmYXVsdCBldmFsIGZ1bmN0aW9uXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBjbWQgVGhlIGNvbW1hbmQgdG8gYmUgZXhlY3V0ZWRcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBjb250ZXh0IFRoZSBjdXJyZW50IGV4ZWN1dGlvbiBjb250ZXh0XHJcbiAqIEBwYXJhbSB7QWJzdHJhY3RTeW50YXhUcmVlfSBhc3QgVGhlIGN1cnJlbnQgYWJzdHJhY3Qgc3ludGF4IHRyZWVcclxuICogQHBhcmFtIHtOdW1iZXJ9IGN1cnNvciBUaGUgcG9zaXRpb24gZm9yIHRoZSBjdXJzb3JcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBBIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiBjb21wbGV0ZVxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gcnVuKGNtZCwgY29udGV4dCwgYXN0LCBjdXJzb3IsIG5leHQpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgLy8gTXVzdCBiZSBhIGNvbW1hbmRcclxuICAgICAgICBpZiAoY21kWzBdID09PSBcIi5cIikge1xyXG4gICAgICAgICAgICB2YXIgY29tbWFuZCA9IGNtZC5zdWJzdHJpbmcoMSk7XHJcbiAgICAgICAgICAgIHZhciBzcGFjZUluZGV4ID0gY29tbWFuZC5pbmRleE9mKFwiIFwiKTtcclxuXHJcbiAgICAgICAgICAgIHZhciBhcmdzID0gXCJcIjtcclxuICAgICAgICAgICAgaWYgKHNwYWNlSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICBhcmdzID0gY29tbWFuZC5zdWJzdHJpbmcoc3BhY2VJbmRleCArIDEpLnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIGNvbW1hbmQgPSBjb21tYW5kLnN1YnN0cmluZygwLCBzcGFjZUluZGV4KS50cmltKCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHN3aXRjaCAoY29tbWFuZCkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcImJyZWFrXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgYXN0LnJvb3Quc3BsaWNlKGNvbnRleHQuX2Jsb2NrU3RhcnQpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQuX2Jsb2NrU3RhcnQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICBuZXh0KCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJjbGVhclwiOlxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQuX2Jsb2NrU3RhcnQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0LnJvb3QgPSBhc3Qucm9vdCA9IFtdO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQubGFiZWxzID0gYXN0LmxhYmVscyA9IHt9O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQub3B0aW9ucy5jdXJzb3JTdGFydCA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5nb3N1YnMgPSBbXTtcclxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0LnN0cmluZ1ZhcnMgPSB7fTtcclxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0Lm51bWJlclZhcnMgPSB7fTtcclxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0LnBvaW50ZXJzID0ge307XHJcbiAgICAgICAgICAgICAgICAgICAgbmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiZXhpdFwiOlxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE9cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcImhlbHBcIjpcclxuICAgICAgICAgICAgICAgICAgICBybC53cml0ZShcIi5icmVhayAgICAgICAtIENsZWFyIHRoZSBjdXJyZW50IG11bHRpLWxpbmUgZXhwcmVzc2lvblxcblwiKTtcclxuICAgICAgICAgICAgICAgICAgICBybC53cml0ZShcIi5jbGVhciAgICAgICAtIFJlc2V0IHRoZSBjdXJyZW50IGNvbnRleHQgYW5kIGNsZWFyIHRoZSBjdXJyZW50IG11bHRpLWxpbmUgZXhwcmVzc2lvblxcblwiKTtcclxuICAgICAgICAgICAgICAgICAgICBybC53cml0ZShcIi5leGl0ICAgICAgICAtIENsb3NlIHRoZSBJL08gc3RyZWFtLCBjYXVzaW5nIHRoZSBSRVBMIHRvIGV4aXRcXG5cIik7XHJcbiAgICAgICAgICAgICAgICAgICAgcmwud3JpdGUoXCIuaGVscCAgICAgICAgLSBTaG93IHRoaXMgbGlzdCBvZiBzcGVjaWFsIGNvbW1hbmRzXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJsLndyaXRlKFwiLmxvYWQgPGZpbGU+IC0gTG9hZCBhIGZpbGUgaW50byB0aGUgc2Vzc2lvblxcblwiKTtcclxuICAgICAgICAgICAgICAgICAgICBybC53cml0ZShcIi5zYXZlIDxmaWxlPiAtIFNhdmUgdGhlIGN1cnJlbnQgc2Vzc2lvblxcblwiKTtcclxuICAgICAgICAgICAgICAgICAgICBuZXh0KCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJsb2FkXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgZnMucmVhZEZpbGUoYXJncywge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmNvZGluZzogJ3V0ZjgnXHJcbiAgICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24oZXJyLCBkYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB0aHJvdyBlcnI7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGxpbmVzID0gZGF0YS5zcGxpdChcIlxcblwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGluZSA9IGxpbmVzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwYXJzZWRMaW5lID0gcGFyc2VyLnBhcnNlTGluZShsaW5lLCBhc3Qucm9vdC5sZW5ndGgsIGFzdC5sYWJlbHMsIGZhbHNlLCBhc3QubWFuYWdlcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBhcnNlZExpbmUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikgdGhyb3cgcGFyc2VkTGluZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocGFyc2VkTGluZS5lcnJvcikgdGhyb3cgcGFyc2VkTGluZS5lcnJvcjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhc3Qucm9vdC5wdXNoKHBhcnNlZExpbmUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXN0Lm1hbmFnZXIucGFyc2UoYXN0KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzdC5leGVjdXRlKGNvbnRleHQsIG5leHQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJsLndyaXRlKGVyciArIFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJzYXZlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvZGUgPSBhc3QudG9TdHJpbmcoKTtcclxuICAgICAgICAgICAgICAgICAgICBmcy53cml0ZUZpbGUoYXJncywgY29kZSwgZnVuY3Rpb24oZXJyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJsLndyaXRlKGVyciArIFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5leHQoKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gUkVQTCBjb21tYW5kJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGxpbmUgPSBwYXJzZXIucGFyc2VMaW5lKGNtZCwgYXN0LnJvb3QubGVuZ3RoLCBhc3QubGFiZWxzLCBmYWxzZSwgYXN0Lm1hbmFnZXIpO1xyXG4gICAgICAgIGlmIChsaW5lIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHRocm93IGxpbmU7XHJcbiAgICAgICAgaWYgKGxpbmUuZXJyb3IpIHRocm93IGxpbmUuZXJyb3I7XHJcblxyXG4gICAgICAgIGFzdC5yb290LnB1c2gobGluZSk7XHJcbiAgICAgICAgYXN0Lm1hbmFnZXIucGFyc2UoYXN0KTtcclxuICAgICAgICBpZiAodHlwZW9mIGNvbnRleHQuX2Jsb2NrU3RhcnQgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgIGNvbnRleHQub3B0aW9ucy5jdXJzb3JTdGFydCA9IGNvbnRleHQuX2Jsb2NrU3RhcnQ7XHJcbiAgICAgICAgICAgIGNvbnRleHQuX2Jsb2NrU3RhcnQgPSBmYWxzZTtcclxuICAgICAgICB9IGVsc2UgY29udGV4dC5vcHRpb25zLmN1cnNvclN0YXJ0ID0gY3Vyc29yO1xyXG4gICAgICAgIGFzdC5leGVjdXRlKGNvbnRleHQsIG5leHQpO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgdmFyIG1lc3NhZ2UgPSBlcnIubWVzc2FnZTtcclxuXHJcbiAgICAgICAgLy8gRGV0ZWN0IHggd2l0aG91dCB5IGFuZCBhZGQgYSBsYXllclxyXG4gICAgICAgIGlmIChlcnIgaW5zdGFuY2VvZiBTeW50YXhFcnJvciAmJiBtZXNzYWdlLmluZGV4T2YoJ3dpdGhvdXQnKSAhPT0gLTEpIHtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjb250ZXh0Ll9ibG9ja1N0YXJ0ICE9PSAnbnVtYmVyJykgY29udGV4dC5fYmxvY2tTdGFydCA9IGFzdC5yb290Lmxlbmd0aCAtIDE7XHJcbiAgICAgICAgICAgIG5leHQoJy4uLiAnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBybC53cml0ZShlcnIgKyBcIlxcblwiKTtcclxuICAgICAgICAgICAgYXN0LnJvb3QucG9wKCk7XHJcbiAgICAgICAgICAgIGFzdC5yb290LnB1c2gobmV3IHN0YXRlbWVudHMuRW1wdHlTdGF0ZW1lbnQoKSk7XHJcbiAgICAgICAgICAgIG5leHQoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBJbnB1dHMgYW5kIGV4ZWN1dGVzIHRoZSBuZXh0IGxpbmVcclxuICpcclxuICogQHBhcmFtIHtFeGVjdXRpb25Db250ZXh0fSBjb250ZXh0IFRoZSBjdXJyZW50IGV4ZWN1dGlvbiBjb250ZXh0XHJcbiAqIEBwYXJhbSB7QWJzdHJhY3RTeW50YXhUcmVlfSBhc3QgVGhlIGN1cnJlbnQgYWJzdHJhY3Qgc3ludGF4IHRyZWVcclxuICogQHBhcmFtIHtTdHJpbmd9IHByb21wdFxyXG4gKiBAcGFyYW0ge1N0cmluZ30gb2xkUHJvbXB0XHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBmb3JjZUN1cnNvclxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBldmFsIFRoZSBmdW5jdGlvbiB0byBldmFsdWF0ZVxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gbmV4dExpbmUoY29udGV4dCwgYXN0LCBwcm9tcHQsIG9sZFByb21wdCwgZm9yY2VDdXJzb3IsIGV2YWwpIHtcclxuICAgIHJsLnF1ZXN0aW9uKHByb21wdCwgZnVuY3Rpb24oYW5zd2VyKSB7XHJcbiAgICAgICAgZXZhbChhbnN3ZXIsIGNvbnRleHQsIGFzdCwgZm9yY2VDdXJzb3IgPT09IC0xID8gYXN0LnJvb3QubGVuZ3RoIDogZm9yY2VDdXJzb3IsIGZ1bmN0aW9uKG5ld1Byb21wdCwgbmV3Q3Vyc29yKSB7XHJcbiAgICAgICAgICAgIG5leHRMaW5lKGNvbnRleHQsIGFzdCwgbmV3UHJvbXB0IHx8IG9sZFByb21wdCwgb2xkUHJvbXB0LCB0eXBlb2YgbmV3Q3Vyc29yID09PSAndW5kZWZpbmVkJyA/IC0xIDogbmV3Q3Vyc29yLCBldmFsKTtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG59IiwiLyoqXHJcbiAqIEZpbmRzIHRoZSBuZXh0IG9uZSBvZiB0aGUgaXRlbXNcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgVGhlIHN0cmluZyB0byBzZWFyY2hcclxuICogQHBhcmFtIHtBcnJheTxTdHJpbmc+fSBpdGVtcyBUaGUgaXRlbXMgdG8gZmluZFxyXG4gKiBAcGFyYW0ge051bWJlcj0wfSBpbmRleCBUaGUgc3RhcnQgaW5kZXhcclxuICogQHJldHVybnMge3tpbmRleDogTnVtYmVyLCBmb3VuZDogU3RyaW5nfX0gVGhlIGZvdW5kIGluZGV4IGFuZCB0aGUgZm91bmQgaXRlbVxyXG4gKi9cclxuZnVuY3Rpb24gZmluZE5leHQoZGF0YSwgaXRlbXMsIGluZGV4KSB7XHJcbiAgICB2YXIgY3VycmVudEluZGV4ID0gZGF0YS5sZW5ndGggKyAxLCBmb3VuZCA9ICcnO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBpdGVtID0gaXRlbXNbaV07XHJcbiAgICAgICAgdmFyIGxvY2F0aW9uID0gZGF0YS5pbmRleE9mKGl0ZW0sIGluZGV4KTtcclxuICAgICAgICBpZiAobG9jYXRpb24gIT09IC0xICYmIGxvY2F0aW9uIDwgY3VycmVudEluZGV4KSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRJbmRleCA9IGxvY2F0aW9uO1xyXG4gICAgICAgICAgICBmb3VuZCA9IGl0ZW07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGN1cnJlbnRJbmRleCA9PT0gZGF0YS5sZW5ndGggKyAxKSByZXR1cm4geyBpbmRleDogLTEsIGZvdW5kOiAnJyB9O1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBpbmRleDogY3VycmVudEluZGV4LFxyXG4gICAgICAgIGZvdW5kOiBmb3VuZFxyXG4gICAgfTtcclxufVxyXG5cclxuZXhwb3J0cy5maW5kTmV4dCA9IGZpbmROZXh0O1xyXG5cclxuLyoqXHJcbiAqIEZpbmRzIHRoZSBsYXN0IG9uZSBvZiB0aGUgaXRlbXNcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgVGhlIHN0cmluZyB0byBzZWFyY2hcclxuICogQHBhcmFtIHtBcnJheTxTdHJpbmc+fSBpdGVtcyBUaGUgaXRlbXMgdG8gZmluZFxyXG4gKiBAcGFyYW0ge051bWJlcj0wfSBpbmRleCBUaGUgZW5kIGluZGV4XHJcbiAqIEByZXR1cm5zIHt7aW5kZXg6IG51bWJlciwgZm91bmQ6IHN0cmluZ319IFRoZSBmb3VuZCBpbmRleCBhbmQgdGhlIGZvdW5kIGl0ZW1cclxuICovXHJcbmZ1bmN0aW9uIGZpbmRMYXN0KGRhdGEsIGl0ZW1zLCBpbmRleCkge1xyXG4gICAgdmFyIGN1cnJlbnRJbmRleCA9IC0xLCBmb3VuZCA9ICcnO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBpdGVtID0gaXRlbXNbaV07XHJcbiAgICAgICAgdmFyIGxvY2F0aW9uID0gZGF0YS5sYXN0SW5kZXhPZihpdGVtLCBpbmRleCk7XHJcbiAgICAgICAgaWYgKGxvY2F0aW9uID4gY3VycmVudEluZGV4KSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRJbmRleCA9IGxvY2F0aW9uO1xyXG4gICAgICAgICAgICBmb3VuZCA9IGl0ZW07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBpbmRleDogY3VycmVudEluZGV4LFxyXG4gICAgICAgIGZvdW5kOiBmb3VuZFxyXG4gICAgfTtcclxufVxyXG5cclxuZXhwb3J0cy5maW5kTGFzdCA9IGZpbmRMYXN0O1xyXG5cclxuLyoqXHJcbiAqIEZpbmRzIHRoZSBuZXh0IG9uZSBvZiB0aGUgaXRlbXMgb3V0c2lkZSBvZiB0aGUgZ2l2ZW4gcG9zaXRpb25zXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhIFRoZSBzdHJpbmcgdG8gc2VhcmNoXHJcbiAqIEBwYXJhbSB7QXJyYXk8U3RyaW5nPn0gaXRlbXMgVGhlIGl0ZW1zIHRvIGZpbmRcclxuICogQHBhcmFtIHtOdW1iZXI9MH0gaW5kZXggVGhlIHN0YXJ0IGluZGV4XHJcbiAqIEBwYXJhbSB7QXJyYXk8e3N0YXJ0OiBOdW1iZXIsIGVuZDogTnVtYmVyfT59IGV4Y2x1ZGUgVGhlIGJvdW5kYXJpZXMgdG8gZXhjbHVkZVxyXG4gKiBAcmV0dXJucyB7e2luZGV4OiBOdW1iZXIsIGZvdW5kOiBTdHJpbmd9fSBUaGUgZm91bmQgaW5kZXggYW5kIHRoZSBmb3VuZCBpdGVtXHJcbiAqL1xyXG5mdW5jdGlvbiBmaW5kTmV4dE91dHNpZGUoZGF0YSwgaXRlbXMsIGluZGV4LCBleGNsdWRlKSB7XHJcbiAgICB2YXIgcmVzdWx0LCBwb3NpdGlvblJlc3VsdCA9IHtzdGFydDogMCwgZW5kOiBpbmRleCA/IGluZGV4IC0gMSA6IC0xfTtcclxuXHJcbiAgICBkbyB7XHJcbiAgICAgICAgcmVzdWx0ID0gZmluZE5leHQoZGF0YSwgaXRlbXMsIHBvc2l0aW9uUmVzdWx0LmVuZCArIDEpO1xyXG4gICAgfSB3aGlsZSAocmVzdWx0LmluZGV4ICE9PSAtMSAmJiAocG9zaXRpb25SZXN1bHQgPSBpblBvc2l0aW9uKHJlc3VsdC5pbmRleCwgZXhjbHVkZSkpKTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmV4cG9ydHMuZmluZE5leHRPdXRzaWRlID0gZmluZE5leHRPdXRzaWRlO1xyXG5cclxuLyoqXHJcbiAqIEZpbmRzIHRoZSBsYXN0IG9uZSBvZiB0aGUgaXRlbXMgb3V0c2lkZSBvZiB0aGUgZ2l2ZW4gcG9zaXRpb25zXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhIFRoZSBzdHJpbmcgdG8gc2VhcmNoXHJcbiAqIEBwYXJhbSB7QXJyYXk8U3RyaW5nPn0gaXRlbXMgVGhlIGl0ZW1zIHRvIGZpbmRcclxuICogQHBhcmFtIHtOdW1iZXI/fSBpbmRleCBUaGUgZW5kIGluZGV4XHJcbiAqIEBwYXJhbSB7QXJyYXk8e3N0YXJ0OiBOdW1iZXIsIGVuZDogTnVtYmVyfT59IGV4Y2x1ZGUgVGhlIGJvdW5kYXJpZXMgdG8gZXhjbHVkZVxyXG4gKiBAcmV0dXJucyB7e2luZGV4OiBOdW1iZXIsIGZvdW5kOiBTdHJpbmd9fSBUaGUgZm91bmQgaW5kZXggYW5kIHRoZSBmb3VuZCBpdGVtXHJcbiAqL1xyXG5mdW5jdGlvbiBmaW5kTGFzdE91dHNpZGUoZGF0YSwgaXRlbXMsIGluZGV4LCBleGNsdWRlKSB7XHJcbiAgICB2YXIgcmVzdWx0LCBwb3NpdGlvblJlc3VsdCA9IHtzdGFydDogaW5kZXggPyBpbmRleCArIDEgOiBkYXRhLmxlbmd0aCArIDEsIGVuZDogMH07XHJcblxyXG4gICAgZG8ge1xyXG4gICAgICAgIHJlc3VsdCA9IGZpbmRMYXN0KGRhdGEsIGl0ZW1zLCBwb3NpdGlvblJlc3VsdC5zdGFydCAtIDEpO1xyXG4gICAgfSB3aGlsZSAocmVzdWx0LmluZGV4ICE9PSAtMSAmJiAocG9zaXRpb25SZXN1bHQgPSBpblBvc2l0aW9uKHJlc3VsdC5pbmRleCwgZXhjbHVkZSkpKTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmV4cG9ydHMuZmluZExhc3RPdXRzaWRlID0gZmluZExhc3RPdXRzaWRlO1xyXG5cclxuLyoqXHJcbiAqIEZpbmRzIHRoZSBuZXh0IGluZGV4IG9mIHRoZSBpdGVtIG91dHNpZGUgb2YgdGhlIGdpdmVuIHBvc2l0aW9uc1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZGF0YSBUaGUgc3RyaW5nIHRvIHNlYXJjaFxyXG4gKiBAcGFyYW0ge1N0cmluZ30gaXRlbSBUaGUgaXRlbSB0byBmaW5kXHJcbiAqIEBwYXJhbSB7TnVtYmVyPTB9IGluZGV4IFRoZSBzdGFydCBpbmRleFxyXG4gKiBAcGFyYW0ge0FycmF5PHtzdGFydDogTnVtYmVyLCBlbmQ6IE51bWJlcn0+fSBleGNsdWRlIFRoZSBib3VuZGFyaWVzIHRvIGV4Y2x1ZGVcclxuICogQHJldHVybnMge051bWJlcn0gVGhlIGZvdW5kIGluZGV4LCBvciAtMSBpZiBub25lIGZvdW5kXHJcbiAqL1xyXG5mdW5jdGlvbiBpbmRleE9mT3V0c2lkZShkYXRhLCBpdGVtLCBpbmRleCwgZXhjbHVkZSkge1xyXG4gICAgdmFyIHJlc3VsdCwgcG9zaXRpb25SZXN1bHQgPSB7c3RhcnQ6IDAsIGVuZDogaW5kZXggPyBpbmRleCAtIDEgOiAtMX07XHJcblxyXG4gICAgZG8ge1xyXG4gICAgICAgIHJlc3VsdCA9IGRhdGEuaW5kZXhPZihpdGVtLCBwb3NpdGlvblJlc3VsdC5lbmQgKyAxKTtcclxuICAgIH0gd2hpbGUgKHJlc3VsdCAhPT0gLTEgJiYgKHBvc2l0aW9uUmVzdWx0ID0gaW5Qb3NpdGlvbihyZXN1bHQsIGV4Y2x1ZGUpKSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5leHBvcnRzLmluZGV4T2ZPdXRzaWRlID0gaW5kZXhPZk91dHNpZGU7XHJcblxyXG4vKipcclxuICogRmluZHMgdGhlIGxhc3QgaW5kZXggb2YgdGhlIGl0ZW0gb3V0c2lkZSBvZiB0aGUgZ2l2ZW4gcG9zaXRpb25zXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhIFRoZSBzdHJpbmcgdG8gc2VhcmNoXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBpdGVtIFRoZSBpdGVtIHRvIGZpbmRcclxuICogQHBhcmFtIHtOdW1iZXI9ZGF0YS5sZW5ndGh9IGluZGV4IFRoZSBlbmQgaW5kZXhcclxuICogQHBhcmFtIHtBcnJheTx7c3RhcnQ6IE51bWJlciwgZW5kOiBOdW1iZXJ9Pn0gZXhjbHVkZSBUaGUgYm91bmRhcmllcyB0byBleGNsdWRlXHJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBmb3VuZCBpbmRleCwgb3IgLTEgaWYgbm9uZSBmb3VuZFxyXG4gKi9cclxuZnVuY3Rpb24gbGFzdEluZGV4T2ZPdXRzaWRlKGRhdGEsIGl0ZW0sIGluZGV4LCBleGNsdWRlKSB7XHJcbiAgICB2YXIgcmVzdWx0LCBwb3NpdGlvblJlc3VsdCA9IHtzdGFydDogaW5kZXggPyBpbmRleCArIDEgOiBkYXRhLmxlbmd0aCArIDEsIGVuZDogMH07XHJcblxyXG4gICAgZG8ge1xyXG4gICAgICAgIHJlc3VsdCA9IGRhdGEubGFzdEluZGV4T2YoaXRlbSwgcG9zaXRpb25SZXN1bHQuc3RhcnQgLSAxKTtcclxuICAgIH0gd2hpbGUgKHJlc3VsdC5pbmRleCAhPT0gLTEgJiYgKHBvc2l0aW9uUmVzdWx0ID0gaW5Qb3NpdGlvbihyZXN1bHQuaW5kZXgsIGV4Y2x1ZGUpKSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5leHBvcnRzLmxhc3RJbmRleE9mT3V0c2lkZSA9IGxhc3RJbmRleE9mT3V0c2lkZTtcclxuXHJcbi8qKlxyXG4gKiBTcGxpdHMgZGF0YSBpbnRvIGFuIGFycmF5IGJ5IHRoZSBzZXBhcmF0b3IsIGV4Y2VwdCBpZiBpbiB0aGUgZXhjbHVkZSByZWdpb25zXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBkYXRhIFRoZSBzdHJpbmcgdG8gc3BsaXRcclxuICogQHBhcmFtIHtTdHJpbmd9IHNlcGFyYXRvciBUaGUgc2VwYXJhdG9yXHJcbiAqIEBwYXJhbSB7QXJyYXk8e3N0YXJ0OiBOdW1iZXIsIGVuZDogTnVtYmVyfT59IGV4Y2x1ZGUgVGhlIGJvdW5kYXJpZXMgdG8gZXhjbHVkZVxyXG4gKiBAcmV0dXJucyB7QXJyYXk8U3RyaW5nPn0gVGhlIHNlcGFyYXRlZCBhcnJheVxyXG4gKi9cclxuZnVuY3Rpb24gc3BsaXRPdXRzaWRlKGRhdGEsIHNlcGFyYXRvciwgZXhjbHVkZSkge1xyXG4gICAgdmFyIHJlc3VsdCA9IFtdO1xyXG5cclxuICAgIHZhciBhY2N1bXVsYXRvciA9IFwiXCI7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBhY2N1bXVsYXRvciArPSBkYXRhW2ldO1xyXG5cclxuICAgICAgICB2YXIgaXNJbkV4Y2x1c2lvbiA9IGluUG9zaXRpb24oaSwgZXhjbHVkZSk7XHJcbiAgICAgICAgaWYgKCFpc0luRXhjbHVzaW9uICYmIGVuZHNXaXRoKGFjY3VtdWxhdG9yLCBzZXBhcmF0b3IpKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGFjY3VtdWxhdG9yLnN1YnN0cmluZygwLCBhY2N1bXVsYXRvci5sZW5ndGggLSBzZXBhcmF0b3IubGVuZ3RoKSk7XHJcbiAgICAgICAgICAgIGFjY3VtdWxhdG9yID0gJyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmVzdWx0LnB1c2goYWNjdW11bGF0b3IpO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZXhwb3J0cy5zcGxpdE91dHNpZGUgPSBzcGxpdE91dHNpZGU7XHJcblxyXG4vKipcclxuICogRmluZHMgdGhlIHN0YXJ0L2VuZCBwb3NpdGlvbiBvZiBlYWNoIGl0ZW1cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgVGhlIHN0cmluZyB0byBzZWFyY2hcclxuICogQHBhcmFtIHtBcnJheTx7c3RhcnQ6IFN0cmluZywgZW5kOiBTdHJpbmd9Pn0gaXRlbXMgVGhlIGFycmF5IG9mIGl0ZW1zIHRvIGZpbmRcclxuICogQHJldHVybnMge0FycmF5PHtzdGFydENoYXI6IFN0cmluZywgZW5kQ2hhcjogU3RyaW5nLCBzdGFydDogTnVtYmVyLCBlbmQ6IE51bWJlcn0+fSBUaGUgZm91bmQgaXRlbXMgYW5kIGxvY2F0aW9uc1xyXG4gKi9cclxuZnVuY3Rpb24gZmluZFBvc2l0aW9ucyhkYXRhLCBpdGVtcykge1xyXG4gICAgdmFyIGRlcHRoID0gMDtcclxuICAgIHZhciByb290SWQgPSAtMTtcclxuICAgIHZhciByZXN1bHQgPSBbXTtcclxuICAgIHZhciBjdXJyZW50SXRlbSA9IHt9O1xyXG5cclxuICAgIHZhciBhY2N1bXVsYXRvciA9ICcnO1xyXG4gICAgZm9yICh2YXIgY2kgPSAwOyBjaSA8IGRhdGEubGVuZ3RoOyBjaSsrKSB7XHJcbiAgICAgICAgYWNjdW11bGF0b3IgKz0gZGF0YVtjaV07XHJcblxyXG4gICAgICAgIHZhciBtYXRjaGVkSXRlbSA9IGZhbHNlO1xyXG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgaXRlbXMubGVuZ3RoOyB4KyspIHtcclxuICAgICAgICAgICAgdmFyIGl0ZW0gPSBpdGVtc1t4XTtcclxuXHJcbiAgICAgICAgICAgIGlmIChkZXB0aCA+IDAgJiYgZW5kc1dpdGgoYWNjdW11bGF0b3IsIGl0ZW0uZW5kKSkge1xyXG4gICAgICAgICAgICAgICAgZGVwdGgtLTtcclxuICAgICAgICAgICAgICAgIGlmIChkZXB0aCA9PT0gMCAmJiByb290SWQgPT09IHgpIHtcclxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50SXRlbS5lbmQgPSBjaSAtIGl0ZW0uZW5kLmxlbmd0aCArIDE7XHJcbiAgICAgICAgICAgICAgICAgICAgcm9vdElkID0gLTE7XHJcbiAgICAgICAgICAgICAgICAgICAgYWNjdW11bGF0b3IgPSAnJztcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQucHVzaChjdXJyZW50SXRlbSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudEl0ZW0gPSB7fTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIGlmIChlbmRzV2l0aChhY2N1bXVsYXRvciwgaXRlbS5zdGFydCkpIHtcclxuICAgICAgICAgICAgICAgIGRlcHRoKys7XHJcbiAgICAgICAgICAgICAgICBpZiAoZGVwdGggPT09IDEgJiYgcm9vdElkID09PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRJdGVtID0ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydENoYXI6IGl0ZW0uc3RhcnQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZENoYXI6IGl0ZW0uZW5kLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydDogY2lcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgICAgIHJvb3RJZCA9IHg7XHJcbiAgICAgICAgICAgICAgICAgICAgYWNjdW11bGF0b3IgPSAnJztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmV4cG9ydHMuZmluZFBvc2l0aW9ucyA9IGZpbmRQb3NpdGlvbnM7XHJcblxyXG4vKipcclxuICogRmluZHMgaWYgdGhlIGluZGV4IGlzIGluc2lkZSBvbmUgb2YgdGhlIGl0ZW1zXHJcbiAqIEl0ZW1zIHNob3VsZCBiZSBpbiB0aGUgc2FtZSBmb3JtYXQgYXMgcmV0dXJuZWQgZnJvbSB1dGlsLmZpbmRQb3NpdGlvbnNcclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IGluZGV4IFRoZSBpbmRleCB0byBjaGVja1xyXG4gKiBAcGFyYW0ge0FycmF5PHtzdGFydDogTnVtYmVyLCBlbmQ6IE51bWJlcn0+fSBpdGVtcyBUaGUgaXRlbXMgdG8gc2VhcmNoXHJcbiAqIEByZXR1cm5zIHsqfSBUaGUgc3RhcnQvZW5kIHBvc2l0aW9uIGlmIGluZGV4IGlzIGluc2lkZSBhbiBpdGVtLCBlbHNlIGZhbHNlXHJcbiAqL1xyXG5mdW5jdGlvbiBpblBvc2l0aW9uKGluZGV4LCBpdGVtcykge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBpdGVtID0gaXRlbXNbaV07XHJcbiAgICAgICAgaWYgKGluZGV4ID49IGl0ZW0uc3RhcnQgJiYgaW5kZXggPD0gaXRlbS5lbmQpIHJldHVybiBpdGVtO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnRzLmluUG9zaXRpb24gPSBpblBvc2l0aW9uO1xyXG5cclxuLyoqXHJcbiAqIEZpbmRzIGlmIGRhdGEgZW5kcyB3aXRoIHN0clxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZGF0YSBUaGUgdGV4dCB0byBzZWFyY2hcclxuICogQHBhcmFtIHtTdHJpbmd9IHN0ciBUaGUgdGV4dCB0byBmaW5kXHJcbiAqIEByZXR1cm5zIHtCb29sZWFufSB3aGV0aGVyIGRhdGEgZW5kcyB3aXRoIHN0clxyXG4gKi9cclxuZnVuY3Rpb24gZW5kc1dpdGgoZGF0YSwgc3RyKSB7XHJcbiAgICBpZiAoZGF0YS5sZW5ndGggPCBzdHIubGVuZ3RoKSByZXR1cm4gZmFsc2U7XHJcbiAgICBpZiAoZGF0YSA9PT0gc3RyKSByZXR1cm4gdHJ1ZTtcclxuICAgIHJldHVybiBkYXRhLmxhc3RJbmRleE9mKHN0cikgPT09IGRhdGEubGVuZ3RoIC0gc3RyLmxlbmd0aDtcclxufVxyXG5cclxuZXhwb3J0cy5lbmRzV2l0aCA9IGVuZHNXaXRoO1xyXG5cclxuLyoqXHJcbiAqIFBhZHMgYSBzdHJpbmdcclxuICpcclxuICogQHBhcmFtIHsqfSBkYXRhIFRoZSB0ZXh0IHRvIHBhZFxyXG4gKiBAcGFyYW0ge051bWJlcn0gbGVuZ3RoIFRoZSBwYWRkZWQgbGVuZ3RoXHJcbiAqIEBwYXJhbSB7U3RyaW5nP30gcGFkIFRoZSB0ZXh0IHRvIHBhZCB3aXRoLCBkZWZhdWx0IGlzIHNwYWNlXHJcbiAqIEByZXR1cm5zIHtTdHJpbmd9XHJcbiAqL1xyXG5mdW5jdGlvbiBwYWQoZGF0YSwgbGVuZ3RoLCBwYWQpIHtcclxuICAgIGRhdGEgPSBTdHJpbmcoZGF0YSk7XHJcbiAgICBwYWQgPSBwYWQgfHwgJyAnO1xyXG4gICAgd2hpbGUgKGRhdGEubGVuZ3RoIDwgbGVuZ3RoKSBkYXRhICs9IHBhZDtcclxuICAgIHJldHVybiBkYXRhO1xyXG59XHJcblxyXG5leHBvcnRzLnBhZCA9IHBhZDtcclxuXHJcbi8qKlxyXG4gKiBTaGFsbG93bHkgY2xvbmVzIHRoZSBvYmplY3QgaW50byB0aGUgc291cmNlIG9iamVjdFxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdD99IHNvdXJjZSBUaGUgc291cmNlIG9iamVjdFxyXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gY2xvbmVcclxuICogQHJldHVybnMge09iamVjdH0gVGhlIHNvdXJjZSBvYmplY3RcclxuICovXHJcbmZ1bmN0aW9uIHNoYWxsb3dDbG9uZShzb3VyY2UsIG9iaikge1xyXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPCAyKSB7XHJcbiAgICAgICAgb2JqID0gc291cmNlO1xyXG4gICAgICAgIHNvdXJjZSA9IHt9O1xyXG4gICAgfVxyXG5cclxuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcclxuICAgICAgICBpZiAoIW9iai5oYXNPd25Qcm9wZXJ0eShrZXkpKSBjb250aW51ZTtcclxuICAgICAgICBzb3VyY2Vba2V5XSA9IG9ialtrZXldO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHNvdXJjZTtcclxufVxyXG5cclxuZXhwb3J0cy5zaGFsbG93Q2xvbmUgPSBzaGFsbG93Q2xvbmU7XHJcblxyXG4vKipcclxuICogVXNlcyBzZXRJbW1lZGlhdGUgb3Igc2V0VGltZW91dCBpZiB1bmF2YWlsYWJsZVxyXG4gKi9cclxuZXhwb3J0cy5zZXRJbW1lZGlhdGUgPSAoZnVuY3Rpb24oKSB7XHJcbiAgICBpZiAodHlwZW9mIHNldEltbWVkaWF0ZSAhPT0gJ3VuZGVmaW5lZCcpIHJldHVybiBzZXRJbW1lZGlhdGU7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24oZnVuYykge1xyXG4gICAgICAgIHNldFRpbWVvdXQoZnVuYywgMCk7XHJcbiAgICB9O1xyXG59KCkpO1xyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIGN1cnJlbnQgaGlnaC1yZXNvbHV0aW9uIHRpbWUgaW4gc2Vjb25kcywgdXNpbmcgcHJvY2Vzcy5ocnRpbWUgb3IgcGVyZm9ybWFuY2Uubm93XHJcbiAqL1xyXG5leHBvcnRzLm5vdyA9IChmdW5jdGlvbigpIHtcclxuICAgIGlmIChwcm9jZXNzLmhydGltZSkge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgdmFyIHRpbWUgPSBwcm9jZXNzLmhydGltZSgpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGltZVswXSArICh0aW1lWzFdIC8gMWU5KTtcclxuICAgICAgICB9O1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHZhciBub3cgPSB3aW5kb3cucGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgIHJldHVybiBub3cgLyAxMDAwO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbn0oKSk7XHJcblxyXG4vKipcclxuICogQSBkZWZlcnJlZCB2YWx1ZVxyXG4gKlxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIERlZmVycmVkVmFsdWUoKSB7fVxyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIHZhbHVlXHJcbiAqXHJcbiAqIEByZXR1cm5zIHsqfVxyXG4gKi9cclxuRGVmZXJyZWRWYWx1ZS5wcm90b3R5cGUudmFsdWVPZiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMudmFsdWU7XHJcbn07XHJcblxyXG5leHBvcnRzLkRlZmVycmVkVmFsdWUgPSBEZWZlcnJlZFZhbHVlOyJdfQ==

