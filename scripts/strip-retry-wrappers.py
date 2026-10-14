#!/usr/bin/env python3
"""
Strip the retry wrapper that used to surround a D1 call.

The old `BaseDAO` was closure-first: every call site wrote
`this.withRetry(() => db.prepare(...).run(), 'context')`, and the wrapper owned
the retry schedule. The kit's `BaseDAO` is sql-first and `run`/`first`/`all`
retry themselves, so keeping the wrapper would retry twice — once here and once
inside `executeWithRetry` — and a transient fault would burn twice the backoff
budget before surfacing.

Rewrites `await X((...) => EXPR, 'context')` to `await EXPR`, where X is
`this.withRetry`, `this.executeD1WithRetry` or `executeD1WithRetry`.
"""
from __future__ import annotations

import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
# The delimiter scanners are duplicated rather than imported: the sibling module
# is a script, not a module, and importing it would run its main().
def scan_call(text: str, open_idx: int) -> int:
    depth = 0
    i = open_idx
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in "'\"":
            i = skip_string(text, i)
            continue
        if ch == "`":
            i = skip_string(text, i)
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            i = text.find("\n", i)
            if i == -1:
                return n
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            i = text.find("*/", i) + 2
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise ValueError("unbalanced call")


def skip_string(text: str, i: int) -> int:
    quote = text[i]
    i += 1
    n = len(text)
    while i < n:
        if text[i] == "\\":
            i += 2
            continue
        if text[i] == "$" and quote == "`" and i + 1 < n and text[i + 1] == "{":
            i = scan_braced(text, i + 1) + 1
            continue
        if text[i] == quote:
            return i + 1
        i += 1
    raise ValueError("unterminated string")


def scan_braced(text: str, open_idx: int) -> int:
    depth = 0
    i = open_idx
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in "'\"`":
            i = skip_string(text, i)
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("unbalanced brace")


WRAPPERS = ("this.withRetry", "executeD1WithRetry", "this.executeD1WithRetry")
ARROW = re.compile(r"^(?:\s*:\s*Promise<[^>]*>)?\s*=>\s*", re.S)


def rewrite(text: str) -> tuple[str, int]:
    count = 0
    pos = 0
    while True:
        best = None
        for wrapper in WRAPPERS:
            idx = text.find(wrapper + "(", pos)
            if idx != -1 and (best is None or idx < best[0]):
                best = (idx, wrapper)
        if best is None:
            break
        idx, wrapper = best
        open_idx = idx + len(wrapper)
        try:
            end = scan_call(text, open_idx)
        except ValueError:
            # Not a call we can see the end of (a template literal the scanner
            # cannot balance). Leave it alone rather than aborting the file.
            pos = open_idx
            continue
        inner = text[open_idx + 1 : end - 1]

        # `inner` is `(closure, 'context')`. Split at the top-level comma.
        depth = 0
        cut = -1
        i = 0
        while i < len(inner):
            ch = inner[i]
            if ch in "'\"`":
                i = skip_string(inner, i)
                continue
            if ch in "([{":
                depth += 1
            elif ch in ")]}":
                depth -= 1
            elif ch == "," and depth == 0:
                cut = i
                break
            i += 1
        if cut == -1:
            pos = end
            continue

        closure = inner[:cut].strip()
        if not closure.startswith("("):
            pos = end
            continue
        close = scan_call(closure, 0)
        body = closure[close:].strip()
        # `body` is `(): Promise<D1Result> => EXPR`. Only strip when it really is
        # an arrow function returning a single expression; a block-bodied closure
        # means the wrapper is doing something else and must stay.
        match = ARROW.match(body)
        if not match:
            pos = end
            continue

        expression = body[match.end():].strip()
        if expression.startswith("{"):
            pos = end
            continue

        text = text[:idx] + expression + text[end:]
        count += 1
        pos = idx + len(expression)

    return text, count


def main() -> None:
    total = 0
    for arg in sys.argv[1:]:
        root = pathlib.Path(arg)
        files = sorted(root.rglob("*.ts")) if root.is_dir() else [root]
        for path in files:
            original = path.read_text()
            updated, n = rewrite(original)
            if n:
                path.write_text(updated)
                print(f"{path}: {n}")
                total += n
    print(f"total {total}")


if __name__ == "__main__":
    main()