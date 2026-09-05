// Futura — API client module
// Requires: auth.js loaded before this

async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(`${FUTURA_CONFIG.API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }

  return res.json();
}

var futuraApi = {
  profile: {
    get: () => apiFetch('/api/profile'),
    update: (body) => apiFetch('/api/profile', { method: 'PATCH', body: JSON.stringify(body) })
  },
  goals: {
    get: () => apiFetch('/api/goals'),
    upsert: (body) => apiFetch('/api/goals', { method: 'POST', body: JSON.stringify(body) })
  },
  contributions: {
    list: () => apiFetch('/api/contributions'),
    create: (body) => apiFetch('/api/contributions', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id) => apiFetch(`/api/contributions/${id}`, { method: 'DELETE' }),
    streak: () => apiFetch('/api/contributions/streak'),
    repairStreak: () => apiFetch('/api/contributions/repair-streak', { method: 'POST' })
  },
  projection: {
    calculate: (body) => apiFetch('/api/projection', { method: 'POST', body: JSON.stringify(body) }),
    roadmap: () => apiFetch('/api/projection/roadmap')
  },
  allocation: {
    get: () => apiFetch('/api/allocation')
  },
  zens: {
    purchase: (razorpay_payment_id) =>
      apiFetch('/api/zens/purchase', {
        method: 'POST',
        body: JSON.stringify({ razorpay_payment_id })
      }),
    spend: (amount) =>
      apiFetch('/api/zens/spend', {
        method: 'POST',
        body: JSON.stringify({ amount })
      }),
    add: (amount) =>
      apiFetch('/api/zens/credit', {
        method: 'POST',
        body: JSON.stringify({ amount })
      }),
    balance: () => apiFetch('/api/zens/balance')
  },
  subscriptions: {
    purchaseElite: (razorpay_payment_id) =>
      apiFetch('/api/subscriptions/purchase-elite', {
        method: 'POST',
        body: JSON.stringify({ razorpay_payment_id })
      })
  },
  holdings: {
    list: () => apiFetch('/api/holdings'),
    create: (body) => apiFetch('/api/holdings', { method: 'POST', body: JSON.stringify(body) }),
    sell: (id, body) => apiFetch(`/api/holdings/${id}/sell`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id) => apiFetch(`/api/holdings/${id}`, { method: 'DELETE' })
  }
};

/**
 * Recovery tokens: streak GET runs monthly refresh RPC — prefer it over profile snapshot.
 * Case-insensitive elite check: DB stores 'elite', but defensive guard added for future-proofing.
 * @param {Object} sub - User subscription data
 * @param {Object} [streakRes] - Result of futuraApi.contributions.streak() (optional)
 */
async function hydrateEliteSidebar(sub, streakRes) {
  // Case-insensitive comparison in case DB value has different casing
  const isElite = typeof sub?.entitlement === 'string' && sub.entitlement.toLowerCase() === 'elite';
  let streakPayload = streakRes;

  // Always try to get fresh streak data for Elite users — streak GET runs the monthly refresh RPC.
  // Only skip re-fetching if we already have valid data with a defined token count.
  const hasValidTokens = streakPayload?.streak?.recovery_tokens !== undefined
    && streakPayload?.streak?.recovery_tokens !== null;

  if (isElite && !hasValidTokens) {
    try {
      streakPayload = await futuraApi.contributions.streak();
    } catch (_) {
      streakPayload = null;
    }
  }

  // Resolve token count: prefer streak API (authoritative), then fall back to sub snapshot
  const tokenCount = isElite
    ? Number(
      streakPayload?.streak?.recovery_tokens !== undefined && streakPayload?.streak?.recovery_tokens !== null
        ? streakPayload.streak.recovery_tokens
        : (sub?.streak_recovery_tokens ?? 0)
    )
    : 0;

  const tokenCountEl = document.getElementById('elite-tokens-count');
  if (tokenCountEl) {
    tokenCountEl.textContent = tokenCount;
  }
  const tierLabel = document.getElementById('sidebar-tier-label');
  const upgradeBtn = document.getElementById('sidebar-upgrade-btn');

  if (isElite) {
    if (tierLabel) {
      tierLabel.textContent = 'Elite Tier';
      tierLabel.classList.add('text-[#FF6F00]', 'animate-pulse');
    }
    if (upgradeBtn) {
      upgradeBtn.innerHTML = '<span class="material-symbols-outlined" style="margin-right:8px; animation: premiumPulse 2s infinite;">local_fire_department</span> <span class="relative z-10">Explore Benefits</span>';
      upgradeBtn.href = '#';
      // Completely restyle to match the burning premium aesthetic requirement
      upgradeBtn.className = 'w-full py-4 mt-8 font-headline font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs transition-all flex items-center justify-center relative overflow-hidden group border-2 border-[#121212] dark:border-[#f6f6f6]';
      upgradeBtn.style.cssText = 'background: linear-gradient(90deg, #ffb300, #ff6f00, #ffb300); background-size: 200% auto; animation: premiumFire 3s linear infinite; box-shadow: 0 0 15px rgba(255,111,0,0.7); text-shadow: 1px 1px 0px rgba(255,255,255,0.3); color: #121212 !important;';

      // Inject global animation styles if not present
      if (!document.getElementById('rebel-premium-styles')) {
        const style = document.createElement('style');
        style.id = 'rebel-premium-styles';
        style.textContent = `
          @keyframes premiumFire { 0% { background-position: 0% center; box-shadow: 0 0 15px rgba(255,111,0,0.6); } 50% { background-position: 100% center; box-shadow: 0 0 25px rgba(255,215,0,0.9); } 100% { background-position: 0% center; box-shadow: 0 0 15px rgba(255,111,0,0.6); } }
          @keyframes premiumPulse { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.2); opacity: 1; text-shadow: 0 0 10px #fff; } 100% { transform: scale(1); opacity: 0.8; } }
        `;
        document.head.appendChild(style);
      }

      // Clean up any existing listeners by cloning (simple way to remove all listeners)
      const newBtn = upgradeBtn.cloneNode(true);
      upgradeBtn.parentNode.replaceChild(newBtn, upgradeBtn);

      newBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const modal = document.getElementById('elite-hub-modal');
        if (modal) {
          modal.classList.remove('hidden');
          modal.classList.add('flex');
          // Global hydration of Elite Modal Data
          try {
            const tokenEl = document.getElementById('elite-tokens-count');
            if (tokenEl) {
              const sr = await futuraApi.contributions.streak().catch(() => null);
              tokenEl.textContent = String(sr?.streak?.recovery_tokens ?? sub?.streak_recovery_tokens ?? 0);
            }

            const goalsRes = await futuraApi.goals.get();
            const goal = goalsRes?.goal;
            if (goal) {
              const income = (goal.target_monthly_income || 0) * 12;
              const investment = (goal.target_monthly_income || 0) * 0.2 * 12;
              const taxSaved = Math.round(investment * 0.25);
              const savingsEl = document.getElementById('elite-tax-savings');
              const recEl = document.getElementById('elite-tax-rec');

              if (savingsEl) savingsEl.textContent = '$' + taxSaved.toLocaleString();
              if (recEl) {
                recEl.textContent = income > 50000
                  ? "Higher rate tax detected. Focus on SIPP for max relief."
                  : "Maximize your tax-free ISA allowance first.";
              }

              const printBtn = document.getElementById('btn-print-roadmap');
              if (printBtn && !printBtn.hasAttribute('data-bound')) {
                printBtn.setAttribute('data-bound', 'true');
                printBtn.onclick = async () => {
                  try {
                    printBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Generating...';
                    printBtn.disabled = true;
                    const report = await futuraApi.projection.roadmap();
                    if (report && report.summary) {
                      const printWin = window.open('', '', 'width=800,height=600');
                      printWin.document.write(`
                           <html><head><title>Elite Retirement Roadmap</title>
                           <style>body{font-family:IBM Plex Mono, sans-serif;padding:40px;line-height:1.6;background:#121212;color:#f6f6f6;}h1{border-bottom:4px solid #cafd00;padding-bottom:10px;text-transform:uppercase;color:#cafd00;}pre{background:#1e1e1e;padding:20px;white-space:pre-wrap;border:2px solid #333;font-size:14px;}</style>
                           </head><body>
                           <h1>Elite Retirement Roadmap</h1>
                           <p><strong>Generated for:</strong> ${goal.email || 'Elite Member'}</p>
                           <pre>${report.summary}</pre>
                           <script>window.onload = function() { window.print(); window.setTimeout(window.close, 500); }<\/script>
                           </body></html>
                       `);
                      printWin.document.close();
                    } else {
                      alert('Roadmap could not be generated.');
                    }
                  } catch (err) {
                    console.error(err);
                    alert('Failed to generate roadmap report.');
                  } finally {
                    printBtn.innerHTML = '<span class="material-symbols-outlined">download</span> Download PDF';
                    printBtn.disabled = false;
                  }
                };
              }
            }
          } catch (err) {
            console.error('Error hydrating elite modal globally', err);
          }
        } else {
          // If not on dashboard and modal missing, redirect to dashboard with elite-hub trigger
          window.location.href = 'dashboard_digital_rebel_desktop.html#elite-hub';
        }
      });
    }
  } else {
    if (tierLabel) {
      tierLabel.textContent = 'Basic Tier';
      tierLabel.classList.remove('text-[#ff81f5]', 'animate-pulse');
    }
    if (upgradeBtn) {
      upgradeBtn.textContent = 'Upgrade Power';
      upgradeBtn.href = 'upgrade_digital_rebel_desktop.html';
      // Reset styles if degraded
      upgradeBtn.style.cssText = '';
      upgradeBtn.className = 'w-full py-4 mt-8 border-2 border-primary-fixed bg-surface hover:bg-primary-fixed font-headline font-black uppercase tracking-[0.2em] text-xs transition-colors whitespace-nowrap overflow-hidden text-ellipsis px-2 no-underline appearance-none box-border flex justify-center items-center h-[52px] text-on-surface';
    }
  }
}

// Load Razorpay SDK dynamically
function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.head.appendChild(script);
  });
}

// Dynamic Zens Purchasing Menu & Razorpay Handler
async function buyZens(onSuccess) {
  const isOnboarded = localStorage.getItem('futura_onboarding_complete') === 'true';
  if (!isOnboarded) {
    if (typeof showToast === 'function') {
      showToast('Please complete your financial profile onboarding before adding ZENS.', 'error');
    } else {
      alert('Please complete your financial profile onboarding before adding ZENS.');
    }
    setTimeout(() => {
      window.location.href = 'onboarding_step_1_age.html';
    }, 2000);
    return;
  }

  await loadRazorpayScript();

  // Create Overlay Menu
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(18,18,18,.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .2s ease;';

  const INRD_RATE = 10; // Zens per 1 INR

  ov.innerHTML = `
    <style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}</style>
    <div style="background:#fff;border:3px solid #121212;box-shadow:8px 8px 0 #121212;width:100%;max-width:480px;animation:slideUp .2s ease;display:flex;flex-direction:column;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:24px 24px 16px;border-bottom:2px solid #121212;">
        <h2 style="font-family:'Lexend',sans-serif;font-weight:900;font-size:24px;text-transform:uppercase;letter-spacing:-.02em;">ADD ZENS Z</h2>
        <button id="close-buy-menu" style="background:none;border:none;font-size:32px;cursor:pointer;font-weight:900;line-height:1;margin-top:-8px;">×</button>
      </div>
      
      <div style="padding:24px;display:flex;flex-direction:column;gap:16px;">
        <p style="font-family:'Inter',sans-serif;font-size:14px;color:#5a5a5a;margin-top:-8px;">Choose a package to top up your virtual wallet.</p>
        
        <!-- Package 1 -->
        <button data-amount="100" data-zens="1000" class="zens-pack" style="display:flex;justify-content:space-between;align-items:center;padding:16px;border:3px solid #121212;background:#f8f8f8;cursor:pointer;transition:all 0.1s;">
          <div style="text-align:left;">
            <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:20px;">Z 1,000 <span style="font-size:12px;color:#767777;">ZENS</span></div>
            <div style="font-family:'Lexend',sans-serif;font-weight:700;font-size:12px;color:#000000;margin-top:4px;">STARTER PACK</div>
          </div>
          <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:18px;">₹100</div>
        </button>

        <!-- Package 2 -->
        <button data-amount="500" data-zens="5000" class="zens-pack" style="display:flex;justify-content:space-between;align-items:center;padding:16px;border:3px solid #121212;background:#f8f8f8;cursor:pointer;transition:all 0.1s;">
          <div style="text-align:left;">
            <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:20px;">Z 5,000 <span style="font-size:12px;color:#767777;">ZENS</span></div>
            <div style="font-family:'Lexend',sans-serif;font-weight:700;font-size:12px;color:#000000;margin-top:4px;">STANDARD PACK</div>
          </div>
          <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:18px;">₹500</div>
        </button>

        <!-- Package 3 -->
        <button data-amount="1000" data-zens="10000" class="zens-pack" style="display:flex;justify-content:space-between;align-items:center;padding:16px;border:3px solid #121212;background:#cafd00;cursor:pointer;transition:all 0.1s;position:relative;box-shadow:4px 4px 0 #121212;">
          <div style="position:absolute;top:-12px;right:-12px;background:#121212;color:#fff;font-family:'Lexend',sans-serif;font-weight:900;font-size:10px;padding:4px 8px;border:2px solid #fff;transform:rotate(4deg);">MOST POPULAR</div>
          <div style="text-align:left;">
            <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:20px;color:#121212;">Z 10,000 <span style="font-size:12px;color:#121212;opacity:0.8;">ZENS</span></div>
            <div style="font-family:'Lexend',sans-serif;font-weight:700;font-size:12px;color:#121212;margin-top:4px;">PREMIUM PACK</div>
          </div>
          <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:18px;color:#121212;">₹1,000</div>
        </button>

        <!-- Package 4 -->
        <button data-amount="2500" data-zens="25000" class="zens-pack" style="display:flex;justify-content:space-between;align-items:center;padding:16px;border:3px solid #121212;background:#f8f8f8;cursor:pointer;transition:all 0.1s;">
          <div style="text-align:left;">
            <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:20px;">Z 25,000 <span style="font-size:12px;color:#767777;">ZENS</span></div>
            <div style="font-family:'Lexend',sans-serif;font-weight:700;font-size:12px;color:#000000;margin-top:4px;">PRO PACK</div>
          </div>
          <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:18px;">₹2,500</div>
        </button>

        <!-- Package 5 -->
        <button data-amount="5000" data-zens="50000" class="zens-pack" style="display:flex;justify-content:space-between;align-items:center;padding:16px;border:3px solid #121212;background:#121212;color:#fff;cursor:pointer;transition:all 0.1s;">
          <div style="text-align:left;">
            <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:20px;color:#cafd00;">Z 50,000 <span style="font-size:12px;color:#fff;opacity:0.7;">ZENS</span></div>
            <div style="font-family:'Lexend',sans-serif;font-weight:700;font-size:12px;color:#fff;opacity:0.9;margin-top:4px;">WHALE PACK</div>
          </div>
          <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:18px;">₹5,000</div>
        </button>

        <!-- Package 6 -->
        <button data-amount="10000" data-zens="100000" class="zens-pack" style="display:flex;justify-content:space-between;align-items:center;padding:16px;border:3px solid #121212;background:#b02500;color:#fff;cursor:pointer;transition:all 0.1s;">
          <div style="text-align:left;">
            <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:20px;color:#fff;">Z 100,000 <span style="font-size:12px;color:#fff;opacity:0.7;">ZENS</span></div>
            <div style="font-family:'Lexend',sans-serif;font-weight:700;font-size:12px;color:#fff;opacity:0.9;margin-top:4px;">INSTITUTIONAL PACK</div>
          </div>
          <div style="font-family:'Lexend',sans-serif;font-weight:900;font-size:18px;">₹10,000</div>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);

  ov.querySelector('#close-buy-menu').addEventListener('click', () => ov.remove());
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });

  // Wire Buttons
  ov.querySelectorAll('.zens-pack').forEach(btn => {
    btn.addEventListener('click', () => {
      const amountINR = parseInt(btn.dataset.amount, 10);
      const zensDesc = parseInt(btn.dataset.zens, 10);
      ov.remove();
      initiateRazorpayPurchase(amountINR, zensDesc, onSuccess);
    });
  });
}

