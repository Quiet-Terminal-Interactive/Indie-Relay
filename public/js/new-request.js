import { api } from './api.js';
import { requireAuth } from './auth.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
if (!requireAuth()) throw new Error('unauthed');
renderNav();

const PROMO_MIN = {
  social_shoutout: 1,
  community_crosspost: 1,
  short_form_video: 2,
  livestream: 3,
  long_form_video: 5,
  press_feature: 5,
};

const typeSelect = document.getElementById('promo-type');
const creditsInput = document.getElementById('credits-offered');
const minHint = document.getElementById('min-hint');

typeSelect.addEventListener('change', () => {
  const min = PROMO_MIN[typeSelect.value] ?? 1;
  creditsInput.min = min;
  if (Number(creditsInput.value) < min) creditsInput.value = min;
  minHint.textContent = `Minimum: ${min} credit${min !== 1 ? 's' : ''}`;
});

document.getElementById('request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const err = document.getElementById('form-error');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Posting…';

  try {
    const result = await api.post('/api/requests', {
      gameName: document.getElementById('game-name').value.trim(),
      gameUrl: document.getElementById('game-url').value.trim() || undefined,
      promoType: typeSelect.value,
      creditsOffered: Number(creditsInput.value),
      description: document.getElementById('description').value.trim() || undefined,
    });
    window.location.href = `/marketplace.html?posted=${result.id}`;
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false;
    btn.textContent = 'Post request';
  }
});
