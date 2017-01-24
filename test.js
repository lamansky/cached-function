'use strict'

const assert = require('assert')
const CachedFunction = require('.')

describe('CachedFunction', function () {
  it('should cache the function’s value', function () {
    let callbackCalls = 0

    function callback () {
      if (++callbackCalls > 1) {
        throw new Error('Callback was called again')
      }
      return 'value'
    }

    const cachedCallback = CachedFunction(callback)
    assert.strictEqual(cachedCallback(), 'value')
    assert.strictEqual(cachedCallback(), 'value')
  })

  it('should throw an error if given a non-function', function () {
    assert.throws(() => {
      CachedFunction('this is not a function')
    })
  })

  it('should return a function which has the same name as the original', function () {
    function Bob () {}
    assert.strictEqual(CachedFunction(Bob).name, 'Bob')
  })

  it('should cache the cached function', function () {
    function callback () {}
    assert.strictEqual(CachedFunction(callback), CachedFunction(callback))
  })

  it('should work on a class prototype and properly contextualize `this`', function () {
    class TestClass {
      constructor (value) {
        this.value = value
      }

      data () {
        return this.value
      }
    }

    TestClass.prototype.data = CachedFunction(TestClass.prototype.data)

    const test1 = new TestClass('value1')
    const test2 = new TestClass('value2')
    assert.strictEqual(test1.data(), 'value1')
    assert.strictEqual(test2.data(), 'value2')
  })

  it('should throw an error when called with `new`', function () {
    assert.throws(() => { new CachedFunction(() => {}) }) // eslint-disable-line no-new
  })

  it('should cache the function’s returned value for any given arguments', function () {
    let callbackCalls = 0

    function callback (a, b) {
      if (++callbackCalls > 1) {
        throw new Error('Callback was called again')
      }
      return a + b
    }

    const cachedCallback = CachedFunction(callback)
    assert.strictEqual(cachedCallback(2, 2), 4)
    assert.strictEqual(cachedCallback(2, 2), 4)
  })

  it('should cache the returned value even for non-primitive arguments', function () {
    let callbackCalls = 0

    function callback (key) {
      if (++callbackCalls > 1) {
        throw new Error('Callback was called again')
      }
      return 'value'
    }

    const a = ['test']
    function f () {}
    const cachedCallback = CachedFunction(callback)
    assert.strictEqual(cachedCallback(a, f, 'test'), 'value')
    assert.strictEqual(cachedCallback(a, f, 'test'), 'value')
  })

  it('should handle multiple calls with varying arguments', function () {
    function callback (a, b) {
      return a + b
    }

    const cachedCallback = CachedFunction(callback)
    assert.strictEqual(cachedCallback(1, 2), 3)
    assert.strictEqual(cachedCallback(2, 3), 5)
    assert.strictEqual(cachedCallback(1, 2), 3)
    assert.strictEqual(cachedCallback(2, 3), 5)
  })

  it('should support strictArgMatch argument', function () {
    const array = ['test']

    const loose = CachedFunction(key => key, {strictArgMatch: false})
    assert.strictEqual(loose(array), array)
    assert.strictEqual(loose(['test']), array)

    const strict = CachedFunction(key => key, {strictArgMatch: true})
    assert.strictEqual(strict(array), array)
    assert.notStrictEqual(strict(['test']), array)
  })

  it('should support TTL argument', function (done) {
    let reachedEnd = false
    let callbackCalls = 0

    function callback (a, b) {
      if (++callbackCalls === 2 && reachedEnd) {
        done()
      }
      return a + b
    }

    const cachedCallback = CachedFunction(callback, {ttl: 10})
    assert.strictEqual(cachedCallback(2, 2), 4)
    assert.strictEqual(cachedCallback(2, 2), 4)

    setTimeout(() => {
      assert.strictEqual(cachedCallback(2, 2), 4)
    }, 20)

    reachedEnd = true
  })

  it('should throw an error if TTL argument is not a positive number', function () {
    assert.throws(() => {
      CachedFunction(() => {}, {ttl: -1})
    })
  })

  it('should create different caches for different TTL arguments', function () {
    function callback () {}
    assert.notStrictEqual(CachedFunction(callback), CachedFunction(callback, {ttl: 100}))
  })

  describe('#cacheGetter()', function () {
    it('should cache a getter on a class prototype', function () {
      let callbackCalls = 0

      class TestClass {
        constructor (value) {
          this.value = value
        }

        get data () {
          if (++callbackCalls > 1) {
            throw new Error('Getter was not cached')
          }
          return this.value
        }
      }

      CachedFunction.cacheGetter(TestClass.prototype, 'data')

      const test = new TestClass('value')
      assert.strictEqual(test.data, 'value')
      assert.strictEqual(test.data, 'value')
    })

    it('should cache a getter on a class', function () {
      let callbackCalls = 0

      class TestClass {
        constructor (value) {
          this.value = value
        }

        get data () {
          if (++callbackCalls > 1) {
            throw new Error('Getter was not cached')
          }
          return this.value
        }
      }

      CachedFunction.cacheGetter(TestClass, 'data')

      const test = new TestClass('value')
      assert.strictEqual(test.data, 'value')
      assert.strictEqual(test.data, 'value')
    })
  })

  describe('#clearCache()', function () {
    it('should clear a function cache', function (done) {
      let callbackCalls = 0

      function callback (a, b) {
        if (++callbackCalls > 1) done()
        return 'value'
      }

      const cachedCallback = CachedFunction(callback)
      assert.strictEqual(cachedCallback(), 'value')
      CachedFunction.clearCache(cachedCallback)
      assert.strictEqual(cachedCallback(), 'value')

      throw new Error('Callback was not called twice')
    })

    it('should clear a function cache for given arguments', function (done) {
      let callbackCalls = 0

      function add (a, b) {
        if (++callbackCalls > 1) done()
        return a + b
      }

      const cachedAdd = CachedFunction(add)
      assert.strictEqual(cachedAdd(2, 2), 4)
      assert.strictEqual(cachedAdd(2, 2), 4)
      CachedFunction.clearCache(cachedAdd, [2, 2])
      assert.strictEqual(cachedAdd(2, 2), 4)

      throw new Error('Callback was not called twice')
    })

    it('should clear a method cache', function (done) {
      let callbackCalls = 0

      class TestClass {
        data (suffix) {
          if (++callbackCalls > 1) done()
          return 'value' + suffix
        }
      }

      TestClass.prototype.data = CachedFunction(TestClass.prototype.data)

      const test = new TestClass()
      assert.strictEqual(test.data(1), 'value1')
      CachedFunction.clearCache(test, 'data', [1])
      assert.strictEqual(test.data(1), 'value1')

      throw new Error('Callback was not called twice')
    })

    it('should clear a getter cache', function (done) {
      let callbackCalls = 0

      class TestClass {
        get data () {
          if (++callbackCalls > 1) done()
          return 'value'
        }
      }

      CachedFunction.cacheGetter(TestClass, 'data', 'extra arg ignored')

      const test = new TestClass('value')
      assert.strictEqual(test.data, 'value')
      CachedFunction.clearCache(test, 'data')
      assert.strictEqual(test.data, 'value')
    })
  })
})
