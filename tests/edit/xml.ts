// A small XML well-formedness check for tests (no dependencies): every tag closes in order,
// attributes are quoted, and ampersands are entities.

export function checkXml(text: string): { ok: boolean; error?: string; root?: string | null; tags: Record<string, number> } {
  const tags: Record<string, number> = {};
  let s = String(text).replace(/^﻿/, "");
  s = s.replace(/<\?xml[^?]*\?>/, "").replace(/<!DOCTYPE[^>]*>/i, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const stack: string[] = [];
  let root: string | null = null;
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const between = s.slice(last, m.index);
    if (between.includes("<")) return { ok: false, error: `stray "<" near: ${between.slice(between.indexOf("<"), between.indexOf("<") + 40)}`, tags };
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(between)) return { ok: false, error: "unescaped &", tags };
    last = re.lastIndex;
    const [, close, name, , self] = m;
    if (close) {
      const open = stack.pop();
      if (open !== name) return { ok: false, error: `</${name}> closes <${open}>`, tags };
    } else {
      tags[name] = (tags[name] ?? 0) + 1;
      if (!root) root = name;
      if (!self) stack.push(name);
    }
  }
  if (s.slice(last).includes("<")) return { ok: false, error: "unparsed tag at the end", tags };
  if (stack.length) return { ok: false, error: `unclosed <${stack.at(-1)}>`, tags };
  return { ok: !!root, root, tags };
}
