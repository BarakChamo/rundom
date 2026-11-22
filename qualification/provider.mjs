import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
registerHooks({resolve(specifier,context,next) {
  if (specifier==='jsdom' && process.env.JSDOM_ENTRY) return next(context.conditions.includes('require')? process.env.JSDOM_ENTRY:pathToFileURL(process.env.JSDOM_ENTRY.replace(/jsdom\.cjs$/, 'jsdom.js')).href,context);
  if (specifier==='@run-dom/dom' && process.env.DOM_VARIANT) return next(process.env.DOM_VARIANT+'/window.cjs',context);
  return next(specifier,context);
}});

if(process.env.DOM_VARIANT){process.on('exit',()=>{const expected=process.env.DOM_VARIANT+'/window-implementation.cjs';if(!process.getBuiltinModule('node:module')._cache[expected] && !process.getBuiltinModule('node:module')._cache[process.env.DOM_VARIANT+'/window.cjs'] && process.env.REQUIRE_VARIANT_CHECK==='1'){process.stderr.write('Expected implementation was not loaded: '+expected+'\n');process.exitCode=9;}});}
