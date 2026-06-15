/** Static portal guide injected into Maya (HR assistant) for onboarding help. */
const PLATFORM_GUIDE = `
AVGC HRMS portal — how to get around (use this to help new employees):

**First-time setup**
- Complete **Onboarding** from the sidebar (required before full portal access).
- Update **Profile** with your details, emergency contact, and bank info.
- Change your password under **Settings** if prompted.

**Employee portal (sidebar)**
- **Dashboard** — attendance summary, announcements, leave balance, quick links.
- **Calendar / Holiday calendar** — view schedules and company holidays.
- **Attendance** — your monthly attendance log and punch history.
- **Leave Management** — apply for leave; **Leave history** shows past requests.
- **Asset management** — view IT assets assigned to you.
- **Policies & important links** — HR policy documents.
- **Performance** — quarterly OKRs, self-assessment, manager review, annual ratings.
- **Organization chart** — see team structure under **Teams**.
- **Company social** — internal social feed and activities.
- **Exit / Resignation** — submit separation requests when applicable.

**Managers additionally**
- **Team attendance**, **Leave approval**, **Team performance**, **Exit clearances**.

**Tips**
- Use the bell icon for HR notifications.
- Ask me (Maya) about policies, leave rules, or where to find something in the portal.
- If something is locked (e.g. self-assessment already submitted), contact HR for changes.
`.trim();

module.exports = { PLATFORM_GUIDE };
