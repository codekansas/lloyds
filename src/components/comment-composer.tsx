"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { CommentFormatValue } from "@/lib/comment-format";
import {
  getCaretTextOffset,
  markdownToRichHtml,
  replaceRichTextRange,
  richHtmlToMarkdown,
} from "@/lib/comment-composer-format";
import type { CommentReferenceOption, UserReferenceOption } from "@/lib/comment-thread";

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

const detectTriggerMatch = (value: string, cursor: number): TriggerMatch | null => {
  const beforeCursor = value.slice(0, cursor);
  const bangMatch = beforeCursor.match(/(^|\s)!([0-9]{0,4})$/);
  if (bangMatch) {
    return {
      type: "comment",
      query: bangMatch[2],
      start: cursor - (bangMatch[2].length + 1),
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

    const replacementText =
      suggestion.type === "comment" ? `!${suggestion.number}` : `@${suggestion.handle}`;
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
    <div className="comment-composer form-stack">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="content" value={content} />
      <input type="hidden" name="format" value="MARKDOWN" />
      <input type="hidden" name="parentIds" value={JSON.stringify(selectedParentIds)} />

      <div className="comment-compose-header">
        <strong className="text-label">Add Comment</strong>
        <div className="comment-format-toggle" role="tablist" aria-label="Comment format">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "MARKDOWN"}
            data-active={mode === "MARKDOWN"}
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
            data-active={mode === "RICH_TEXT"}
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
        <div className="comment-parent-pill-row inline-cluster">
          <span className="text-label">Replying to:</span>
          {selectedParents.map((parent) => (
            <button
              key={parent.id}
              type="button"
              className="comment-parent-pill chip"
              onClick={() => removeParentReference(parent.id)}
              title={`Remove parent #${parent.number}`}
            >
              !{parent.number} ×
            </button>
          ))}
        </div>
      ) : (
        <p className="comment-compose-tip">
          Tip: type <code>!</code> or <code>@</code> to reference comments/users.
        </p>
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
            placeholder="Add a thoughtful comment. Use !12 to reference another comment, or @name to mention a member."
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
            data-placeholder="Write with formatting. Type !12 to reference another comment or @name to mention a member."
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
                  data-highlighted={isHighlighted}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySuggestion(suggestion);
                  }}
                >
                  {suggestion.type === "comment" ? (
                    <>
                      <strong>!{suggestion.number}</strong>
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

      <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
        Post Comment
      </button>
    </div>
  );
};
