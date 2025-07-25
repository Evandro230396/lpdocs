
const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase conectado com sucesso!');
} else {
  console.warn('⚠️ Configurações do Supabase não encontradas. Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis de ambiente.');
}

module.exports = { supabase };
