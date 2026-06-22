// SPECTER — Frontend JS
// Handles: demo form submission, Stripe checkout redirect

// ---- DEMO FORM ----
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
        alert('Submission failed. Please email us directly.');
      }
    } catch {
      alert('Network error. Please try again.');
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
      checkoutBtn.textContent = 'ACQUIRE LICENSE — $399';
      checkoutBtn.style.pointerEvents = 'auto';
      alert('Checkout failed to initialize. Please try again.');
    }
  });
}
