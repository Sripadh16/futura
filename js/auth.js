// Futura — Supabase Auth module
// Requires: supabase-js CDN + config.js loaded before this

// ── Instant Sidebar Cache ──────────────────────────────────────────────────
// Synchronously hydrate sidebar from localStorage before any async work.
// This eliminates the flash of placeholder avatar/name when navigating pages.
(function _applyCachedSidebarState() {
  try {
    var raw = localStorage.getItem('futura_sidebar_v1');
    if (!raw) return;
    var c = JSON.parse(raw);
    // Username
    var names = document.querySelectorAll('#user-name, #sidebar-user-name');
    if (c.username && names.length) names.forEach(function(el){ el.textContent = c.username; });
    // Avatar
    if (c.avatarHTML) {
      var avatars = [document.getElementById('nav-avatar'), document.getElementById('sidebar-avatar')];
      avatars.forEach(function(a){ if(a) a.innerHTML = c.avatarHTML; });
    }
    // Tier label + button
    var label = document.getElementById('sidebar-tier-label');
    var btn = document.getElementById('sidebar-upgrade-btn');
    if (c.isElite) {
      if (label) { label.textContent = 'Elite Tier'; label.style.color = '#FF6F00'; }
      if (btn) {
        btn.innerHTML = '<span class="material-symbols-outlined" style="margin-right:8px;">local_fire_department</span> Explore Benefits';
        btn.removeAttribute('href');
        btn.className = 'w-full py-4 mt-8 font-headline font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs transition-all flex items-center justify-center border-2 border-[#121212]';
        btn.style.cssText = 'background:linear-gradient(90deg,#ffb300,#ff6f00,#ffb300);background-size:200% auto;box-shadow:0 0 15px rgba(255,111,0,0.7);color:#121212!important;cursor:pointer;';
        btn.onclick = function(e) {
          e.preventDefault();
          var modal = document.getElementById('elite-hub-modal');
          if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        };
      }
    } else {
      if (label) { label.textContent = 'Basic Tier'; label.style.color = '#767777'; }
      if (btn) { btn.textContent = 'Upgrade Power'; btn.href = 'upgrade_digital_rebel_desktop.html'; }
    }
  } catch(e) {}
})();

function _futuraNotify(message, type) {
  type = type === 'success' ? 'success' : 'error';
  var root = document.getElementById('futura-toast-stack');
  if (!root) {
    root = document.createElement('div');
    root.id = 'futura-toast-stack';
    root.setAttribute('aria-live', 'polite');
    root.className =
      'fixed bottom-4 right-4 z-[10000] flex max-w-md flex-col gap-2 p-0 pointer-events-none';
    document.body.appendChild(root);
  }
  var el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.className =
    'pointer-events-auto border-2 border-on-surface px-4 py-3 font-headline font-black uppercase text-xs tracking-widest neo-shadow ' +
    (type === 'success' ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-error-container text-on-error-container');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(function () {
    el.remove();
  }, 6500);
}

/** Optional global for other scripts */
window.showFuturaToast = function (message, opts) {
  _futuraNotify(message, (opts && opts.type) || 'error');
};

let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    // Ensure supabase library and config are loaded
    if (typeof supabase === 'undefined') {
      throw new Error('Supabase library not loaded. Ensure Supabase CDN is included.');
    }
    if (!FUTURA_CONFIG || !FUTURA_CONFIG.SUPABASE_URL || !FUTURA_CONFIG.SUPABASE_ANON_KEY) {
      throw new Error('FUTURA_CONFIG not properly initialized. Check config.js.');
    }
    
    _supabase = supabase.createClient(
      FUTURA_CONFIG.SUPABASE_URL,
      FUTURA_CONFIG.SUPABASE_ANON_KEY
    );
  }
  return _supabase;
}

// Get current session (returns null if not logged in)
// Concurrent callers share one in-flight Supabase getSession() for fewer round-trips.
let _sessionInFlight = null;

