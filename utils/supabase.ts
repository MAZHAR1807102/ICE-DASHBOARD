import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client: the logged-in user's session lives in cookies, so every query
// runs as that user and the database's Row Level Security decides what they can touch.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
