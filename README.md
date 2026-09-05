# Digital Rebel (Futura) 🚀

**Digital Rebel** (codenamed "Futura") is a provocative, gamified personal finance and retirement planning web application. Designed with a neo-brutalist aesthetic, it transforms traditional retirement planning into an engaging, dynamic experience through virtual currency, AI-driven projections, and streak-based gamification.

---

## 🔗 Live Deployments & Demo
- **Live Frontend (Vercel):** [https://futura-soon.vercel.app](https://futura-soon.vercel.app)
- **Live API (Cloudflare Workers):** [https://futura-api.sripadh.workers.dev](https://futura-api.sripadh.workers.dev)
- **Demo Video:** [Google Drive Demo](https://drive.google.com/file/d/1ok30D5cx84UnO5U9_bZ1rEp2xS4XBoKl/view?usp=sharing)

---

## 🌟 Novelty & Gamification

Digital Rebel challenges mundane finance trackers by introducing intense gamification:
- **ZENS (Virtual Currency):** Users earn, purchase, and spend ZENS within the app to unlock features or simulate high-risk market trades without risking real capital.
- **Contributions & Streaks:** Users build and maintain "savings streaks" by logging regular contributions. Missing a month breaks the streak.
- **Elite Tier & Streak Recovery:** Users can purchase an "Elite" subscription (via Razorpay) to unlock Streak Recovery Tokens, ensuring their hard-earned streaks survive missed months.
- **AI-Driven Alpha (Rebel Signals):** Translates user portfolios into actionable (simulated) algorithmic trading insights based on real-time market data models.

---

## ⚙️ Tech Stack

Futura is built on a split-stack architecture, utilizing a lightweight static frontend interacting with a highly scalable serverless backend.

### Frontend
- **HTML/CSS/JS:** Pure Vanilla JavaScript and HTML for maximum performance and explicit DOM control.
- **Styling:** **Tailwind CSS v3** compiled via PostCSS, featuring a custom Neo-Brutalist design system (custom primary `#cafd00`, stark borders, hard shadows).
- **Icons & Typography:** Material Symbols Outlined, Google Fonts (Lexend, Inter).
- **Hosting:** **Vercel** with custom caching and security headers.
- **Payments:** Razorpay integration for ZENS top-ups and Elite subscriptions.

### Backend (API)
- **Framework:** **Hono.js** framework running on **Cloudflare Workers**.
- **Language:** TypeScript (`futura-api/`).
- **Authentication:** **Supabase Auth** (Google OAuth + JWT Bearer tokens).
- **Validation:** Zod schemas via `@hono/zod-validator`.

### Database
- **Provider:** **Supabase (PostgreSQL)** featuring strict Row-Level Security (RLS) policies, triggers, and RPC stored procedures.

---

## 🗄 Database Structure (Supabase)

The database models user profiles, financial goals, gamification mechanics, and subscriptions.

| Table | Key Columns | Description |
|---|---|---|
| **`profiles`** | `id`, `email`, `display_name`, `bio`, `age`, `retirement_age`, `monthly_income`, `target_monthly_income`, `zens`, `onboarding_complete` | Core user identity, tracking the current ZENS virtual balance. |
| **`user_goals`** | `user_id`, `current_age`, `retirement_age`, `target_monthly_income`, `annual_return_rate`, `risk_profile` | Financial targets used by the Monte Carlo projection engine. |
| **`contributions`** | `id`, `user_id`, `amount`, `contribution_date`, `note`, `currency` | A ledger of user savings and investments. |
| **`streaks`** | `user_id`, `current_streak`, `longest_streak`, `previous_streak`, `last_contribution_date` | Gamification tracking for continuous monthly contributions. |
| **`user_subscriptions`**| `user_id`, `entitlement` (`free`/`pro`/`elite`), `streak_recovery_tokens`, `expires_at` | Manages paywalled features and recovery token economies. |
| **`portfolio_holdings`**| `id`, `user_id`, `ticker`, `company_name`, `amount_zens`, `price_at_purchase`, `sold` | Virtual stock market portfolio and trade ledger. |

---

## 🖥 Core Features & Project Structure

The frontend consists of statically served pages seamlessly hydrated via Supabase and the Cloudflare Worker API.

### `futura/` Root (Frontend)
- **`index.html`:** The landing page and Google OAuth entry point.
- **`dashboard_digital_rebel_desktop.html`:** The central hub displaying active streaks, ZENS balances, and high-level projections.
- **`market_digital_rebel_desktop.html` & `market_detail.html`:** A simulated asset market where users can spend ZENS on virtual stocks to test volatility.
- **`projections_digital_rebel_desktop.html`:** A heavy Monte Carlo math engine visualizing corpus growth through interactive charts.
- **`transactions.html`:** Contribution history and CSV export functionality.
- **`cards_digital_rebel_desktop.html` & `add_card_digital_rebel.html`:** Virtual debit/credit card management UI.
- **`upgrade_digital_rebel_desktop.html` & `checkout_digital_rebel_desktop.html`:** Razorpay monetization flows.
- **`onboarding_*.html`:** 3-step onboarding flow for age, retirement goal, and monthly income targets.

### `futura-api/src/` (Backend)
- **`/lib/calculator.ts`:** Handles complex retirement ROI math and compounding projections.
- **`/middleware/auth.ts`:** Intercepts Supabase JWTs to ensure robust route protection.
- **`/routes/contributions.ts`:** Manages the streak algorithm, ensuring streaks break or increment conditionally based on timestamps.
- **`/routes/projection.ts`:** Exposes Monte Carlo calculation and multi-scenario comparison endpoints.
- **`/routes/zens.ts & subscriptions.ts`:** Securely processes Razorpay payment verification to credit ZENS or upgrade tiers.
- **`/routes/holdings.ts`:** Manages portfolio asset purchases and sales.

---

## 🚀 Setup & Execution

### 1. Database Setup (Supabase)
1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in Supabase and run the single unified script: [`supabase/full_schema.sql`](supabase/full_schema.sql).
3. Under **Authentication -> Providers -> Google**, enable Google OAuth and enter your Google Client ID & Secret.
4. Under **Authentication -> URL Configuration**, add your local URLs (`http://localhost:*`, `http://127.0.0.1:*`) and production Vercel URL to **Redirect URLs**.
5. Copy your **Project URL**, **`anon` public key**, and **`service_role` secret key** from **Project Settings -> API**.

### 2. API Setup (Cloudflare Workers)
1. Navigate to the API directory:
   ```bash
   cd futura-api
   npm install
   ```
2. Create `.dev.vars` (see `.dev.vars.example`):
   ```env
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   RAZORPAY_KEY_ID=<your-razorpay-key-id>
   RAZORPAY_KEY_SECRET=<your-razorpay-key-secret>
   FRONTEND_ORIGIN=*
   ```
3. Run locally for testing:
   ```bash
   npm run dev
   ```
4. Deploy to Cloudflare Workers:
   ```bash
   node upload_secrets.mjs
   npm run deploy
   ```

### 3. Frontend Setup
1. Open [`js/config.js`](js/config.js) and verify:
   ```javascript
   const FUTURA_CONFIG = {
     PUBLIC_SITE_ORIGIN: '',
     SUPABASE_URL: 'https://<your-project-ref>.supabase.co',
     SUPABASE_ANON_KEY: '<your-anon-key>',
     API_BASE_URL: isLocal ? 'http://127.0.0.1:8789' : 'https://<your-worker>.workers.dev',
     RAZORPAY_KEY_ID: '<your-razorpay-key-id>'
   };
   ```
2. Build Tailwind CSS:
   ```bash
   npm run build
   ```
3. Run with any static server (VS Code Live Server or `npx serve .`).

---

## 📝 License
© DIGITAL REBEL. All Rights Reserved. Not financial advice. Numbers are illustrative.
