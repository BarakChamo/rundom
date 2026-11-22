from pathlib import Path

root = Path('.cache/jsdom-reference/test/web-platform-tests')
def instrument(file, marker, addition):
    source = root / file
    text = source.read_text()
    assert text.count(marker) == 1
    source.write_text(text.replace(marker, marker + addition))
instrument('run-wpts.js', 'const toRunFilename = "to-run.yaml";', '\nlet index = 0;')
instrument('run-wpts.js', 'for (const testFilePath of testFilePaths) {', '\n        if (index++ % 4 !== Number(process.env.WPT_SHARD)) continue;')
instrument('run-single-wpt.js', 'window.add_completion_callback((tests, harnessStatus) => {', '''
          require("node:fs").appendFileSync(process.env.WPT_OBSERVATIONS, JSON.stringify({
            path: testPath, harness: harnessStatus.status, tests: tests.map(t => [t.name, t.status])
          }) + "\n");
'''.replace('"\n"', '"\\n"'))
