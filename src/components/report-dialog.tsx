"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DISTRICT_ORDER, DISTRICTS, KIND_LABEL } from "@/lib/edp/constants";
import type { DistrictId, Kind, Priority } from "@/lib/edp/types";

export interface ReportDraft {
  kind: Kind;
  priority: Priority;
  district: DistrictId;
  summary: string;
  reporter: string;
}

const KIND_ITEMS = (Object.entries(KIND_LABEL) as [Kind, string][]).map(([value, label]) => ({
  value,
  label,
}));

const PRIORITY_ITEMS: { value: Priority; label: string }[] = [
  { value: 1, label: "P1 · life safety" },
  { value: 2, label: "P2 · urgent" },
  { value: 3, label: "P3 · routine" },
];

const DISTRICT_ITEMS = DISTRICT_ORDER.map((id) => ({
  value: id,
  label: DISTRICTS[id].label,
}));

export function ReportDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (report: ReportDraft) => void;
}) {
  const [kind, setKind] = useState<Kind>("medical");
  const [priority, setPriority] = useState<Priority>(2);
  const [district, setDistrict] = useState<DistrictId>("harbor");
  const [summary, setSummary] = useState("");
  const [reporter, setReporter] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = summary.trim();
    if (clean.length < 8) {
      setError("Describe the call in at least 8 characters.");
      return;
    }
    onSubmit({
      kind,
      priority,
      district,
      summary: clean,
      reporter: reporter.trim() || "Desk operator",
    });
    setSummary("");
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">File a report</DialogTitle>
          <DialogDescription>
            This becomes an incident.reported event from the operator console. Dispatch will try to assign a unit as soon as the queue delivers it.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="report-kind">Kind</Label>
              <Select
                value={kind}
                items={KIND_ITEMS}
                onValueChange={(value) => {
                  if (isKind(value)) setKind(value);
                }}
              >
                <SelectTrigger id="report-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="report-priority">Priority</Label>
              <Select
                value={priority}
                items={PRIORITY_ITEMS}
                onValueChange={(value) => {
                  const next = asPriority(value);
                  if (next) setPriority(next);
                }}
              >
                <SelectTrigger id="report-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="report-district">District</Label>
              <Select
                value={district}
                items={DISTRICT_ITEMS}
                onValueChange={(value) => {
                  if (isDistrict(value)) setDistrict(value);
                }}
              >
                <SelectTrigger id="report-district" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISTRICT_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-summary">What is happening</Label>
            <Textarea
              id="report-summary"
              value={summary}
              onChange={(event) => {
                setSummary(event.target.value);
                if (error) setError(null);
              }}
              placeholder="Smoke from the smokehouse roof, visible from the ferry"
              maxLength={180}
              required
              aria-invalid={error ? true : undefined}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-reporter">Reporter</Label>
            <Input
              id="report-reporter"
              value={reporter}
              onChange={(event) => setReporter(event.target.value)}
              placeholder="Desk operator"
              maxLength={80}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Put it on the queue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function asPriority(value: unknown): Priority | undefined {
  if (value === 1 || value === "1") return 1;
  if (value === 2 || value === "2") return 2;
  if (value === 3 || value === "3") return 3;
  return undefined;
}

function isKind(value: unknown): value is Kind {
  return KIND_ITEMS.some((item) => item.value === value);
}

function isDistrict(value: unknown): value is DistrictId {
  return DISTRICT_ORDER.some((id) => id === value);
}
