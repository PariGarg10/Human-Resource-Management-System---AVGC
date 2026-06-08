/**
 * HRMS homepage — loads recognition cards from the API.
 */
(function () {
  function initials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function avatarHtml(person) {
    const ini = initials(person.name);
    const alt = esc(person.name);
    const image = person.image || person.imageUrl || '';
    if (!image) {
      return `
        <div class="home-person-card__avatar">
          <span class="home-person-card__initials" aria-hidden="true">${ini}</span>
        </div>
      `;
    }
    return `
      <div class="home-person-card__avatar">
        <img
          src="${esc(image)}"
          alt="${alt}"
          loading="lazy"
          onerror="this.classList.add('is-hidden'); this.nextElementSibling.removeAttribute('hidden');"
        />
        <span class="home-person-card__initials" hidden aria-hidden="true">${ini}</span>
      </div>
    `;
  }

  function personCard(person, variant) {
    return `
      <article class="home-person-card home-person-card--${variant}">
        ${avatarHtml(person)}
        <p class="home-person-card__name">${esc(person.name)}</p>
        <p class="home-person-card__designation">${esc(person.designation)}</p>
      </article>
    `;
  }

  function emptyMessage(text) {
    return `<p class="home-landing__empty">${esc(text)}</p>`;
  }

  async function loadRecognition() {
    const leadsEl = document.getElementById('homeTeamLeads');
    const employeesEl = document.getElementById('homeTopEmployees');
    if (!leadsEl && !employeesEl) return;

    try {
      const res = await fetch('/api/home-recognition');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not load');

      const teamLeads = data.teamLeads || [];
      const topEmployees = data.employees || [];

      if (leadsEl) {
        leadsEl.innerHTML = teamLeads.length
          ? teamLeads.map((p) => personCard(p, 'lead')).join('')
          : emptyMessage('No team leads added yet.');
      }
      if (employeesEl) {
        employeesEl.innerHTML = topEmployees.length
          ? topEmployees.map((p) => personCard(p, 'employee')).join('')
          : emptyMessage('No employees added yet.');
      }
    } catch (_err) {
      if (leadsEl) leadsEl.innerHTML = emptyMessage('Recognition list unavailable.');
      if (employeesEl) employeesEl.innerHTML = emptyMessage('Recognition list unavailable.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadRecognition);
  } else {
    loadRecognition();
  }
})();