function initiateRazorpayPurchase(amountINR, zensExpected, onSuccess) {
  const options = {
    key: (FUTURA_CONFIG.RAZORPAY_KEY_ID || '').trim(),
    amount: amountINR * 100, // INR to paise
    currency: 'INR',
    name: 'Digital Rebel',
    description: `${zensExpected.toLocaleString('en-US')} Zens Credit Pack`,
    handler: async (response) => {
      try {
        const result = await futuraApi.zens.purchase(response.razorpay_payment_id);

        // Add notification for successful purchase
        if (typeof RebelNotifications !== 'undefined') {
          RebelNotifications.add(
            'ZENS Credited',
            `Successfully added ${zensExpected.toLocaleString('en-US')} ZENS to your warchest.`,
            'success'
          );
        }

        if (onSuccess) onSuccess(result.newBalance || result.zens); // Pass new balance
      } catch (err) {
        console.error('Zens credit failed:', err);
        alert('Payment received but failed to credit Zens. Contact support.');
      }
    },
    theme: { color: '#68FD00' }
  };

  const rzp = new window.Razorpay(options);
  rzp.open();
}

// Purchase Elite / Pro using Razorpay Payment ID
async function buyElite(razorpay_payment_id) {
  try {
    const result = await futuraApi.subscriptions.purchaseElite(razorpay_payment_id);
    return result;
  } catch (err) {
    const msg = err.message || '';
    alert('Failed to upgrade to Elite: ' + msg);
    throw err;
  }
}

// Expose futuraApi to global scope for production compatibility
if (typeof window !== 'undefined') {
  window.futuraApi = futuraApi;
}
