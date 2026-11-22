import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
registerHooks({resolve(specifier,context,next) {
  if (specifier==='happy-dom' && process.env.QUAL_ENV==='happy-dom') return next(new URL('../packages/jsdom/node_modules/happy-dom/lib/index.js',import.meta.url).href,context);
  if (specifier==='jsdom' && process.env.JSDOM_ENTRY) return next(context.conditions.includes('require')? process.env.JSDOM_ENTRY:pathToFileURL(process.env.JSDOM_ENTRY.replace(/jsdom\.cjs$/, 'jsdom.js')).href,context);
  if (specifier==='@run-dom/dom' && process.env.DOM_VARIANT) return next(process.env.DOM_VARIANT+'/window.cjs',context);
  return next(specifier,context);
}});

if(process.env.DOM_VARIANT){process.on('exit',()=>{const expected=process.env.DOM_VARIANT+'/window-implementation.cjs';if(!process.getBuiltinModule('node:module')._cache[expected] && !process.getBuiltinModule('node:module')._cache[process.env.DOM_VARIANT+'/window.cjs'] && process.env.REQUIRE_VARIANT_CHECK==='1'){process.stderr.write('Expected implementation was not loaded: '+expected+'\n');process.exitCode=9;}});}

if (process.env.MEMORY_TRACE) {
  const {getHeapSpaceStatistics} = process.getBuiltinModule('node:v8');
  const {appendFileSync} = process.getBuiltinModule('node:fs');
  const file = process.env.MEMORY_TRACE + '-' + process.pid + '.jsonl';
  function sample() {
    const {rss,heapTotal,heapUsed,external} = process.memoryUsage();
    const spaces = Object.fromEntries(getHeapSpaceStatistics().map(s=>[s.space_name,[s.space_used_size,s.physical_space_size]]));
    appendFileSync(file,JSON.stringify({t:Date.now(),pid:process.pid,rss,heapTotal,heapUsed,external,spaces})+'\n');
  }
  setInterval(sample,250).unref();
  process.once('exit',sample);
}
