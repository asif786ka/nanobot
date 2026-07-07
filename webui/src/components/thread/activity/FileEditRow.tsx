import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDashed,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { FileReferenceChip } from "@/components/FileReferenceChip";
import { useFileEditDisplayMode } from "@/hooks/useFileEditDisplayMode";
import type { UIFileDiff, UIFileEdit, UIFileDiffLine } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ActivityStep } from "./ActivityStep";
import { DiffPair } from "./DiffPair";

const INITIAL_VISIBLE_DIFF_LINES = 160;

export interface FileEditSummary {
  key: string;
  path: string;
  absolute_path?: string;
  added: number;
  deleted: number;
  approximate: boolean;
  binary: boolean;
  status: UIFileEdit["status"];
  operation?: UIFileEdit["operation"];
  pending: boolean;
  error?: string;
  diff?: UIFileDiff;
}

export function FileEditGroup({
  edits,
  onOpenFilePreview,
  density = "default",
}: {
  edits: FileEditSummary[];
  onOpenFilePreview?: (path: string) => void;
  density?: "default" | "diff-only";
}) {
  const displayMode = useFileEditDisplayMode();
  if (edits.length === 0) return null;
  return (
    <ul className="space-y-1">
      {edits.map((edit) => {
        if (density === "diff-only" && canRenderDiffOnly(edit, displayMode)) {
          return (
            <FileEditDiffOnly
              key={edit.key}
              edit={edit}
              displayMode={displayMode}
              onOpenFilePreview={onOpenFilePreview}
            />
          );
        }
        return (
          <FileEditRow
            key={edit.key}
            edit={edit}
            onOpenFilePreview={onOpenFilePreview}
          />
        );
      })}
    </ul>
  );
}

function canRenderDiffOnly(
  edit: FileEditSummary,
  displayMode: "summary" | "diff" | "collapsed_diff",
): displayMode is "diff" | "collapsed_diff" {
  return (
    displayMode !== "summary"
    && edit.status !== "editing"
    && edit.status !== "error"
    && !!edit.diff?.hunks?.length
  );
}

function FileEditDiffOnly({
  edit,
  displayMode,
  onOpenFilePreview,
}: {
  edit: FileEditSummary;
  displayMode: "diff" | "collapsed_diff";
  onOpenFilePreview?: (path: string) => void;
}) {
  return (
    <li className="min-w-0 py-0.5">
      <FileUnifiedDiff
        diff={edit.diff!}
        collapsed={displayMode === "collapsed_diff"}
        added={edit.added}
        deleted={edit.deleted}
        showCollapsedStats={false}
        previewPath={edit.absolute_path || edit.path}
        onOpenFilePreview={onOpenFilePreview}
      />
    </li>
  );
}

function FileEditRow({
  edit,
  onOpenFilePreview,
}: {
  edit: FileEditSummary;
  onOpenFilePreview?: (path: string) => void;
}) {
  const { t } = useTranslation();
  const displayMode = useFileEditDisplayMode();
  const editing = edit.status === "editing";
  const failed = edit.status === "error";
  const hasCountedDiff = !failed && !edit.binary && hasVisibleDiffStats(edit);
  const showDiff = displayMode !== "summary" && !editing && !failed && !!edit.diff?.hunks?.length;
  const rawFailureDetail = failed ? cleanFileEditError(edit.error) : "";
  const failureDetail = failed
    ? formatFileEditError(edit.error)
      || t("message.fileEditFailedFallback", { defaultValue: "File change was not applied." })
    : "";
  const statusIcon = failed ? (
    <AlertCircle className="h-3 w-3" aria-hidden />
  ) : editing ? (
    <CircleDashed className="h-3 w-3 animate-spin" aria-hidden />
  ) : (
    <CheckCircle2 className="h-3 w-3" aria-hidden />
  );
  return (
    <ActivityStep
      as="li"
      marker={(
        <span
          className={cn(
            "grid h-3.5 w-3.5 place-items-center rounded-full border bg-background transition-colors",
            failed && "border-destructive/30 text-destructive/78",
            editing && "border-muted-foreground/24 text-muted-foreground/65",
            !failed && !editing && "border-emerald-500/28 text-emerald-500/78",
          )}
        >
          {statusIcon}
        </span>
      )}
      active={editing}
      tone={failed ? "error" : editing ? "active" : "success"}
      className="text-xs"
      contentClassName={failed || showDiff ? "min-w-0" : "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"}
      title={rawFailureDetail || edit.absolute_path || edit.path}
      label={edit.pending && !edit.path
        ? t("message.fileEditPreparing", { defaultValue: "Preparing file edit…" })
        : (
          <FileReferenceChip
            path={edit.path}
            tooltipPath={edit.absolute_path}
            previewPath={edit.absolute_path || edit.path}
            onOpen={onOpenFilePreview}
            display="path"
            active={editing}
            className="min-w-0"
            textClassName="text-[12px]"
            testId="activity-file-reference"
          />
        )}
      detail={null}
      aside={hasCountedDiff ? <DiffPair added={edit.added} deleted={edit.deleted} /> : null}
    >
      {failed ? (
        <span className="block max-w-[42rem] truncate text-[11px] leading-4 text-destructive/75">
          {failureDetail}
        </span>
      ) : null}
      {showDiff ? (
        <FileUnifiedDiff
          diff={edit.diff!}
          collapsed={displayMode === "collapsed_diff"}
          added={edit.added}
          deleted={edit.deleted}
          previewPath={edit.absolute_path || edit.path}
          onOpenFilePreview={onOpenFilePreview}
        />
      ) : null}
    </ActivityStep>
  );
}

