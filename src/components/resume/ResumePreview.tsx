"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import {
  CAI_BLUE,
  CAI_NAVY,
  CAI_TEAL,
  getTemplate,
  labelFor,
  type SectionKey,
} from "@/lib/resume-formatting/templates";
import { splitBulletLabel } from "@/lib/resume-formatting/segment";
import type { ResumeModel, TemplateId } from "@/lib/resume-formatting/types";

// On-screen approximation of the exported document. The DOCX export
// (src/lib/resume-formatting/docx.ts) mirrors this layout.

// ── Editing ──────────────────────────────────────────────────────────────────

type Edit = (updater: (m: ResumeModel) => ResumeModel) => void;

/** Null when the preview is read-only, which is how it renders by default. */
const EditContext = createContext<Edit | null>(null);

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Bullet text with its lead-in label emboldened, as in the source resume. */
function bulletHtml(text: string) {
  const split = splitBulletLabel(text);
  if (!split) return escapeHtml(text);
  return `<b>${escapeHtml(split.label)}</b>${escapeHtml(split.rest)}`;
}

function replaceAt<T>(arr: T[], i: number, next: T): T[] {
  return arr.map((v, j) => (j === i ? next : v));
}

/**
 * A span of the document that can be typed into directly.
 *
 * The browser owns the text while the caret is inside it and React only writes
 * to the node when it is unfocused, so a re-render triggered by an edit
 * elsewhere can never move the caret or swallow a half-typed word. The value
 * is committed on blur rather than on every keystroke, which keeps one edit to
 * one undo step.
 */
function Editable({
  value,
  onCommit,
  rich,
  className = "",
  style,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  /** Display HTML for when the field is not being typed into. */
  rich?: string;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const edit = useContext(EditContext);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = rich ?? escapeHtml(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.innerHTML !== shown) el.innerHTML = shown;
  }, [shown]);

  if (!edit) {
    return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: shown }} />;
  }

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      data-placeholder={placeholder}
      // Typing happens on plain text; the emboldened lead-in comes back on blur.
      onFocus={(e) => {
        e.currentTarget.textContent = value;
      }}
      onBlur={(e) => {
        const text = (e.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text !== value) onCommit(text);
        else e.currentTarget.innerHTML = shown;
      }}
      onKeyDown={(e) => {
        // Enter commits rather than splitting the field into two lines.
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.textContent = value;
          e.currentTarget.blur();
        }
      }}
      className={`${className} cursor-text rounded-[2px] outline-none transition-colors hover:bg-[#eef2f7] focus:bg-[#eff6ff] focus:ring-1 focus:ring-[#93c5fd]`}
      style={style}
    />
  );
}

/** Remove / add controls on a bullet list, shown only when editing is on. */
function BulletControls({ onDelete }: { onDelete: () => void }) {
  const edit = useContext(EditContext);
  if (!edit) return null;
  return (
    <button
      type="button"
      onClick={onDelete}
      title="Remove this bullet"
      className="ml-1 hidden rounded px-1 text-[10px] leading-none text-[#b91c1c] hover:bg-[#fee2e2] group-hover:inline"
    >
      ✕
    </button>
  );
}

function AddBullet({ onAdd }: { onAdd: () => void }) {
  const edit = useContext(EditContext);
  if (!edit) return null;
  return (
    <button
      type="button"
      onClick={onAdd}
      className="mt-0.5 rounded px-1 text-[10px] text-[#2563eb] hover:bg-[#eff6ff]"
    >
      + bullet
    </button>
  );
}

// ── Headings ─────────────────────────────────────────────────────────────────

function Heading({ label, tmplId }: { label: string; tmplId: TemplateId }) {
  const tmpl = getTemplate(tmplId);
  if (!label) return null;
  if (tmpl.cai) {
    return (
      <div
        className="mt-4 pb-0.5 text-[12px] font-bold"
        style={{ color: `#${CAI_NAVY}`, borderBottom: `1.25px solid #${CAI_BLUE}` }}
      >
        {label}
      </div>
    );
  }
  if (tmpl.underlinedHeadings) {
    return (
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-black underline decoration-1 underline-offset-2">
        {label}
      </div>
    );
  }
  if (tmpl.boxedHeadings) {
    return (
      <div
        className="mt-3 mb-1.5 border px-2 py-1 text-[11px] font-bold uppercase tracking-wide"
        style={{ color: `#${tmpl.accent}`, backgroundColor: "#E8E8E8", borderColor: "#AFAFAF" }}
      >
        {label}
      </div>
    );
  }
  return (
    <div
      className="mt-3 mb-1.5 text-[16px] font-bold uppercase tracking-wide"
      style={{ color: `#${tmpl.accent}` }}
    >
      {label}
    </div>
  );
}

