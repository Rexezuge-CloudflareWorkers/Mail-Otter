import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../lib/utils';

function isSafeHref(href?: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (trimmed === '') return false;
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('?')) return true;
  try {
    const parsed = new URL(trimmed, 'https://mail-otter.local');
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// GFM renderer for AI-generated content. Raw HTML is stripped (skipHtml,
// no rehype-raw) and links are restricted to safe protocols + opened in a
// new tab. Rendered as React elements — never via dangerouslySetInnerHTML.
const components: Components = {
  a({ node: _node, href, children, className, ...rest }) {
    if (!isSafeHref(href)) {
      return <span className={className}>{children}</span>;
    }
    return (
      <a
        {...rest}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('break-all underline underline-offset-2 hover:opacity-80', className)}
      >
        {children}
      </a>
    );
  },
  p({ node: _node, className, ...rest }) {
    return <p {...rest} className={cn('my-1 leading-relaxed first:mt-0 last:mb-0', className)} />;
  },
  ul({ node: _node, className, ...rest }) {
    return <ul {...rest} className={cn('my-1 ml-4 list-disc space-y-1', className)} />;
  },
  ol({ node: _node, className, ...rest }) {
    return <ol {...rest} className={cn('my-1 ml-4 list-decimal space-y-1', className)} />;
  },
  li({ node: _node, className, ...rest }) {
    return <li {...rest} className={cn('leading-relaxed [&>ol]:my-1 [&>ul]:my-1', className)} />;
  },
  pre({ node: _node, className, ...rest }) {
    return (
      <pre
        {...rest}
        className={cn(
          'my-2 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 font-mono text-xs leading-relaxed',
          '[&_code]:bg-transparent [&_code]:p-0',
          className,
        )}
      />
    );
  },
  code({ node: _node, className, ...rest }) {
    return (
      <code {...rest} className={cn('break-words rounded bg-[var(--color-surface-2)] px-1 py-0.5 font-mono text-[0.8em]', className)} />
    );
  },
  blockquote({ node: _node, className, ...rest }) {
    return <blockquote {...rest} className={cn('my-1 border-l-2 border-[var(--color-border)] pl-3 italic', className)} />;
  },
  h1({ node: _node, className, ...rest }) {
    return <h1 {...rest} className={cn('mt-2 mb-1 text-base font-semibold', className)} />;
  },
  h2({ node: _node, className, ...rest }) {
    return <h2 {...rest} className={cn('mt-2 mb-1 text-[15px] font-semibold', className)} />;
  },
  h3({ node: _node, className, ...rest }) {
    return <h3 {...rest} className={cn('mt-2 mb-1 text-sm font-semibold', className)} />;
  },
  h4({ node: _node, className, ...rest }) {
    return <h4 {...rest} className={cn('mt-2 mb-1 text-sm font-semibold', className)} />;
  },
  table({ node: _node, children }) {
    return (
      <div className="my-2 min-w-0 overflow-x-auto">
        <table className="w-full border-collapse text-xs">{children}</table>
      </div>
    );
  },
  th({ node: _node, className, ...rest }) {
    return (
      <th
        {...rest}
        className={cn('border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-left font-semibold', className)}
      />
    );
  },
  td({ node: _node, className, ...rest }) {
    return <td {...rest} className={cn('border border-[var(--color-border)] px-2 py-1 align-top', className)} />;
  },
  hr({ node: _node, className, ...rest }) {
    return <hr {...rest} className={cn('my-2 border-[var(--color-border)]', className)} />;
  },
  input({ node: _node, ...rest }) {
    return <input {...rest} disabled className="mr-1 align-middle" />;
  },
  strong({ node: _node, className, ...rest }) {
    return <strong {...rest} className={cn('font-semibold', className)} />;
  },
};

export function Markdown({ content }: { content: string }) {
  return (
    <div className="min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={defaultUrlTransform} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