export function hasVisibleDiffStats(edit: Pick<FileEditSummary, "added" | "deleted">): boolean {
  return edit.added > 0 || edit.deleted > 0;
}

function cleanFileEditError(error?: string): string {
  const firstLine = (error || "").replace(/\s+/g, " ").trim();
  if (!firstLine) return "";
  return firstLine
    .replace(/^Error applying patch:\s*/i, "")
    .replace(/^Error writing file:\s*/i, "")
    .replace(/^Error editing file:\s*/i, "")
    .replace(/^Error:\s*/i, "");
}

function formatFileEditError(error?: string): string {
  const cleaned = cleanFileEditError(error);
  if (!cleaned) return "";

  if (/\bpermission denied\b/i.test(cleaned) || /\boperation not permitted\b/i.test(cleaned)) {
    return "No permission to change this location.";
  }

  return cleaned
    .replace(/^old_text not found in (.+)$/i, "Target text was not found in $1.")
    .replace(/^old_text appears multiple times in (.+)$/i, "Target text matched multiple places in $1.")
    .replace(/^file to (?:update|delete) does not exist: (.+)$/i, "File does not exist: $1.")
    .replace(/^path to (?:update|delete) is not a file: (.+)$/i, "Path is not a file: $1.")
    .slice(0, 180);
}

