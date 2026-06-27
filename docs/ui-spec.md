# Technical Interview Portal — UI Build Spec

Self-contained prompt to paste into Claude (artifacts / "Claude design") to build a
frontend that matches the current functionality of this app. It pins an exact design
system (light recruiter/admin UI, dark candidate-interview UI), badge color mapping,
scoring model, and every screen + state.

The product is **Technical Interview Portal (TIP)**, owned by **American Business
Solutions, Inc. (ABSI)** — the ABSI logo (embedded below) is the brand mark used in
every nav bar and auth/interview card. Wherever the prompt says "TIP logo / brand /
monogram", render the ABSI logo asset.

To regenerate one screen at a time (often better results), copy the DESIGN SYSTEM +
BRAND ASSETS + BADGE/SCORING/ROLES sections plus just the screen you want.

---

```
Build the frontend for "Technical Interview Portal" (TIP) — an AI-powered platform for screening job candidates with proctored, recorded, AI-scored technical interviews. Implement every screen and state below, faithfully matching the DESIGN SYSTEM. Use React + TypeScript + Tailwind (or your stack of choice), responsive, accessible.

=== DESIGN SYSTEM ===
Theme: clean, professional, trustworthy SaaS — LIGHT theme for all recruiter/admin/auth screens; DARK theme ONLY for the candidate live-interview screens (focus + proctoring).
Typography: 'IBM Plex Sans' for all UI text; 'IBM Plex Mono' for labels, metadata, timestamps, code, and small caps eyebrows (letter-spacing .05–.08em, uppercased).
Color tokens:
- Accent / primary: #2563eb (hover #1d4ed8). Dark/ink buttons: #0f172a.
- Surfaces (light): page bg #f4f6f9; cards #ffffff; card border #e7ebf0; inputs bg #f8fafc, border #dce2ea; focus ring border #2563eb + box-shadow 0 0 0 3px rgba(37,99,235,.14).
- Text: heading #0f172a; body #334155/#475569; muted #64748b; faint #94a3b8.
- Dark interview surfaces: bg #0f172a, panel #1a2740/#111c30, border #1e293b/#243352, editor bg #0b1220.
Radii: cards 14–18px; inputs/buttons 9–11px; pills/badges 5–7px. Shadows are soft and low (e.g. 0 12px 40px -16px rgba(15,23,42,.14)).
Components: top nav bar, cards, data tables (CSS grid rows), accordions, modals, toast/banner messages, stat cards, progress bars, dropdowns, candidate video player with Q1…Q10 selector.
Avoid: heavy gradients (except the 4 analytics stat cards), dark mode on recruiter screens, emoji outside the interview-level icons.

=== BRAND ASSETS / LOGO ===
The brand mark is the American Business Solutions, Inc. (ABSI) logo. Use this exact SVG anywhere the spec mentions the logo / brand / monogram (nav bars top-left, auth cards, interview pre-checks/complete cards, results footer). It is a horizontal logo on a white background, so on dark interview screens place it inside a small white rounded chip (radius 6px, padding 4px) so it stays legible.
Brand colors: ABSI navy #273c7c, ABSI orange #f36f21. These are the BRAND identity colors — keep the app's functional accent blue (#2563eb) for primary buttons/links, but you may use ABSI navy for the dark/ink elements and ABSI orange sparingly for a brand touch (e.g. the interview-level "Practical/Training" accents or a thin nav underline). Do not recolor the logo itself.

Logo SVG (use as-is; scale by width, preserve aspect ratio 220×86):
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 86" role="img" aria-label="American Business Solutions, Inc.">
  <rect width="220" height="86" fill="#ffffff"/>
  <text x="0" y="18" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#273c7c">American</text>
  <text x="43" y="40" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#273c7c">Business</text>
  <text x="83" y="62" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#273c7c">Solutions,Inc.</text>
  <path d="M161 43a17 17 0 0 1 31 10h-9a8 8 0 0 0-15-4z" fill="#f36f21"/>
  <text x="23" y="80" font-family="Arial, Helvetica, sans-serif" font-size="12" font-style="italic" font-weight="700" fill="#f36f21">Partnership Is Our Service Philosophy</text>
  <text x="206" y="80" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#f36f21">TM</text>
</svg>

Suggested logo sizing: nav bars ~h-9 (≈width 92px); auth/interview hero cards ~h-16 (≈width 164px); small footer ~h-8.

=== BADGE COLOR MAPPING (use everywhere) ===
Test status pills:
- Questions pending → amber: bg #fef3c7, text #b45309
- Questions approved / In progress → blue: bg #dbeafe, text #2563eb
- Invited → indigo: bg #e0e7ff, text #4f46e5
- Completed → green: bg #dcfce7, text #15803d
- Expired → gray: bg #f1f5f9, text #64748b
- Stopped (≥3 proctoring violations) → red: bg #fee2e2, text #dc2626
Level badges: Basic (amber), Intermediate (blue), Advanced (indigo), Practical (green), Training (slate).
Integrity severity: HIGH #dc2626, MEDIUM #d97706, LOW #64748b.

=== SCORING MODEL ===
- AI scores 0–10 internally; ALWAYS DISPLAY as X.X out of 5 (e.g. "4.0/5").
- Overall = average of answered questions; unanswered are excluded and shown as "Not answered / Not scored — no answer captured".
- Rating labels: Excellent (9+), Good (8+), Average (6+), Below Average (4+), Poor (<4), "No Answers" when nothing captured.
- Score text colors: green ≥4/5, amber ≥3/5, red <3/5.

=== ROLES ===
RECRUITER sees only their own candidates/tests. ADMIN sees everything + Admin Panel. Role shown as a small mono uppercase badge (e.g. "RECRUITER") next to the user name in the nav.

=== STATUS LIFECYCLE ===
QUESTIONS_PENDING → QUESTIONS_APPROVED → INVITED → IN_PROGRESS → COMPLETED, plus EXPIRED and a derived "STOPPED – Tab Changes" state.

=== DATA MODEL ===
- User: name, email, role (ADMIN/RECRUITER), isActive.
- Candidate: name, email, phone, optional resume (file or pasted text/URL).
- Test: jobTitle, jobDescription, level, status, inviteToken+expiry, shareToken, startedAt/completedAt, timeUsedSeconds, overallScore, overallRating.
- Question: order, questionText, category, expectedSummary, codeLanguageHint, videoUrl, transcript, codeResponse, aiScore, aiRationale.
- FraudEvent: type (screen/tab change, tab switch, window blur, fullscreen exit, copy/paste, rapid answer, multiple faces, no face, phone detected), severity, detail, timestamp.

=== SCREENS ===

1. LOGIN (/login) — centered card on a soft light gradient with blurred accent blobs. ABSI logo + "Technical Interview Portal" + "Sign in to your account". Email field; Password field with inline "Forgot password?" link above it (toggles a reset sub-panel: email → "Send reset email" → success). Error line ("Invalid email or password"). Primary "Sign in" (loading: "Signing in…"). Link "Don't have an account? Create account". Below the card: collapsible SYSTEM STATUS panel — green/red dot + "All systems operational"/"System issues detected", expands to 4 rows (Database, Firebase, AI Service, Auth Secret) each with status dot + message, plus Node version.

2. REGISTER (/register) — same style. Full name, Email, Password. "Create account". Link back to sign in.

3. DASHBOARD (/dashboard) — recruiter home. Top nav: ABSI logo left; right: Activity link, user name + role badge, Admin Panel link (admin only), Sign Out. Header "Candidates" + subtitle "Search by name, email, or phone number." + "Add Candidate" primary (+ icon). Search row: input ("Search candidates by name, email, or +1 phone") + Search + Clear (Clear shows only when query active). Table cols: Candidate (name link / email / phone stacked), Latest Test (job title), Status (status pill + red "Tab changes: N" pill when flagged), Actions (View / Schedule / Delete). Empty states: "No candidates yet" (CTA) and "No matching candidates". Delete → confirm modal ("This cannot be undone… all their tests and results will be permanently removed").

4. ADD/EDIT CANDIDATE (/candidates/new, /candidates/[id]/edit) — back link + centered card. Full name, Email, Phone (country dial-code <select> + number input), Resume (drag/drop upload PDF/DOCX ≤10MB with file chip + Remove, OR paste text/URL). Save + Cancel.

5. CANDIDATE PROFILE (/candidates/[id]) — back link. Header card: avatar initials, name, email · phone; right action stack: Edit link, Delete link, "Schedule Test" primary. Resume section (download chip or pasted text). Test History: list of cards — job title, "level · date", status pill, contextual action (Review / Resend Invite / Results), and score X.X/5 when available.

6. SCHEDULE / CREATE TEST (/tests/new) — back link + centered card "Schedule Technical Interview". Searchable candidate picker dropdown (name + email rows, per-row edit/delete icons on hover, "+ Add new candidate" footer; edit→modal, delete→confirm). Job Title (becomes optional "Session Name" when TRAINING). Job Description textarea (hidden when TRAINING). Interview Level — 2-col grid of selectable cards each with icon + label + description: Basic 📘, Intermediate 📗, Advanced 📕, Practical 💻, Training 🎯 (full-width). When TRAINING: highlighted panel with "Training Questions" textarea (one per line) + "Upload Questions File" (PDF/DOCX/TXT/MD/CSV) showing "Loaded <filename>" + Remove. Submit "Generate Questions" (or "Create Training Questions"; loading "Generating questions with AI…"). After generation: success card "10 questions generated!" + collapsible "AI Conversation Log" with 3 color-coded mono sections (System / User / AI Response) + "Review & Edit Questions →". Always generate exactly 10.

7. REVIEW QUESTIONS (/tests/[id]/review-questions) — back link + header card "<Candidate> — <Job Title>" + colored LEVEL badge + helper text (changes in resend mode). Optional collapsible AI Conversation Log(s). 10 editable question cards: "Q#" + category badge + optional "Code: <lang>" badge + "Edited" badge; editable textarea; "Show/Hide expected answer summary" toggle revealing a green model-answer box. "Invite Link Validity" panel: number input + unit <select> (Minutes/Hours/Days), shows current expiry. Footer: primary "Approve & Send Invite" (or "Resend Invite Email") + secondary "Regenerate All Questions" (confirm before replacing); on error surface a manual invite link.

8. TEST RESULTS (/tests/[id]) and public share (/results/share/[shareToken]) — top nav back-to-dashboard; a "Review Questions / Resend Invite" pill for pending/invited; green success banner after invite sent. Header card: name, "Job Title • LEVEL", completion timestamp + duration (e.g. "30m 10s"); right: large overall "X.X/5" + colored rating label with glow — OR a "Not Scored / No answers captured" block. Buttons: "Copy Share Link", "Send Performance Email", "Re-run AI Scoring". Warning banners ("No answers were captured…", "Candidate changed tabs/windows/fullscreen N times"). INTEGRITY REPORT card (collapsible, only if violations): header with HIGH/MED/LOW counts; expanded color-coded event list (type, detail, timestamp). CANDIDATE VIDEO card: player + Q1…Q10 selector buttons + "Question N recording" caption (fallback text when none). QUESTION RESPONSES accordion (all 10): collapsed row = "Q#" + question + category badge + "X/5" (or amber "Not answered" pill); expanded = full question, green "Expected Answer" box, per-question video player, "Transcript" box, monospace "Code Response" block when present, and an AI score box with rationale (blue when scored, amber "Not scored" otherwise).

9. ADMIN PANEL (/admin) — admin only. Nav + tab pills Users / Tests / Analytics.
   • USERS: "Recruiters" + "Create Recruiter" (inline 3-field form: Name, Email, Password). Table: Name, Email, Tests (count), Status (Active/Inactive badge), Actions (Deactivate/Reactivate).
   • TESTS: "All Tests" table: Candidate (link), Position, Level, Status, Score (X.X/5), Recruiter.
   • ANALYTICS: 4 gradient stat cards (Total Candidates 👥 blue→indigo, Tests Completed ✅ green, Tests This Month 📝 sky, Fraud Events 🛡️ red); then "Average Score by Level" with a horizontal bar per level (Basic/Intermediate/Advanced/Practical) showing avg/5 + test count (bar color amber if avg <3.5/5).

10. ACTIVITY (/activity) — nav (Candidates / Activity / user). Header "Recruiter Activity" + "Schedule Test". 4 stat cards: Invited (indigo), In Progress (blue), Completed (green), Integrity Flags (red). Filter bar: search + status <select> (All + every status) + Filter/Clear. Wide table: Sent By (recruiter name+email), Candidate (name/email/phone), Test (title + level badge + "N Q" badge), Status (badge + "Tab: N" badge), Timeline (Created/Started/Done timestamps), Score (X.X/5 + rating), Links (Details, Review/Invite, Copy Invite / Copy Result by status).

11. CANDIDATE PRE-CHECKS (/interview/[token], phase prechecks) — NO LOGIN. Centered card on light gradient. ABSI brand + "<Candidate> — <Job Title> (LEVEL)". Optional blue "previous session interrupted — reconnect to resume" banner. Amber "Interview Rules" panel: camera+mic active throughout; stay fullscreen; tab/window/fullscreen switches detected, repeated violations stop the interview; copy-paste disabled; face must stay visible; no second device/phone; monitored & recorded (shorter mobile variant). "Camera Setup": "Ready" badge once granted; "Allow Camera & Microphone" button (states "Opening Camera…", "Try Camera Again"); live self-view preview; RED error messages for permission denied, no device, device in use, missing browser support, insecure (non-HTTPS) context. Required "I understand and agree to all interview conditions" checkbox. Info line "10 questions • 3 min per question • 30-minute total limit • Chrome or Edge required". "Begin Interview" DISABLED until BOTH agreement checked AND camera+mic confirmed; red helper text when blocked for camera.

12. INTERVIEW SCREEN (phase interview) — DARK theme. First a start-warning modal "Stay on this interview screen" + "I Understand". Top bar: ABSI logo (white chip), "Question X of N", integrity-warning badge if violations, per-question countdown ("This Q" mm:ss; amber <60s, red <30s), total countdown ("Total" mm:ss; red <5min).
   A) NON-PRACTICAL (spoken): centered column — question card (mono category eyebrow + large question text), red "● Recording your spoken response" indicator with live transcript preview, small self-view in corner, per-question progress bar, "Next Question →" / "Submit Interview" (loading "Uploading…") + upload error text.
   B) PRACTICAL (coding): split view — LEFT Monaco-style code editor (language from question, line numbers), RIGHT self-view on top, question text, progress bar, Next/Submit.
   Proctoring overlays: "Fullscreen Violation" overlay + "Return to Fullscreen"; red proctoring-notice modal (title/message) with either "Submitting interview…" terminal state or "I Understand - Return to Interview". Auto-submit when the 30-min total timer expires. Each question records continuous video + speech-to-text transcript. Persist interview progress to survive reconnect.

13. INTERVIEW COMPLETE (/interview/[token]/complete) — centered card, green check badge: "Interview Submitted!" + thank-you ("The recruiter will review your responses…") + note that unreached questions won't count, + ABSI brand.

=== DELIVERABLE ===
A cohesive component library (nav, cards, badges, buttons primary/secondary/danger, inputs, tables, accordions, modals, banners/toasts, stat cards, progress bars, video player + Q selector) with realistic placeholder data. Fully responsive: recruiter tables collapse gracefully on mobile; the candidate interview must work on phones. Prioritize clarity, trust, and recruiter efficiency.
```
