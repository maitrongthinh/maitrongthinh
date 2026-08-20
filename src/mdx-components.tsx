import type { MDXComponents } from 'mdx/types';

/**
 * Styling for MDX note bodies.
 *
 * Next looks for this file automatically; every `page.mdx` under `src/app/notes/`
 * renders through it. Keeping the styles here rather than in a `.prose` class means
 * note authors write plain Markdown and never touch a className.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Every MDX file on the site is a note, so the reading shell can live here
    // instead of in a route layout — which keeps the notes index full-bleed.
    wrapper: ({ children }) => (
      <main className="mx-auto w-full max-w-[820px] px-5 pb-24 pt-32 sm:px-8 sm:pt-40">
        {children}
      </main>
    ),
    h1: (props) => (
      <h1
        className="font-display mb-6 mt-14 text-[10vw] leading-[0.9] sm:text-[4vw]"
        {...props}
      />
    ),
    h2: (props) => (
      <h2 className="font-display mb-4 mt-14 border-t border-rule pt-6 text-2xl sm:text-3xl" {...props} />
    ),
    h3: (props) => <h3 className="label mb-3 mt-10 text-ink" {...props} />,
    p: (props) => (
      <p className="mb-6 max-w-[68ch] text-base leading-relaxed text-ink-dim sm:text-lg" {...props} />
    ),
    a: (props) => (
      <a
        className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
        target={props.href?.startsWith('http') ? '_blank' : undefined}
        rel="noreferrer"
        {...props}
      />
    ),
    ul: (props) => (
      <ul className="mb-6 max-w-[68ch] list-none space-y-2 text-ink-dim" {...props} />
    ),
    ol: (props) => (
      <ol className="mb-6 max-w-[68ch] list-decimal space-y-2 pl-6 text-ink-dim" {...props} />
    ),
    li: (props) => (
      <li
        className="relative pl-6 leading-relaxed before:absolute before:left-0 before:top-[0.72em] before:h-px before:w-3 before:bg-rule"
        {...props}
      />
    ),
    blockquote: (props) => (
      <blockquote
        className="mb-6 max-w-[62ch] border-l-2 border-ink pl-5 text-lg italic text-ink"
        {...props}
      />
    ),
    code: (props) => (
      <code className="border border-rule bg-ground-2 px-1.5 py-0.5 font-mono text-[0.85em] text-ink" {...props} />
    ),
    pre: (props) => (
      <pre
        className="mb-8 overflow-x-auto border border-rule bg-ground-2 p-5 font-mono text-sm leading-relaxed text-ink [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0"
        {...props}
      />
    ),
    hr: () => <hr className="my-12 border-rule" />,
    strong: (props) => <strong className="font-semibold text-ink" {...props} />,
    ...components,
  };
}
