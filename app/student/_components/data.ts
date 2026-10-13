import { supabase } from '../../../utils/supabase';
import { fetchProfile, type Profile } from '../../../utils/profile';

export type { Profile };

// The signed-in student's own profile (RLS limits every query to their rows).
export const loadProfile = (studentId: string) => fetchProfile(supabase, studentId);
