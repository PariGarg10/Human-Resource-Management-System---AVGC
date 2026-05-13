window.HRMS = window.HRMS || {};

HRMS.confirmModal = function confirmModal(message, onConfirm) {
  let backdrop = document.getElementById('hrms-modal');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'hrms-modal';
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog">
        <div class="modal-header">Confirm</div>
        <div class="modal-body" id="hrms-modal-body"></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="hrms-modal-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="hrms-modal-ok">OK</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
  }
  document.getElementById('hrms-modal-body').textContent = message;
  backdrop.classList.add('is-open');

  const close = () => backdrop.classList.remove('is-open');
  document.getElementById('hrms-modal-cancel').onclick = close;
  document.getElementById('hrms-modal-ok').onclick = () => {
    close();
    if (onConfirm) onConfirm();
  };
};
