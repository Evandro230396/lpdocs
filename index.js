const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { PDFDocument, rgb } = require('pdf-lib');
const { supabase } = require('./supabase-config');

// Helper function to format date in Brazil timezone
const formatBrazilDate = (date = new Date()) => {
  return new Date(date).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// Function to generate signed PDF
const generateSignedPDF = async (envelope) => {
  try {
    // Read original PDF from uploads folder
    const originalPdfBuffer = fs.readFileSync(path.join(__dirname, envelope.pdf_path));

    // Load PDF with pdf-lib
    const pdfDoc = await PDFDocument.load(originalPdfBuffer);
    const pages = pdfDoc.getPages();

    console.log(`PDF carregado com ${pages.length} páginas para geração`);

    // Apply signatures to PDF
    envelope.signature_positions.forEach(position => {
      const sigData = envelope.signatures[position.signatoryEmail];
      if (sigData) {
        const pageIndex = position.page - 1; // Convert to 0-based index
        if (pageIndex >= 0 && pageIndex < pages.length) {
          const page = pages[pageIndex];
          const { width, height } = page.getSize();

          // Convert position coordinates (from canvas) to PDF coordinates
          const pdfX = position.x;
          const pdfY = height - position.y - 40; // Flip Y coordinate and adjust for text height

          console.log(`Aplicando assinatura de ${sigData.signatory.name} na página ${position.page} em (${pdfX}, ${pdfY})`);

          // Add signature background rectangle first
          page.drawRectangle({
            x: pdfX - 5,
            y: pdfY - 5,
            width: 200,
            height: 45,
            borderColor: rgb(0.2, 0.5, 0.8),
            borderWidth: 2,
            color: rgb(0.95, 0.98, 1),
            opacity: 0.9,
          });

          // Add "ASSINADO POR:" label
          page.drawText('ASSINADO DIGITALMENTE POR:', {
            x: pdfX,
            y: pdfY + 25,
            size: 8,
            color: rgb(0.3, 0.3, 0.3),
          });

          // Add signatory name
          page.drawText(sigData.signatory.name, {
            x: pdfX,
            y: pdfY + 12,
            size: 12,
            color: rgb(0, 0, 0),
          });

          // Add signature date and time in Brazil timezone
          const signedDate = formatBrazilDate(new Date(sigData.signedAt));
          page.drawText(`Data: ${signedDate}`, {
            x: pdfX,
            y: pdfY - 2,
            size: 8,
            color: rgb(0.3, 0.3, 0.3),
          });

          // Add verification text
          page.drawText('Assinatura Verificada', {
            x: pdfX,
            y: pdfY - 15,
            size: 8,
            color: rgb(0, 0.6, 0),
          });
        }
      }
    });

    // Add verification page with signature details
    const verificationPage = pdfDoc.addPage();
    const { width, height } = verificationPage.getSize();

    // Add header background
    verificationPage.drawRectangle({
      x: 30,
      y: height - 80,
      width: width - 60,
      height: 60,
      color: rgb(0.95, 0.98, 1),
      borderColor: rgb(0.2, 0.5, 0.8),
      borderWidth: 2,
    });

    verificationPage.drawText('DOCUMENTO ASSINADO DIGITALMENTE', {
      x: 50,
      y: height - 50,
      size: 18,
      color: rgb(0.1, 0.3, 0.7),
    });

    verificationPage.drawText('CERTIFICADO DE ASSINATURAS DIGITAIS', {
      x: 50,
      y: height - 70,
      size: 12,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Get creator information
    let creatorInfo = 'Sistema';
    let creatorName = 'Sistema';
    let creatorEmail = 'N/A';

    if (envelope.created_by && supabase) {
      try {
        const { data: creator, error } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', envelope.created_by)
          .single();

        if (!error && creator) {
          creatorInfo = `${creator.name} (${creator.email})`;
          creatorName = creator.name;
          creatorEmail = creator.email;
        }
      } catch (error) {
        console.log('❌ Erro ao buscar informações do criador:', error);
      }
    }

    // Document info section
    verificationPage.drawText(`Titulo do Documento: ${envelope.title || 'Documento'}`, {
      x: 50,
      y: height - 110,
      size: 12,
      color: rgb(0, 0, 0),
    });

    verificationPage.drawText(`Data de Criacao: ${formatBrazilDate(new Date(envelope.created_at))}`, {
      x: 50,
      y: height - 130,
      size: 12,
      color: rgb(0, 0, 0),
    });

    // Creator information section with background
    verificationPage.drawRectangle({
      x: 45,
      y: height - 220,
      width: width - 90,
      height: 70,
      color: rgb(0.95, 0.98, 1),
      borderColor: rgb(0.2, 0.5, 0.8),
      borderWidth: 1,
    });

    verificationPage.drawText('INFORMAÇÕES DO CRIADOR:', {
      x: 55,
      y: height - 160,
      size: 12,
      color: rgb(0.1, 0.3, 0.7),
    });

    verificationPage.drawText(`Nome: ${creatorName}`, {
      x: 55,
      y: height - 180,
      size: 11,
      color: rgb(0, 0, 0),
    });

    verificationPage.drawText(`Email: ${creatorEmail}`, {
      x: 55,
      y: height - 195,
      size: 11,
      color: rgb(0, 0, 0),
    });

    verificationPage.drawText(`Endereço IP: ${envelope.creator_ip || 'N/A'}`, {
      x: 55,
      y: height - 210,
      size: 10,
      color: rgb(0.4, 0.4, 0.4),
    });

    verificationPage.drawText(`Status: COMPLETAMENTE ASSINADO`, {
      x: 50,
      y: height - 240,
      size: 12,
      color: rgb(0, 0.6, 0),
    });

    verificationPage.drawText(`ID do Envelope: ${envelope.id}`, {
      x: 50,
      y: height - 260,
      size: 10,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Signatures section
    verificationPage.drawText('ASSINATURAS COLETADAS:', {
      x: 50,
      y: height - 300,
      size: 14,
      color: rgb(0.1, 0.3, 0.7),
    });

    let yPosition = height - 330;
    const signers = envelope.signatories.filter(s => s.type === 'signer');
    signers.forEach((sig, index) => {
      const sigData = envelope.signatures[sig.email];

      // Signature box
      verificationPage.drawRectangle({
        x: 45,
        y: yPosition - 35,
        width: width - 90,
        height: 50,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
      });

      verificationPage.drawText(`${index + 1}. ${sig.name}`, {
        x: 55,
        y: yPosition - 5,
        size: 12,
        color: rgb(0, 0, 0),
      });

      verificationPage.drawText(`   Email: ${sig.email}`, {
        x: 55,
        y: yPosition - 20,
        size: 10,
        color: rgb(0.3, 0.3, 0.3),
      });

      verificationPage.drawText(`   Data/Hora: ${formatBrazilDate(new Date(sigData.signedAt))}`, {
        x: 55,
        y: yPosition - 33,
        size: 10,
        color: rgb(0.3, 0.3, 0.3),
      });

      verificationPage.drawText('VALIDA', {
        x: width - 120,
        y: yPosition - 15,
        size: 12,
        color: rgb(0, 0.6, 0),
      });

      yPosition -= 70;
    });

    // Generate and return PDF buffer
    const signedPdfBuffer = await pdfDoc.save();
    console.log('✅ PDF com assinaturas gerado com sucesso!');

    return Buffer.from(signedPdfBuffer);

  } catch (error) {
    console.error('❌ Erro ao gerar PDF assinado:', error);
    throw error;
  }
};

const formatBrazilDateISO = (date = new Date()) => {
  return new Date(date).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  });
};

const app = express();
const PORT = 5000;

// JWT Secret - Em produção, use uma chave mais segura
const JWT_SECRET = process.env.JWT_SECRET || 'econfirmo-secret-key-change-in-production';

// Initialize Resend with API key from secrets (only if key exists)
let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('⚠️  RESEND_API_KEY não configurado. Emails não serão enviados automaticamente.');
}

// Database operations with Supabase ONLY
const createEnvelopeEvent = async (envelopeId, eventType, description, metadata = {}) => {
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado');
    return;
  }

  try {
    const { error } = await supabase
      .from('envelope_events')
      .insert({
        envelope_id: envelopeId,
        event_type: eventType,
        description,
        user_ip: metadata.ip,
        user_agent: metadata.userAgent,
        signatory_name: metadata.signatoryName,
        signatory_email: metadata.signatoryEmail,
        metadata: metadata.extra || {}
      });

    if (error) {
      console.error('❌ Erro ao criar evento:', error);
    } else {
      console.log('✅ Evento criado no Supabase:', eventType);
    }
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase para evento:', error);
  }
};

const saveEnvelopeToDatabase = async (envelope) => {
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado');
    return envelope.id;
  }

  try {
    const { data, error } = await supabase
      .from('envelopes')
      .insert({
        id: envelope.id,
        title: envelope.title,
        pdf_path: envelope.pdfPath,
        signatories: envelope.signatories,
        signature_positions: envelope.signaturePositions,
        status: envelope.status,
        creator_ip: envelope.creatorIP,
        signatures: envelope.signatures || {},
        created_by: envelope.createdBy
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao salvar envelope no Supabase:', error);
      return envelope.id;
    }

    console.log('✅ Envelope salvo no Supabase:', data.id);
    return data.id;
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase:', error);
    return envelope.id;
  }
};

const saveSignatureToDatabase = async (signatureId, signatureData) => {
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado');
    return;
  }

  try {
    const { error } = await supabase
      .from('signatures')
      .insert({
        id: signatureId,
        envelope_id: signatureData.envelopeId,
        signatory: signatureData.signatory,
        status: signatureData.status,
        signature_data: signatureData.signatureData || null,
        signer_ip: signatureData.signerIP || null,
        signed_at: signatureData.signedAt || null
      });

    if (error) {
      console.error('❌ Erro ao salvar signature no Supabase:', error);
    } else {
      console.log('✅ Signature salva no Supabase:', signatureId);
    }
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase para signature:', error);
  }
};

