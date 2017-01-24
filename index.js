'use strict'

const check = require('check-types')
const maybeStringify = require('maybe-stringify')
const modifyProperty = require('modify-property')
const MultiKeyMap = require('multikey')
const NamedFunction = require('named-function')
const suppress = require('suppress')
const TTLMap = require('ttlmap')

const getDescriptor = suppress(require('get-descriptor'))

const cachedFunctions = new WeakMap()
const cachedFunctionOptions = new WeakMap()
const cachedValues = new WeakMap()

const noThis = {}
const getRegex = /^get /

/**
 * Generates the representation of function arguments which will be used to store
 *   and retrieve return values in the cache.
 * @param  {array|object} args An array-like collection of the function's arguments.
 * @param  {bool} [strictArgMatch=true] Whether or not to match function arguments
 *   based on their serialized representation.
 * @return {array} An array of keys (either the arguments themselves or a
 *   serialization thereof) to use for the cache.
 */
function generateKey (args, strictArgMatch = true) {
  args = Array.from(args)
  if (strictArgMatch) return args
  return args.map(arg => maybeStringify(arg))
}

/**
 * Wraps a function and caches its return value for any given set of arguments
 * (if any). When those same arguments are used again, it pulls from the cache.
 * @param {function} valueGetter The underlying function that is called whenever
 *   a cached value is not available.
 * @param {object} options
 * @param {bool} [options.strictArgMatch=true] If set to true (the default),
 *   then a function call will pull from the cache only if the arguments are
 *   _exactly_ the same as a previous function call. If set to false, then array
 *   and object arguments will be considered a match if their serialized
 *   representations are identical.
 * @param {int} options.ttl The number of milliseconds a return value will remain in the
 *   cache before expiring.
 * @return {function} A function which will decide whether to pull from the
 *   cache or call upon the `valueGetter`.
 */
function CachedFunction (valueGetter, {strictArgMatch = true, ttl} = {}) {
  check.assert(typeof this === 'undefined', 'Do not call CachedFunction with `new`. Call it directly.', SyntaxError)

  // If we have already created a `CachedFunction` for this `valueGetter` and
  // set of arguments, return it.
  const paramsKey = maybeStringify(arguments[1], {fallback: ''})
  if (cachedFunctions.has(valueGetter) && cachedFunctions.get(valueGetter).has(paramsKey)) {
    return cachedFunctions.get(valueGetter).get(paramsKey)
  }

  check.assert.function(valueGetter, 'valueGetter must be a function', TypeError)
  check.assert.maybe.integer(ttl, 'ttl must be a positive integer', TypeError)
  check.assert.maybe.positive(ttl, 'ttl must be a positive integer', RangeError)

  // Give the cached function the same name as the original function.
  const functionName = valueGetter.name.replace(getRegex, '') || ''
  const cachedFunction = NamedFunction(functionName, function CacheLayer () {
    // Each `this` context needs a separate set of cached values.
    const context = this === global ? noThis : this
    if (!cachedValues.get(cachedFunction).has(context)) {
      const map = new TTLMap()
      map._values = new MultiKeyMap()
      map._ttls = new MultiKeyMap()
      cachedValues.get(cachedFunction).set(context, map)
    }
    const valuesForThis = cachedValues.get(cachedFunction).get(context)

    // Based on the function arguments, see if we already have a return value
    // in the cache.
    const key = generateKey(arguments, strictArgMatch)
    if (valuesForThis.has(key)) {
      return valuesForThis.get(key)
    }

    // Generate a fresh return value, cache it, and return it.
    const value = valueGetter.apply(this, arguments)
    valuesForThis.set(key, value, ttl)
    return value
  })

  cachedValues.set(cachedFunction, new WeakMap())
  cachedFunctionOptions.set(cachedFunction, arguments[1] || {})

  // Save this `CachedFunction` for later. If we are given the same `valueGetter`
  // and same arguments, we can return it without having to make a new one.
  if (!cachedFunctions.has(valueGetter)) cachedFunctions.set(valueGetter, new Map())
  cachedFunctions.get(valueGetter).set(paramsKey, cachedFunction)

  return cachedFunction
}

/**
 * Replaces an object's property getter with a cached function.
 * @param  {function|object} prototype A class or an object.
 * @param  {string} propName The name of the property that has the getter to be
 *   cached.
 * @param  {object} options The options to pass to `CachedFunction`.
 * @return {void}
 */
CachedFunction.cacheGetter = function cacheGetter (prototype, propName, options) {
  if (typeof prototype === 'function') ({prototype} = prototype)
  modifyProperty(prototype, propName, prop => {
    if (typeof prop.get !== 'function') { throw new Error('Property has no getter') }
    prop.get = CachedFunction(prop.get, options)
  })
}

/**
 * Erases the cached values of a given function so that the underlying function
 * can be called and fresh values obtained.
 * @param  {function|object} objectOrFunction The cached function, or, if the
 *   function is a method, the object which provides the `this` context for the
 *   method.
 * @param  {string} methodName The name of the object's method or getter that
 *   needs its cache erased. If the first argument is a function, then the third
 *   argument takes the place of this second argument.
 * @param  {?array} args The arguments passed to the function in question, the
 *   return value for which should be cleared from the cache. Pass an empty array
 *   to clear the cached value which the function returns when called with no
 *   arguments. Omit this argument to clear all the cached values for the function,
 *   regardless of any passed arguments. If the first argument is a function, then
 *   this `args` array should be the second argument instead of the third.
 * @return {void}
 */
CachedFunction.clearCache = function clearCache (objectOrFunction, methodName, args) {
  let cachedFunction, context

  // If the first argument is an object, then we're dealing with a `this` context.
  if (typeof objectOrFunction === 'object') {
    check.assert.string(methodName, 'Must provide a method name if first argument is an object', TypeError)
    context = objectOrFunction

    // See if there's a method by that name
    if (typeof objectOrFunction[methodName] === 'function') {
      cachedFunction = objectOrFunction[methodName]

    // If not, see if there's a getter by that name
    } else {
      const desc = getDescriptor(context, methodName)
      check.assert.object(desc, `Could not find a method named '${methodName}'`, ReferenceError)
      cachedFunction = desc.get
      args = [] // Getters don't take arguments
    }
  } else {
    check.assert.function(objectOrFunction, 'First argument must be a function or object', TypeError)
    context = noThis
    cachedFunction = objectOrFunction
    args = methodName
  }

  check.assert(cachedValues.has(cachedFunction), 'Function is not cached.', ReferenceError)
  check.assert.maybe.array(args, 'Arguments must be passed as an array', TypeError)

  if (!cachedValues.get(cachedFunction).has(context)) return

  if (typeof args === 'undefined') {
    // Delete all cached values for all sets of arguments
    cachedValues.get(cachedFunction).delete(context)
  } else {
    // Delete the cached value for only the specified set of arguments
    const key = generateKey(args, cachedFunctionOptions.get(cachedFunction).strictArgMatch)
    cachedValues.get(cachedFunction).get(context).delete(key)
  }
}

module.exports = CachedFunction
