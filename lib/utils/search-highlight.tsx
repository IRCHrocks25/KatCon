import React from "react";

/**
 * Highlight search matches in text while preserving existing formatting
 * Works with formatMentions output (array of strings and React elements)
 */
export function highlightSearchMatches(
  content: string | (string | React.ReactElement)[],
  searchQuery: string,
  highlightClassName: string = "bg-yellow-500/30 text-yellow-200 rounded px-0.5"
): (string | React.ReactElement)[] {
  if (!searchQuery.trim()) {
    // If content is already formatted (array), return as-is, otherwise return as string array
    return Array.isArray(content) ? content : [content];
  }

  const query = searchQuery.trim();
  const queryLower = query.toLowerCase();
  
  // If content is already an array (from formatMentions), we need to search within string parts
  if (Array.isArray(content)) {
    const result: (string | React.ReactElement)[] = [];
    let keyCounter = 0;

    content.forEach((part) => {
      if (typeof part === "string") {
        // Search within string part
        const highlighted = highlightText(part, query, queryLower, highlightClassName, keyCounter);
        result.push(...highlighted.parts);
        keyCounter = highlighted.nextKey;
      } else {
        // Preserve React elements (mentions, etc.)
        result.push(part);
      }
    });

    return result.length > 0 ? result : content;
  }

  // Content is a plain string
  const highlighted = highlightText(content, query, queryLower, highlightClassName, 0);
  return highlighted.parts;
}

/**
 * Highlight search matches in plain text
 */
function highlightText(
  text: string,
  query: string,
  queryLower: string,
  highlightClassName: string,
  startKey: number
): { parts: (string | React.ReactElement)[]; nextKey: number } {
  const parts: (string | React.ReactElement)[] = [];
  let keyCounter = startKey;
  let lastIndex = 0;
  const textLower = text.toLowerCase();
  let searchIndex = textLower.indexOf(queryLower, lastIndex);

  while (searchIndex !== -1) {
    // Add text before match
    if (searchIndex > lastIndex) {
      const textBefore = text.substring(lastIndex, searchIndex);
      if (textBefore) {
        parts.push(textBefore);
      }
    }

    // Add highlighted match
    const matchText = text.substring(searchIndex, searchIndex + query.length);
    parts.push(
      React.createElement(
        "mark",
        {
          key: `search-match-${keyCounter++}`,
          className: highlightClassName,
        },
        matchText
      )
    );

    lastIndex = searchIndex + query.length;
    searchIndex = textLower.indexOf(queryLower, lastIndex);
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      parts.push(remainingText);
    }
  }

  return {
    parts: parts.length > 0 ? parts : [text],
    nextKey: keyCounter,
  };
}





