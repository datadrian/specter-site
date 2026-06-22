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
const checkoutBtn = document.getElementById('checkoutBtn');
if (checkoutBtn) {
  checkoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    checkoutBtn.textContent = 'INITIALIZING...';
    checkoutBtn.style.pointerEvents = 'none';
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No URL returned');
      }
    } catch {
      checkoutBtn.textContent = 'ACQUIRE LICENSE, $399';
      checkoutBtn.style.pointerEvents = 'auto';
      alert('Checkout failed to initialize. Please try again.');
    }
  });
}

/* ---- SCREENSHOT LIGHTBOX ---- */
(function () {
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  var lbImg = document.getElementById('lightboxImg');
  var lbCap = document.getElementById('lightboxCap');
  var lbClose = document.getElementById('lightboxClose');

  function openLb(src, caption) {
    lbImg.src = src;
    lbCap.textContent = caption || '';
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

  document.querySelectorAll('.screen-shot[data-full], .vm-shot[data-full]').forEach(function (fig) {
    fig.style.cursor = 'zoom-in';
    fig.addEventListener('click', function () {
      var cap = fig.querySelector('figcaption');
      openLb(fig.getAttribute('data-full'), cap ? cap.textContent : '');
    });
  });

  lbClose.addEventListener('click', closeLb);
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lb.classList.contains('open')) closeLb();
  });
})();
