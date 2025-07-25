
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE; // Use service role key for admin operations

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE são necessárias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupDatabase() {
  try {
    console.log('🔧 Configurando banco de dados no Supabase...');
    
    // Read the SQL schema file
    const schema = fs.readFileSync('database-schema.sql', 'utf8');
    
    // Split SQL commands and execute them one by one
    const commands = schema.split(';').filter(cmd => cmd.trim());
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i].trim();
      if (command) {
        console.log(`Executando comando ${i + 1}/${commands.length}...`);
        
        const { error } = await supabase.rpc('exec_sql', { sql: command });
        
        if (error) {
          console.error(`❌ Erro no comando ${i + 1}:`, error);
          // Continue with other commands even if one fails
        } else {
          console.log(`✅ Comando ${i + 1} executado com sucesso`);
        }
      }
    }
    
    console.log('🎉 Configuração do banco de dados concluída!');
    console.log('✅ Tabelas criadas: envelopes, signatures, envelope_events');
    
  } catch (error) {
    console.error('❌ Erro ao configurar banco de dados:', error);
  }
}

setupDatabase();
