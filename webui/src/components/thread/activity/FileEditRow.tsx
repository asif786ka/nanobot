import { AlertCircle, CheckCircle2, CircleDashed } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FileReferenceChip } from "@/components/FileReferenceChip";
import { useFileEditDisplayMode } from "@/hooks/useFileEditDisplayMode";
import type { UIFileDiff, UIFileEdit, UIFileDiffLine } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ActivityStep } from "./ActivityStep";
import { DiffPair } from "./DiffPair";

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
}: {
  edit: FileEditSummary;
  displayMode: "diff" | "collapsed_diff";
}) {
  return (
    <li className="min-w-0 py-0.5">
      <FileUnifiedDiff
        diff={edit.diff!}
        collapsed={displayMode === "collapsed_diff"}
        added={edit.added}
        deleted={edit.deleted}
        showCollapsedStats={false}
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
}: {
  diff: UIFileDiff;
  collapsed: boolean;
  added: number;
  deleted: number;
  showCollapsedStats?: boolean;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const body = (
    <div
      className="mt-1 overflow-hidden rounded-md border border-border/55 bg-background/80 shadow-[0_1px_0_rgba(15,23,42,0.03)]"
      data-testid="file-edit-diff"
    >
      {diff.hunks.map((hunk, index) => (
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
      {diff.truncated ? (
        <div className="border-t border-border/45 bg-muted/35 px-2 py-1 text-[11px] text-muted-foreground">
          {tx("message.fileEditDiffTruncated", "Diff truncated. Open the file for the full change.")}
        </div>
      ) : null}
    </div>
  );

  if (!collapsed) return body;

  return (
    <details className="group/file-diff mt-1">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-md border border-border/45 bg-muted/35 px-2 py-1",
          "text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50",
        )}
      >
        <span className="min-w-0 flex-1">{tx("message.fileEditViewDiff", "View diff")}</span>
        {showCollapsedStats ? <DiffPair added={added} deleted={deleted} /> : null}
      </summary>
      {body}
    </details>
  );
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
