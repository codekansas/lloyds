const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const normalizeLinkHref = (value: string): string | null => {
  const trimmedValue = value.trim();

  if (/^(https?:\/\/|mailto:)/i.test(trimmedValue)) {
    return trimmedValue;
  }

  return null;
};

const renderInlineMarkdownToHtml = (value: string): string => {
  const escaped = escapeHtml(value);

  return escaped
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const nextHref = normalizeLinkHref(href.replaceAll("&amp;", "&"));
      return nextHref
        ? `<a href="${escapeHtml(nextHref)}" rel="noreferrer noopener" target="_blank">${label}</a>`
        : label;
    })
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/&lt;u&gt;([\s\S]+?)&lt;\/u&gt;/g, "<u>$1</u>");
};

const isQuoteLine = (value: string): boolean => {
  return /^>\s?/.test(value);
};

const isUnorderedListLine = (value: string): boolean => {
  return /^-\s+/.test(value);
};

const isOrderedListLine = (value: string): boolean => {
  return /^\d+\.\s+/.test(value);
};

const isBlockBoundaryLine = (value: string): boolean => {
  return value.trim().length === 0 || isQuoteLine(value) || isUnorderedListLine(value) || isOrderedListLine(value);
};

export const markdownToRichHtml = (value: string): string => {
  const normalizedLines = value.replaceAll("\r\n", "\n").split("\n");
  const htmlParts: string[] = [];
  let idx = 0;

  while (idx < normalizedLines.length) {
    const currentLine = normalizedLines[idx] ?? "";

    if (currentLine.trim().length === 0) {
      idx += 1;
      continue;
    }

    if (isQuoteLine(currentLine)) {
      const quoteLines: string[] = [];

      while (idx < normalizedLines.length && isQuoteLine(normalizedLines[idx] ?? "")) {
        quoteLines.push((normalizedLines[idx] ?? "").replace(/^>\s?/, ""));
        idx += 1;
      }

      htmlParts.push(
        `<blockquote>${quoteLines
          .map((line) => `<p>${line.length > 0 ? renderInlineMarkdownToHtml(line) : "<br>"}</p>`)
          .join("")}</blockquote>`,
      );
      continue;
    }

    if (isUnorderedListLine(currentLine) || isOrderedListLine(currentLine)) {
      const listKind = isOrderedListLine(currentLine) ? "ol" : "ul";
      const listItems: string[] = [];

      while (idx < normalizedLines.length) {
        const listLine = normalizedLines[idx] ?? "";
        const matchesCurrentKind = listKind === "ol" ? isOrderedListLine(listLine) : isUnorderedListLine(listLine);

        if (!matchesCurrentKind) {
          break;
        }

        const itemText =
          listKind === "ol" ? listLine.replace(/^\d+\.\s+/, "") : listLine.replace(/^-\s+/, "");
        listItems.push(`<li>${renderInlineMarkdownToHtml(itemText)}</li>`);
        idx += 1;
      }

      htmlParts.push(`<${listKind}>${listItems.join("")}</${listKind}>`);
      continue;
    }

    const paragraphLines: string[] = [];

    while (idx < normalizedLines.length && !isBlockBoundaryLine(normalizedLines[idx] ?? "")) {
      paragraphLines.push(normalizedLines[idx] ?? "");
      idx += 1;
    }

    htmlParts.push(`<p>${paragraphLines.map((line) => renderInlineMarkdownToHtml(line)).join("<br>")}</p>`);
  }

  return htmlParts.join("");
};

const serializeNodeListToMarkdown = (nodes: NodeListOf<ChildNode> | ChildNode[]): string => {
  return Array.from(nodes)
    .map((node) => serializeNodeToMarkdown(node))
    .join("");
};

