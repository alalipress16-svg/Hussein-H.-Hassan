// بيانات الاتصال العامة بمشروع Supabase.
// ضع Project URL وPublishable/Anon Key للمشروع الصحيح هنا.
// لا تضع service_role أو أي مفتاح سري في هذا الملف.
const SUPABASE_URL = "https://buqbkxdebnobfhvtwgbj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Yh8-Um1IruyaZBgRyg-beA_LIFYvfUA";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
