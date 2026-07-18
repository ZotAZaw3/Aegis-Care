// DataTable Data-Dense: cột config + sort header + horizontal-scroll (chống vỡ layout) + skeleton + empty.
// Bám ui-ux-pro-max: overflow-x-auto, reserve space (skeleton), EmptyState, row hover/cursor.
import { type ReactNode, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./empty-state";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  className?: string;
}

export function DataTable<T>({
  columns, rows, isLoading, emptyMessage, emptyIcon, onRowClick, rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  isLoading?: boolean;
  emptyMessage: string;
  emptyIcon?: ReactNode;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const sorted = (() => {
    if (!sort) return rows;
    const sv = columns.find((c) => c.key === sort.key)?.sortValue;
    if (!sv) return rows;
    return [...rows].sort((a, b) => {
      const va = sv(a), vb = sv(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  })();

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  if (isLoading) {
    return <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>;
  }
  if (rows.length === 0) return <EmptyState icon={emptyIcon} message={emptyMessage} />;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.className}>
                {c.sortable ? (
                  <button
                    onClick={() => toggleSort(c.key)}
                    className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
                  >
                    {c.header}
                    {sort?.key === c.key ? (
                      sort.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                    )}
                  </button>
                ) : (
                  c.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? "cursor-pointer" : undefined}
            >
              {columns.map((c) => <TableCell key={c.key} className={c.className}>{c.cell(row)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
