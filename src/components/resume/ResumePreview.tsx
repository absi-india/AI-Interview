import { getTemplate, SECTION_LABEL, type SectionKey } from "@/lib/resume-formatting/templates";
import type { ResumeModel, TemplateId } from "@/lib/resume-formatting/types";

// On-screen approximation of the exported document. The DOCX export
// (src/lib/resume-formatting/docx.ts) mirrors this layout.

function Heading({ label, tmplId }: { label: string; tmplId: TemplateId }) {
  const tmpl = getTemplate(tmplId);
  if (!label) return null;
  if (tmpl.blueHeadingBoxes) {
    return (
      <div
        className="mt-3 mb-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
        style={{ backgroundColor: `#${tmpl.accent}` }}
      >
        {label}
      </div>
    );
  }
  return (
    <div
      className="mt-3 mb-1.5 border-b pb-0.5 text-[11px] font-bold uppercase tracking-wide"
      style={{ color: `#${tmpl.accent}`, borderColor: `#${tmpl.accent}` }}
    >
      {label}
    </div>
  );
}

function Section({ k, model, tmplId }: { k: SectionKey; model: ResumeModel; tmplId: TemplateId }) {
  const tmpl = getTemplate(tmplId);
  const label = SECTION_LABEL[k];

  switch (k) {
    case "header":
      return null;
    case "name":
      return (
        <div className="text-[17px] font-bold leading-tight" style={{ color: `#${tmpl.accent}` }}>
          {model.name || "Candidate Name"}
        </div>
      );
    case "contact": {
      const parts = [model.contact.location, model.contact.phone, model.contact.email, model.contact.linkedin, model.contact.website].filter(Boolean);
      if (!parts.length) return null;
      return <div className="mt-0.5 text-[10.5px] text-gray-600">{parts.join("  |  ")}</div>;
    }
    case "title":
      return model.title ? (
        <div className="mt-0.5 text-[11px]"><span className="font-semibold">Title / Role:</span> {model.title}</div>
      ) : null;
    case "requisition":
      return (
        <div className="mt-0.5 text-[11px]">
          <span className="font-semibold">VectorVMS Requisition Number:</span> {model.requisitionNumber || "Not Available"}
        </div>
      );
    case "summary":
      return model.summary ? (
        <>
          <Heading label={label} tmplId={tmplId} />
          <p className="text-[11px] leading-snug text-gray-800">{model.summary}</p>
        </>
      ) : null;
    case "skills":
      return model.skills.length ? (
        <>
          <Heading label={label} tmplId={tmplId} />
          <div className="space-y-0.5">
            {model.skills.map((s, i) => (
              <div key={i} className="text-[11px] leading-snug">
                <span className="font-semibold">{s.category}:</span> {s.skills.join(", ")}
              </div>
            ))}
          </div>
        </>
      ) : null;
    case "experience":
      return model.experience.length ? (
        <>
          <Heading label={label} tmplId={tmplId} />
          <div className="space-y-2">
            {model.experience.map((e, i) => (
              <div key={i}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-bold text-gray-900">{[e.company, e.location].filter(Boolean).join(", ")}</span>
                  <span className="whitespace-nowrap text-[10.5px] font-semibold text-gray-700">{[e.startDate, e.endDate].filter(Boolean).join(" – ")}</span>
                </div>
                {e.title && <div className="text-[11px] italic text-gray-700">{e.title}</div>}
                <ul className="ml-4 list-disc space-y-0.5">
                  {e.bullets.map((b, j) => (
                    <li key={j} className="text-[11px] leading-snug text-gray-800">{b}</li>
                  ))}
                </ul>
                {e.environment && <div className="mt-0.5 text-[10.5px] text-gray-700"><span className="font-semibold">Environment:</span> {e.environment}</div>}
              </div>
            ))}
          </div>
        </>
      ) : null;
    case "education":
      if (!model.education.length) return null;
      if (tmpl.educationTable) {
        return (
          <>
            <Heading label={label} tmplId={tmplId} />
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
                    {[e.degree, e.areaOfStudy, e.school, e.location, e.awarded, e.date].map((v, j) => (
                      <td key={j} className="border border-gray-300 px-1 py-0.5 align-top">{v || ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        );
      }
      return (
        <>
          <Heading label={label} tmplId={tmplId} />
          <div className="space-y-0.5">
            {model.education.map((e, i) => (
              <div key={i} className="text-[11px] leading-snug">
                <span className="font-semibold">{[e.degree, e.areaOfStudy].filter(Boolean).join(", ")}</span>
                {[e.school, e.location].filter(Boolean).length > 0 && <> — {[e.school, e.location].filter(Boolean).join(", ")}</>}
                {e.date && <> ({e.date})</>}
              </div>
            ))}
          </div>
        </>
      );
    case "certifications":
      return model.certifications.length ? (
        <>
          <Heading label={label} tmplId={tmplId} />
          <ul className="ml-4 list-disc space-y-0.5">
            {model.certifications.map((c, i) => (
              <li key={i} className="text-[11px] leading-snug text-gray-800">
                {c.name}{[c.issuer, c.date].filter(Boolean).length ? ` — ${[c.issuer, c.date].filter(Boolean).join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null;
    case "projects":
      return model.projects.length ? (
        <>
          <Heading label={label} tmplId={tmplId} />
          <div className="space-y-1.5">
            {model.projects.map((p, i) => (
              <div key={i}>
                <div className="text-[11px] font-bold text-gray-900">{p.name}</div>
                {p.description && <div className="text-[11px] leading-snug text-gray-800">{p.description}</div>}
                {p.bullets.length > 0 && (
                  <ul className="ml-4 list-disc space-y-0.5">
                    {p.bullets.map((b, j) => <li key={j} className="text-[11px] leading-snug text-gray-800">{b}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null;
    case "additional":
      return model.additional ? (
        <>
          <Heading label={label} tmplId={tmplId} />
          <p className="text-[11px] leading-snug text-gray-800">{model.additional}</p>
        </>
      ) : null;
    default:
      return null;
  }
}

export function ResumePreview({ model, tmplId }: { model: ResumeModel; tmplId: TemplateId }) {
  const tmpl = getTemplate(tmplId);
  return (
    <div className="mx-auto w-full max-w-[850px] bg-white px-8 py-7 shadow-sm" style={{ aspectRatio: "auto" }}>
      {tmpl.repeatingLogo && (
        <div className="mb-3 border-b border-gray-200 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ohio-itsa-logo.png" alt="OST — OHIO ITSA — Information Technology Staff Augmentation" className="h-9 w-auto object-contain" />
          <div className="mt-1 text-[8px] uppercase tracking-wide text-gray-400">Logo repeats on every page in the exported document</div>
        </div>
      )}
      {tmpl.order.map((k) => (
        <Section key={k} k={k} model={model} tmplId={tmplId} />
      ))}
    </div>
  );
}
