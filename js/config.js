// Futura — shared configuration
const isLocal = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const FUTURA_CONFIG = {
  /** Set to your production origin (e.g. https://futura.vercel.app) for stable canonical/OG on previews. Leave '' to use window.location.origin. */
  PUBLIC_SITE_ORIGIN: '',
  SUPABASE_URL: 'https://cduuhdhpgcczdtomgsfy.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkdXVoZGhwZ2NjemR0b21nc2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MjQ3NDQsImV4cCI6MjEwNDIwMDc0NH0.vWW44Vul1FUpAZc2zNwkJwZXzI-WtzhwNrUEib-1MYU',
  API_BASE_URL: isLocal ? 'http://127.0.0.1:8789' : 'https://futura-api.sripadh.workers.dev',
  RAZORPAY_KEY_ID: 'rzp_test_TGCtM3iz8RakR1'
};

