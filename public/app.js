// SPECTER, Frontend JS
// Handles: website question form submission, Stripe checkout redirect

// ---- QUESTION FORM ----
const demoForm = document.getElementById('demoRequestForm');
const demoSuccess = document.getElementById('demoSuccess');

if (demoForm) {
  demoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      name:  demoForm.name.value,
      email: demoForm.email.value,
      team:  demoForm.team.value,
    };
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        demoForm.style.display = 'none';
        demoSuccess.style.display = 'block';
      } else {
        alert('Submission failed. Please email support@specter-imaging.com directly.');
      }
    } catch {
      alert('Network error. Please email support@specter-imaging.com directly.');
    }
  });
}

// ---- STRIPE CHECKOUT ----
const checkoutButtons = document.querySelectorAll('[data-checkout-product]');
checkoutButtons.forEach((checkoutBtn) => checkoutBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  const original = checkoutBtn.textContent;
  checkoutBtn.textContent = 'INITIALIZING...';
  checkoutBtn.style.pointerEvents = 'none';
  checkoutBtn.disabled = true;
  try {
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: checkoutBtn.dataset.checkoutProduct || 'imaging' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || 'No checkout URL returned');
    window.location.href = data.url;
  } catch (error) {
    checkoutBtn.textContent = original;
    checkoutBtn.style.pointerEvents = 'auto';
    checkoutBtn.disabled = false;
    alert(error.message || 'Checkout failed to initialize. Please try again.');
  }
}));

/* ---- SCREENSHOT LIGHTBOX ---- */
(function () {
  // Build the lightbox container once, on any page.
  var lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('aria-hidden', 'true');
  lb.innerHTML =
    '<button class="lb-close" aria-label="Close">&times;</button>' +
    '<figure class="lb-figure">' +
      '<img class="lb-img" alt="" />' +
      '<figcaption class="lb-cap"></figcaption>' +
    '</figure>' +
    '<div class="lb-hint">Click anywhere or press Esc to close</div>';
  document.body.appendChild(lb);

  var lbImg = lb.querySelector('.lb-img');
  var lbCap = lb.querySelector('.lb-cap');
  var lbClose = lb.querySelector('.lb-close');

  function openLb(src, cap) {
    if (!src) return;
    lbImg.src = src;
    lbImg.alt = cap || '';
    lbCap.textContent = cap || '';
    lbCap.style.display = cap ? 'block' : 'none';
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeLb() {
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(function () { lbImg.src = ''; }, 200);
  }

  // Any screenshot figure image is zoomable. data-full overrides src if present.
  document.querySelectorAll('.screen-shot, .vm-shot').forEach(function (fig) {
    var img = fig.querySelector('img');
    if (!img) return;
    fig.style.cursor = 'zoom-in';
    fig.addEventListener('click', function (e) {
      e.preventDefault();
      var cap = fig.querySelector('figcaption');
      var full = fig.getAttribute('data-full') || img.currentSrc || img.src;
      openLb(full, cap ? cap.textContent : (img.alt || ''));
    });
  });

  lbClose.addEventListener('click', closeLb);
  lb.addEventListener('click', function (e) { if (e.target !== lbImg && e.target !== lbCap) closeLb(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lb.classList.contains('open')) closeLb();
  });
})();