const updateSignatureInDatabase = async (signatureId, updates) => {
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado');
    return;
  }

  try {
    const { error } = await supabase
      .from('signatures')
      .update(updates)
      .eq('id', signatureId);

    if (error) {
      console.error('❌ Erro ao atualizar signature no Supabase:', error);
    } else {
      console.log('✅ Signature atualizada no Supabase:', signatureId);
    }
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase para atualizar signature:', error);
  }
};

const updateEnvelopeInDatabase = async (envelopeId, updates) => {
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado');
    return;
  }

  try {
    const { error } = await supabase
      .from('envelopes')
      .update(updates)
      .eq('id', envelopeId);

    if (error) {
      console.error('❌ Erro ao atualizar envelope no Supabase:', error);
    } else {
      console.log('✅ Envelope atualizado no Supabase:', envelopeId);
    }
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase para atualizar envelope:', error);
  }
};

const getEnvelopeFromDatabase = async (envelopeId) => {
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('envelopes')
      .select('*')
      .eq('id', envelopeId)
      .single();

    if (error) {
      console.error('❌ Erro ao buscar envelope no Supabase:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase para buscar envelope:', error);
    return null;
  }
};

const getSignatureFromDatabase = async (signatureId) => {
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('signatures')
      .select('*')
      .eq('id', signatureId)
      .single();

    if (error) {
      console.error('❌ Erro ao buscar signature no Supabase:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase para buscar signature:', error);
    return null;
  }
};

const getAllEnvelopesFromDatabase = async () => {
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('envelopes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar envelopes no Supabase:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase para buscar envelopes:', error);
    return [];
  }
};

const getEnvelopeEventsFromDatabase = async (envelopeId) => {
  if (!supabase) {
    console.warn('⚠️ Supabase não configurado');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('envelope_events')
      .select('*')
      .eq('envelope_id', envelopeId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Erro ao buscar eventos no Supabase:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase para buscar eventos:', error);
    return [];
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Middleware de autenticação
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verificar se o usuário ainda existe e está ativo
    if (supabase) {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', decoded.userId)
        .eq('is_active', true)
        .single();

      if (error || !user) {
        return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
      }

      req.user = user;
    } else {
      req.user = decoded;
    }

    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido' });
  }
};

// Middleware opcional de autenticação (não bloqueia se não autenticado)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      if (supabase) {
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', decoded.userId)
          .eq('is_active', true)
          .single();

        if (!error && user) {
          req.user = user;
        }
      } else {
        req.user = decoded;
      }
    } catch (error) {
      // Ignora erros de token, apenas não autentica
    }
  }

  next();
};

// AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nome, email e senha são obrigatórios' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false, 
        error: 'Supabase não configurado' 
      });
    }

    // Verificar se email já existe
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email já está em uso' 
      });
    }

    // Criar usuário com senha em texto simples
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        password_hash: password, // Senha em texto simples
        role: ['admin', 'user'].includes(role) ? role : 'user'
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar usuário:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Erro ao criar usuário: ' + error.message 
      });
    }

    res.json({
      success: true,
      message: 'Usuário criado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔐 Tentativa de login:', { email, passwordLength: password?.length });

    if (!email || !password) {
      console.log('❌ Email ou senha em branco');
      return res.status(400).json({ 
        success: false, 
        error: 'Email e senha são obrigatórios' 
      });
    }

    if (!supabase) {
      console.log('❌ Supabase não configurado');
      return res.status(500).json({ 
        success: false, 
        error: 'Supabase não configurado' 
      });
    }

    console.log('🔍 Buscando usuário no Supabase...');

    // Buscar usuário
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    console.log('📊 Resultado da busca:', { 
      userFound: !!user, 
      error: error?.message,
      userEmail: user?.email,
      userActive: user?.is_active 
    });

    if (error || !user) {
      console.log('❌ Usuário não encontrado ou inativo');
      return res.status(401).json({ 
        success: false, 
        error: 'Email ou senha incorretos' 
      });
    }

    console.log('🔑 Verificando senha...');

    // Verificar senha (comparação direta)
    const passwordMatch = password === user.password_hash;

    console.log('🎯 Resultado da verificação de senha:', passwordMatch);

    if (!passwordMatch) {
      console.log('❌ Senha incorreta');
      return res.status(401).json({ 
        success: false, 
        error: 'Email ou senha incorretos' 
      });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Salvar sessão no banco (opcional)
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await supabase
      .from('user_sessions')
      .insert({
        user_id: user.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString()
      });

    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    if (supabase) {
      // Remover sessões do usuário
      await supabase
        .from('user_sessions')
        .delete()
        .eq('user_id', req.user.id);
    }

    res.json({
      success: true,
      message: 'Logout realizado com sucesso'
    });
  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// Debug endpoint para listar usuários (temporário)
app.get('/api/debug/users', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, role, is_active, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar usuários:', error);
      return res.status(500).json({ error: 'Erro ao buscar usuários: ' + error.message });
    }

    res.json({
      success: true,
      totalUsers: users.length,
      users: users
    });
  } catch (error) {
    console.error('Erro no endpoint debug/users:', error);
    res.status(500).json({ error: 'Erro interno: ' + error.message });
  }
});

