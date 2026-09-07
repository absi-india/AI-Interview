"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { showToast } from "@/components/ui/Toaster";
import { amountInWords } from "@/lib/payroll/words";
import type { Payslip, PayrollWarning } from "@/lib/payroll/types";

type Step = "upload" | "review";

function money(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Recompute totals so an edited figure flows through to net pay immediately. */
function recalc(p: Payslip): Payslip {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const totalEarnings = round2(
    p.earnings.basic + p.earnings.hra + p.earnings.conveyance + p.earnings.specialAllowance,
  );
  const totalDeductions = round2(p.deductions.incomeTax + p.deductions.medical + p.deductions.lop);
  const netPay = round2(totalEarnings - totalDeductions);
  // The wording is part of the slip, so it has to follow the figure it states.
  return { ...p, totalEarnings, totalDeductions, netPay, netPayInWords: amountInWords(netPay) };
}

export function PayrollApp() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState("");
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [warnings, setWarnings] = useState<PayrollWarning[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const keyOf = (p: Payslip) => `${p.month}::${p.name}`;
  const forMonth = useMemo(() => payslips.filter((p) => p.month === month), [payslips, month]);
  const chosen = useMemo(() => forMonth.filter((p) => selected.has(keyOf(p))), [forMonth, selected]);
  const monthWarnings = useMemo(() => warnings.filter((w) => w.month === month), [warnings, month]);
  const allChosen = forMonth.length > 0 && chosen.length === forMonth.length;

  function chooseFile(f: File | null) {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) {
      setError("Please choose the salary workbook as an .xlsx file.");
      return;
    }
    setError("");
    setFile(f);
  }

  async function parseFile() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/payroll/parse", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "That workbook could not be read.");
        return;
      }
      const data = body as { months: string[]; payslips: Payslip[]; warnings: PayrollWarning[] };
      setMonths(data.months);
      setPayslips(data.payslips);
      setWarnings(data.warnings);
      const latest = data.months[data.months.length - 1] ?? "";
      setMonth(latest);
      setSelected(new Set(data.payslips.filter((p) => p.month === latest).map(keyOf)));
      setStep("review");
      showToast(`Read ${data.payslips.length} payslips across ${data.months.length} months.`, "success");
    } catch {
      setError("Upload failed. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Edits update the data, so the workbook and the PDF can never disagree. */
  function editSlip(key: string, patch: (p: Payslip) => Payslip) {
    setPayslips((all) => all.map((p) => (keyOf(p) === key ? recalc(patch(p)) : p)));
  }

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Tick or clear every employee shown for the month in one go. */
  function toggleAll() {
    setSelected((s) => {
      const next = new Set(s);
      // Only the rows on screen are touched, so a different month's choices
      // survive switching back and forth.
      for (const p of forMonth) {
        if (allChosen) next.delete(keyOf(p));
        else next.add(keyOf(p));
      }
      return next;
    });
  }

  function selectMonth(m: string) {
    setMonth(m);
    setSelected(new Set(payslips.filter((p) => p.month === m).map(keyOf)));
    setEditing(null);
  }

  async function download(format: "xlsx" | "pdf") {
    if (!chosen.length) {
      showToast("Select at least one employee first.", "error");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/payroll/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, payslips: chosen }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? "Could not generate the payslips.", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disp = res.headers.get("Content-Disposition") ?? "";
      a.download = disp.match(/filename="?([^"]+)"?/)?.[1] ?? `Payslips.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`${chosen.length} payslip${chosen.length === 1 ? "" : "s"} downloaded.`, "success");
    } finally {
      setExporting(false);
    }
  }

  if (step === "upload") {
    return (
      <div className="mx-auto max-w-2xl p-6 lg:p-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#0f172a]">Generate payslips</h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Upload the salary workbook. Nothing is saved — the payslips exist only until you download them.
        </p>

        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); chooseFile(e.dataTransfer.files?.[0] ?? null); }}
            className={`mt-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${dragOver ? "border-[#2563eb] bg-[#eff4ff]" : "border-[#cbd5e1] bg-[#f8fafc]"}`}
          >
            <svg className="h-10 w-10 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="mt-3 text-sm font-medium text-[#334155]">Drop the salary workbook here</p>
            <p className="text-xs text-[#94a3b8]">.xlsx — one sheet per month, plus Bank Details</p>
            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary mt-4">Browse files</button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
          </div>
        ) : (
          <div className="mt-5 glass-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#ecfdf5] text-[#15803d]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 6v3.776" /></svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[#0f172a]">{file.name}</div>
                <div className="text-xs text-[#64748b]">{(file.size / 1024).toFixed(0)} KB</div>
              </div>
              {!busy && (
                <button onClick={() => setFile(null)} className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-1.5 text-xs font-semibold text-[#dc2626] hover:bg-[#fee2e2]">Remove</button>
              )}
            </div>
            <button onClick={parseFile} disabled={busy} className="btn-primary mt-4 w-full disabled:opacity-60">
              {busy ? "Reading workbook…" : "Read payslips"}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-7">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { setStep("upload"); setFile(null); }} className="btn-secondary px-3 py-1.5 text-xs">&larr; New workbook</button>
        <select value={month} onChange={(e) => selectMonth(e.target.value)} className="rounded-lg border border-[#dce2ea] bg-white px-2.5 py-1.5 text-sm text-[#334155]">
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-sm text-[#64748b]">{chosen.length} of {forMonth.length} selected</span>
        {monthWarnings.length > 0 && (
          <button onClick={() => setShowWarnings((v) => !v)} className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1.5 text-xs font-semibold text-[#b45309]">
            {monthWarnings.length} to check
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={() => download("xlsx")} disabled={exporting} className="btn-secondary text-sm disabled:opacity-60">
            {exporting ? "Working…" : "Download Excel"}
          </button>
          <button onClick={() => download("pdf")} disabled={exporting} className="btn-primary text-sm disabled:opacity-60">
            {exporting ? "Working…" : "Download PDF"}
          </button>
        </div>
      </div>

      {showWarnings && monthWarnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
          <h2 className="text-sm font-semibold text-[#b45309]">Worth checking before you send these</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-[#92400e]">
            {monthWarnings.map((w, i) => <li key={i}><span className="font-medium">{w.name}</span> — {w.issue}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#e1e7f0] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f8fafc] text-left font-mono text-[11px] uppercase tracking-wide text-[#94a3b8]">
              <th className="px-3 py-2.5 w-8">
                <SelectAllBox
                  checked={allChosen}
                  // Part-way through, the box shows a dash rather than claiming
                  // everyone is either in or out.
                  indeterminate={chosen.length > 0 && !allChosen}
                  disabled={forMonth.length === 0}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2.5">Employee</th>
              <th className="px-3 py-2.5 text-right">Gross</th>
              <th className="px-3 py-2.5 text-right">Earnings</th>
              <th className="px-3 py-2.5 text-right">Deductions</th>
              <th className="px-3 py-2.5 text-right">Net pay</th>
              <th className="px-3 py-2.5 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {forMonth.map((p) => {
              const key = keyOf(p);
              const isOpen = editing === key;
              return (
                <PayslipRow
                  key={key}
                  p={p}
                  checked={selected.has(key)}
                  open={isOpen}
                  onToggle={() => toggle(key)}
                  onOpen={() => setEditing(isOpen ? null : key)}
                  onEdit={(patch) => editSlip(key, patch)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px] text-[#94a3b8]">
        Corrections here apply to both the Excel and the PDF, so the two always match. Nothing is stored — reload and
        you start again from the workbook.
      </p>
    </div>
  );
}

/**
 * The header tick box. "Indeterminate" has no HTML attribute — it can only be
 * set on the element — so it is applied here rather than in the markup.
 */
function SelectAllBox({
  checked, indeterminate, disabled, onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={checked ? "Clear all" : "Select all"}
      title={checked ? "Clear all" : "Select all"}
      className="h-4 w-4 cursor-pointer accent-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-[#475569]">{label}</span>
      <input
        type="number"
        step="0.01"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 w-full rounded-md border border-[#dce2ea] px-2 py-1.5 text-[13px] tabular-nums"
      />
    </label>
  );
}

function PayslipRow({
  p, checked, open, onToggle, onOpen, onEdit,
}: {
  p: Payslip;
  checked: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: (patch: (p: Payslip) => Payslip) => void;
}) {
  return (
    <>
      <tr className="border-t border-[#f1f5f9] hover:bg-[#fafbfd]">
        <td className="px-3 py-2.5">
          <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 accent-[#2563eb]" />
        </td>
        <td className="px-3 py-2.5">
          <div className="font-medium text-[#0f172a]">{p.name}</div>
          <div className="text-[11.5px] text-[#64748b]">
            {p.employeeNo || "no employee no."}{p.designation ? ` · ${p.designation}` : ""}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{money(p.gross)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{money(p.totalEarnings)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{money(p.totalDeductions)}</td>
        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#0f172a]">
          {money(p.netPay)}
          {p.netPayMismatch && (
            <span className="ml-1.5 text-[10.5px] font-normal text-[#b45309]" title={`The sheet says ${money(p.netPayMismatch.fromSheet)}`}>
              differs
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          <button onClick={onOpen} className="text-[12.5px] font-medium text-[#2563eb] hover:text-[#1d4ed8]">
            {open ? "Close" : "Edit"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-[#f1f5f9] bg-[#fafbfd]">
          <td colSpan={7} className="px-3 py-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <NumberField label="Basic" value={p.earnings.basic} onChange={(n) => onEdit((s) => ({ ...s, earnings: { ...s.earnings, basic: n } }))} />
              <NumberField label="HRA" value={p.earnings.hra} onChange={(n) => onEdit((s) => ({ ...s, earnings: { ...s.earnings, hra: n } }))} />
              <NumberField label="Conveyance" value={p.earnings.conveyance} onChange={(n) => onEdit((s) => ({ ...s, earnings: { ...s.earnings, conveyance: n } }))} />
              <NumberField label="Special allowance" value={p.earnings.specialAllowance} onChange={(n) => onEdit((s) => ({ ...s, earnings: { ...s.earnings, specialAllowance: n } }))} />
              <NumberField label="Income tax" value={p.deductions.incomeTax} onChange={(n) => onEdit((s) => ({ ...s, deductions: { ...s.deductions, incomeTax: n } }))} />
              <NumberField label="Medical" value={p.deductions.medical} onChange={(n) => onEdit((s) => ({ ...s, deductions: { ...s.deductions, medical: n } }))} />
              <NumberField label="LOP" value={p.deductions.lop} onChange={(n) => onEdit((s) => ({ ...s, deductions: { ...s.deductions, lop: n } }))} />
              <label className="block">
                <span className="text-[11px] font-medium text-[#475569]">Designation</span>
                <input
                  value={p.designation}
                  onChange={(e) => onEdit((s) => ({ ...s, designation: e.target.value }))}
                  className="mt-0.5 w-full rounded-md border border-[#dce2ea] px-2 py-1.5 text-[13px]"
                />
              </label>
            </div>
            <p className="mt-3 text-[11.5px] text-[#64748b]">
              Net pay is now <span className="font-semibold text-[#0f172a]">{money(p.netPay)}</span> — {p.netPayInWords}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
