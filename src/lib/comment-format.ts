import { marked, type MarkedOptions } from "marked";
import sanitizeHtml from "sanitize-html";

export const commentFormats = ["MARKDOWN", "RICH_TEXT"] as const;
export type CommentFormatValue = (typeof commentFormats)[number];

const htmlSanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "a",
    "blockquote",
    "br",
    "code",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "span",
    "strong",
    "u",
    "ul",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (_tagName, attribs) => {
      const href = (attribs.href ?? "").trim();
      return transformAnchorTag(href);
    },
  },
};

const plainTextSanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

const markdownOptions: MarkedOptions = {
  gfm: true,
  breaks: true,
  async: false,
};

const commentReferencePattern = (): RegExp => /(^|[^\w])((?:>>|!))(\d{1,4})(?=$|[^\w])/g;

const transformAnchorTag = (href: string): sanitizeHtml.Tag => {
  if (href.startsWith("#comment-")) {
    return {
      tagName: "a",
      attribs: {
        href,
      },
    };
  }

  return {
    tagName: "a",
    attribs: {
      href,
      rel: "noreferrer noopener",
      target: "_blank",
    },
  };
};

const parseMarkdown = (value: string): string => {
  const parsed = marked.parse(value, markdownOptions);
  return typeof parsed === "string" ? parsed : "";
};

export const normalizeCommentFormat = (value: unknown): CommentFormatValue | null => {
  if (value === "MARKDOWN" || value === "RICH_TEXT") {
    return value;
  }

  return null;
};

export const sanitizeCommentHtml = (value: string): string => {
  return sanitizeHtml(value, htmlSanitizeOptions);
};

export const extractPlainTextFromHtml = (value: string): string => {
  return sanitizeHtml(value, plainTextSanitizeOptions).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
};

export const renderCommentBodyHtml = ({
  content,
  format,
  commentIdByNumber,
}: {
  content: string;
  format: CommentFormatValue;
  commentIdByNumber?: Map<number, string>;
}): string => {
  const markdownWithCommentLinks =
    format === "MARKDOWN" ? replaceCommentReferencesWithLinks(content, commentIdByNumber) : content;
  const rawHtml = format === "RICH_TEXT" ? content : parseMarkdown(markdownWithCommentLinks);
  return sanitizeCommentHtml(rawHtml);
};

export const getCommentPlainText = ({
  content,
  format,
}: {
  content: string;
  format: CommentFormatValue;
}): string => {
  if (format === "RICH_TEXT") {
    return extractPlainTextFromHtml(content);
  }

  return extractPlainTextFromHtml(parseMarkdown(content));
};

export const extractCommentReferenceNumbers = (value: string): number[] => {
  const references = new Set<number>();
  const matches = value.matchAll(commentReferencePattern());

  for (const match of matches) {
    const parsed = Number.parseInt(match[3], 10);

    if (Number.isInteger(parsed) && parsed > 0) {
      references.add(parsed);
    }
  }

  return [...references];
};

const replaceCommentReferencesWithLinks = (
  value: string,
  commentIdByNumber: Map<number, string> | undefined,
): string => {
  if (!commentIdByNumber || commentIdByNumber.size === 0) {
    return value;
  }

  return value.replaceAll(commentReferencePattern(), (_fullMatch, prefix: string, marker: string, rawNumber: string) => {
    const commentNumber = Number.parseInt(rawNumber, 10);
    const commentId = commentIdByNumber.get(commentNumber);

    if (!commentId) {
      return `${prefix}${marker}${rawNumber}`;
    }

    return `${prefix}[${marker}${commentNumber}](#comment-${commentId})`;
  });
};
