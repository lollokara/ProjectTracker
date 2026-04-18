import { Fragment, ReactNode } from 'react';

/**
 * Splits `text` on case-insensitive occurrences of `query`
 * and returns a React fragment with matches wrapped in <mark>.
 * If `query` is empty or no match, returns the text unchanged.
 * Safe against ReDoS — uses literal string matching, not regex.
 */
export function highlightMatch(text: string, query: string): ReactNode {
  if (!query || !text) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const queryLen = lowerQuery.length;

  if (queryLen === 0) return text;

  const segments: ReactNode[] = [];
  let pos = 0;
  let wrapCount = 0;
  const MAX_WRAPS = 10;

  while (pos < text.length && wrapCount < MAX_WRAPS) {
    const idx = lowerText.indexOf(lowerQuery, pos);
    if (idx === -1) break;

    if (idx > pos) {
      segments.push(
        <Fragment key={`pre-${pos}`}>{text.slice(pos, idx)}</Fragment>,
      );
    }

    segments.push(
      <mark
        key={`match-${idx}`}
        style={{
          background: 'rgba(255, 200, 0, 0.35)',
          color: 'inherit',
          fontStyle: 'inherit',
          fontWeight: 'inherit',
          borderRadius: '2px',
          padding: '0 1px',
        }}
      >
        {text.slice(idx, idx + queryLen)}
      </mark>,
    );

    pos = idx + queryLen;
    wrapCount++;
  }

  if (pos < text.length) {
    segments.push(<Fragment key={`tail-${pos}`}>{text.slice(pos)}</Fragment>);
  }

  if (segments.length === 0) return text;

  return <>{segments}</>;
}
