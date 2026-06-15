/**
 * Admin — policy knowledge base for the Policy Assistant chatbot.
 */
(function () {
  window.HRMS = window.HRMS || {};

  HRMS.initPolicyChatAdmin = function initPolicyChatAdmin(api) {
    const form = document.getElementById('policyChatUploadForm');
    const fileInput = document.getElementById('policyChatFile');
    const msg = document.getElementById('policyChatMessage');
    const body = document.getElementById('policyChatDocsBody');
    if (!form || !body) return;

    async function loadList() {
      body.innerHTML = '<tr><td colspan="3" class="stat-sub">Loading…</td></tr>';
      try {
        const data = await api('/api/policies/knowledge');
        const docs = data.documents || [];
        if (!docs.length) {
          body.innerHTML =
            '<tr><td colspan="3" class="stat-sub">No documents uploaded yet. Upload PDF, TXT, or DOCX files for the chatbot.</td></tr>';
          return;
        }
        body.innerHTML = docs
          .map(
            (d) => `
          <tr>
            <td>${escapeHtml(d.filename)}</td>
            <td>${escapeHtml(formatDate(d.uploaded_at))}</td>
            <td><button type="button" class="btn btn-outline btn-sm policy-chat-del" data-id="${d.id}">Delete</button></td>
          </tr>`
          )
          .join('');
        body.querySelectorAll('.policy-chat-del').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (!id || !window.confirm('Delete this policy document from the chatbot knowledge base?')) return;
            try {
              await api(`/api/policies/knowledge/${id}`, { method: 'DELETE' });
              HRMS.toast('Document deleted', 'success');
              await loadList();
            } catch (e) {
              HRMS.toast(e.message || 'Delete failed', 'error');
            }
          });
        });
      } catch (e) {
        body.innerHTML = `<tr><td colspan="3" class="stat-sub">${escapeHtml(e.message || 'Could not load')}</td></tr>`;
      }
    }

    if (form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const file = fileInput?.files?.[0];
        if (!file) {
          HRMS.toast('Choose a file first', 'error');
          return;
        }
        const fd = new FormData();
        fd.append('file', file);
        if (msg) msg.textContent = 'Uploading…';
        try {
          const token = localStorage.getItem('token');
          const res = await fetch('/api/policies/knowledge/upload', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: fd,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || 'Upload failed');
          HRMS.toast(data.message || 'Uploaded', 'success');
          if (fileInput) fileInput.value = '';
          if (msg) msg.textContent = '';
          await loadList();
        } catch (e) {
          if (msg) msg.textContent = '';
          HRMS.toast(e.message || 'Upload failed', 'error');
        }
      });
    }

    loadList().catch(() => {});
  };

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(v) {
    if (HRMS.formatDisplayDate) return HRMS.formatDisplayDate(v);
    if (!v) return '—';
    return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
})();
