"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { CommentFormatValue } from "@/lib/comment-format";

type CommentReferenceOption = {
  id: string;
  number: number;
  authorLabel: string;
  preview: string;
};

type UserReferenceOption = {
  id: string;
  handle: string;
  label: string;
};

type TriggerMatch = {
  type: "comment" | "user";
  query: string;
  start: number;
  end: number;
};

type SuggestionOption =
  | ({
      type: "comment";
    } & CommentReferenceOption)
  | ({
      type: "user";
    } & UserReferenceOption);

type CommentComposerProps = {
  postId: string;
  commentOptions: CommentReferenceOption[];
  userOptions: UserReferenceOption[];
};

const minCommentCharacters = 2;

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
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

const markdownToRichHtml = (value: string): string => {
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

const richHtmlToMarkdown = (value: string): string => {
  if (typeof window === "undefined") {
    return value.trim();
  }

  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(value, "text/html");
  const markdown = serializeNodeListToMarkdown(parsedDocument.body.childNodes);

  return markdown.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
};

const detectTriggerMatch = (value: string, cursor: number): TriggerMatch | null => {
  const beforeCursor = value.slice(0, cursor);
  const commentMatch = beforeCursor.match(/(^|\s)>>([0-9]{0,4})$/);

  if (commentMatch) {
    return {
      type: "comment",
      query: commentMatch[2],
      start: cursor - (commentMatch[2].length + 2),
      end: cursor,
    };
  }

  const userMatch = beforeCursor.match(/(^|\s)@([a-z0-9_-]{0,32})$/i);

  if (userMatch) {
    return {
      type: "user",
      query: userMatch[2],
      start: cursor - (userMatch[2].length + 1),
      end: cursor,
    };
  }

  return null;
};

const replaceRange = ({
  value,
  start,
  end,
  replacement,
}: {
  value: string;
  start: number;
  end: number;
  replacement: string;
}): string => {
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
};

const getCaretTextOffset = (element: HTMLElement): number | null => {
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

const replaceRichTextRange = ({
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

export const CommentComposer = ({ postId, commentOptions, userOptions }: CommentComposerProps) => {
  const [mode, setMode] = useState<CommentFormatValue>("MARKDOWN");
  const [content, setContent] = useState("");
  const [richTextDraft, setRichTextDraft] = useState("");
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);
  const [activeTrigger, setActiveTrigger] = useState<TriggerMatch | null>(null);
  const [highlightedSuggestionIdx, setHighlightedSuggestionIdx] = useState(0);
  const markdownInputRef = useRef<HTMLTextAreaElement>(null);
  const richEditorRef = useRef<HTMLDivElement>(null);

  const commentOptionsById = useMemo(() => new Map(commentOptions.map((option) => [option.id, option])), [commentOptions]);
  const selectedParents = selectedParentIds
    .map((parentId) => commentOptionsById.get(parentId))
    .filter((option): option is CommentReferenceOption => Boolean(option));
  const plainTextLength = content.trim().length;
  const canSubmit = plainTextLength >= minCommentCharacters;

  const suggestionOptions = useMemo<SuggestionOption[]>(() => {
    if (!activeTrigger) {
      return [];
    }

    if (activeTrigger.type === "comment") {
      const queryLower = activeTrigger.query.toLowerCase();
      return commentOptions
        .filter((option) => {
          if (!queryLower) {
            return true;
          }

          return (
            option.number.toString().startsWith(queryLower) ||
            option.authorLabel.toLowerCase().includes(queryLower) ||
            option.preview.toLowerCase().includes(queryLower)
          );
        })
        .slice(0, 7)
        .map((option) => ({
          ...option,
          type: "comment" as const,
        }));
    }

    const queryLower = activeTrigger.query.toLowerCase();
    return userOptions
      .filter((option) => {
        if (!queryLower) {
          return true;
        }

        return option.handle.toLowerCase().includes(queryLower) || option.label.toLowerCase().includes(queryLower);
      })
      .slice(0, 7)
      .map((option) => ({
        ...option,
        type: "user" as const,
      }));
  }, [activeTrigger, commentOptions, userOptions]);

  useEffect(() => {
    const editor = richEditorRef.current;

    if (mode !== "RICH_TEXT" || !editor) {
      return;
    }

    if (editor.innerHTML !== richTextDraft) {
      editor.innerHTML = richTextDraft;
    }
  }, [mode, richTextDraft]);

  const updateTriggerState = (nextTrigger: TriggerMatch | null): void => {
    setActiveTrigger((previousTrigger) => {
      const hasChanged =
        previousTrigger?.type !== nextTrigger?.type ||
        previousTrigger?.query !== nextTrigger?.query ||
        previousTrigger?.start !== nextTrigger?.start ||
        previousTrigger?.end !== nextTrigger?.end;

      if (hasChanged) {
        setHighlightedSuggestionIdx(0);
      }

      return nextTrigger;
    });
  };

  const updateMarkdownTrigger = (target: HTMLTextAreaElement): void => {
    const cursor = target.selectionStart ?? target.value.length;
    const nextTrigger = detectTriggerMatch(target.value, cursor);
    updateTriggerState(nextTrigger);
  };

  const updateRichTrigger = (): void => {
    const editor = richEditorRef.current;

    if (!editor) {
      updateTriggerState(null);
      return;
    }

    const cursor = getCaretTextOffset(editor);

    if (cursor === null) {
      updateTriggerState(null);
      return;
    }

    const value = editor.textContent ?? "";
    const nextTrigger = detectTriggerMatch(value, cursor);
    updateTriggerState(nextTrigger);
  };

  const syncRichEditorState = (): void => {
    if (!richEditorRef.current) {
      return;
    }

    const nextHtml = richEditorRef.current.innerHTML;
    setRichTextDraft(nextHtml);
    setContent(richHtmlToMarkdown(nextHtml));
  };

  const upsertParentId = (parentId: string): void => {
    setSelectedParentIds((previousParentIds) => {
      if (previousParentIds.includes(parentId)) {
        return previousParentIds;
      }

      return [...previousParentIds, parentId];
    });
  };

  const applySuggestion = (suggestion: SuggestionOption): void => {
    if (!activeTrigger) {
      return;
    }

    const replacementText = suggestion.type === "comment" ? `>>${suggestion.number}` : `@${suggestion.handle}`;
    const replacementWithPadding = `${replacementText} `;

    if (mode === "MARKDOWN" && markdownInputRef.current) {
      const nextValue = replaceRange({
        value: content,
        start: activeTrigger.start,
        end: activeTrigger.end,
        replacement: replacementWithPadding,
      });

      const nextCursor = activeTrigger.start + replacementWithPadding.length;
      setContent(nextValue);
      setActiveTrigger(null);

      requestAnimationFrame(() => {
        markdownInputRef.current?.focus();
        markdownInputRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    } else if (mode === "RICH_TEXT" && richEditorRef.current) {
      richEditorRef.current.focus();
      replaceRichTextRange({
        editor: richEditorRef.current,
        start: activeTrigger.start,
        end: activeTrigger.end,
        replacement: replacementWithPadding,
      });
      syncRichEditorState();
      setActiveTrigger(null);
    }

    if (suggestion.type === "comment") {
      upsertParentId(suggestion.id);
    }
  };

  const handleSuggestionNavigation = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (suggestionOptions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedSuggestionIdx((idx) => (idx + 1) % suggestionOptions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedSuggestionIdx((idx) => (idx - 1 + suggestionOptions.length) % suggestionOptions.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selectedSuggestion = suggestionOptions[highlightedSuggestionIdx] ?? suggestionOptions[0];

      if (selectedSuggestion) {
        applySuggestion(selectedSuggestion);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setActiveTrigger(null);
    }
  };

  const runRichCommand = (command: string, value?: string): void => {
    const editor = richEditorRef.current;

    if (!editor) {
      return;
    }

    editor.focus();
    document.execCommand(command, false, value);
    syncRichEditorState();
    updateRichTrigger();
  };

  const removeParentReference = (parentId: string): void => {
    setSelectedParentIds((previousParentIds) => previousParentIds.filter((id) => id !== parentId));
  };

  return (
    <div className="comment-composer">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="content" value={content} />
      <input type="hidden" name="format" value="MARKDOWN" />
      <input type="hidden" name="parentIds" value={JSON.stringify(selectedParentIds)} />

      <div className="comment-compose-header">
        <strong>Add Comment</strong>
        <div className="comment-format-toggle" role="tablist" aria-label="Comment format">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "MARKDOWN"}
            className={mode === "MARKDOWN" ? "comment-format-toggle-active" : undefined}
            onClick={() => {
              if (mode === "RICH_TEXT" && richEditorRef.current) {
                const nextHtml = richEditorRef.current.innerHTML;
                setRichTextDraft(nextHtml);
                setContent(richHtmlToMarkdown(nextHtml));
              }

              setMode("MARKDOWN");
              setActiveTrigger(null);
            }}
          >
            Markdown
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "RICH_TEXT"}
            className={mode === "RICH_TEXT" ? "comment-format-toggle-active" : undefined}
            onClick={() => {
              setRichTextDraft(markdownToRichHtml(content));
              setMode("RICH_TEXT");
              setActiveTrigger(null);
            }}
          >
            Rich Text
          </button>
        </div>
      </div>

      {selectedParents.length > 0 ? (
        <div className="comment-parent-pill-row">
          <span>Replying to:</span>
          {selectedParents.map((parent) => (
            <button
              key={parent.id}
              type="button"
              className="comment-parent-pill"
              onClick={() => removeParentReference(parent.id)}
              title={`Remove parent #${parent.number}`}
            >
              &gt;&gt;{parent.number} ×
            </button>
          ))}
        </div>
      ) : (
        <p className="comment-compose-tip">Tip: type <code>&gt;&gt;</code> or <code>@</code> to reference comments/users.</p>
      )}

      {mode === "MARKDOWN" ? (
        <label htmlFor={`comment-${postId}`} className="comment-input-label">
          Markdown
          <textarea
            ref={markdownInputRef}
            id={`comment-${postId}`}
            name="comment-markdown-draft"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              updateMarkdownTrigger(event.target);
            }}
            onKeyDown={handleSuggestionNavigation}
            onKeyUp={(event) => updateMarkdownTrigger(event.currentTarget)}
            onClick={(event) => updateMarkdownTrigger(event.currentTarget)}
            placeholder="Add a thoughtful comment. Use >>12 to reference another comment, or @name to mention a member."
            autoComplete="off"
          />
        </label>
      ) : (
        <div className="comment-rich-editor-shell">
          <div className="comment-rich-toolbar">
            <button type="button" onClick={() => runRichCommand("bold")}>
              Bold
            </button>
            <button type="button" onClick={() => runRichCommand("italic")}>
              Italic
            </button>
            <button type="button" onClick={() => runRichCommand("underline")}>
              Underline
            </button>
            <button type="button" onClick={() => runRichCommand("insertUnorderedList")}>
              Bullets
            </button>
            <button type="button" onClick={() => runRichCommand("formatBlock", "blockquote")}>
              Quote
            </button>
            <button
              type="button"
              onClick={() => {
                const nextUrl = window.prompt("Link URL");

                if (!nextUrl) {
                  return;
                }

                runRichCommand("createLink", nextUrl);
              }}
            >
              Link
            </button>
          </div>

          <div
            ref={richEditorRef}
            className="comment-rich-editor"
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              syncRichEditorState();
              updateRichTrigger();
            }}
            onKeyDown={handleSuggestionNavigation}
            onKeyUp={() => updateRichTrigger()}
            onClick={() => updateRichTrigger()}
            data-placeholder="Write with formatting. Type >>12 to reference another comment or @name to mention a member."
          />
        </div>
      )}

      {suggestionOptions.length > 0 && activeTrigger ? (
        <ul className="comment-suggestion-list" role="listbox">
          {suggestionOptions.map((suggestion, idx) => {
            const isHighlighted = idx === highlightedSuggestionIdx;

            return (
              <li key={suggestion.type === "comment" ? suggestion.id : `${suggestion.id}-${suggestion.handle}`}>
                <button
                  type="button"
                  className={isHighlighted ? "comment-suggestion-active" : undefined}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySuggestion(suggestion);
                  }}
                >
                  {suggestion.type === "comment" ? (
                    <>
                      <strong>&gt;&gt;{suggestion.number}</strong>
                      <span>{suggestion.authorLabel}</span>
                      <p>{suggestion.preview}</p>
                    </>
                  ) : (
                    <>
                      <strong>@{suggestion.handle}</strong>
                      <span>{suggestion.label}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <button type="submit" className="lloyds-button" disabled={!canSubmit}>
        Post Comment
      </button>
    </div>
  );
};
