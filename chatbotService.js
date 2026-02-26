require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { SystemMessage, HumanMessage, AIMessage } = require('@langchain/core/messages');

// ==========================================
// 1. INISIALISASI DATABASE & AI MODEL
// ==========================================
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Menggunakan Gemini 1.5 Flash agar lebih cepat dan kuota gratis lebih lega
const llm = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash", 
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.7, // Disesuaikan agar AI lebih empatik dan natural, tidak terlalu kaku
});

// ==========================================
// 2. SUPER PROMPT (R.O.L.E FRAMEWORK)
// ==========================================
// // Role-Based Prompt Engineering
// const prompt = ChatPromptTemplate.fromMessages([
//     [
//         "system",
//         `Kamu adalah chatbot pendamping konsultasi awal kesehatan mental di Indonesia. 
//         Tugas utamamu adalah memberikan dukungan emosional awal, psikoedukasi ringan, dan memvalidasi perasaan pengguna dengan bahasa Indonesia yang empatik, santai, dan tidak menghakimi.
        
//         BATASAN MUTLAK:
//         1. Kamu BUKAN psikolog, psikiater, atau tenaga medis profesional.
//         2. Jangan pernah memberikan diagnosis medis, saran klinis, atau resep obat.
//         3. Jika pengguna menunjukkan indikasi krisis, gangguan berat, atau niat menyakiti diri sendiri, segera arahkan mereka dengan lembut untuk mencari bantuan profesional (seperti layanan darurat atau psikolog).`
//     ],
//     new MessagesPlaceholder("chat_history"),
//     ["human", "{input}"]
// ]);

const systemPrompt = `
[ROLE]
Kamu adalah DengarAI, sebuah asisten virtual empatik dan pendamping kesehatan mental non-klinis. Kamu dirancang sebagai ruang aman bagi pengguna untuk bercerita dan meringankan beban pikiran mereka.

[OBJECTIVE]
1. Terapkan 'Active Listening': Dengarkan cerita pengguna secara penuh perhatian, validasi perasaan mereka bahwa apa yang mereka rasakan itu wajar.
2. Lakukan psikoedukasi ringan dan berikan dukungan emosional awal.
3. Lakukan observasi bahasa untuk deteksi dini gejala stres atau kecemasan ringan dari cerita pengguna, lalu bantu mereka mengurai emosi tersebut perlahan-lahan.

[LIMITS]
1. DILARANG KERAS memberikan diagnosis medis, psikologis, atau menyarankan obat-obatan apa pun. Kamu BUKAN psikolog atau psikiater sungguhan.
2. Jangan pernah mengatakan "kamu menderita depresi" atau kalimat diagnosis pasti lainnya.
3. Jika pengguna menunjukkan tanda-tanda krisis, keinginan menyakiti diri sendiri (self-harm), atau ideasi bunuh diri, BERHENTI memberikan nasihat umum. Segera berikan respons penuh empati dan sarankan mereka untuk menghubungi tenaga profesional, psikolog terdekat, atau layanan darurat (misal: 119).
4. Jawab berdasarkan konteks percakapan sebelumnya. Jangan mengulang-ulang perkenalan diri jika sudah di tengah percakapan.

[EXPRESSION]
1. Gunakan bahasa Indonesia yang santai, sopan, ramah, dan empatik. Gunakan kata ganti "aku" untuk dirimu dan "kamu" untuk pengguna.
2. Balas dengan ringkas dan natural, maksimal 2-3 paragraf pendek. Jangan memberikan poin-poin panjang seperti buku teks kecuali pengguna memintanya.
3. Akhiri balasanmu dengan satu pertanyaan pemantik yang lembut untuk mendorong pengguna bercerita lebih lanjut (contoh: "Pelan-pelan saja, apa yang paling membuatmu merasa berat hari ini?").
`;

// ==========================================
// 3. FUNGSI UTAMA PEMROSESAN CHAT
// ==========================================
const processChat = async (sessionId, userId, userMessage) => {
    try {
        // --- A. Manajemen Sesi Dinamis (Supabase) ---
        if (userId) {
            const { data: sessionData } = await supabase
                .from('chat_sessions')
                .select('session_id')
                .eq('session_id', sessionId)
                .single();

            // Jika sesi baru, buat judul otomatis dari pesan pertama pengguna
            if (!sessionData) {
                const generatedTitle = userMessage.length > 30 
                    ? userMessage.substring(0, 30) + "..." 
                    : userMessage;

                const { error: insertSessionError } = await supabase
                    .from('chat_sessions')
                    .insert([{ session_id: sessionId, user_id: userId, title: generatedTitle }]);
                
                if (insertSessionError) console.error("Gagal membuat sesi:", insertSessionError.message);
            }
        }

        // --- B. Menarik Riwayat Percakapan (Memory) ---
        let chatHistory = [new SystemMessage(systemPrompt)];

        if (userId) {
            const { data: pastMessages, error: historyError } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true })
                .limit(10); // Ambil 10 pesan terakhir saja agar tidak kena limit token Gemini

            if (!historyError && pastMessages) {
                pastMessages.forEach(msg => {
                    if (msg.message.role === 'user') {
                        chatHistory.push(new HumanMessage(msg.message.content));
                    } else if (msg.message.role === 'ai') {
                        chatHistory.push(new AIMessage(msg.message.content));
                    }
                });
            }
        }

        // Tambahkan pesan terbaru dari pengguna
        chatHistory.push(new HumanMessage(userMessage));

        // --- C. Eksekusi ke Model AI (LangChain) ---
        const response = await llm.invoke(chatHistory);
        const aiReply = response.content;

        // --- D. Simpan Percakapan ke Database ---
        if (userId) {
            const messagesToSave = [
                { session_id: sessionId, message: { role: 'user', content: userMessage } },
                { session_id: sessionId, message: { role: 'ai', content: aiReply } }
            ];

            const { error: saveError } = await supabase
                .from('chat_messages')
                .insert(messagesToSave);
                
            if (saveError) console.error("Gagal menyimpan pesan:", saveError.message);
        }

        return aiReply;

    } catch (error) {
        console.error("Error di chatbotService:", error);
        throw new Error("Gagal memproses pesan dengan AI.");
    }
};

module.exports = { processChat };