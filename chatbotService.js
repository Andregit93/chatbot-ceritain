require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { SystemMessage, HumanMessage, AIMessage } = require('@langchain/core/messages');

// Inisialisasi Database
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Inisialisasi Model AI (Menggunakan Flash agar ringan & anti limit)
const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash", 
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.7, 
});

// Super Prompt R.O.L.E Framework
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

const processChat = async (sessionId, userId, userMessage) => {
    try {
        // Validasi Keamanan Lapis Pertama
        if (!userMessage || userMessage.trim() === "") {
            throw new Error("Pesan pengguna kosong.");
        }

        // --- A. Penamaan Sesi (History Sidebar) ---
        if (userId && sessionId) {
            const { data: sessionData } = await supabase
                .from('chat_sessions')
                .select('session_id')
                .eq('session_id', sessionId)
                .single();

            if (!sessionData) {
                const generatedTitle = userMessage.length > 30 
                    ? userMessage.substring(0, 30) + "..." 
                    : userMessage;

                await supabase
                    .from('chat_sessions')
                    .insert([{ session_id: sessionId, user_id: userId, title: generatedTitle }]);
            }
        }

        // --- B. Tarik Memori Percakapan ---
        let chatHistory = [new SystemMessage(systemPrompt)];

        if (userId && sessionId) {
            const { data: pastMessages, error: historyError } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true })
                .limit(15); 

            if (!historyError && pastMessages) {
                pastMessages.forEach(msg => {
                    const textContent = msg.message?.content || ""; 
                    if (textContent.trim() !== "") {
                        if (msg.message.role === 'user') {
                            chatHistory.push(new HumanMessage(textContent));
                        } else if (msg.message.role === 'ai') {
                            chatHistory.push(new AIMessage(textContent));
                        }
                    }
                });
            }
        }

        // Masukkan pesan terbaru
        chatHistory.push(new HumanMessage(userMessage));

        // --- C. Eksekusi AI ---
        const response = await llm.invoke(chatHistory);
        const aiReply = response.content;

        // --- D. Simpan ke Database ---
        if (userId && sessionId) {
            const messagesToSave = [
                { session_id: sessionId, message: { role: 'user', content: userMessage } },
                { session_id: sessionId, message: { role: 'ai', content: aiReply } }
            ];

            await supabase.from('chat_messages').insert(messagesToSave);
        }

        return aiReply;

    } catch (error) {
        console.error("Error di chatbotService:", error);
        throw new Error("Gagal memproses pesan AI.");
    }
};

module.exports = { processChat };