function FileUnifiedDiff({
  diff,
  collapsed,
  added,
  deleted,
  showCollapsedStats = true,
  previewPath,
  onOpenFilePreview,
}: {
  diff: UIFileDiff;
  collapsed: boolean;
  added: number;
  deleted: number;
  showCollapsedStats?: boolean;
  previewPath?: string;
  onOpenFilePreview?: (path: string) => void;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const [open, setOpen] = useState(false);
  const [expandedLines, setExpandedLines] = useState(false);
  const totalLineCount = useMemo(() => countDiffLines(diff), [diff]);
  const shouldLimitLines = totalLineCount > INITIAL_VISIBLE_DIFF_LINES;
  const lineLimit = expandedLines || !shouldLimitLines
    ? totalLineCount
    : INITIAL_VISIBLE_DIFF_LINES;
  const visibleDiff = useMemo(
    () => selectVisibleDiffLines(diff, lineLimit, totalLineCount),
    [diff, lineLimit, totalLineCount],
  );
  const lineCountLabel = t("message.fileEditDiffLineCount", {
    count: diff.truncated ? `${totalLineCount}+` : totalLineCount,
    defaultValue: "{{count}} lines",
  });

  useEffect(() => {
    setExpandedLines(false);
  }, [diff]);

  const body = (
    <div
      className="mt-1 overflow-hidden rounded-md border border-border/55 bg-background/80 shadow-[0_1px_0_rgba(15,23,42,0.03)]"
      data-testid="file-edit-diff"
    >
      {visibleDiff.hunks.map((hunk, index) => (
        <div
          key={`${hunk.old_start}-${hunk.new_start}-${index}`}
          className={cn("min-w-0", index > 0 && "border-t border-border/45")}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[11px] leading-5">
              <tbody>
                {hunk.lines.map((line, lineIndex) => (
                  <DiffLineRow
                    key={`${line.old_lineno ?? ""}:${line.new_lineno ?? ""}:${lineIndex}`}
                    line={line}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {visibleDiff.hiddenLineCount > 0 ? (
        <div className="border-t border-border/45 bg-muted/30 px-2 py-1">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium",
              "text-muted-foreground transition-colors hover:bg-muted/65 hover:text-foreground",
            )}
            data-testid="file-edit-diff-expand-lines"
            onClick={() => setExpandedLines(true)}
          >
            <ChevronDown className="h-3 w-3" aria-hidden />
            {t("message.fileEditShowMoreLines", {
              count: visibleDiff.hiddenLineCount,
              defaultValue: "Show {{count}} more lines",
            })}
          </button>
        </div>
      ) : expandedLines && shouldLimitLines ? (
        <div className="border-t border-border/45 bg-muted/30 px-2 py-1">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium",
              "text-muted-foreground transition-colors hover:bg-muted/65 hover:text-foreground",
            )}
            data-testid="file-edit-diff-collapse-lines"
            onClick={() => setExpandedLines(false)}
          >
            <ChevronUp className="h-3 w-3" aria-hidden />
            {tx("message.fileEditShowFewerLines", "Show fewer lines")}
          </button>
        </div>
      ) : null}
      {diff.truncated ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/45 bg-muted/35 px-2 py-1 text-[11px] text-muted-foreground"
          data-testid="file-edit-diff-truncated"
        >
          <span>
            {tx("message.fileEditDiffTruncated", "Diff truncated. Open the file for the full change.")}
          </span>
          {previewPath && onOpenFilePreview ? (
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium",
                "text-muted-foreground transition-colors hover:bg-muted/65 hover:text-foreground",
              )}
              data-testid="file-edit-diff-open-file"
              onClick={() => onOpenFilePreview(previewPath)}
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              {tx("message.fileEditOpenFile", "Open file")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (!collapsed) return body;

  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        data-testid="file-edit-diff-toggle"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-md border border-border/45 bg-muted/35 px-2 py-1 text-left",
          "text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50",
        )}
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")}
          aria-hidden
        />
        <span className="min-w-0 flex-1">{tx("message.fileEditViewDiff", "View diff")}</span>
        <span className="shrink-0 text-muted-foreground/65">{lineCountLabel}</span>
        {showCollapsedStats ? <DiffPair added={added} deleted={deleted} /> : null}
      </button>
      {open ? body : null}
    </div>
  );
}

function countDiffLines(diff: UIFileDiff): number {
  return diff.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
}

function selectVisibleDiffLines(
  diff: UIFileDiff,
  lineLimit: number,
  totalLineCount: number,
): { hunks: UIFileDiff["hunks"]; hiddenLineCount: number } {
  if (lineLimit >= totalLineCount) {
    return { hunks: diff.hunks, hiddenLineCount: 0 };
  }

  let remaining = Math.max(0, lineLimit);
  const hunks: UIFileDiff["hunks"] = [];
  for (const hunk of diff.hunks) {
    if (remaining <= 0) break;
    if (hunk.lines.length <= remaining) {
      hunks.push(hunk);
      remaining -= hunk.lines.length;
      continue;
    }
    hunks.push({ ...hunk, lines: hunk.lines.slice(0, remaining) });
    remaining = 0;
  }
  return {
    hunks,
    hiddenLineCount: Math.max(0, totalLineCount - lineLimit),
  };
}

function DiffLineRow({ line }: { line: UIFileDiffLine }) {
  const kind = line.kind === "add" || line.kind === "delete" ? line.kind : "context";
  const marker = kind === "add" ? "+" : kind === "delete" ? "-" : " ";
  return (
    <tr
      className={cn(
        "border-0",
        kind === "add" && "bg-emerald-500/[0.09] dark:bg-emerald-300/[0.11]",
        kind === "delete" && "bg-rose-500/[0.09] dark:bg-rose-300/[0.11]",
      )}
    >
      <td className="w-10 select-none border-r border-border/35 px-1.5 text-right text-muted-foreground/55">
        {line.old_lineno ?? ""}
      </td>
      <td className="w-10 select-none border-r border-border/35 px-1.5 text-right text-muted-foreground/55">
        {line.new_lineno ?? ""}
      </td>
      <td
        className={cn(
          "w-5 select-none px-1 text-center",
          kind === "add" && "text-emerald-600/80 dark:text-emerald-300/85",
          kind === "delete" && "text-rose-600/80 dark:text-rose-300/85",
          kind === "context" && "text-muted-foreground/45",
        )}
      >
        {marker}
      </td>
      <td className="min-w-[16rem] px-1.5 text-foreground/86">
        <span className="whitespace-pre">{line.content || " "}</span>
        {line.truncated ? <span className="text-muted-foreground/60">...</span> : null}
      </td>
    </tr>
  );
}
