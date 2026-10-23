interface StoryTitleProps {
  readonly title: string;
  readonly url?: string;
}

// With a title and a link the title itself is the link (the long address is not shown); without a
// link it is plain text; with a link and no title the link is shown as it is. Everything is rendered
// as text, never as HTML.
export function StoryTitle({ title, url }: StoryTitleProps) {
  if (!url) return <span className="type-name wrap-anywhere">{title}</span>;
  const text = title === '' ? url : title;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="type-name text-blue-800 dark:text-blue-300 underline wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:focus-visible:outline-slate-100"
    >
      {text} <span aria-hidden="true">↗</span> <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
