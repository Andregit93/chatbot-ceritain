const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");

// Inisialisasi Model Gemini
const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: 0.7, // Suhu ini memberikan keseimbangan antara respons yang empatik dan tetap terarah
    apiKey: process.env.GEMINI_API_KEY
});

// Role-Based Prompt Engineering
const prompt = ChatPromptTemplate.fromMessages([
    [
        "system",
        `Kamu adalah chatbot pendamping konsultasi awal kesehatan mental di Indonesia. 
        Tugas utamamu adalah memberikan dukungan emosional awal, psikoedukasi ringan, dan memvalidasi perasaan pengguna dengan bahasa Indonesia yang empatik, santai, dan tidak menghakimi.
        
        BATASAN MUTLAK:
        1. Kamu BUKAN psikolog, psikiater, atau tenaga medis profesional.
        2. Jangan pernah memberikan diagnosis medis, saran klinis, atau resep obat.
        3. Jika pengguna menunjukkan indikasi krisis, gangguan berat, atau niat menyakiti diri sendiri, segera arahkan mereka dengan lembut untuk mencari bantuan profesional (seperti layanan darurat atau psikolog).`
    ],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"]
]);

const chain = prompt.pipe(llm);

// Fungsi Pemrosesan Chat & Manajemen Memori Supabase
async function processChat(supabase, sessionId, userId, userMessage) {
    let chatHistory = [];

    // Tarik riwayat chat JIKA user sudah login
    if (userId && sessionId) {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('message')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (!error && data) {
            chatHistory = data.map(row => {
                return row.message.role === 'user' 
                    ? new HumanMessage(row.message.content) 
                    : new AIMessage(row.message.content);
            });
        }
    }

    // Kirim riwayat dan pesan baru ke Gemini
    const response = await chain.invoke({
        chat_history: chatHistory,
        input: userMessage
    });

    // Simpan data ke Supabase JIKA user sudah login
    if (userId && sessionId) {
        // Cek & Buat Sesi Otomatis
        const { data: sessionData, error: sessionError } = await supabase
            .from('chat_sessions')
            .select('session_id')
            .eq('session_id', sessionId)
            .single();

        // Jika sesi belum ada di database, buat baru
        if (!sessionData) {
            // Buat judul dari pesan pertama user
            const generatedTitle = userMessage.length > 30 
                ? userMessage.substring(0, 30) + "..." 
                : userMessage;

            const { error: insertSessionError } = await supabase
                .from('chat_sessions')
                .insert([{ session_id: sessionId, user_id: userId, title: generatedTitle }]);
            
            if (insertSessionError) {
                console.error("Gagal membuat sesi baru:", insertSessionError.message);
            }
        }
        // -----------------------------------------------

        // Simpan input User
        const { error: errUser } = await supabase.from('chat_messages').insert({
            session_id: sessionId,
            message: { role: 'user', content: userMessage }
        });
        if (errUser) console.error("Gagal simpan pesan user:", errUser.message);
        
        // Simpan respons Gemini
        const { error: errAi } = await supabase.from('chat_messages').insert({
            session_id: sessionId,
            message: { role: 'ai', content: response.content }
        });
        if (errAi) console.error("Gagal simpan pesan AI:", errAi.message);
    }

    return response.content;
}

module.exports = { processChat };