async function getSession() {
  if (!_sessionInFlight) {
    _sessionInFlight = getSupabase()
      .auth.getSession()
      .then(({ data: { session } }) => session)
      .finally(() => {
        _sessionInFlight = null;
      });
  }
  return _sessionInFlight;
}

// Get access token for API calls
async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}

// Sign in with Google OAuth
async function signInWithGoogle() {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname + '?auth_callback=true'
    }
  });
  if (error) {
    console.error('Google sign-in error:', error.message);
    _futuraNotify('Sign-in failed: ' + error.message, 'error');
  }
}

// Sign out
async function signOut() {
  _sessionInFlight = null;
  await getSupabase().auth.signOut();
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = '/index.html';
}

let _profileVerified = false;

// Check if onboarding is completed
async function checkOnboarding() {
  const session = await getSession();
  const currentPath = window.location.pathname;

  if (!session) {
    _profileVerified = true;
    updateNavAuth();
    return;
  }

  try {
    let profile = null;
    let is404 = false;

    // 1. Attempt API fetch
    try {
      const res = await fetch(`${FUTURA_CONFIG.API_BASE_URL}/api/profile`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (res.status === 404) {
        is404 = true;
      } else if (res.ok) {
        const data = await res.json();
        profile = data.profile;
      }
    } catch (fetchErr) {
      console.warn('API backend unreachable, querying Supabase directly:', fetchErr.message);
    }

    // 2. Direct Supabase fallback if API was offline or didn't return profile
    if (!profile && !is404) {
      try {
        const { data: dbProfile, error: dbErr } = await getSupabase()
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (dbProfile) {
          profile = dbProfile;
        } else if (!dbErr) {
          is404 = true;
        }
      } catch (dbEx) {
        console.warn('Direct Supabase profile query failed:', dbEx);
      }
    }

    if (is404 || !profile) {
      const urlParams = new URLSearchParams(window.location.search);
      const isNewLogin = urlParams.has('auth_callback') || window.location.hash.includes('access_token');
      const isOnboardingPage = currentPath.includes('onboarding_');

      if (isNewLogin || isOnboardingPage || session) {
        if (!isOnboardingPage) {
          window.location.href = 'onboarding_step_1_age.html';
        }
        return;
      } else {
        console.warn('Profile missing and not onboarding. Aggressive logout.');
        document.documentElement.classList.remove('auth-verified', 'auth-loading');
        localStorage.clear();
        sessionStorage.clear();
        await signOut();
        return;
      }
    }

    _profileVerified = true;

    const isOnboarded = profile && profile.onboarding_complete;
    localStorage.setItem('futura_onboarding_complete', isOnboarded ? 'true' : 'false');

    if (isOnboarded) {
      document.documentElement.classList.add('auth-verified');
      document.documentElement.classList.remove('auth-loading');

      // If user is on landing or onboarding pages but IS already onboarded, send to dashboard
      const shouldRedirectToDash = currentPath === '/' ||
        currentPath.includes('index.html') ||
        currentPath.includes('landing_') ||
        currentPath.includes('onboarding_');

      if (shouldRedirectToDash) {
        if (!window.location.search.includes('redirecting')) {
          window.location.href = 'dashboard_digital_rebel_desktop.html?redirecting=true';
          return;
        }
      }
    } else {
      document.documentElement.classList.remove('auth-verified', 'auth-loading');
      // If NOT onboarded and NOT already on an onboarding page, send to Step 1
      if (!currentPath.includes('onboarding_')) {
        const protectedPaths = ['dashboard_', 'market_', 'assets_', 'index.html', 'landing_'];
        const isProtected = protectedPaths.some(p => currentPath.includes(p)) || currentPath === '/' || currentPath === '';

        if (isProtected) {
          window.location.href = 'onboarding_step_1_age.html';
          return;
        }
      }
    }

    // UI is now safe to update
    updateNavAuth();
    document.body.style.opacity = '1';
  } catch (err) {
    console.error('Onboarding check failed:', err);
    document.documentElement.classList.remove('auth-verified', 'auth-loading');
    _profileVerified = true;
    updateNavAuth();
    document.body.style.opacity = '1';
    var msg = err && err.message ? String(err.message) : '';
    if (/network|fetch|failed to load|load failed|aborted/i.test(msg) || (err && err.name === 'TypeError')) {
      _futuraNotify(
        'Could not connect to verify your session. Check your connection and try again.',
        'error'
      );
    }
  }
}

// Protect a page — redirect to index if not authenticated
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

/**
 * Keep the header fire token pill aligned with GET /contributions/streak (same source as Elite Hub).
 * Call after streak data is loaded on the dashboard overview.
 * @param { { recovery_tokens?: number } } streakPayload - streak object from API
 */
function syncNavRecoveryTokenPill(streakPayload) {
  if (!streakPayload || typeof streakPayload !== 'object') return;
  const raw = streakPayload.recovery_tokens;
  if (raw === undefined || raw === null) return;
  const count = Number(raw);
  if (!Number.isFinite(count)) return;
  const countEl = document.getElementById('nav-tokens-count');
  const pill = document.getElementById('nav-tokens-pill');
  if (countEl) countEl.textContent = '+' + count;
  if (pill) {
    pill.style.display = 'flex';
    if (count > 0) pill.classList.add('fire-glow');
    else pill.classList.remove('fire-glow');
  }
}

// Update nav UI based on auth state
async function updateNavAuth() {
  const session = await getSession();

  // Header Button: Hide if signed in, show name instead
  const headerBtn = document.getElementById('btn-auth-header');
  const nameLabel = document.getElementById('user-name-header');
  const displayName = document.getElementById('user-display-name');
  const sidebarNames = document.querySelectorAll('#user-name, #sidebar-user-name');

  const username = (session?.user?.email?.split('@')[0] || 'REBEL').toUpperCase();

  if (session && _profileVerified) {
    if (headerBtn) headerBtn.style.display = 'none';
    if (nameLabel) {
      nameLabel.classList.remove('hidden');
      if (displayName) displayName.textContent = username;
    }
    sidebarNames.forEach(el => el.textContent = username);
  } else {
    if (headerBtn) {
      headerBtn.style.display = 'flex';
      headerBtn.onclick = (e) => { e.preventDefault(); signInWithGoogle(); };
    }
    if (nameLabel) nameLabel.classList.add('hidden');
  }

  // ZENS Pill Visibility
  const zensPill = document.getElementById('nav-zens-pill');
  if (zensPill) {
    if (session && _profileVerified) {
      zensPill.classList.remove('hidden');
      zensPill.classList.add('md:flex');

      // Add Tokens Pill for Elite Users
      (async () => {
        try {
          const profileRes = await fetch(`${FUTURA_CONFIG.API_BASE_URL}/api/profile`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          const profileData = profileRes.ok ? await profileRes.json() : null;
          const sub = profileData?.subscription;

          function entitlementLooksElite(raw) {
            if (raw == null || raw === '') return false;
            const s = String(raw).trim().toLowerCase();
            return s === 'elite';
          }

          function paintSidebarTier(isElite) {
            localStorage.setItem('isElite', isElite ? 'true' : 'false');
            var sidebarBtn = document.getElementById('sidebar-upgrade-btn');
            var sidebarLabel = document.getElementById('sidebar-tier-label');
            if (sidebarLabel) {
              sidebarLabel.textContent = isElite ? 'Elite Tier' : 'Basic Tier';
              sidebarLabel.style.color = isElite ? '#FF6F00' : '#767777';
            }
            if (sidebarBtn) {
              if (isElite) {
                sidebarBtn.innerHTML = '<span class="material-symbols-outlined" style="margin-right:8px;">local_fire_department</span> Explore Benefits';
                sidebarBtn.removeAttribute('href');
                sidebarBtn.className = 'w-full py-4 mt-8 font-headline font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs transition-all flex items-center justify-center border-2 border-[#121212]';
                sidebarBtn.style.cssText = 'background:linear-gradient(90deg,#ffb300,#ff6f00,#ffb300);background-size:200% auto;animation:eliteBtnGlow 3s linear infinite;box-shadow:0 0 15px rgba(255,111,0,0.7);color:#121212!important;cursor:pointer;';
                if (!document.getElementById('elite-btn-anim')) {
                  var st = document.createElement('style'); st.id = 'elite-btn-anim';
                  st.textContent = '@keyframes eliteBtnGlow{0%{background-position:0% center;box-shadow:0 0 15px rgba(255,111,0,.6)}50%{background-position:100% center;box-shadow:0 0 25px rgba(255,215,0,.9)}100%{background-position:0% center;box-shadow:0 0 15px rgba(255,111,0,.6)}}';
                  document.head.appendChild(st);
                }
                sidebarBtn.onclick = function(ev) {
                  ev.preventDefault();
                  var m = document.getElementById('elite-hub-modal');
                  if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
                };
              } else {
                sidebarBtn.textContent = 'Upgrade Power';
                sidebarBtn.href = 'upgrade_digital_rebel_desktop.html';
                sidebarBtn.style.cssText = '';
                sidebarBtn.onclick = null;
              }
            }
          }

          // Tier from profile first — do not wait for streak (streak can hang/slow on some hosts).
          let isElite = entitlementLooksElite(sub?.entitlement);
          paintSidebarTier(isElite);

          if (typeof window.TierStateManager !== 'undefined' && window.TierStateManager.initializeFromProfile) {
            try {
              window.TierStateManager.initializeFromProfile(sub || null);
            } catch (e) { /* tier-state optional */ }
          }

          let tokenCount = Number(sub?.streak_recovery_tokens ?? 0);

          let streakData = null;
          const apiClient = typeof window !== 'undefined' ? window.futuraApi : null;
          if (apiClient && typeof apiClient.contributions?.streak === 'function') {
            streakData = await apiClient.contributions.streak().catch(() => null);
          }

          const streakElite = streakData?.streak?.is_elite === true;
          if (streakData?.streak?.recovery_tokens !== undefined) {
            tokenCount = Number(streakData.streak.recovery_tokens);
          }

          const finalElite = isElite || streakElite;
          if (finalElite !== isElite) {
            isElite = finalElite;
            paintSidebarTier(isElite);
          }

          if (isElite) {
            let tokenPill = document.getElementById('nav-tokens-pill');
            if (!tokenPill) {
              tokenPill = document.createElement('div');
              tokenPill.id = 'nav-tokens-pill';
              // Use a vibrant orange background with black icon/text to match user's provided icon
              tokenPill.className = 'flex items-center gap-2 bg-[#ff6f00] text-[#121212] border-2 border-[#121212] px-3 py-1 font-headline font-black tracking-widest text-sm neo-shadow-sm cursor-pointer hover:bg-[#e65100] transition-all mr-2';
              tokenPill.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:18px; font-variation-settings: 'FILL' 1;">local_fire_department</span>
                <span id="nav-tokens-count" style="line-height:1">+0</span>
              `;

              // Add glow style if not exists
              if (!document.getElementById('fire-glow-style')) {
                const s = document.createElement('style');
                s.id = 'fire-glow-style';
                s.textContent = `
                  @keyframes fireGlow {
                    0% { box-shadow: 0 0 5px #ff6f00, 4px 4px 0 #121212; }
                    50% { box-shadow: 0 0 20px #ffb300, 4px 4px 0 #121212; }
                    100% { box-shadow: 0 0 5px #ff6f00, 4px 4px 0 #121212; }
                  }
                  .fire-glow { animation: fireGlow 2s infinite !important; }
                `;
                document.head.appendChild(s);
              }

              zensPill.parentNode.insertBefore(tokenPill, zensPill);

              tokenPill.onclick = (e) => {
                e.preventDefault();
                const modal = document.getElementById('elite-hub-modal');
                if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
              };
            }
            const countEl = document.getElementById('nav-tokens-count');
            const tokens = Number.isFinite(tokenCount) ? tokenCount : 0
            if (countEl) countEl.textContent = `+${tokens}`;
            tokenPill.style.display = 'flex';

            if (tokens > 0) {
              tokenPill.classList.add('fire-glow');
            } else {
              tokenPill.classList.remove('fire-glow');
            }
          } else {
            const orphanPill = document.getElementById('nav-tokens-pill');
            if (orphanPill) orphanPill.remove();
          }

          // Persist cache
          try {
            localStorage.setItem('futura_sidebar_v1', JSON.stringify({
              username: (session?.user?.email?.split('@')[0] || 'REBEL').toUpperCase(),
              avatarHTML: document.getElementById('nav-avatar')?.innerHTML || '',
              isElite: isElite
            }));
          } catch(e) {}

        } catch (e) {
          console.warn('[Futura] Failed to hydrate token pill/sidebar:', e);
        }
      })();

    } else {
      zensPill.classList.add('hidden');
      zensPill.classList.remove('md:flex');
      const tokenPill = document.getElementById('nav-tokens-pill');
      if (tokenPill) tokenPill.remove();
    }
  }

  // Avatar Update
  const avatars = [document.getElementById('nav-avatar'), document.getElementById('sidebar-avatar')].filter(Boolean);
  if (avatars.length > 0 && session && _profileVerified) {
    const photo = session.user?.user_metadata?.avatar_url || session.user?.user_metadata?.picture;
    avatars.forEach(avatar => {
      if (photo) {
        avatar.innerHTML = `<img src="${photo}" class="w-full h-full object-cover" alt="User profile">`;
      } else {
        const initial = (session.user.email?.[0] || 'R').toUpperCase();
        avatar.innerHTML = `<div class="bg-[#cafd00] text-[#121212] font-headline font-black w-full h-full flex items-center justify-center text-sm">${initial}</div>`;
      }
    });
  }

  // Hero Button: Change to ENTER TERMINAL if signed in
  const heroBtn = document.getElementById('btn-auth-hero');
  if (heroBtn) {
    if (session && _profileVerified) {
      heroBtn.innerHTML = '<span class="material-symbols-outlined">terminal</span> ENTER TERMINAL';
      heroBtn.onclick = (e) => {
        e.preventDefault();
        window.location.href = 'dashboard_digital_rebel_desktop.html';
      };
    } else {
      heroBtn.innerHTML = `
        <img alt="G" class="w-6 h-6" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAGbSlYWQx7duriQ_rj1NkH12h0GPa6HXIDIMazPgvscwHaU0LrccorkuzuIhtDpMuUMIEvQc27qUB_AaYDxuJNz7VeElyUlxaHNGnABnsN5QMzTBTDVSGsx05jIxorxhKmdzR_IiiffekEIQR4xadI5EnXGV8YwxwVHVVo88rn9uq2i-uyNK-W1jaVVwvyb9vqadxunjI4sluWlaRmjOGa0sqxde0pAYhzni0eKL2qxhiuPvpW56hqN44MwRReBRJzNUdWS-P6qOwh" />
        Sign in with Google
      `;
      heroBtn.onclick = (e) => { e.preventDefault(); signInWithGoogle(); };
    }
  }

  // Connect Wallet logic removed

  // Populate Zens Balance in Nav if applicable
  // Populate Zens Balance in Nav if applicable
  if (session) {
    const zensPills = document.querySelectorAll('#nav-zens-balance, [id*="zens-balance"]');
    const addMoneyBtns = document.querySelectorAll('#add-money-btn, [onclick*="buyZens"]');

    // Standardize ZENS display
    if (zensPills.length > 0) {
      try {
        const { zens } = await futuraApi.zens.balance();
        const formatted = (zens || 0).toLocaleString('en-US') + ' ZENS';
        zensPills.forEach(p => {
          p.textContent = formatted;
          // Make the parent container clickable for the Razorpay flow
          const container = p.closest('.bg-surface-container') || p.closest('#nav-zens-pill') || p.parentElement;
          if (container && !container._hasZensClickListener) {
            container.style.cursor = 'pointer';
            container.classList.add('hover:bg-[#cafd00]', 'hover:text-[#121212]', 'transition-all');
            // Remove text color utility so hover applies smoothly
            container.classList.remove('text-primary-fixed', 'text-[#cafd00]');
            container.addEventListener('click', (e) => {
              e.preventDefault();
              if (typeof buyZens === 'function') {
                buyZens(newBalance => {
                  const fmt = (newBalance || 0).toLocaleString('en-US') + ' ZENS';
                  document.querySelectorAll('#nav-zens-balance, [id*="zens-balance"]').forEach(el => el.textContent = fmt);
                  if (window.showToast) showToast('ZENS Successfully added!');
                });
              }
            });
            container._hasZensClickListener = true;
          }
        });
      } catch (err) {
        console.error("Failed to load Zens balance:", err);
      }
    }

    // Standardize Add Money Buttons
    document.querySelectorAll('button').forEach(btn => {
      if (btn.textContent.trim().toUpperCase() === 'ADD MONEY' || btn.id === 'add-money-btn') {
        btn.onclick = () => {
          if (typeof buyZens === 'function') {
            buyZens(newBalance => {
              const formatted = (newBalance || 0).toLocaleString('en-US') + ' ZENS';
              document.querySelectorAll('#nav-zens-balance').forEach(p => p.textContent = formatted);
              if (window.showToast) showToast('ZENS Successfully added!');
            });
          }
        };
      }
    });
  }

  // ── Notification Bell Handler ──────────────────────────────────────────
  // Refined selector for the bell icon prioritizing standard ID
  const bell = document.querySelector('#notif-bell') ||
    Array.from(document.querySelectorAll('.material-symbols-outlined')).find(el => el.textContent.trim() === 'notifications');

  if (bell && !bell._hasListener) {
    bell.style.position = 'relative';
    bell.style.cursor = 'pointer';

    // Create/Update Badge
    const updateBadge = () => {
      let badge = bell.querySelector('.notif-badge');
      const count = window.RebelNotifications ? RebelNotifications.getUnreadCount() : 0;

      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'notif-badge';
          badge.style.cssText = 'position:absolute;top:-2px;right:-2px;width:12px;height:12px;background:#b02500;border:1px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:900;';
          bell.appendChild(badge);
        }
        badge.textContent = count > 9 ? '9+' : count;
      } else if (badge) {
        badge.remove();
      }
    };

    updateBadge();
    window.addEventListener('notifications-updated', updateBadge);

    bell.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.rebel-dropdown').forEach(d => d.remove());

      const dd = document.createElement('div');
      dd.className = 'rebel-dropdown notification-dropdown';
      dd.style.cssText = `
        position: fixed;
        background: #fff;
        border: 2px solid #121212;
        box-shadow: 4px 4px 0 #121212;
        z-index: 9999;
        min-width: 320px;
        max-width: 360px;
        animation: slideIn 0.1s ease-out;
      `;

      const rect = bell.getBoundingClientRect();
      dd.style.top = (rect.bottom + 12) + 'px';
      dd.style.right = (window.innerWidth - rect.right) + 'px';

      // Header
      const header = document.createElement('div');
      header.className = 'p-4 border-b-2 border-[#121212] bg-[#f6f6f6] flex justify-between items-center';
      header.innerHTML = `
        <span class="font-headline font-black text-xs uppercase tracking-widest">Incoming Intel</span>
        <button id="clear-all-notifs" class="font-headline font-black text-[10px] uppercase text-[#b02500] hover:underline">Clear All</button>
      `;
      dd.appendChild(header);

      const list = document.createElement('div');
      list.className = 'max-h-[400px] overflow-y-auto';

      const notifs = window.RebelNotifications ? RebelNotifications.getLatest(5) : [];

      if (notifs.length === 0) {
        list.innerHTML = `<div class="p-8 text-center font-headline font-bold text-[10px] text-[#767777] uppercase tracking-widest">No active threats or intel detected.</div>`;
      } else {
        notifs.forEach(n => {
          const item = document.createElement('div');
          item.className = `p-4 border-b border-[#e0e0e0] last:border-none hover:bg-surface-container-low transition-colors ${!n.read ? 'bg-[#cafd000a]' : ''}`;

          let icon = 'info';
          let color = '#121212';
          if (n.type === 'success') { icon = 'check_circle'; color = '#4e6300'; }
          if (n.type === 'error') { icon = 'warning'; color = '#b02500'; }
          if (n.type === 'trend') { icon = 'trending_up'; color = '#a400a4'; }
          if (n.type === 'system') { icon = 'terminal'; color = '#121212'; }

          item.innerHTML = `
            <div class="flex gap-3">
              <span class="material-symbols-outlined text-sm" style="color:${color}">${icon}</span>
              <div class="flex-1">
                <div class="font-headline font-black text-[10px] uppercase tracking-tighter mb-1">${n.title}</div>
                <div class="font-body text-[11px] leading-tight text-on-surface-variant font-medium">${n.message}</div>
                <div class="font-body text-[8px] uppercase mt-2 opacity-50 font-bold">${new Date(n.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>
          `;
          list.appendChild(item);
        });
      }
      dd.appendChild(list);

      document.body.appendChild(dd);

      // Actions
      const clearBtn = dd.querySelector('#clear-all-notifs');
      if (clearBtn) {
        clearBtn.onclick = (ex) => {
          ex.stopPropagation();
          if (window.RebelNotifications) {
            RebelNotifications.clearAll();
            dd.remove();
          }
        };
      }

      // Mark all as read when opening
      if (window.RebelNotifications) RebelNotifications.markAsAllRead();

      // Close Logic
      const closeDropdown = (event) => {
        if (!dd.contains(event.target) && event.target !== bell) {
          dd.remove();
          document.removeEventListener('click', closeDropdown);
        }
      };
      setTimeout(() => document.addEventListener('click', closeDropdown), 10);
    });

    bell._hasListener = true;
  }

  // ── Logout Listener (Event Delegation) ───────────────────────────────────
  // Using delegation so that dynamically injected elements (like dropdowns) 
  // also get the logout functionality automatically.
  if (!window._logoutListenerAttached) {
    document.addEventListener('click', async (e) => {
      const logoutTarget = e.target.closest('#logout-link, .btn-logout, [href*="logout"]');
      const isLogoutText = e.target.textContent.toLowerCase().includes('logout') &&
        (e.target.closest('a') || e.target.closest('button'));

      if (logoutTarget || isLogoutText) {
        e.preventDefault();
        console.log('Logout triggered');
        await signOut();
      }
    });
    window._logoutListenerAttached = true;
  }

  // ── Global Avatar Dropdown ────────────────────────────────────────────────
  // Attaches a consistent dropdown to any #nav-avatar element
  const avatarWrap = document.getElementById('nav-avatar');
  if (avatarWrap && !avatarWrap._hasDropdown) {
    avatarWrap.style.cursor = 'pointer';
    avatarWrap.addEventListener('click', e => {
      e.stopPropagation();
      // Remove any existing dropdowns
      document.querySelectorAll('.avatar-dropdown').forEach(d => d.remove());

      const dd = document.createElement('div');
      dd.className = 'avatar-dropdown';
      dd.id = 'dynamic-avatar-dropdown';
      dd.style.cssText = `
        position: fixed;
        background: #fff;
        border: 2px solid #121212;
        box-shadow: 4px 4px 0 #121212;
        z-index: 9999;
        min-width: 200px;
        animation: slideIn 0.1s ease-out;
      `;

      // Simple slide-in animation
      const style = document.createElement('style');
      style.textContent = `@keyframes slideIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }`;
      if (!document.getElementById('dropdown-styles')) {
        style.id = 'dropdown-styles';
        document.head.appendChild(style);
      }

      const rect = avatarWrap.getBoundingClientRect();
      dd.style.top = (rect.bottom + 8) + 'px';
      dd.style.right = (window.innerWidth - rect.right) + 'px';

      const links = [
        { label: 'My Dashboard', href: 'dashboard_digital_rebel_desktop.html', icon: 'grid_view' },
        { label: 'My Settings', href: 'settings_digital_rebel_desktop.html', icon: 'settings' },
        { label: 'Assets', href: 'assets_digital_rebel_desktop.html', icon: 'account_balance_wallet' },
        { label: 'Logout', href: 'index.html', icon: 'logout', id: 'logout-link', color: '#b02500' }
      ];

      links.forEach(({ label, href, icon, id, color }) => {
        const a = document.createElement('a');
        a.href = href;
        if (id) a.id = id;
        a.className = 'flex items-center gap-3 px-4 py-3 font-headline font-black text-xs uppercase tracking-widest text-[#121212] hover:bg-[#cafd00] transition-colors border-b border-[#e0e0e0] last:border-none';
        a.style.textDecoration = 'none';
        if (color) a.style.color = color;

        a.innerHTML = `<span class="material-symbols-outlined text-sm">${icon}</span> ${label}`;

        a.addEventListener('click', async (e) => {
          if (label === 'Logout') {
            e.preventDefault();
            await signOut();
          }
        });

        dd.appendChild(a);
      });

      document.body.appendChild(dd);

      // Close when clicking outside
      const closeDropdown = (event) => {
        if (!dd.contains(event.target) && event.target !== avatarWrap) {
          dd.remove();
          document.removeEventListener('click', closeDropdown);
        }
      };
      setTimeout(() => document.addEventListener('click', closeDropdown), 10);
    });
    avatarWrap._hasDropdown = true;
  }
}

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();

  // Safety Reveal: Ensure body is never permanently hidden if auth/api hangs
  setTimeout(() => {
    if (document.body.style.opacity === '0' || getComputedStyle(document.body).opacity === '0') {
      document.body.style.opacity = '1';
    }
  }, 2500);

  // ── SAFETY NET: Tier label only (sidebar upgrade CTA removed site-wide)
  setTimeout(() => {
    var eliteFlag = localStorage.getItem('isElite') === 'true';
    var label = document.getElementById('sidebar-tier-label');
    if (label) {
      label.textContent = eliteFlag ? 'Elite Tier' : 'Basic Tier';
      label.style.color = eliteFlag ? '#FF6F00' : '#767777';
    }
  }, 3000);

  // Only check onboarding once session is established
  getSupabase().auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      // Only checkOnboarding — it ends with updateNavAuth() after _profileVerified is set.
      // Calling updateNavAuth() here in parallel often ran while _profileVerified was still false,
      // so the sidebar tier / Explore Benefits block never executed on some hosts.
      void checkOnboarding();
    } else if (event === 'SIGNED_OUT') {
      document.documentElement.classList.remove('auth-verified', 'auth-loading');
      _profileVerified = true;
      updateNavAuth();
      document.body.style.opacity = '1';
    }
  });
});

// Expose auth functions to global scope for production compatibility
if (typeof window !== 'undefined') {
  window.getSupabase = getSupabase;
  window.getSession = getSession;
  window.getAccessToken = getAccessToken;
  window.requireAuth = requireAuth;
  window.signOut = signOut;
}
