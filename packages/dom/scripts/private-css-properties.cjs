// The upstream implementation supplies validation and serialization. Only descriptor allocation
// is deferred. Public CSSStyleProperties prototypes are built separately from the complete IDL list.
module.exports = function privateCssProperties(specialized, aliases, recipes, options, create) {
  let prototype;
  function has(name) {
    return Object.hasOwn(specialized, name) || Object.hasOwn(aliases, name);
  }
  function get(name) {
    if (Object.hasOwn(specialized, name)) return specialized[name];
    if (!Object.hasOwn(aliases, name)) return undefined;
    const existing = Object.getOwnPropertyDescriptor(prototype, name);
    if (existing) return existing;
    const [property, option] = recipes[aliases[name]];
    const descriptor = create(property, options[option]);
    Object.defineProperty(prototype, name, descriptor);
    return descriptor;
  }
  function install(base) {
    prototype = base;
    Object.defineProperties(base, specialized);
    // Named IDL getters request the original generic accessor once; ordinary private
    // field and index accesses retain the normal prototype chain.
    Object.defineProperty(base, "_readGenericProperty", {
      value(name) {
        const descriptor = get(name);
        return descriptor?.get.call(this);
      },
    });
  }
  return { has, get, install };
};
