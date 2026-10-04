// SvelteKit serves a page's server data from `<route>/__data.json`, encoded
// with devalue: each node's `data` is one flat array where every object and
// array refers to its members by index, which is how shared values are
// written once. The page itself carries the same data, but as a JavaScript
// literal inside a script, which could only be read by running it.
//
// devalue also has encodings for Dates, Maps, Sets, NaN and the like, written
// as negative indices or arrays tagged with a type name. Love Camden's data
// uses none of them besides `undefined`, so anything else is an error rather
// than a guess at what it meant.
const UNDEFINED = -1;

function unflatten(values) {
  const hydrated = new Map();

  const hydrate = (index) => {
    if (index === UNDEFINED) return undefined;
    if (!Number.isInteger(index) || index < 0 || index >= values.length) {
      throw new Error(`Unsupported devalue reference: ${index}`);
    }
    if (hydrated.has(index)) return hydrated.get(index);

    const value = values[index];
    if (Array.isArray(value)) {
      if (typeof value[0] === "string") {
        throw new Error(`Unsupported devalue type: ${value[0]}`);
      }
      const array = [];
      hydrated.set(index, array);
      for (const item of value) array.push(hydrate(item));
      return array;
    }
    if (value && typeof value === "object") {
      const object = {};
      hydrated.set(index, object);
      for (const [key, item] of Object.entries(value)) {
        object[key] = hydrate(item);
      }
      return object;
    }

    hydrated.set(index, value);
    return value;
  };

  return hydrate(0);
}

module.exports = unflatten;
