/** Static portal guide injected into Maya (HR assistant) for onboarding help. */
const PLATFORM_GUIDE = `
AVGC HRMS portal — navigation and features (use for how-to questions; match the user's wording):

**First-time / onboarding**
- New employees must finish **Onboarding** in the sidebar before the full portal unlocks.
- Onboarding checklist: complete profile (personal details, emergency contact, bank info, Aadhar/PAN/cheque uploads), read company policies, complete POSH training, meet your team.
- **Profile** / **Settings** — update name, phone, DOB, location, photo, emergency contact, bank details, and upload documents.
- Change password when prompted under profile/settings.

**Employee sidebar modules**
- **Dashboard** — today's summary, leave balance, announcements, quick links.
- **Calendar** — personal/work calendar view.
- **Holiday calendar** — official company holidays (uploaded by HR).
- **Attendance** — monthly log, punch in/out history, working days.
- **Leave Management** — apply for casual/sick/earned/WFH leave; attach reason and dates; track status.
- **Leave history** — past approved/rejected/pending requests.
- **Payroll & payslips** — salary slips and payroll info (when enabled).
- **Asset management** — laptops/devices assigned to you.
- **Policies & important links** — official HR policy PDFs/links.
- **Performance** — quarterly OKRs, self-assessment forms, manager reviews, annual ratings.
- **Teams / Organization chart** — reporting structure and colleagues.
- **Employee directory** — search colleagues by name, see contact details and department.
- **Company social** — internal posts, celebrations, live activities.
- **Exit / Resignation** — submit notice and track clearance when leaving.

**Managers (extra modules)**
- **Team attendance** — view direct reports' attendance.
- **Leave approval** — approve or reject team leave requests.
- **Team performance** — review team OKRs and assessments.
- **Exit clearances** — manager clearance on resignations.

**Admins (extra modules)**
- People management, import employees, assign managers, employee documents.
- Holiday list upload, policy document management, POSH quiz setup.
- **Policy documents (chatbot)** — upload PDF/TXT/DOCX that Maya uses to answer policy questions.

**How to answer portal questions**
- Give step-by-step clicks using exact sidebar labels above.
- If the user asks casually ("where's my leave", "need to apply WFH", "payslip?"), interpret intent and guide them.
- For policy facts (leave count, notice period, conduct rules), use uploaded policy documents — not this guide alone.
`.trim();

module.exports = { PLATFORM_GUIDE };
