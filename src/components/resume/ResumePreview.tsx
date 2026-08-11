import { getTemplate, SECTION_LABEL, type SectionKey } from "@/lib/resume-formatting/templates";
import { splitBulletLabel } from "@/lib/resume-formatting/segment";
import type { ResumeModel, TemplateId } from "@/lib/resume-formatting/types";

/** Bullet text with its lead-in label emboldened, as in the source resume. */
function BulletText({ text }: { text: string }) {
  const split = splitBulletLabel(text);
  if (!split) return <>{text}</>;
  return (
    <>
      <span className="font-semibold">{split.label}</span>
      {split.rest}
    </>
  );
}

// On-screen approximation of the exported document. The DOCX export
// (src/lib/resume-formatting/docx.ts) mirrors this layout.

function Heading({ label, tmplId }: { label: string; tmplId: TemplateId }) {
  const tmpl = getTemplate(tmplId);
  if (!label) return null;
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
      className="mt-3 mb-1.5 border-b pb-0.5 text-[16px] font-bold uppercase tracking-wide"
      style={{ color: `#${tmpl.accent}`, borderColor: `#${tmpl.accent}` }}
    >
      {label}
    </div>
  );
}

/** Body of a headed section, without the heading. Returns null when empty. */
function SectionBody({ k, model, tmplId }: { k: SectionKey; model: ResumeModel; tmplId: TemplateId }) {
  const tmpl = getTemplate(tmplId);

  switch (k) {
    case "summary": {
      const bullets = model.summaryBullets ?? [];
      if (!model.summary && !bullets.length) return null;
      return (
        <>
          {model.summary && <p className="text-justify text-[11px] leading-snug text-gray-800">{model.summary}</p>}
          {bullets.length > 0 && (
            <ul className="ml-4 list-disc space-y-0.5">
              {bullets.map((b, i) => (
                <li key={i} className="text-justify text-[11px] leading-snug text-gray-800"><BulletText text={b} /></li>
              ))}
            </ul>
          )}
        </>
      );
    }

    case "skills":
      return model.skills.length ? (
        <div className="space-y-0.5">
          {model.skills.map((s, i) => (
            <div key={i} className="text-[11px] leading-snug">
              <span className="font-semibold">{s.category}:</span> {s.skills.join(", ")}
            </div>
          ))}
        </div>
      ) : null;

    case "experience":
      return model.experience.length ? (
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
                  <li key={j} className="text-justify text-[11px] leading-snug text-gray-800"><BulletText text={b} /></li>
                ))}
              </ul>
              {e.environment && (
                <div className="mt-0.5 text-[10.5px] text-gray-700"><span className="font-semibold">Environment:</span> {e.environment}</div>
              )}
            </div>
          ))}
        </div>
      ) : null;

    case "education":
      if (!model.education.length) return null;
      if (tmpl.educationTable) {
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
                  {[e.degree, e.areaOfStudy, e.school, e.location, e.awarded, e.date].map((v, j) => (
                    <td key={j} className="border border-gray-300 px-1 py-0.5 align-top">{v || ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      return (
        <div className="space-y-0.5">
          {model.education.map((e, i) => (
            <div key={i} className="text-[11px] leading-snug">
              <span className="font-semibold">{[e.degree, e.areaOfStudy].filter(Boolean).join(", ")}</span>
              {[e.school, e.location].filter(Boolean).length > 0 && <> — {[e.school, e.location].filter(Boolean).join(", ")}</>}
              {e.date && <> ({e.date})</>}
            </div>
          ))}
        </div>
      );

    case "certifications":
      return model.certifications.length ? (
        <ul className="ml-4 list-disc space-y-0.5">
          {model.certifications.map((c, i) => (
            <li key={i} className="text-[11px] leading-snug text-gray-800">
              {c.name}{[c.issuer, c.date].filter(Boolean).length ? ` — ${[c.issuer, c.date].filter(Boolean).join(", ")}` : ""}
            </li>
          ))}
        </ul>
      ) : null;

    case "projects":
      return model.projects.length ? (
        <div className="space-y-1.5">
          {model.projects.map((p, i) => (
            <div key={i}>
              <div className="text-[11px] font-bold text-gray-900">{p.name}</div>
              {p.description && <div className="text-[11px] leading-snug text-gray-800">{p.description}</div>}
              {p.bullets.length > 0 && (
                <ul className="ml-4 list-disc space-y-0.5">
                  {p.bullets.map((b, j) => <li key={j} className="text-justify text-[11px] leading-snug text-gray-800"><BulletText text={b} /></li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : null;

    case "additional":
      return model.additional ? <p className="text-[11px] leading-snug text-gray-800">{model.additional}</p> : null;

    default:
      return null;
  }
}

function hasBody(k: SectionKey, model: ResumeModel): boolean {
  switch (k) {
    case "summary": return Boolean(model.summary) || (model.summaryBullets?.length ?? 0) > 0;
    case "skills": return model.skills.length > 0;
    case "experience": return model.experience.length > 0;
    case "education": return model.education.length > 0;
    case "certifications": return model.certifications.length > 0;
    case "projects": return model.projects.length > 0;
    case "additional": return Boolean(model.additional);
    default: return false;
  }
}

function Section({ k, model, tmplId }: { k: SectionKey; model: ResumeModel; tmplId: TemplateId }) {
  const tmpl = getTemplate(tmplId);

  // Un-headed identity fields.
  switch (k) {
    case "header":
      return null;
    case "name":
      return (
        <div className="text-center text-[17px] font-bold leading-tight" style={{ color: `#${tmpl.accent}` }}>
          {model.name || "Candidate Name"}
        </div>
      );
    case "contact": {
      // Ohio ITSA submissions omit phone / email / LinkedIn — location only.
      if (tmpl.hideContactDetails) {
        return model.contact.location ? (
          <div className="mt-0.5 text-center text-[11px]"><span className="font-semibold">Current location:</span> {model.contact.location}</div>
        ) : null;
      }
      const parts = [model.contact.location, model.contact.phone, model.contact.email, model.contact.linkedin, model.contact.website].filter(Boolean);
      return parts.length ? <div className="mt-0.5 text-center text-[10.5px] text-gray-600">{parts.join("  |  ")}</div> : null;
    }
    case "title":
      // Ohio ITSA renders title and requisition together, under "requisition".
      if (tmpl.titleAndRequisitionOnOneLine) return null;
      return model.title ? (
        <div className="mt-0.5 text-[11px]"><span className="font-semibold">Title / Role:</span> {model.title}</div>
      ) : null;
    case "requisition":
      if (tmpl.titleAndRequisitionOnOneLine) {
        return (
          <div className="mt-2 space-y-0.5 text-[11px]">
            <div className="flex justify-between font-bold" style={{ color: `#${tmpl.accent}` }}>
              <span>Title/Role:</span>
              <span>Requisition Number:</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900">
              <span>{model.title || "—"}</span>
              <span>{model.requisitionNumber || "Not Available"}</span>
            </div>
          </div>
        );
      }
      return (
        <div className="mt-0.5 text-[11px]">
          <span className="font-semibold">VectorVMS Requisition Number:</span> {model.requisitionNumber || "Not Available"}
        </div>
      );
    default:
      break;
  }

  if (!hasBody(k, model)) return null;

  return (
    <>
      <Heading label={SECTION_LABEL[k]} tmplId={tmplId} />
      <SectionBody k={k} model={model} tmplId={tmplId} />
    </>
  );
}

/** Section keys that render above the Covendis box rather than inside it. */
const IDENTITY_KEYS: SectionKey[] = ["header", "name", "contact", "title", "requisition"];

export function ResumePreview({ model, tmplId }: { model: ResumeModel; tmplId: TemplateId }) {
  const tmpl = getTemplate(tmplId);
  return (
    <div
      className="mx-auto w-full max-w-[850px] bg-white px-8 py-7 shadow-sm"
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
            .filter((k) => !IDENTITY_KEYS.includes(k) && hasBody(k, model))
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
  );
}
