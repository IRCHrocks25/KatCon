import React from "react";

export interface User {
  id: string;
  email: string;
  fullname?: string | null;
}

/**
 * Parse @mentions from message content
 * Returns array of usernames (without @ symbol)
 */
export function parseMentions(content: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  return [...new Set(mentions)]; // Remove duplicates
}

/**
 * Get user objects for mentioned users
 * Matches by email prefix (before @) or fullname
 */
export function getMentionedUsers(content: string, allUsers: User[]): User[] {
  const mentions = parseMentions(content);
  const mentionedUsers: User[] = [];

  mentions.forEach((mention) => {
    // Try to match by email prefix
    const userByEmail = allUsers.find((user) => {
      const emailPrefix = user.email.split("@")[0].toLowerCase();
      return emailPrefix === mention.toLowerCase();
    });

    if (userByEmail) {
      mentionedUsers.push(userByEmail);
      return;
    }

    // Try to match by fullname (first name or last name)
    const userByName = allUsers.find((user) => {
      if (!user.fullname) return false;
      const nameParts = user.fullname.toLowerCase().split(" ");
      return nameParts.some(
        (part) =>
          part === mention.toLowerCase() ||
          part.startsWith(mention.toLowerCase())
      );
    });

    if (userByName) {
      mentionedUsers.push(userByName);
    }
  });

  return [...new Set(mentionedUsers.map((u) => u.id))].map(
    (id) => allUsers.find((u) => u.id === id)!
  );
}

/**
 * Format message content with highlighted mentions
 * Returns array of React nodes that can be rendered directly
 */
export function formatMentions(
  content: string,
  users: User[]
): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = [];
  const mentionRegex = /@(\w+)/g;
  let lastIndex = 0;
  let match;
  let keyCounter = 0;

  while ((match = mentionRegex.exec(content)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index);
      if (textBefore) {
        parts.push(textBefore);
      }
    }

    // Find mentioned user
    const mentionText = match[1];

    // Special handling for @everyone
    if (mentionText.toLowerCase() === "everyone") {
      parts.push(
        React.createElement(
          "span",
          {
            key: `mention-${keyCounter++}`,
            className:
              "font-bold text-orange-400 hover:text-orange-300 bg-orange-900/20 px-1 py-0.5 rounded",
          },
          "@everyone"
        )
      );
    } else {
      const mentionedUser = users.find((user) => {
        const emailPrefix = user.email.split("@")[0].toLowerCase();
        if (emailPrefix === mentionText.toLowerCase()) return true;

        if (user.fullname) {
          const nameParts = user.fullname.toLowerCase().split(" ");
          return nameParts.some(
            (part) =>
              part === mentionText.toLowerCase() ||
              part.startsWith(mentionText.toLowerCase())
          );
        }
        return false;
      });

      // Add mention with styling
      if (mentionedUser) {
        parts.push(
          React.createElement(
            "span",
            {
              key: `mention-${keyCounter++}`,
              className: "font-semibold text-purple-400 hover:text-purple-300",
            },
            `@${mentionedUser.fullname || mentionedUser.email.split("@")[0]}`
          )
        );
      } else {
        // Mention not found, show as plain text
        parts.push(`@${mentionText}`);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex);
    if (remainingText) {
      parts.push(remainingText);
    }
  }

  return parts.length > 0 ? parts : [content];
}
