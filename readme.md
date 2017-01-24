# cached-function

A [Node.js](https://nodejs.org/en/) module that wraps a function and caches its return value for any given set of arguments. When those same arguments are used again, it pulls from the cache.

* Cached values can be cleared manually or can be configured to expire automatically.
* In addition to caching regular functions, the module can also cache class methods and getters.

## Installation

```
npm install cached-function --save
```

## Usage Examples

```javascript
const CachedFunction = require('cached-function')

function downloadData() {
  console.log('Downloading...')
  // Do the download
  return 'data'
}

// Returns 'data' and outputs "Downloading..."
CachedFunction(downloadData)()

// Returns 'data' but no console output
CachedFunction(downloadData)()
```

It caches the return value for any given set of arguments:

```javascript
const CachedFunction = require('cached-function')
let add = CachedFunction((a, b) => a + b)
add(2, 2) // 4
add(2, 2) // returns 4 from the cache
```

### Class Methods

You can easily modify a prototype to cache a particular method for all instantiated objects:

```javascript
const CachedFunction = require('cached-function')

class TestClass {
  constructor (value) {
    this.value = value
  }

  data (suffix) {
    console.log('The data method was called')
    return this.value + suffix
  }
}

// Cache the data method
TestClass.prototype.data = CachedFunction(TestClass.prototype.data)

const test = new TestClass('value')
test.data(123) // returns 'value123' and logs to the console
test.data(123) // returns 'value123' but does NOT log to the console
CachedFunction.clearCache(test, 'data', [123]) // clears the cached return value
test.data(123) // returns 'value123' and logs to the console
```

### Property Getters

The `cacheGetter()` function makes it easy to implement caching on a property getter:

```javascript
const CachedFunction = require('cached-function')

class TestClass {
  constructor (value) {
    this.value = value
  }

  get data () {
    console.log('The data getter was called')
    return this.value
  }
}

CachedFunction.cacheGetter(TestClass, 'data', {ttl: 5000})

const test = new TestClass('value')
test.data // returns 'value' and logs to the console
test.data // returns 'value' but does NOT log to the console
CachedFunction.clearCache(test, 'data') // clears the cached return value
test.data // returns 'value' and logs to the console
```

### Manual Cache Clearing

The `clearCache()` function can be used to flush the cache manually.

```javascript
const CachedFunction = require('cached-function')
let add = CachedFunction((a, b) => a + b)

add(2, 2) // 4
add(2, 2) // returns 4 from the cache

add(5, 5) // 10
add(5, 5) // returns 10 from the cache

// Clears the cached return value for the given arguments:
CachedFunction.clearCache(add, [2, 2])

add(2, 2) // recalculates: 4

add(5, 5) // still cached: 10
```

### Automatic Cache Expiry

Cached return values can be set to expire after a given number of milliseconds. After a value expires, future calls with those arguments will trigger the underlying function once again.

```javascript
// Each cached return value will have a lifetime of 10 seconds.
func = CachedFunction(func, {ttl: 10000})
```

### Argument Match Modes

By default, the `CachedFunction` will return a cached return value for a given set of arguments only if those arguments are identical. But if you want, you can disable strict-match mode and can compare arguments by their serialization.

```javascript
const CachedFunction = require('cached-function')

function callback (stringArg, arrayArg) {
  console.log('Function called')
}

const strict = CachedFunction(callback) // Default behavior

strict('test', [1, 2, 3]) // Logs to the console
strict('test', [1, 2, 3]) // Still logs to the console. The cache is not invoked because it's technically a different array.

const loose = CachedFunction(callback, {strictArgMatch: false})

loose('test', [1, 2, 3]) // Logs to the console
loose('test', [1, 2, 3]) // Doesn't log to the console. Pulls from the cache, because the array's serialization is identical.
```
