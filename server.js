const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { processChat } = require('./chatbotService');
const bcrypt = require('bcrypt');

// Inisialisasi Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Inisialisasi Koneksi Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// Endpoint Utama untuk Chatbot
// ==========================================
app.post('/api/chat', async (req, res) => {
    try {
        // Menerima data dari frontend
        const { sessionId, userId, message } = req.body; 

        // 1. Validasi DULU sebelum dilempar ke AI
        if (!message || message.trim() === "") {
            return res.status(400).json({ error: "Pesan tidak boleh kosong." });
        }

        // 2. Proses chat (Hanya dipanggil SEKALI, dan parameter dicocokkan dengan chatbotService.js)
        const aiResponse = await processChat(sessionId, userId, message);

        // 3. Kembalikan balasan ke frontend
        res.status(200).json({ reply: aiResponse });

    } catch (error) {
        console.error("Error pada proses chat:", error);
        res.status(500).json({ error: "Terjadi kesalahan saat memproses pesan." });
    }
});

// ==========================================
// Register
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: "Semua kolom harus diisi." });
        }

        // Enkripsi password dengan bcrypt
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Simpan ke Supabase
        const { data, error } = await supabase
            .from('users')
            .insert([{ username, email, password_hash: hashedPassword }])
            .select('id, username, email');

        if (error) {
            if (error.code === '23505') return res.status(400).json({ error: "Email sudah terdaftar." });
            throw error;
        }

        res.status(201).json({ 
            message: "Registrasi berhasil!", 
            user: data[0] 
        });
    } catch (error) {
        console.error("Error Register:", error);
        res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

// ==========================================
// Login
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Cari user berdasarkan email di Supabase
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);

        if (error || users.length === 0) {
            return res.status(400).json({ error: "Email atau password salah." });
        }

        const user = users[0];

        // Bandingkan password yang diinput dengan password_hash di database
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(400).json({ error: "Email atau password salah." });
        }

        // Jika berhasil, kembalikan data user
        res.status(200).json({ 
            message: "Login berhasil!", 
            user: { id: user.id, username: user.username, email: user.email } 
        });
    } catch (error) {
        console.error("Error Login:", error);
        res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

// ==========================================
// RIWAYAT CHAT
// ==========================================
app.get('/api/sessions/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json({ sessions: data });
    } catch (error) {
        console.error("Error Get Sessions:", error);
        res.status(500).json({ error: "Gagal mengambil riwayat sesi." });
    }
});

// ==========================================
// Pesan dalam Satu Sesi Khusus
// ==========================================
app.get('/api/chat/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        res.status(200).json({ messages: data });
    } catch (error) {
        console.error("Error Get Messages:", error);
        res.status(500).json({ error: "Gagal mengambil pesan." });
    }
});

// ==========================================
// Jalankan Server
// ==========================================
app.listen(port, () => {
    console.log(`Server DengarAI berjalan di http://localhost:${port}`);
});