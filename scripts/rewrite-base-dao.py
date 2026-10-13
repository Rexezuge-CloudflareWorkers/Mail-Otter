#!/usr/bin/env python3
"""
Rewrite `this.database.prepare(sql).bind(args).<verb>()` chains into the kit's
sql-first BaseDAO: `this.<verb><T>(sql, [args])`.

Written as a scanner rather than a regex because the SQL argument is a template
literal that routinely contains `${...}`, parentheses and braces; a regex that
tried to balance those would be guessing. The scanner walks forward from a known
chain start and matches delimiters, so a query containing `)` cannot end the
match early.

Every rewrite is checked afterwards by `tsc` — this script's job is to produce
reviewable diffs, not to be trusted blind.
"""
from __future__ import annotations

import pathlib
import re
import sys

VERBS = ("all", "first", "run", "batch")


def scan_call(text: str, open_idx: int) -> int:
    """Index just past the `)` closing the call whose `(` sits at `open_idx`.

    Handles nesting, single/double/backtick strings and comments so a `)` inside
    a literal does not close the call.
    """
    assert text[open_idx] == "("
    depth = 0
    i = open_idx
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in "'\"`":
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
    """Index just past the string literal starting at `i`."""
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
    """Index of the `}` matching the `{` at `open_idx`."""
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


def split_args(arglist: str) -> list[str]:
    """Top-level split of a `.bind(...)` argument list."""
    parts: list[str] = []
    depth = 0
    current: list[str] = []
    i = 0
    n = len(arglist)
    while i < n:
        ch = arglist[i]
        if ch in "'\"`":
            end = skip_string(arglist, i)
            current.append(arglist[i:end])
            i = end
            continue
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(current).strip())
            current = []
            i += 1
            continue
        current.append(ch)
        i += 1
    tail = "".join(current).strip()
    if tail:
        parts.append(tail)
    return parts


def rewrite(text: str) -> tuple[str, int]:
    count = 0
    pos = 0
    while True:
        start = text.find("this.database", pos)
        if start == -1:
            break

        # `.database` may be followed by whitespace/newline before `.prepare`.
        cursor = start + len("this.database")
        rest = text[cursor:]
        lead = re.match(r"\s*", rest).group(0)
        cursor += len(lead)
        if not text.startswith(".prepare", cursor):
            pos = start + len("this.database")
            continue

        cursor += len(".prepare")
        sql_open = cursor
        sql_end = scan_call(text, sql_open)
        sql = text[sql_open + 1 : sql_end - 1].strip()

        cursor = sql_end
        lead = re.match(r"\s*", text[cursor:]).group(0)
        cursor += len(lead)
        if not text.startswith(".bind", cursor):
            pos = sql_end
            continue
        cursor += len(".bind")
        bind_open = cursor
        bind_end = scan_call(text, bind_open)
        bindings = split_args(text[bind_open + 1 : bind_end - 1])

        cursor = bind_end
        lead = re.match(r"\s*", text[cursor:]).group(0)
        cursor += len(lead)

        verb = None
        verb_end = cursor
        for candidate in VERBS:
            if text.startswith(f".{candidate}", cursor):
                verb = candidate
                verb_end = cursor + len(candidate) + 1
                break
        if verb is None:
            pos = bind_end
            continue
        after = verb_end
        type_arg = ""
        if text.startswith("<", after):
            close = text.index(">", after)
            type_arg = text[after : close + 1]
            after = close + 1
        if not text.startswith("()", after):
            pos = bind_end
            continue

        sql_text = sql.rstrip(",")
        # A multi-line chain reads as one very long line once flattened, which
        # makes the diff unreviewable. Collapse the SQL's own indentation and
        # keep whatever leading whitespace the original `this.database` had.
        sql_text = " ".join(line.strip() for line in sql_text.splitlines() if line.strip())
        args = ", ".join(bindings)
        binding_array = f"[{args}]" if args else "[]"
        replacement = f"this.{verb}{type_arg}({sql_text}, {binding_array})"

        # `.then((r) => r.results || [])` after an `all()` is the envelope being
        # unwrapped by hand. The kit's `all` already returns the rows, so keeping
        # it would break the call. Strip it.
        tail_start = after + 2
        stripped = strip_results_then(text, tail_start)
        count += 1
        text = text[:start] + replacement + stripped
        pos = start + len(replacement)

    return text, count


def strip_results_then(text: str, pos: int) -> str:
    """Remove a trailing `.then(...)` that unwraps `result.results`.

    Returns everything from `pos` onwards, minus that `.then(...)` when it is
    present. The no-match case must hand back the untouched remainder: returning
    `""` there silently deleted the rest of the statement.
    """
    lead = re.match(r"\s*", text[pos:]).group(0)
    cursor = pos + len(lead)
    if not text.startswith(".then", cursor):
        return text[pos:]
    cursor += len(".then")
    end = scan_call(text, cursor)
    body = text[cursor + 1 : end - 1]
    if "results" not in body:
        return text[pos:]
    return text[end:]


def main() -> None:
    roots = [pathlib.Path(a) for a in sys.argv[1:]]
    total = 0
    for root in roots:
        files = sorted(root.rglob("*.ts")) if root.is_dir() else [root]
        for path in files:
            if path.name.endswith(".test.ts"):
                continue
            original = path.read_text()
            if "this.database" not in original:
                continue
            updated, n = rewrite(original)
            if n:
                path.write_text(updated)
                print(f"{path}: {n}")
                total += n
    print(f"total {total}")


if __name__ == "__main__":
    main()