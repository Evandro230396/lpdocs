
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE são necessárias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestUser() {
  try {
    console.log('🔧 Criando usuário de teste...');
    
    // Senha em texto simples
    const password = 'admin123';
    
    // Criar usuário admin
    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .insert({
        name: 'Administrador',
        email: 'admin@sistema.com',
        password_hash: password, // Senha em texto simples
        role: 'admin',
        is_active: true
      })
      .select()
      .single();

    if (adminError) {
      if (adminError.code === '23505') {
        console.log('⚠️ Usuário admin@sistema.com já existe');
      } else {
        console.error('❌ Erro ao criar admin:', adminError);
      }
    } else {
      console.log('✅ Usuário admin criado:', adminUser);
    }

    // Criar usuário comum
    const { data: commonUser, error: commonError } = await supabase
      .from('users')
      .insert({
        name: 'Usuário Teste',
        email: 'usuario@teste.com',
        password_hash: password, // Senha em texto simples
        role: 'user',
        is_active: true
      })
      .select()
      .single();

    if (commonError) {
      if (commonError.code === '23505') {
        console.log('⚠️ Usuário usuario@teste.com já existe');
      } else {
        console.error('❌ Erro ao criar usuário:', commonError);
      }
    } else {
      console.log('✅ Usuário comum criado:', commonUser);
    }

    // Verificar usuários existentes
    console.log('\n📋 Verificando usuários existentes...');
    const { data: allUsers, error: listError } = await supabase
      .from('users')
      .select('id, name, email, role, is_active, created_at');

    if (listError) {
      console.error('❌ Erro ao listar usuários:', listError);
    } else {
      console.log('👥 Usuários na base de dados:');
      allUsers.forEach(user => {
        console.log(`   - ${user.name} (${user.email}) - Papel: ${user.role} - Ativo: ${user.is_active}`);
      });
    }

    console.log('\n🔐 Credenciais para teste:');
    console.log('   Email: admin@sistema.com');
    console.log('   Senha: admin123');
    console.log('   ou');
    console.log('   Email: usuario@teste.com');
    console.log('   Senha: admin123');

  } catch (error) {
    console.error('❌ Erro ao criar usuários:', error);
  }
}

createTestUser();