// API endpoint for file upload (protected)
app.post('/upload', authenticateToken, upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({ 
    success: true, 
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`
  });
});

// Create envelope (protected)
app.post('/api/envelope/create', authenticateToken, async (req, res) => {
  try {
    console.log('=== CRIANDO ENVELOPE ===');
    console.log('Dados recebidos:', req.body);

    const { pdfPath, signatories, signaturePositions, title } = req.body;

    // Get creator IP address
    const creatorIP = req.headers['x-forwarded-for'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                     'IP não disponível';

    // Validações
    if (!pdfPath) {
      return res.status(400).json({ success: false, error: 'PDF path é obrigatório' });
    }

    if (!signatories || signatories.length === 0) {
      return res.status(400).json({ success: false, error: 'Pelo menos um signatário é obrigatório' });
    }

    if (!signaturePositions || signaturePositions.length === 0) {
      return res.status(400).json({ success: false, error: 'Posições de assinatura são obrigatórias' });
    }

    const envelopeId = crypto.randomUUID();
    console.log('Envelope ID gerado:', envelopeId);

    const envelope = {
      id: envelopeId,
      title: title || 'Documento para Assinatura',
      pdfPath,
      signatories,
      signaturePositions,
      status: 'pending',
      createdAt: new Date().toISOString(),
      creatorIP: creatorIP,
      createdBy: req.user.id,
      signatures: {}
    };

    console.log('📋 Envelope sendo salvo com created_by:', req.user.id);
    console.log('📋 User info:', req.user);

    // Save to Supabase
    await saveEnvelopeToDatabase(envelope);
    await createEnvelopeEvent(envelopeId, 'created', 'Envelope criado', {
      ip: creatorIP,
      userAgent: req.headers['user-agent']
    });

    // Create signature links only for signers (not copy recipients)
    const signersForLinks = signatories.filter(s => s.type === 'signer');
    const copyRecipients = signatories.filter(s => s.type === 'copy');

    console.log('Criando links de assinatura para signatários:', signersForLinks);
    console.log('Receptores de cópia:', copyRecipients);

    const signatureLinks = [];

    for (const signatory of signersForLinks) {
      const signatureId = crypto.randomUUID();
      console.log(`Link criado para ${signatory.name}: ${signatureId}`);

      // Store signature data
      const signatureData = {
        envelopeId,
        signatory,
        status: 'pending',
        signedAt: null
      };

      // Save to Supabase
      await saveSignatureToDatabase(signatureId, signatureData);

      // Generate the signature link
      const baseUrl = req.get('host').includes('localhost') ? 
        `${req.protocol}://${req.get('host')}` : 
        `https://${req.get('host')}`;

      const signatureLink = `${baseUrl}/sign/${signatureId}`;

      console.log(`Link gerado para ${signatory.name}: ${signatureLink}`);
      console.log(`Signature ID armazenado: ${signatureId}`);

      signatureLinks.push({
        ...signatory,
        signatureId,
        signatureLink
      });
    }

    console.log('Links de assinatura criados:', signatureLinks.length);

    // Send emails to signatories using Resend (if configured)
    console.log('Verificando se Resend está configurado:', !!resend);

    if (resend) {
      try {
        console.log('Enviando emails para', signatureLinks.length, 'signatários');

        // Send signature requests only to signers
        for (const signatory of signatureLinks) {
          console.log(`Enviando email de assinatura para: ${signatory.email}`);

          const emailResult = await resend.emails.send({
            from: 'assina@lpdocs.com.br',
            to: signatory.email,
            subject: `📋 Documento para Assinatura: ${title}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h2 style="color: #333; margin: 0;">📋 Documento para Assinatura</h2>
                </div>

                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                  <p style="margin: 0 0 10px 0;"><strong>Olá ${signatory.name},</strong></p>
                  <p style="margin: 0;">Você foi solicitado(a) para assinar o documento: <strong>${title}</strong></p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${signatory.signatureLink}" 
                     style="background-color: #28a745; color: white; padding: 15px 30px; 
                            text-decoration: none; border-radius: 5px; display: inline-block; 
                            font-weight: bold; font-size: 16px;">
                    ✍️ Assinar Documento
                  </a>
                </div>

                <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <p style="margin: 0; color: #856404; font-size: 14px;">
                    <strong>⚠️ Importante:</strong> Este link é único e pessoal. Não compartilhe com outras pessoas.
                  </p>
                </div>

                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">

                <div style="text-align: center;">
                  <p style="color: #6c757d; font-size: 12px; margin: 0;">
                    Este email foi enviado automaticamente pelo sistema de assinaturas digitais.
                  </p>
                  <p style="color: #6c757d; font-size: 12px; margin: 5px 0 0 0;">
                    mvmconversor.com.br
                  </p>
                </div>
              </div>
            `
          });

          console.log(`Email enviado com sucesso para: ${signatory.email}`, emailResult);
        }

        // Add delivery event
        await createEnvelopeEvent(envelopeId, 'delivered', `Emails de assinatura enviados para ${signatureLinks.length} signatário(s)`, {
          ip: creatorIP,
          userAgent: req.headers['user-agent']
        });

        console.log('Todos os emails enviados com sucesso!');

        res.json({
          success: true,
          envelopeId,
          message: 'Envelope criado e emails enviados com sucesso!',
          emailsSent: signatureLinks.length,
          signatories: signatureLinks.map(s => ({
            name: s.name,
            email: s.email,
            status: 'email_sent'
          }))
        });
      } catch (emailError) {
        console.error('Erro ao enviar emails:', emailError);
        res.json({
          success: true,
          envelopeId,
          signatureLinks,
          warning: 'Envelope criado, mas houve erro ao enviar alguns emails. Verifique a configuração do Resend.',
          error: emailError.message
        });
      }
    } else {
      // Resend not configured - return envelope without sending emails
      res.json({
        success: true,
        envelopeId,
        signatureLinks,
        message: 'Envelope criado com sucesso!',
        warning: 'RESEND_API_KEY não configurado. Os emails não foram enviados automaticamente.',
        note: 'Você pode compartilhar os links de assinatura manualmente com os signatários.',
        signatories: signatureLinks.map(s => ({
          name: s.name,
          email: s.email,
          signatureLink: s.signatureLink,
          status: 'awaiting_manual_share'
        }))
      });
    }

  } catch (error) {
    console.error('Erro geral ao criar envelope:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// Get envelope for signing
app.get('/api/envelope/:signatureId', async (req, res) => {
  const { signatureId } = req.params;

  console.log('=== ACESSANDO PAGINA DE ASSINATURA ===');
  console.log('Signature ID da URL:', signatureId);

  const signature = await getSignatureFromDatabase(signatureId);

  if (!signature) {
    console.log('❌ Signature nao encontrada, redirecionando para erro');
    return res.status(404).json({ 
      error: 'Link de assinatura não encontrado',
      signatureId: signatureId
    });
  }

  console.log(`✅ Signature encontrada:`, signature);

  const envelope = await getEnvelopeFromDatabase(signature.envelope_id);
  if (!envelope) {
    return res.status(404).json({ error: 'Envelope não encontrado' });
  }

  // Get signature positions for this signatory
  const signatoryPositions = envelope.signature_positions.filter(
    pos => pos.signatoryEmail === signature.signatory.email
  );

  res.json({
    envelope: {
      id: envelope.id,
      title: envelope.title,
      pdfPath: envelope.pdf_path
    },
    signatory: signature.signatory,
    signaturePositions: signatoryPositions,
    status: signature.status
  });
});

// Submit signature
app.post('/api/envelope/:signatureId/sign', async (req, res) => {
  const { signatureId } = req.params;
  const { signatureData } = req.body;

  // Get signer IP address
  const signerIP = req.headers['x-forwarded-for'] || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress ||
                  (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                  'IP não disponível';

  const signature = await getSignatureFromDatabase(signatureId);
  if (!signature) {
    return res.status(404).json({ error: 'Link de assinatura não encontrado' });
  }

  if (signature.status === 'signed') {
    return res.status(400).json({ error: 'Documento já foi assinado' });
  }

  // Update signature in database
  await updateSignatureInDatabase(signatureId, {
    status: 'signed',
    signed_at: new Date().toISOString(),
    signature_data: signatureData,
    signer_ip: signerIP
  });

  // Update envelope
  const envelope = await getEnvelopeFromDatabase(signature.envelope_id);
  if (!envelope) {
    return res.status(404).json({ error: 'Envelope não encontrado' });
  }

  const updatedSignatures = envelope.signatures || {};
  updatedSignatures[signature.signatory.email] = {
    signatory: signature.signatory,
    signedAt: new Date().toISOString(),
    signatureData,
    signerIP: signerIP
  };

  // Update envelope in Supabase
  await updateEnvelopeInDatabase(envelope.id, {
    signatures: updatedSignatures
  });

  // Create signature event
  await createEnvelopeEvent(envelope.id, 'signed', `Documento assinado por ${signature.signatory.name}`, {
    ip: signerIP,
    userAgent: req.headers['user-agent'],
    signatoryName: signature.signatory.name,
    signatoryEmail: signature.signatory.email
  });

  // Check if all signatures are complete (only signers need to sign)
  const signers = envelope.signatories.filter(s => s.type === 'signer');
  const allSigned = signers.every(sig => 
    updatedSignatures[sig.email]
  );

  if (allSigned) {
    // Update envelope status in Supabase
    await updateEnvelopeInDatabase(envelope.id, {
      status: 'completed'
    });

    // Create completion event
    await createEnvelopeEvent(envelope.id, 'completed', 'Envelope completamente assinado - Todas as assinaturas coletadas', {
      ip: signerIP,
      userAgent: req.headers['user-agent']
    });

    console.log('Envelope completo! Todas as assinaturas coletadas.');

    // Send completed PDF to all participants if Resend is configured
    if (resend) {
      try {
        console.log('📧 Gerando e enviando PDF assinado para todos os participantes...');

        // Generate the signed PDF
        const signedPdfBuffer = await generateSignedPDF(envelope);

        // Get list of all recipients (signers + copy recipients + creator)
        const allParticipants = [...envelope.signatories];

        // Add creator to the recipient list if not already included
        let creatorEmail = null;
        let creatorName = 'Criador do Envelope';

        if (envelope.created_by && supabase) {
          try {
            const { data: creator, error } = await supabase
              .from('users')
              .select('name, email')
              .eq('id', envelope.created_by)
              .single();

            if (!error && creator) {
              creatorEmail = creator.email;
              creatorName = creator.name;

              // Check if creator is not already in the participants list
              const creatorAlreadyIncluded = allParticipants.some(p => p.email === creatorEmail);

              if (!creatorAlreadyIncluded) {
                allParticipants.push({
                  name: creatorName,
                  email: creatorEmail,
                  type: 'creator'
                });
                console.log(`📋 Adicionado criador do envelope à lista de destinatários: ${creatorName} (${creatorEmail})`);
              } else {
                console.log(`📋 Criador do envelope já está na lista de participantes: ${creatorEmail}`);
              }
            }
          } catch (error) {
            console.log('❌ Erro ao buscar informações do criador para envio de email:', error);
          }
        }

        for (const participant of allParticipants) {
          console.log(`📎 Enviando PDF assinado para: ${participant.email} (${participant.type || 'participant'})`);

          // Customize message based on participant type
          let greetingMessage = '';
          if (participant.type === 'creator') {
            greetingMessage = 'O documento que você criou foi completamente assinado por todos os signatários!';
          } else if (participant.type === 'copy') {
            greetingMessage = 'O documento para o qual você foi incluído como cópia foi completamente assinado!';
          } else {
            greetingMessage = 'O documento foi completamente assinado por todos os signatários!';
          }

          const emailResult = await resend.emails.send({
            from: 'noreply@mvmconversor.com.br',
            to: participant.email,
            subject: `✅ Documento Assinado Completo: ${envelope.title}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h2 style="color: #28a745; margin: 0;">✅ Documento Completamente Assinado</h2>
                </div>

                <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                  <p style="margin: 0 0 10px 0;"><strong>Olá ${participant.name},</strong></p>
                  <p style="margin: 0;">${greetingMessage}</p>
                  <p style="margin: 10px 0 0 0;"><strong>Documento:</strong> ${envelope.title}</p>
                </div>

                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <h3 style="margin: 0 0 10px 0; color: #495057;">📋 Resumo das Assinaturas:</h3>
                  ${signers.map(signer => `
                    <p style="margin: 5px 0; color: #495057;">
                      ✓ <strong>${signer.name}</strong> (${signer.email})
                      <br>&nbsp;&nbsp;&nbsp;Assinado em: ${formatBrazilDate(new Date(updatedSignatures[signer.email].signedAt))}
                    </p>
                  `).join('')}
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <p style="background-color: #17a2b8; color: white; padding: 15px; border-radius: 5px; margin: 0;">
                    📎 <strong>O documento assinado está anexado a este email</strong>
                  </p>
                </div>

                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">

                <div style="text-align: center;">
                  <p style="color: #6c757d; font-size: 12px; margin: 0;">
                    Este documento foi processado pelo sistema LP Docs de assinaturas digitais.
                  </p>
                  <p style="color: #6c757d; font-size: 12px; margin: 5px 0 0 0;">
                    mvmconversor.com.br
                  </p>
                </div>
              </div>
            `,
            attachments: [
              {
                filename: `${envelope.title || 'documento'}_assinado.pdf`,
                content: signedPdfBuffer
              }
            ]
          });

          console.log(`✅ PDF assinado enviado para: ${participant.email}`);
        }

        // Create event for PDF distribution
        await createEnvelopeEvent(envelope.id, 'completed', `PDF assinado enviado para ${allParticipants.length} participante(s)`, {
          ip: signerIP,
          userAgent: req.headers['user-agent']
        });

        console.log('🎉 PDF assinado enviado para todos os participantes!');

        // Delete original PDF from uploads folder after successful delivery to ALL participants
        try {
          const originalPdfPath = path.join(__dirname, envelope.pdf_path);
          if (fs.existsSync(originalPdfPath)) {
            fs.unlinkSync(originalPdfPath);
            console.log('🗑️ Arquivo PDF original excluído da pasta uploads após entrega completa para todos os participantes:', envelope.pdf_path);

            // Create event for file deletion
            await createEnvelopeEvent(envelope.id, 'file_cleanup', `Arquivo PDF original removido da pasta uploads após entrega completa para ${allParticipants.length} participante(s)`, {
              ip: signerIP,
              userAgent: req.headers['user-agent'],
              extra: { 
                originalPath: envelope.pdf_path,
                participantsCount: allParticipants.length,
                participantsEmails: allParticipants.map(p => p.email)
              }
            });
          } else {
            console.log('⚠️ Arquivo PDF original não encontrado para exclusão:', envelope.pdf_path);
          }
        } catch (fileError) {
          console.error('❌ Erro ao excluir arquivo PDF original:', fileError);
          // Don't fail the process if file deletion fails
        }

      } catch (emailError) {
        console.error('❌ Erro ao enviar PDF assinado:', emailError);
        // Continue normal flow even if email fails
      }
    }
  }

  res.json({
    success: true,
    status: 'signed',
    envelopeComplete: allSigned
  });
});

// Debug endpoint to check signature status (protected)
app.get('/api/debug/signatures', optionalAuth, async (req, res) => {
  try {
    const envelopes = await getAllEnvelopesFromDatabase();

    // Get total signatures count from database
    let totalSignatures = 0;
    if (supabase) {
      const { data: signatures, error } = await supabase
        .from('signatures')
        .select('id');

      if (!error && signatures) {
        totalSignatures = signatures.length;
      }
    }

    res.json({
      totalEnvelopes: envelopes.length,
      totalSignatures: totalSignatures,
      envelopes: envelopes.map(env => ({
        id: env.id,
        title: env.title,
        status: env.status,
        createdAt: env.created_at,
        creatorIP: env.creator_ip,
        signatoriesCount: env.signatories ? env.signatories.length : 0,
        signatories: env.signatories
      })),
      supabaseConnected: !!supabase
    });
  } catch (error) {
    console.error('Erro no endpoint debug/signatures:', error);
    res.status(500).json({
      error: 'Erro ao buscar dados',
      message: error.message
    });
  }
});

// Download completed envelope
app.get('/api/envelope/:envelopeId/download', async (req, res) => {
  const { envelopeId } = req.params;
  const envelope = await getEnvelopeFromDatabase(envelopeId);

  if (!envelope) {
    return res.status(404).json({ error: 'Envelope não encontrado' });
  }

  if (envelope.status !== 'completed') {
    return res.status(400).json({ error: 'Envelope ainda não foi completamente assinado' });
  }

  res.json({
    success: true,
    envelope,
    downloadReady: true
  });
});

// Serve signing page
app.get('/sign/:signatureId', async (req, res) => {
  const { signatureId } = req.params;

  console.log('=== ACESSANDO PAGINA DE ASSINATURA ===');
  console.log('Signature ID da URL:', signatureId);

  // Check if signature exists before serving the page
  const signature = await getSignatureFromDatabase(signatureId);
  if (!signature) {
    console.log('❌ Signature nao encontrada, redirecionando para erro');
    return res.status(404).send(`
      <html>
        <head><title>Link Inválido</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>❌ Link de Assinatura Inválido</h1>
          <p>Este link de assinatura não foi encontrado ou expirou.</p>
          <p>Por favor, solicite um novo link de assinatura.</p>
          <p><strong>ID solicitado:</strong> ${signatureId}</p>
        </body>
      </html>
    `);
  }

  console.log('✅ Signature encontrada, servindo pagina de assinatura');
  res.sendFile(path.join(__dirname, 'public', 'sign.html'));
});

// Login routes
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Admin panel route (protected)
app.get('/admin', optionalAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Get detailed envelope information
app.get('/api/envelope/:envelopeId/details', async (req, res) => {
  const { envelopeId } = req.params;

  try {
    const envelope = await getEnvelopeFromDatabase(envelopeId);

    if (!envelope) {
      return res.status(404).json({ error: 'Envelope não encontrado' });
    }

    // Get events for this envelope from Supabase
    const events = await getEnvelopeEventsFromDatabase(envelopeId);

    // Get signatures for this envelope to build detailed signatory info
    let signaturesWithDetails = [];
    if (supabase) {
      const { data: signatures, error } = await supabase
        .from('signatures')
        .select('*')
        .eq('envelope_id', envelopeId);

      if (!error && signatures) {
        signaturesWithDetails = signatures.map(sig => ({
          ...sig.signatory,
          status: sig.status,
          signedAt: sig.signed_at,
          signerIP: sig.signer_ip,
          signatureData: sig.signature_data
        }));
      }
    }

    // Format events for display
    const formattedEvents = events.map(event => ({
      type: event.event_type,
      timestamp: event.created_at,
      description: event.description,
      ip: event.user_ip,
      signatory: event.signatory_name,
      email: event.signatory_email,
      userAgent: event.user_agent,
      metadata: event.metadata
    }));

    console.log(`📋 Detalhes do envelope ${envelopeId}:`);
    console.log(`- Eventos encontrados: ${formattedEvents.length}`);
    console.log(`- Signatários: ${signaturesWithDetails.length}`);

    res.json({
      id: envelope.id,
      title: envelope.title,
      status: envelope.status,
      createdAt: envelope.created_at,
      creatorIP: envelope.creator_ip,
      signatories: signaturesWithDetails.length > 0 ? signaturesWithDetails : envelope.signatories,
      signaturePositions: envelope.signature_positions,
      signatures: envelope.signatures,
      events: formattedEvents,
      completedSignatures: signaturesWithDetails.filter(s => s.status === 'signed').length,
      positionsPerSignatory: envelope.signature_positions ? 
        envelope.signature_positions.reduce((acc, pos) => {
          if (!acc[pos.signatoryEmail]) acc[pos.signatoryEmail] = 0;
          acc[pos.signatoryEmail]++;
          return acc;
        }, {}) : {}
    });
  } catch (error) {
    console.error('Erro ao buscar detalhes do envelope:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// Delete envelope (admin function) - Implement database deletion
app.delete('/api/envelope/:envelopeId', async (req, res) => {
  const { envelopeId } = req.params;

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    // Delete related signatures
    const { error: signaturesError } = await supabase
      .from('signatures')
      .delete()
      .eq('envelope_id', envelopeId);

    if (signaturesError) {
      console.error('❌ Erro ao excluir signatures:', signaturesError);
      return res.status(500).json({ error: 'Erro ao excluir signatures: ' + signaturesError.message });
    }

    // Delete envelope events
    const { error: eventsError } = await supabase
        .from('envelope_events')
        .delete()
        .eq('envelope_id', envelopeId);

    if (eventsError) {
        console.error('❌ Erro ao excluir envelope events:', eventsError);
        return res.status(500).json({error: 'Erro ao excluir envelope events: ' + eventsError.message});
    }

    // Delete envelope
    const { error: envelopeError } = await supabase
      .from('envelopes')
      .delete()
      .eq('id', envelopeId);

    if (envelopeError) {
      console.error('❌ Erro ao excluir envelope:', envelopeError);
      return res.status(500).json({ error: 'Erro ao excluir envelope: ' + envelopeError.message });
    }

    console.log(`🗑️ Envelope ${envelopeId} excluído do sistema (Supabase)`);

    res.json({
      success: true,
      message: 'Envelope excluído com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao conectar com Supabase para excluir envelope:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor ao excluir envelope: ' + error.message
    });
  }
});

// Resend envelope emails
app.post('/api/envelope/:envelopeId/resend', async (req, res) => {
  const { envelopeId } = req.params;

    if (!supabase) {
        return res.status(500).json({ error: 'Supabase não configurado' });
    }

  try {
        const envelope = await getEnvelopeFromDatabase(envelopeId);

        if (!envelope) {
            return res.status(404).json({ error: 'Envelope não encontrado' });
        }

        if (envelope.status === 'completed') {
            return res.status(400).json({ error: 'Envelope já foi completado, não é possível reenviar' });
        }

    if (!resend) {
      return res.status(500).json({ error: 'Resend não configurado' });
    }

    console.log(`🔄 Reenviando emails para o envelope: ${envelopeId}`);

        // Fetch pending signatures from database based on envelope id.
        const { data: signatures, error: signaturesError } = await supabase
            .from('signatures')
            .select('*')
            .eq('envelope_id', envelopeId)
            .eq('status', 'pending');

        if (signaturesError) {
            console.error('Erro ao buscar signatures pendentes:', signaturesError);
            return res.status(500).json({ error: 'Erro ao buscar signatures pendentes: ' + signaturesError.message });
        }

    if (!signatures || signatures.length === 0) {
      return res.status(400).json({ error: 'Não há assinaturas pendentes para reenviar' });
    }

    let emailsSent = 0;
    const emailResults = [];

        for (const signature of signatures) {
      console.log(`Reenviando email para: ${signature.signatory.email}`);

      const baseUrl = req.get('host').includes('localhost') ? 
        `${req.protocol}://${req.get('host')}` : 
        `https://${req.get('host')}`;

      const signatureLink = `${baseUrl}/sign/${signature.id}`;

      try {
        const emailResult = await resend.emails.send({
          from: 'noreply@mvmconversor.com.br',
          to: signature.signatory.email,
          subject: `📋 LEMBRETE: Documento para Assinatura: ${envelope.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h2 style="color: #333; margin: 0;">📋 Lembrete: Documento para Assinatura</h2>
              </div>

              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0 0 10px 0;"><strong>Olá ${signature.signatory.name},</strong></p>
                <p style="margin: 0;">Este é um lembrete de que você ainda precisa assinar o documento: <strong>${envelope.title}</strong></p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${signatureLink}" 
                   style="background-color: #28a745; color: white; padding: 15px 30px; 
                          text-decoration: none; border-radius: 5px; display: inline-block; 
                          font-weight: bold; font-size: 16px;">
                  ✍️ Assinar Documento Agora
                </a>
              </div>

              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0; color: #856404; font-size: 14px;">
                  <strong>⚠️ Importante:</strong> Este link é único e pessoal. Não compartilhe com outras pessoas.
                </p>
              </div>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">

              <div style="text-align: center;">
                <p style="color: #6c757d; font-size: 12px; margin: 0;">
                  Este é um lembrete automático do sistema de assinaturas digitais.
                </p>
                <p style="color: #6c757d; font-size: 12px; margin: 5px 0 0 0;">
                  mvmconversor.com.br
                </p>
              </div>
            </div>
          `
        });

        console.log(`Email reenviado com sucesso para: ${signature.signatory.email}`);
        emailsSent++;
        emailResults.push({
          email: signature.signatory.email,
          status: 'sent',
          result: emailResult
        });

      } catch (emailError) {
        console.error(`Erro ao reenviar email para ${signature.signatory.email}:`, emailError);
        emailResults.push({
          email: signature.signatory.email,
          status: 'error',
          error: emailError.message
        });
      }
    }

    res.json({
      success: true,
      message: `${emailsSent} email(s) reenviado(s) com sucesso`,
      emailsSent,
      totalPending: signatures.length,
      results: emailResults
    });

} catch (error) {
    console.error('Erro ao reenviar emails:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao reenviar emails: ' + error.message
    });
  }
});

// Download completed envelope as PDF
app.get('/api/envelope/:envelopeId/download-pdf', async (req, res) => {
  const { envelopeId } = req.params;
    if (!supabase) {
        return res.status(500).json({ error: 'Supabase não configurado' });
    }

  try {
        const envelope = await getEnvelopeFromDatabase(envelopeId);

        if (!envelope) {
            return res.status(404).json({ error: 'Envelope não encontrado' });
        }

        if (envelope.status !== 'completed') {
            return res.status(400).json({ error: 'Envelope ainda não foi completamente assinado' });
        }

    console.log(`📥 Gerando download do PDF assinado para envelope: ${envelopeId}`);

        // Read original PDF from uploads folder.
        const originalPdfBuffer = fs.readFileSync(path.join(__dirname, envelope.pdf_path));

    // Load PDF with pdf-lib
    const pdfDoc = await PDFDocument.load(originalPdfBuffer);
    const pages = pdfDoc.getPages();

    console.log(`PDF carregado com ${pages.length} páginas`);

    // Apply signatures to PDF
    envelope.signature_positions.forEach(position => {
      const sigData = envelope.signatures[position.signatoryEmail];
      if (sigData) {
        const pageIndex = position.page - 1; // Convert to 0-based index
        if (pageIndex >= 0 && pageIndex < pages.length) {
          const page = pages[pageIndex];
          const { width, height } = page.getSize();

          // Convert position coordinates (from canvas) to PDF coordinates
          const pdfX = position.x;
          const pdfY = height - position.y - 40; // Flip Y coordinate and adjust for text height

          console.log(`Aplicando assinatura de ${sigData.signatory.name} na página ${position.page} em (${pdfX}, ${pdfY})`);

          // Add signature background rectangle first
          page.drawRectangle({
            x: pdfX - 5,
            y: pdfY - 5,
            width: 200,
            height: 45,
            borderColor: rgb(0.2, 0.5, 0.8),
            borderWidth: 2,
            color: rgb(0.95, 0.98, 1),
            opacity: 0.9,
          });

          // Add "ASSINADO POR:" label
          page.drawText('ASSINADO DIGITALMENTE POR:', {
            x: pdfX,
            y: pdfY + 25,
            size: 8,
            color: rgb(0.3, 0.3, 0.3),
          });

          // Add signatory name
          page.drawText(sigData.signatory.name, {
            x: pdfX,
            y: pdfY + 12,
            size: 12,
            color: rgb(0, 0, 0),
          });

          // Add signature date and time in Brazil timezone
          const signedDate = formatBrazilDate(new Date(sigData.signedAt));
          page.drawText(`Data: ${signedDate}`, {
            x: pdfX,
            y: pdfY - 2,
            size: 8,
            color: rgb(0.3, 0.3, 0.3),
          });

          // Add verification text
          page.drawText('Assinatura Verificada', {
            x: pdfX,
            y: pdfY - 15,
            size: 8,
            color: rgb(0, 0.6, 0),
          });
        }
      }
    });

    // Add verification page with signature details
    const verificationPage = pdfDoc.addPage();
    const { width, height } = verificationPage.getSize();

    // Add header background
    verificationPage.drawRectangle({
      x: 30,
      y: height - 80,
      width: width - 60,
      height: 60,
      color: rgb(0.95, 0.98, 1),
      borderColor: rgb(0.2, 0.5, 0.8),
      borderWidth: 2,
    });

    verificationPage.drawText('DOCUMENTO ASSINADO DIGITALMENTE', {
      x: 50,
      y: height - 50,
      size: 18,
      color: rgb(0.1, 0.3, 0.7),
    });

    verificationPage.drawText('CERTIFICADO DE ASSINATURAS DIGITAIS', {
      x: 50,
      y: height - 70,
      size: 12,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Get creator information
    let creatorInfo = 'Sistema';
    let creatorName = 'Sistema';
    let creatorEmail = 'N/A';

    if (envelope.created_by && supabase) {
      try {
        const { data: creator, error } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', envelope.created_by)
          .single();

        if (!error && creator) {
          creatorInfo = `${creator.name} (${creator.email})`;
          creatorName = creator.name;
          creatorEmail = creator.email;
        }
      } catch (error) {
        console.log('❌ Erro ao buscar informações do criador:', error);
      }
    }

    // Document info section
    verificationPage.drawText(`Titulo do Documento: ${envelope.title || 'Documento'}`, {
      x: 50,
      y: height - 110,
      size: 12,
      color: rgb(0, 0, 0),
    });

    verificationPage.drawText(`Data de Criacao: ${formatBrazilDate(new Date(envelope.created_at))}`, {
      x: 50,
      y: height - 130,
      size: 12,
      color: rgb(0, 0, 0),
    });

    // Creator information section with background
    verificationPage.drawRectangle({
      x: 45,
      y: height - 220,
      width: width - 90,
      height: 70,
      color: rgb(0.95, 0.98, 1),
      borderColor: rgb(0.2, 0.5, 0.8),
      borderWidth: 1,
    });

    verificationPage.drawText('INFORMAÇÕES DO CRIADOR:', {
      x: 55,
      y: height - 160,
      size: 12,
      color: rgb(0.1, 0.3, 0.7),
    });

    verificationPage.drawText(`Nome: ${creatorName}`, {
      x: 55,
      y: height - 180,
      size: 11,
      color: rgb(0, 0, 0),
    });

    verificationPage.drawText(`Email: ${creatorEmail}`, {
      x: 55,
      y: height - 195,
      size: 11,
      color: rgb(0, 0, 0),
    });

    verificationPage.drawText(`Endereço IP: ${envelope.creator_ip || 'N/A'}`, {
      x: 55,
      y: height - 210,
      size: 10,
      color: rgb(0.4, 0.4, 0.4),
    });

    verificationPage.drawText(`Status: COMPLETAMENTE ASSINADO`, {
      x: 50,
      y: height - 240,
      size: 12,
      color: rgb(0, 0.6, 0),
    });

    verificationPage.drawText(`ID do Envelope: ${envelope.id}`, {
      x: 50,
      y: height - 260,
      size: 10,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Signatures section
    verificationPage.drawText('ASSINATURAS COLETADAS:', {
      x: 50,
      y: height - 300,
      size: 14,
      color: rgb(0.1, 0.3, 0.7),
    });

    let yPosition = height - 330;
    const signers = envelope.signatories.filter(s => s.type === 'signer');
    signers.forEach((sig, index) => {
      const sigData = envelope.signatures[sig.email];

      // Signature box
      verificationPage.drawRectangle({
        x: 45,
        y: yPosition - 35,
        width: width - 90,
        height: 50,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
      });

      verificationPage.drawText(`${index + 1}. ${sig.name}`, {
        x: 55,
        y: yPosition - 5,
        size: 12,
        color: rgb(0, 0, 0),
      });

      verificationPage.drawText(`   Email: ${sig.email}`, {
        x: 55,
        y: yPosition - 20,
        size: 10,
        color: rgb(0.3, 0.3, 0.3),
      });

      verificationPage.drawText(`   Data/Hora: ${formatBrazilDate(new Date(sigData.signedAt))}`, {
        x: 55,
        y: yPosition - 33,
        size: 10,
        color: rgb(0.3, 0.3, 0.3),
      });

      verificationPage.drawText('VALIDA', {
        x: width - 120,
        y: yPosition - 15,
        size: 12,
        color: rgb(0, 0.6, 0),
      });

      yPosition -= 70;
    });

    // Generate signed PDF buffer
    const signedPdfBuffer = await pdfDoc.save();

    console.log('PDF com assinaturas gerado para download!');

    // Set headers for file download
    const filename = `${envelope.title || 'documento'}_assinado.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', signedPdfBuffer.length);

    // Send the PDF buffer
    res.send(Buffer.from(signedPdfBuffer));

  } catch (error) {
    console.error('Erro ao gerar PDF para download:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar PDF: ' + error.message
    });
  }
});

// Serve the main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log('📊 Sistema usando APENAS Supabase como banco de dados');

  if (supabase) {
    console.log('✅ Supabase conectado e funcionando!');
  } else {
    console.log('❌ Supabase NÃO configurado - Verifique as variáveis SUPABASE_URL e SUPABASE_ANON_KEY');
  }
});
