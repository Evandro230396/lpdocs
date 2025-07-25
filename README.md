
# LP Docs - Sistema de Assinaturas Digitais

**Onde tecnologia e compromisso se encontram**

Sistema completo de assinaturas digitais desenvolvido em Node.js com integração ao Supabase para gerenciamento de documentos e assinaturas eletrônicas.

## 🚀 Funcionalidades

- ✅ Upload e gestão de documentos PDF
- ✅ Criação de envelopes de assinatura
- ✅ Posicionamento personalizado de assinaturas
- ✅ Envio automático de emails para signatários
- ✅ Interface web responsiva para assinatura
- ✅ Rastreamento completo do processo
- ✅ Download de documentos assinados
- ✅ Painel administrativo
- ✅ Sistema de autenticação e autorização
- ✅ Notificações por email via Resend
- ✅ Exclusão automática de arquivos após conclusão

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js + Express
- **Banco de Dados**: Supabase (PostgreSQL)
- **Manipulação de PDF**: pdf-lib
- **Envio de Emails**: Resend
- **Autenticação**: JWT
- **Frontend**: HTML, CSS, JavaScript vanilla

## 📋 Pré-requisitos

- Node.js (versão 18 ou superior)
- Conta no Supabase
- Conta no Resend (para envio de emails)

## ⚙️ Configuração

1. Clone o repositório:
```bash
git clone https://github.com/Evandro230396/lpdocs.git
cd lpdocs
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
- `SUPABASE_URL`: URL do seu projeto Supabase
- `SUPABASE_ANON_KEY`: Chave anônima do Supabase
- `SUPABASE_SERVICE_ROLE`: Chave de serviço do Supabase
- `RESEND_API_KEY`: Chave da API do Resend
- `JWT_SECRET`: Chave secreta para JWT

4. Configure o banco de dados:
```bash
node setup-database.js
```

5. Crie usuário de teste:
```bash
node create-test-user.js
```

## 🚀 Execução

```bash
node index.js
```

O servidor estará disponível em `http://localhost:5000`

## 📁 Estrutura do Projeto

```
lpdocs/
├── public/           # Arquivos estáticos (HTML, CSS, JS)
├── uploads/          # Diretório para arquivos temporários
├── index.js          # Servidor principal
├── supabase-config.js # Configuração do Supabase
├── setup-database.js # Script de configuração do BD
├── create-test-user.js # Script para criar usuários de teste
└── database-schema.sql # Schema do banco de dados
```

## 🔐 Credenciais de Teste

- **Email**: admin@sistema.com
- **Senha**: admin123

## 📧 Funcionalidades de Email

O sistema envia automaticamente:
- Links de assinatura para signatários
- Notificações de documentos assinados
- PDFs finalizados para todos os participantes

## 🔒 Segurança

- Autenticação JWT
- Validação de dados de entrada
- Controle de acesso baseado em roles
- Rastreamento de IP e User-Agent
- Links únicos e seguros para assinatura

## 📄 Licença

Este projeto está sob a licença MIT.

## 🤝 Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues e pull requests.

## 📞 Suporte

Para suporte, entre em contato através do email: evandro@lpprojetos.net
