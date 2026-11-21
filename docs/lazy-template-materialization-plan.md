# Lazy canonical copies of private parse templates

Status: rejected for default use after 1,152 fixed/follow-up paired timing trials. All prototypes and diagnostics are archived; the lazy backend and its diagnostic export are removed from production. Conservative initial name/radio discovery is retained as a separate candidate. GcYJcS remains the last fully qualified checkpoint.

## Boundary and purpose

Repeated-input TypeScript parsing already retains one bounded, private, unexposed raw parse template. Every new Window still eagerly clones that tree, including all attributes. Native repeated-input reuse now similarly avoids parsing but eagerly constructs a full canonical raw tree. Investigate sharing immutable private parse data while allocating independent canonical records only for touched nodes. This targets repeated large sparse documents, with complete traversal/mutation and retained memory as equal acceptance axes. Do not change public constructors, prototypes, records, capabilities, identity or default semantics.

Start with the existing TypeScript private template; add an arena-backed source only after the contracts and measurements justify it. Cold unique input and cache admission stay on the existing path. Keep the one-entry / 1,048,576-markup-unit / 32,768-node admission policy. Initially require at least 1,024 source nodes and keep the first two parses eager. No user-visible reduced capability mode or hidden prewarming is involved.

## Private representation

A per-document copy context maps private source nodes to stable raw copies. It never stores public nodes in the process-wide template cache. The original template remains immutable. Its source parent/child pointers and attributes can answer private ordinary-tree discovery without constructing untouched siblings. A bounded private ID cache may contain only source nodes or misses, never Window-owned records.

The new root remains one ordinary canonical Document object, so the Window and Document wrapper keep their raw identity. Partially touched elements have ordinary scalar name/namespace fields and private guarded accessors for attributes, children and parent. Use shared accessor functions plus weak receiver metadata, avoiding per-field closures on every copied node. Attributes and text values need guarded writes too. Keep all raw property names, own enumerability, template content, doctype identifiers, namespaces and parent absence on Document/DocumentFragment correct. Raw records and private arrays never escape through public wrappers.

A lazy child array is a private Proxy over an Array target of the correct length. Indexed reads materialize stable child copies; has/ownKeys/descriptors must model dense source membership before promotion. Native Array methods, iteration, slice/filter/splice and index descriptors must see normal behavior. After promotion, every trap forwards to the populated target, preserving aliases held by an in-progress internal algorithm. Preserve existing numeric-property rules; do not turn holes or inherited numeric properties into source children after promotion.

Before the first write to topology, attribute arrays/values, text values or guarded raw fields, promote the whole private copy to ordinary writable records. Preserve every previously copied raw object's identity and any state already attached to public wrappers. Existing partial attribute/text objects must become normal writable data fields, with their current values retained. Fill existing child-array targets and remove accessor metadata. Clear context maps/source references after promotion; stale private array proxies must not retain an unnecessary source graph. Never pool public objects or keep a strong global list of copy contexts.

Use an initial fixed budget of 64 partially accessed records to bound accessor/metadata overhead. Dense reads promote automatically. Known whole-tree operations such as document querySelectorAll can promote before walking, avoiding a long partial prefix. Mutation promotion is synchronous and precedes author reactions; initialization that only advances revisions must not falsely count as mutation. Cross-realm borrowed methods must hit the same raw write guards, so correctness cannot depend on the calling Window's local flag.

## Discovery and initialization

Document getElementById can search immutable source order while the context is unmodified, then return the stable per-document raw copy. Duplicate IDs must follow ordinary tree order, excluding template content and hidden roots. Once promoted, existing owned-ID indexing and invalidation resume normally. A source-order cursor for first-match queries can avoid eagerly copying every sibling before the first candidate. Compile and validate selectors normally; apply live predicates only to Window-owned copies, never wrap or expose a private template node. Arbitrary subtree and complex query fallbacks may promote.

The current initial radio reconciliation scans the entire tree whenever markup contains any input, including the benchmark's checkbox. First evaluate a conservative radio prefilter: require an input token and either case-insensitive `radio` text or any ampersand. Entity-encoded radio types must always take the complete path. Active/incremental parsing and unknown input remain conservative. This is a private admission optimization, not permission to omit required radio initialization. Scripts, styles, frames, details, declarative shadow roots, custom elements and author callbacks retain full initialization; their reads may legitimately promote the copy.