// ── Section bodies ───────────────────────────────────────────────────────────

/** Body of a headed section, without the heading. Returns null when empty. */
function SectionBody({ k, model, tmplId }: { k: SectionKey; model: ResumeModel; tmplId: TemplateId }) {
  const tmpl = getTemplate(tmplId);
  const edit = useContext(EditContext);

  switch (k) {
    case "summary": {
      const bullets = model.summaryBullets ?? [];
      if (!model.summary && !bullets.length) return null;
      return (
        <>
          {model.summary && (
            <p className="text-justify text-[11px] leading-snug text-gray-800">
              <Editable
                value={model.summary}
                onCommit={(v) => edit?.((m) => ({ ...m, summary: v }))}
              />
            </p>
          )}
          {bullets.length > 0 && (
            <ul className="ml-4 list-disc space-y-0.5">
              {bullets.map((b, i) => (
                <li key={i} className="group text-justify text-[11px] leading-snug text-gray-800">
                  <Editable
                    value={b}
                    rich={bulletHtml(b)}
                    onCommit={(v) =>
                      edit?.((m) => ({ ...m, summaryBullets: replaceAt(m.summaryBullets ?? [], i, v) }))
                    }
                  />
                  <BulletControls
                    onDelete={() =>
                      edit?.((m) => ({
                        ...m,
                        summaryBullets: (m.summaryBullets ?? []).filter((_, j) => j !== i),
                      }))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <AddBullet
            onAdd={() => edit?.((m) => ({ ...m, summaryBullets: [...(m.summaryBullets ?? []), "New point"] }))}
          />
        </>
      );
    }

    case "skills": {
      if (!model.skills.length) return null;
      if (tmpl.skillsYearsTable) {
        // Flattened for display, so an edit has to find its way back to the
        // group it came from.
        const rows = model.skills.flatMap((g, gi) => g.skills.map((s, si) => ({ s, gi, si })));
        return (
          <table className="mt-1 w-full border-collapse text-[9.5px]">
            <thead>
              <tr style={{ backgroundColor: `#${CAI_NAVY}`, color: "#fff" }}>
                <th className="border border-[#ccc] px-1.5 py-1 text-left font-semibold">Skill</th>
                <th className="border border-[#ccc] px-1.5 py-1 text-left font-semibold w-40">Years of Experience</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, gi, si }) => (
                <tr key={`${gi}-${si}`}>
                  <td className="border border-[#ccc] px-1.5 py-1 align-top">
                    <Editable
                      value={s}
                      onCommit={(v) =>
                        edit?.((m) => ({
                          ...m,
                          skills: replaceAt(m.skills, gi, {
                            ...m.skills[gi],
                            skills: replaceAt(m.skills[gi].skills, si, v),
                          }),
                        }))
                      }
                    />
                  </td>
                  {/* The resume does not state years per skill, so this is left
                      for the recruiter rather than guessed. */}
                  <td className="border border-[#ccc] px-1.5 py-1" />
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      return (
        <div className="space-y-0.5">
          {model.skills.map((s, i) => (
            <div key={i} className="text-[11px] leading-snug">
              <span className="font-semibold">
                <Editable
                  value={s.category}
                  onCommit={(v) => edit?.((m) => ({ ...m, skills: replaceAt(m.skills, i, { ...m.skills[i], category: v }) }))}
                />
                :
              </span>{" "}
              <Editable
                value={s.skills.join(", ")}
                onCommit={(v) =>
                  edit?.((m) => ({
                    ...m,
                    skills: replaceAt(m.skills, i, {
                      ...m.skills[i],
                      skills: v.split(",").map((x) => x.trim()).filter(Boolean),
                    }),
                  }))
                }
              />
            </div>
          ))}
        </div>
      );
    }

    case "experience":
      return model.experience.length ? (
        <div className="space-y-2">
          {model.experience.map((e, i) => {
            const setRole = (patch: Partial<typeof e>) =>
              edit?.((m) => ({ ...m, experience: replaceAt(m.experience, i, { ...m.experience[i], ...patch }) }));
            return (
              <div key={i}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-bold text-gray-900">
                    <Editable value={e.company ?? ""} placeholder="Company" onCommit={(v) => setRole({ company: v })} />
                    {(e.location || edit) && (
                      <>
                        {", "}
                        <Editable value={e.location ?? ""} placeholder="Location" onCommit={(v) => setRole({ location: v })} />
                      </>
                    )}
                  </span>
                  <span className="whitespace-nowrap text-[10.5px] font-semibold text-gray-700">
                    <Editable value={e.startDate ?? ""} placeholder="Start" onCommit={(v) => setRole({ startDate: v })} />
                    {" – "}
                    <Editable value={e.endDate ?? ""} placeholder="End" onCommit={(v) => setRole({ endDate: v })} />
                  </span>
                </div>
                {(e.title || edit) && (
                  <div className="text-[11px] italic text-gray-700">
                    <Editable value={e.title ?? ""} placeholder="Title" onCommit={(v) => setRole({ title: v })} />
                  </div>
                )}
                <ul className="ml-4 list-disc space-y-0.5">
                  {e.bullets.map((b, j) => (
                    <li key={j} className="group text-justify text-[11px] leading-snug text-gray-800">
                      <Editable
                        value={b}
                        rich={bulletHtml(b)}
                        onCommit={(v) => setRole({ bullets: replaceAt(e.bullets, j, v) })}
                      />
                      <BulletControls onDelete={() => setRole({ bullets: e.bullets.filter((_, x) => x !== j) })} />
                    </li>
                  ))}
                </ul>
                <AddBullet onAdd={() => setRole({ bullets: [...e.bullets, "New point"] })} />
                {(e.environment || edit) && (
                  <div className="mt-0.5 text-[10.5px] text-gray-700">
                    <span className="font-semibold">{tmpl.environmentLabel ?? "Environment"}:</span>{" "}
                    <Editable
                      value={e.environment ?? ""}
                      placeholder="Technologies"
                      onCommit={(v) => setRole({ environment: v })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null;

    case "education":
      if (tmpl.educationWithCertifications) {
        // One heading covers both, so the certificates follow the degrees.
        return (
          <>
            {model.education.length > 0 && <EducationList model={model} />}
            {model.certifications.length > 0 && <CertificationList model={model} />}
          </>
        );
      }
      if (!model.education.length) return null;
      if (tmpl.educationTable) {
        const cols: (keyof ResumeModel["education"][number])[] = [
          "degree", "areaOfStudy", "school", "location", "awarded", "date",
        ];
        return (
          <table className="w-full border-collapse text-[9.5px]">
            <thead>
              <tr className="bg-gray-100">
                {["Degree", "Area of Study", "School / University", "Location", "Awarded?", "Date"].map((h) => (
                  <th key={h} className="border border-gray-300 px-1 py-0.5 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.education.map((e, i) => (
                <tr key={i}>
                  {cols.map((col) => (
                    <td key={col} className="border border-gray-300 px-1 py-0.5 align-top">
                      <Editable
                        value={e[col] ?? ""}
                        onCommit={(v) =>
                          edit?.((m) => ({ ...m, education: replaceAt(m.education, i, { ...m.education[i], [col]: v }) }))
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      return <EducationList model={model} />;

    case "certifications":
      if (tmpl.educationWithCertifications) return null; // shown under education
      if (!model.certifications.length) return null;
      if (tmpl.certificationsTable) {
        const cols: ("name" | "issuer" | "date")[] = ["name", "issuer", "date"];
        return (
          <table className="w-full border-collapse text-[9.5px]">
            <thead>
              <tr className="bg-gray-100">
                {["Certification", "Issued By", "Date Obtained", "Certification Number", "Expiration Date"].map((h) => (
                  <th key={h} className="border border-gray-300 px-1 py-0.5 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.certifications.map((c, i) => (
                <tr key={i}>
                  {cols.map((col) => (
                    <td key={col} className="border border-gray-300 px-1 py-0.5 align-top">
                      <Editable
                        value={c[col] ?? ""}
                        onCommit={(v) =>
                          edit?.((m) => ({
                            ...m,
                            certifications: replaceAt(m.certifications, i, { ...m.certifications[i], [col]: v }),
                          }))
                        }
                      />
                    </td>
                  ))}
                  {/* Not stated on a resume; left for the recruiter. */}
                  <td className="border border-gray-300 px-1 py-0.5" />
                  <td className="border border-gray-300 px-1 py-0.5" />
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      return <CertificationList model={model} />;

    case "projects":
      return model.projects.length ? (
        <div className="space-y-1.5">
          {model.projects.map((p, i) => {
            const setProject = (patch: Partial<typeof p>) =>
              edit?.((m) => ({ ...m, projects: replaceAt(m.projects, i, { ...m.projects[i], ...patch }) }));
            return (
              <div key={i}>
                <div className="text-[11px] font-bold text-gray-900">
                  <Editable value={p.name} onCommit={(v) => setProject({ name: v })} />
                </div>
                {(p.description || edit) && (
                  <div className="text-[11px] leading-snug text-gray-800">
                    <Editable
                      value={p.description ?? ""}
                      placeholder="Description"
                      onCommit={(v) => setProject({ description: v })}
                    />
                  </div>
                )}
                {p.bullets.length > 0 && (
                  <ul className="ml-4 list-disc space-y-0.5">
                    {p.bullets.map((b, j) => (
                      <li key={j} className="group text-justify text-[11px] leading-snug text-gray-800">
                        <Editable value={b} rich={bulletHtml(b)} onCommit={(v) => setProject({ bullets: replaceAt(p.bullets, j, v) })} />
                        <BulletControls onDelete={() => setProject({ bullets: p.bullets.filter((_, x) => x !== j) })} />
                      </li>
                    ))}
                  </ul>
                )}
                <AddBullet onAdd={() => setProject({ bullets: [...p.bullets, "New point"] })} />
              </div>
            );
          })}
        </div>
      ) : null;

    case "additional":
      return model.additional ? (
        <p className="text-[11px] leading-snug text-gray-800">
          <Editable value={model.additional} onCommit={(v) => edit?.((m) => ({ ...m, additional: v }))} />
        </p>
      ) : null;

    default:
      return null;
  }
}

/** Degrees as plain lines, used wherever the template has no education table. */
function EducationList({ model }: { model: ResumeModel }) {
  const edit = useContext(EditContext);
  return (
    <div className="space-y-0.5">
      {model.education.map((e, i) => {
        const set = (patch: Partial<typeof e>) =>
          edit?.((m) => ({ ...m, education: replaceAt(m.education, i, { ...m.education[i], ...patch }) }));
        return (
          <div key={i} className="text-[11px] leading-snug">
            <span className="font-semibold">
              <Editable value={e.degree ?? ""} placeholder="Degree" onCommit={(v) => set({ degree: v })} />
              {", "}
              <Editable value={e.areaOfStudy ?? ""} placeholder="Area of study" onCommit={(v) => set({ areaOfStudy: v })} />
            </span>
            {" — "}
            <Editable value={e.school ?? ""} placeholder="School" onCommit={(v) => set({ school: v })} />
            {", "}
            <Editable value={e.location ?? ""} placeholder="Location" onCommit={(v) => set({ location: v })} />
            {" ("}
            <Editable value={e.date ?? ""} placeholder="Date" onCommit={(v) => set({ date: v })} />
            {")"}
          </div>
        );
      })}
    </div>
  );
}

function CertificationList({ model }: { model: ResumeModel }) {
  const edit = useContext(EditContext);
  return (
    <ul className="ml-4 mt-1 list-disc space-y-0.5">
      {model.certifications.map((c, i) => {
        const set = (patch: Partial<typeof c>) =>
          edit?.((m) => ({ ...m, certifications: replaceAt(m.certifications, i, { ...m.certifications[i], ...patch }) }));
        return (
          <li key={i} className="group text-[11px] leading-snug text-gray-800">
            <Editable value={c.name} onCommit={(v) => set({ name: v })} />
            {" — "}
            <Editable value={c.issuer ?? ""} placeholder="Issuer" onCommit={(v) => set({ issuer: v })} />
            {", "}
            <Editable value={c.date ?? ""} placeholder="Date" onCommit={(v) => set({ date: v })} />
            <BulletControls
              onDelete={() => edit?.((m) => ({ ...m, certifications: m.certifications.filter((_, j) => j !== i) }))}
            />
          </li>
        );
      })}
    </ul>
  );
}

function hasBody(k: SectionKey, model: ResumeModel, tmplId: TemplateId): boolean {
  switch (k) {
    case "summary": return Boolean(model.summary) || (model.summaryBullets?.length ?? 0) > 0;
    case "skills": return model.skills.length > 0;
    case "experience": return model.experience.length > 0;
    case "education":
      // The CAI heading covers certificates too, so either one fills it.
      return getTemplate(tmplId).educationWithCertifications
        ? model.education.length > 0 || model.certifications.length > 0
        : model.education.length > 0;
    case "certifications":
      if (getTemplate(tmplId).educationWithCertifications) return false;
      return model.certifications.length > 0;
    case "projects": return model.projects.length > 0;
    case "additional": return Boolean(model.additional);
    default: return false;
  }
}

/**
 * The CAI letterhead: the navy bar (a running header in the export, so it is
 * drawn once here), the title, the contract line and the programme contacts.
 * None of it is editable — it is the client's letterhead, not the candidate's.
 */
function CaiCover({ tmplId }: { tmplId: TemplateId }) {
  const cai = getTemplate(tmplId).cai;
  if (!cai) return null;
  return (
    <div className="mb-3">
      <div className="flex items-stretch text-white">
        <div className="flex-1 px-3 py-1.5" style={{ backgroundColor: `#${CAI_NAVY}` }}>
          <span className="text-[13px] font-bold">CAI</span>
          <span className="ml-2 text-[9px]" style={{ color: "#D8E3EF" }}>
            {cai.headerLabel} — Resume Template
          </span>
        </div>
        <div className="flex items-center px-3 py-1.5 text-[8px]" style={{ backgroundColor: `#${CAI_TEAL}` }}>
          Managed Services Program
        </div>
      </div>
      <div className="mt-2 pb-0.5 text-[20px] font-bold" style={{ color: `#${CAI_NAVY}`, borderBottom: `0.75px solid #${CAI_BLUE}` }}>
        CAI Resume Template
      </div>
      <div className="mt-1 text-[9px] font-bold" style={{ color: `#${CAI_BLUE}` }}>{cai.contractLine}</div>
      {cai.contacts.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-bold" style={{ color: `#${CAI_NAVY}` }}>CAI Program Contact</div>
          {cai.contacts.map((c, i) => (
            <div key={c.email} className="mt-0.5 text-[9px] text-[#222]">
              {i > 0 && <div className="text-gray-500">or</div>}
              <span className="font-bold">{c.name}</span>
              <span className="ml-2">Phone: {c.phone}</span>
              <span className="ml-2">Email: {c.email}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ k, model, tmplId }: { k: SectionKey; model: ResumeModel; tmplId: TemplateId }) {
  const tmpl = getTemplate(tmplId);
  const edit = useContext(EditContext);
  const setContact = (patch: Partial<ResumeModel["contact"]>) =>
    edit?.((m) => ({ ...m, contact: { ...m.contact, ...patch } }));

  // Un-headed identity fields.
  switch (k) {
    case "header":
      return tmpl.cai ? <CaiCover tmplId={tmplId} /> : null;
    case "name":
      return (
        <div
          className={tmpl.cai ? "mt-4 text-center text-[16px] font-bold leading-tight" : "text-center text-[17px] font-bold leading-tight"}
          style={{ color: `#${tmpl.cai ? CAI_NAVY : tmpl.accent}` }}
        >
          <Editable
            value={model.name ?? ""}
            placeholder="Candidate Name"
            onCommit={(v) => edit?.((m) => ({ ...m, name: v }))}
          />
        </div>
      );
    case "contact": {
      // CAI asks for the location alone, centred under the name.
      if (tmpl.cai) {
        return (model.contact.location || edit) ? (
          <div className="mt-0.5 text-center text-[11px] font-bold" style={{ color: `#${CAI_BLUE}` }}>
            <Editable value={model.contact.location ?? ""} placeholder="City, State" onCommit={(v) => setContact({ location: v })} />
          </div>
        ) : null;
      }
      // Ohio ITSA submissions omit phone / email / LinkedIn — location only.
      if (tmpl.hideContactDetails) {
        return (model.contact.location || edit) ? (
          <div className="mt-0.5 text-center text-[11px]">
            <span className="font-semibold">Current location:</span>{" "}
            <Editable value={model.contact.location ?? ""} placeholder="City, State" onCommit={(v) => setContact({ location: v })} />
          </div>
        ) : null;
      }
      const fields: [keyof ResumeModel["contact"], string][] = [
        ["location", "Location"], ["phone", "Phone"], ["email", "Email"],
        ["linkedin", "LinkedIn"], ["website", "Website"],
      ];
      const shown = edit ? fields : fields.filter(([key]) => model.contact[key]);
      return shown.length ? (
        <div className="mt-0.5 text-center text-[10.5px] text-gray-600">
          {shown.map(([key, label], i) => (
            <span key={key}>
              {i > 0 && "  |  "}
              <Editable value={model.contact[key] ?? ""} placeholder={label} onCommit={(v) => setContact({ [key]: v })} />
            </span>
          ))}
        </div>
      ) : null;
    }
    case "title":
      // Ohio ITSA renders title and requisition together, under "requisition".
      if (tmpl.titleAndRequisitionOnOneLine) return null;
      return (model.title || edit) ? (
        <div className="mt-0.5 text-[11px]">
          <span className="font-semibold">Title / Role:</span>{" "}
          <Editable value={model.title ?? ""} placeholder="Title / Role" onCommit={(v) => edit?.((m) => ({ ...m, title: v }))} />
        </div>
      ) : null;
    case "requisition": {
      const reqLabel = tmpl.requisitionLabel ?? "VectorVMS Requisition Number";
      if (tmpl.titleAndRequisitionOnOneLine) {
        return (
          <div className="mt-2 space-y-0.5 text-[11px]">
            <div className="flex justify-between font-bold" style={{ color: `#${tmpl.accent}` }}>
              <span>Title/Role:</span>
              <span>{reqLabel}:</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900">
              <Editable value={model.title ?? ""} placeholder="—" onCommit={(v) => edit?.((m) => ({ ...m, title: v }))} />
              <Editable
                value={model.requisitionNumber ?? ""}
                placeholder="Not Available"
                onCommit={(v) => edit?.((m) => ({ ...m, requisitionNumber: v }))}
              />
            </div>
          </div>
        );
      }
      return (
        <div className="mt-0.5 text-[11px]">
          <span className="font-semibold">{reqLabel}:</span>{" "}
          <Editable
            value={model.requisitionNumber ?? ""}
            placeholder="Not Available"
            onCommit={(v) => edit?.((m) => ({ ...m, requisitionNumber: v }))}
          />
        </div>
      );
    }
    default:
      break;
  }

  if (!hasBody(k, model, tmplId)) return null;

  return (
    <>
      <Heading label={labelFor(k, tmplId)} tmplId={tmplId} />
      <SectionBody k={k} model={model} tmplId={tmplId} />
    </>
  );
}

/** Section keys that render above the Covendis box rather than inside it. */
const IDENTITY_KEYS: SectionKey[] = ["header", "name", "contact", "title", "requisition"];

export function ResumePreview({
  model,
  tmplId,
  onChange,
}: {
  model: ResumeModel;
  tmplId: TemplateId;
  /** Supply this to let the document be typed into directly. */
  onChange?: (next: ResumeModel) => void;
}) {
  const tmpl = getTemplate(tmplId);
  const edit = useMemo<Edit | null>(
    () => (onChange ? (updater) => onChange(updater(model)) : null),
    [onChange, model],
  );

  return (
    <EditContext.Provider value={edit}>
      <div
        className="mx-auto w-full max-w-[850px] bg-white px-8 py-7 shadow-sm [&_[contenteditable]:empty]:before:text-gray-400 [&_[contenteditable]:empty]:before:content-[attr(data-placeholder)]"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        {tmpl.repeatingLogo && (
          <div className="mb-3 border-b border-gray-200 pb-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ohio-itsa-logo.png" alt="OST — OHIO ITSA — Information Technology Staff Augmentation" className="mx-auto h-9 w-auto object-contain" />
            <div className="mt-1 text-[8px] uppercase tracking-wide text-gray-400">Logo repeats on every page in the exported document</div>
          </div>
        )}
        {tmpl.boxedSections ? (
          /* The frame is a page border in the DOCX — Word repeats it on every
             page — so here it wraps the page content, with a rule between
             sections. */
          <div className="border p-3" style={{ borderColor: `#${tmpl.accent}` }}>
            {tmpl.order.filter((k) => IDENTITY_KEYS.includes(k)).map((k) => (
              <Section key={k} k={k} model={model} tmplId={tmplId} />
            ))}
            {tmpl.order
              .filter((k) => !IDENTITY_KEYS.includes(k) && hasBody(k, model, tmplId))
              .map((k, i) => (
                <div key={k} className={i > 0 ? "mt-2 border-t pt-2" : "mt-2"} style={{ borderColor: `#${tmpl.accent}` }}>
                  <Section k={k} model={model} tmplId={tmplId} />
                </div>
              ))}
          </div>
        ) : (
          tmpl.order.map((k) => <Section key={k} k={k} model={model} tmplId={tmplId} />)
        )}
      </div>
    </EditContext.Provider>
  );
}