// Rich-text input can contain browser-inserted wrappers (<div>, <p>, <br>) and
// formatting tags. We normalize those to markdown so the server stores one format.
const serializeNodeToMarkdown = (node: ChildNode): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replaceAll("\u00a0", " ");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  const childMarkdown = serializeNodeListToMarkdown(element.childNodes);

  if (tagName === "br") {
    return "\n";
  }

  if (tagName === "strong" || tagName === "b") {
    return `**${childMarkdown}**`;
  }

  if (tagName === "em" || tagName === "i") {
    return `*${childMarkdown}*`;
  }

  if (tagName === "u") {
    return `<u>${childMarkdown}</u>`;
  }

  if (tagName === "code") {
    if (element.parentElement?.tagName.toLowerCase() === "pre") {
      return childMarkdown;
    }

    return `\`${childMarkdown}\``;
  }

  if (tagName === "pre") {
    const codeContent = (element.textContent ?? "").replaceAll("\u00a0", " ").trimEnd();
    return codeContent.length > 0 ? `\`\`\`\n${codeContent}\n\`\`\`\n\n` : "";
  }

  if (tagName === "a") {
    const href = normalizeLinkHref(element.getAttribute("href") ?? "");
    const linkLabel = childMarkdown.trim();
    return href ? `[${linkLabel || href}](${href})` : linkLabel;
  }

  if (tagName === "ul") {
    const listItems = Array.from(element.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((item) => `- ${serializeNodeListToMarkdown(item.childNodes).trim()}`);
    return listItems.length > 0 ? `${listItems.join("\n")}\n\n` : "";
  }

  if (tagName === "ol") {
    const listItems = Array.from(element.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((item, itemIdx) => `${itemIdx + 1}. ${serializeNodeListToMarkdown(item.childNodes).trim()}`);
    return listItems.length > 0 ? `${listItems.join("\n")}\n\n` : "";
  }

  if (tagName === "blockquote") {
    const quoteLines = childMarkdown
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `> ${line}`);
    return quoteLines.length > 0 ? `${quoteLines.join("\n")}\n\n` : "";
  }

  if (tagName === "p" || tagName === "div") {
    const paragraph = childMarkdown.trim();
    return paragraph.length > 0 ? `${paragraph}\n\n` : "";
  }

  return childMarkdown;
};

export const richHtmlToMarkdown = (value: string): string => {
  if (typeof window === "undefined") {
    return value.trim();
  }

  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(value, "text/html");
  const markdown = serializeNodeListToMarkdown(parsedDocument.body.childNodes);

  return markdown.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
};

export const getCaretTextOffset = (element: HTMLElement): number | null => {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!element.contains(range.endContainer)) {
    return null;
  }

  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
};

const getTextNodeAtOffset = (
  root: HTMLElement,
  targetOffset: number,
): {
  node: Text;
  offset: number;
} | null => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let traversed = 0;
  let current = walker.nextNode();

  while (current) {
    const textNode = current as Text;
    const textLength = textNode.textContent?.length ?? 0;

    if (traversed + textLength >= targetOffset) {
      return {
        node: textNode,
        offset: Math.max(0, targetOffset - traversed),
      };
    }

    traversed += textLength;
    current = walker.nextNode();
  }

  return null;
};

export const replaceRichTextRange = ({
  editor,
  start,
  end,
  replacement,
}: {
  editor: HTMLElement;
  start: number;
  end: number;
  replacement: string;
}): void => {
  if (editor.textContent === null) {
    editor.textContent = "";
  }

  const startPosition = getTextNodeAtOffset(editor, start);
  const endPosition = getTextNodeAtOffset(editor, end);

  // Browsers can create transient DOM trees while composing rich text.
  // When offsets cannot be resolved safely, fall back to the current selection.
  if (!startPosition || !endPosition) {
    editor.focus();
    document.execCommand("insertText", false, replacement);
    return;
  }

  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  range.deleteContents();

  const textNode = document.createTextNode(replacement);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);

  selection?.removeAllRanges();
  selection?.addRange(range);
};
