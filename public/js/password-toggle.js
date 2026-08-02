(function () {
  var EYE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';

  function enhancePasswordInput(input) {
    if (!input || input.type !== 'password') return;
    if (input.closest('.password-field-wrap')) return;
    if (input.dataset.passwordToggle === 'off') return;

    var wrap = document.createElement('div');
    wrap.className = 'password-field-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-toggle-btn';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = EYE;
    wrap.appendChild(btn);

    btn.addEventListener('click', function () {
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      btn.setAttribute('aria-pressed', showing ? 'false' : 'true');
      btn.innerHTML = showing ? EYE : EYE_OFF;
    });
  }

  function scan(root) {
    var scope = root || document;
    var inputs = scope.querySelectorAll('input[type="password"]');
    for (var i = 0; i < inputs.length; i += 1) {
      enhancePasswordInput(inputs[i]);
    }
  }

  function init() {
    scan(document);
    if (typeof MutationObserver === 'undefined') return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j += 1) {
          var node = nodes[j];
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches('input[type="password"]')) {
            enhancePasswordInput(node);
          }
          scan(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.HRMS = window.HRMS || {};
  window.HRMS.initPasswordToggles = scan;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
