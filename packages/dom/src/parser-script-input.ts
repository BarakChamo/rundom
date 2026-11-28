// Keeps the tokenizer's original input behind document.write() calls from parser-inserted scripts.
type Input = { text: string; next?: Input };
export type ScriptSteps = (steps: () => Promise<void> | void) => Promise<void> | void;

export function parserScriptInput(
  tokenize: (chunk: string, end: boolean) => void,
  insideScript: () => boolean,
  prepare: (withInsertion: ScriptSteps, nested: boolean) => Promise<void> | void,
  active: () => boolean,
  error: (reason: unknown) => void,
) {
  const tail: Input = { text: "" };
  let input = tail;
  let point: Input | undefined;
  let blocked: object | undefined;
  let checkpoint = false;
  let writing = false;
  let eof = false;
  let finished = false;

  function pump(limit: Input): void {
    if (writing || blocked || finished || !active()) return;
    while (active() && !blocked) {
      if (input.text === "") {
        if (input === limit || !input.next) break;
        input = input.next;
        continue;
      }
      const start = insideScript() ? 0 : input.text.search(/<\/script/i);
      const close = start < 0 ? -1 : input.text.indexOf(">", start);
      const end = close < 0 ? input.text.length : close + 1;
      const chunk = input.text.slice(0, end);
      input.text = input.text.slice(end);
      writing = true;
      try {
        tokenize(chunk, false);
      } finally {
        writing = false;
      }
      if (!checkpoint || !active()) continue;
      checkpoint = false;
      const task = {};
      const withInsertion: ScriptSteps = (steps) => {
        if (blocked === task) blocked = undefined;
        const previous = point;
        point = input = { text: "", next: input };
        let result: Promise<void> | void = undefined;
        try {
          result = steps();
        } finally {
          if (!result) point = previous;
        }
        return result?.finally(() => {
          point = previous;
        });
      };
      const pending = prepare(withInsertion, point !== undefined);
      if (pending) {
        blocked ??= task;
        void pending
          .then(() => {
            if (blocked === task) blocked = undefined;
            if (!point) pump(tail);
          })
          .catch(error);
      }
    }
    if (active() && !blocked && !point && !finished && eof && input === tail && !input.text) {
      finished = true;
      tokenize("", true);
    }
  }
  return {
    checkpoint() {
      checkpoint = true;
    },
    get hasInsertionPoint() {
      return !!point;
    },
    insert(text: string) {
      if (point) {
        point.text += text;
        pump(point);
      }
    },
    write(text: string, end: boolean) {
      tail.text += text;
      eof ||= end;
      pump(tail);
    },
  };
}
