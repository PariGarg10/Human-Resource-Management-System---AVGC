/**
 * Admin — initiate employee exit + modal.
 */
(function () {
  window.HRMS = window.HRMS || {};

  let pendingEmployee = null;

  function modalEl() {
    return document.getElementById('exitInitiateModal');
  }

  function openModal(employeeId, employeeName) {
    pendingEmployee = { id: employeeId, name: employeeName };
    const modal = modalEl();
    const title = document.getElementById('exitInitiateEmployeeName');
    const lwd = document.getElementById('exitInitiateLwd');
    const reason = document.getElementById('exitInitiateReason');
    const msg = document.getElementById('exitInitiateMessage');
    if (title) title.textContent = employeeName || 'Employee';
    if (lwd) lwd.value = '';
    if (reason) reason.value = '';
    if (msg) msg.textContent = '';
    if (modal) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeModal() {
    pendingEmployee = null;
    const modal = modalEl();
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  HRMS.openExitInitiateModal = openModal;

  HRMS.initExitAdmin = function initExitAdmin(api) {
    const form = document.getElementById('exitInitiateForm');
    const cancelBtn = document.getElementById('exitInitiateCancel');
    const modal = modalEl();

    if (cancelBtn && cancelBtn.dataset.bound !== '1') {
      cancelBtn.dataset.bound = '1';
      cancelBtn.addEventListener('click', closeModal);
    }
    if (modal && modal.dataset.bound !== '1') {
      modal.dataset.bound = '1';
      modal.addEventListener('click', (ev) => {
        if (ev.target === modal) closeModal();
      });
    }

    if (form && form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!pendingEmployee) return;
        const lwd = document.getElementById('exitInitiateLwd')?.value?.trim();
        const reason = document.getElementById('exitInitiateReason')?.value?.trim();
        const msg = document.getElementById('exitInitiateMessage');
        if (!lwd || !reason) {
          HRMS.toast('Last working day and reason are required', 'error');
          return;
        }
        if (msg) msg.textContent = 'Submitting…';
        try {
          await api('/api/exit/initiate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: pendingEmployee.id,
              lastWorkingDay: lwd,
              reason,
            }),
          });
          HRMS.toast('Exit process initiated', 'success');
          closeModal();
          document.getElementById('loadEmployeesBtn')?.click();
        } catch (e) {
          if (msg) msg.textContent = '';
          HRMS.toast(e.message || 'Could not initiate exit', 'error');
        }
      });
    }
  };
})();
