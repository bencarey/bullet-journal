// Template for config.js (which holds the app's live Supabase values).
// The Supabase anon key is public-by-design, BUT this repo is public — so the
// anon key may only be committed once Row Level Security + Auth are enabled,
// otherwise anyone could read/write the journal. Empty config => local-only.
window.JOURNAL_CONFIG = {
  supabase: {
    url: 'https://YOUR-PROJECT.supabase.co',
    key: 'YOUR-ANON-KEY'
    // token: '<set later for authenticated sync>'
  }
};