Do not build a duplicate selector engine, mutate the cached template with per-document tokens, expose raw arena words, or change the native wire solely for this prototype. A later native source can use immutable numeric topology metadata shared per checked arena, bounded by existing cache admission. Public native-call/fallback accounting stays truthful.

## Examples and acceptance

- Third and later identical parses preserve independent documents, attributes, text, templates, foreign content, doctypes and quirks mode.
- Reading the first ID/first match and child-list length does not change later full enumeration, serialization, cloning or identity.
- Duplicate IDs, misses, selectors with scope/relational/state predicates, template isolation and XML/custom-adapter fallbacks retain current behavior.
- Array iteration/slice/filter/indexOf and a mutation during an internal traversal see stable records before/after promotion.
- Attribute value replacement, insertion/removal, namespaced attributes, Attr adoption, text edits, split/normalize, replacement, fragment insertion and parent changes preserve state and observer/reaction order.
- Borrowed getters/mutators and adoption across source/destination realms preserve creator prototypes and owner documents, including unexposed descendants and closed handles.
- Radio initialization covers plain, mixed-case, fully entity-encoded and partially encoded types; unrelated checkbox documents remain correct.
- Replacing/evicting the one-entry template cannot change already-created lazy documents.
- Three fresh ownership probes must collect released Windows, retain deliberately held handles, then collect them on release. Cached source data must contain no public records.

Measure nine rotated fresh processes against the exact eager checkpoint with the same rig. Include cold unique input, admission/third-use, warm identical and rotating input; sparse first reads, complete traversal/serialization, small/large documents, long-list updates, first-write cost, repeated mutations, events/interactions, queries, roles and framework work. Use live/closed/released heap plus external/ArrayBuffer/RSS, and separate CPU/allocation diagnostics. Check both sparse gains and dense/mutation penalties before selecting admission thresholds. No builds, tests or profilers overlap timing.

Retain only after the full default/native/API/types/four-pool gates, actual native coverage where touched, complete selected assertion replay and real React workflows. If dense or mutation costs outweigh useful sparse gains, reject the representation and preserve the prototype/evidence; do not weaken the work checks. Keep source/runtime hashes and distinguish this decision from the already retained bounded parse cache.

## Fixed prototype evidence and next decision

The first prototype oqqKt2 was rejected because document named-property discovery promoted every copy before sparse reads. Fixed gP3Qt1 preserves sparse behavior with conservative initial name/radio discovery. At 4,096 rows, four-document sparse batches improve 16.390 to 7.547 ms; full traversal regresses 40.083 to 45.868 and first writes 30.741 to 34.938. At 8,192 rows, sparse improves 34.747 to 11.117 while traversal changes 82.178 to 87.741 and writes 68.087 to 72.138. Shared-host exploratory distributions, not a universal ratio. Small/unique/rotating, admission/budget, query, role/style, long-list, interaction, deep-event/write and VM controls are preserved in `.cache/qualification/lazy-template-fixed-matrix-summary.json`.

Across five sampled batches, sparse allocation falls 112.184 to 27.809 MiB, traversal changes 160.583 to 156.543, and update allocation rises 128.963 to 141.831. At 64 live windows, pre-edit heap falls 175.61 to 53.29 MiB; after writes promote the copies, post-work heap is 189.34 versus 189.60, and released heap 21.65 versus 21.74. Styled-window initialization promotes and has no storage win. All six ownership probes pass (three per side), including a held-node positive control and source-cache eviction.

A copied-runtime supplemental run forces eligible inactive HTML through lazy copies even at first use/small sizes: 1,515 facade tests and 634 upstream API tests pass. This does not replace full normal default/native/WPT qualification. CPU profiles identify promotion overhead; the next candidate bypasses accessor restoration for newly cloned records while preserving the bounded observed prefix and active-reader identity map. Retain or reject it only after paired sparse/dense/write measurements and broad controls.

Final decision: promotion specialization improves some dense comparisons, but the default tradeoff remains unfavorable. The direct-append variant still changes 4,096-row traversal 47.336 to 50.741 ms and full count 31.980 to 34.858; at 8,192 rows traversal changes 80.269 to 84.024 while updates improve 69.071 to 65.460. Sparse remains much faster. Do not average these workloads or label the dense penalty resolved. Independent conservative initialization is the remaining production candidate. A future packed/fine-grained copy-on-write design must avoid whole-document promotion on the first edit; this is an outstanding architecture experiment, not an implemented improvement. Decision index: `.cache/qualification/lazy-template-decision.json`.
