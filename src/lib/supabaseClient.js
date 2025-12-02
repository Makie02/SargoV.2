
 import { createClient } from '@supabase/supabase-js';

 const supabaseUrl = 'https://ecserxlzqdyvnreshwte.supabase.co'
 const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjc2VyeGx6cWR5dm5yZXNod3RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MDU1NTgsImV4cCI6MjA3ODQ4MTU1OH0.G0IvKj2fwXmRcPOHy0A4ZDq-ceMFKAThkdW2u3bc1rE'

 export const supabase = createClient(supabaseUrl, supabaseKey);
