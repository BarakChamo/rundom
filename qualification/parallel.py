from pathlib import Path
import json,sys,time,os,subprocess,hashlib
root=Path.cwd();d=Path(os.environ['RUNNER_TEMP']); v=d
for project in [os.environ['PROJECT']]:
 for n in ([4] if os.getenv('TRACE_MEMORY') else ([4,2,1] if os.getenv('ROUND') else [1,2,4])):
  for provider in sys.argv[1:]:
   tag=f'{project}-{n}-{provider}' + ('-trace' if os.getenv('TRACE_MEMORY') else '') + ('-r2' if os.getenv('ROUND') else '')
   if (d/('batch3-'+tag+'.json')).exists():continue
   procs=[];files=[];logs=[];peak=0;start=time.monotonic()
   for i in range(n):
    f=d/f'con3-{tag}-{i}.json'; files.append(f);logs.append((d/f'con3-{tag}-{i}.log').open('w'))
    env={**os.environ,'CI':'1','TZ':'UTC','TEST_SCOPE':'node'}
    if provider=='jsdom':
     env.update(NODE_OPTIONS='--import='+str(root/'qualification/provider.mjs'),JSDOM_ENTRY=str((root/'packages/jsdom/node_modules/jsdom/lib/api.js').resolve()))
    else:
     env.update(NODE_OPTIONS='--import='+str(root/'qualification/provider.mjs'),JSDOM_ENTRY=str(root/'packages/jsdom/dist/jsdom.cjs'))
     if provider=='nursery16':env['NODE_OPTIONS']+=' --max-semi-space-size=16'
     if provider=='before':env['DOM_VARIANT']=str(root/'packages/dom/out/starting')
    if os.getenv('TRACE_MEMORY'):env['MEMORY_TRACE']=str(d/f'memory-{tag}-{i}')
    cases=['--project','node:@mui/material','packages/mui-material/src/Autocomplete/Autocomplete.test.js'] if project=='mui' else ['components/'+x+'.test.tsx' for x in ['alert/__tests__/index','alert/__tests__/semantic','checkbox/__tests__/checkbox','checkbox/__tests__/group','radio/__tests__/radio','radio/__tests__/group','tag/__tests__/semantic','tag/__tests__/variant']]
    procs.append(subprocess.Popen(['node','node_modules/vitest/vitest.mjs','run',*cases,'--maxWorkers','1','--no-file-parallelism','--no-cache','--no-fsModuleCache','--testTimeout','120000','--reporter=json','--outputFile='+str(f)],cwd=d/project,env=env,start_new_session=True,stdout=logs[-1],stderr=subprocess.STDOUT))
   ids={p.pid for p in procs}
   while any(p.poll() is None for p in procs):
    rows=subprocess.check_output(['ps','-axo','pgid=,rss='],text=True);peak=max(peak,sum(int(r.split()[1]) for r in rows.splitlines() if len(r.split())==2 and int(r.split()[0]) in ids));time.sleep(.25)
   wall=time.monotonic()-start;valid=0
   for p,f in zip(procs,files):
    if p.returncode or not f.exists():continue
    x=json.loads(f.read_text());a=sorted((Path(t['name']).resolve().relative_to((d/project).resolve()).as_posix(),k['fullName'],k['status']) for t in x['testResults'] for k in t['assertionResults'])
    expected={'antd':'b2ea93a5fbae0566a48c30b2520c69f314a82e1aff61b226d1283f10fab4b6a9','mui':'4101787bce586b4ff1bfad491aec62af9bf1ca918d452359b86445ea5ad3531a'}
    valid+=hashlib.sha256(json.dumps(a,ensure_ascii=False).encode()).hexdigest()==expected[project]
   row=dict(project=project,n=n,provider=provider,passedCommands=valid,wall=wall,perMinute=60*valid/wall,peakMiB=peak/1024);print(row,flush=True);(d/('batch3-'+tag+'.json')).write_text(json.dumps(row))
