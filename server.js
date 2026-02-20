const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { processChat } = require('./chatbotService'); // Import fungsi AI
const bcrypt = require('bcrypt');

// Inisialisasi Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // Agar bisa menerima format JSON dari frontend
app.use(express.static('public'));

// Inisialisasi Koneksi Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Endpoint Dasar (Untuk Cek Status Server)
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'success', 
        message: 'Server Backend Chatbot Kesehatan Mental Berjalan Lancar!' 
    });
});

// Endpoint Tes Koneksi Supabase (Opsional, untuk memastikan Supabase nyambung)
app.get('/api/test-db', async (req, res) => {
    // Mencoba mengambil data dari tabel users (hanya ambil 1 limit untuk tes)
    const { data, error } = await supabase.from('users').select('*').limit(1);
    
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.status(200).json({ message: 'Koneksi Supabase Berhasil!', data });
});

// Endpoint Utama untuk Chatbot
app.post('/api/chat', async (req, res) => {
    try {
        // Menerima data dari frontend
        // Jika guest, userId dan sessionId bisa dikirim null/kosong dari frontend
        const { sessionId, userId, message } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Pesan tidak boleh kosong." });
        }

        // Proses chat menggunakan LangChain & Gemini
        const aiResponse = await processChat(supabase, sessionId, userId, message);

        res.status(200).json({ reply: aiResponse });

    } catch (error) {
        console.error("Error pada proses chat:", error);
        res.status(500).json({ error: "Terjadi kesalahan saat memproses pesan." });
    }
});

// --- ENDPOINT AUTENTIKASI ---
// 1. Endpoint Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: "Semua kolom harus diisi." });
        }

        // Enkripsi password dengan bcrypt (salt rounds = 10)
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Simpan ke Supabase
        // ... di dalam app.post('/api/register') ...
        const { data, error } = await supabase
            .from('users')
            .insert([{ username, email, password_hash: hashedPassword }])
            .select('id, username, email'); // Tambahkan select untuk ambil data user baru

        if (error) {
            if (error.code === '23505') return res.status(400).json({ error: "Email sudah terdaftar." });
            throw error;
        }

        // Langsung kirim data user agar bisa auto-login
        res.status(201).json({ 
            message: "Registrasi berhasil!", 
            user: data[0] 
        });
    } catch (error) {
        console.error("Error Register:", error);
        res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

// 2. Endpoint Login
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

        // Jika berhasil, kembalikan data user (tanpa password_hash)
        res.status(200).json({ 
            message: "Login berhasil!", 
            user: { id: user.id, username: user.username, email: user.email } 
        });
    } catch (error) {
        console.error("Error Login:", error);
        res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

// --- ENDPOINT RIWAYAT CHAT ---
// 3. Endpoint Ambil Daftar Sesi (Untuk Sidebar)
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

// 4. Endpoint Ambil Pesan dalam Satu Sesi Khusus (Untuk layar chat utama)
app.get('/api/chat/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true }); // Urutkan dari yang terlama ke terbaru

        if (error) throw error;

        res.status(200).json({ messages: data });
    } catch (error) {
        console.error("Error Get Messages:", error);
        res.status(500).json({ error: "Gagal mengambil pesan." });
    }
});

// Jalankan Server
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});