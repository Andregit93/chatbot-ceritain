// Konfigurasi URL Backend 
const API_URL = 'http://localhost:3000/api';

// UTILITIES
const getUser = () => JSON.parse(localStorage.getItem('ceritAIn_user'));
const saveUser = (user) => localStorage.setItem('ceritAIn_user', JSON.stringify(user));
const logout = () => {
    localStorage.removeItem('ceritAIn_user');
    window.location.href = 'index.html';
};

// Pembuat ID Sesi Acak
const generateSessionId = () => 'sesi-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

const typeWriter = (element, text, speed = 60) => {
    let i = 0;
    let formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') 
        .replace(/\n/g, '<br>');
    
    element.innerHTML = "";
    
    return new Promise((resolve) => {
        let words = formattedText.split(' ');
        function type() {
            if (i < words.length) {
                element.innerHTML += words[i] + ' ';
                i++;
                const chatWindow = document.getElementById('chatWindow');
                if (chatWindow) chatWindow.scrollTop = chatWindow.scrollHeight;
                
                let lastWord = words[i-1];
                let extraPause = 0;
                if (lastWord.endsWith('.') || lastWord.endsWith('?') || lastWord.endsWith('!')) {
                    extraPause = 200;
                }

                setTimeout(type, speed + extraPause);
            } else { 
                resolve(); 
            }
        }
        type();
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    const authArea = document.getElementById('authArea');
    const historyList = document.getElementById('historyList');
    const guestMessage = document.getElementById('guestMessage');
    const chatWindow = document.getElementById('chatWindow');
    const userInput = document.getElementById('userInput');
    const btnSend = document.getElementById('btnSend');

    
    // REGISTER
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = registerForm.querySelector('button');
            btn.disabled = true;

            const payload = {
                username: document.getElementById('regUsername').value,
                email: document.getElementById('regEmail').value,
                password: document.getElementById('regPassword').value
            };

            try {
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                
                if (response.ok) {
                    saveUser(data.user);
                    Swal.fire({
                        icon: 'success',
                        title: 'Berhasil!',
                        text: 'Akun ceritAIn berhasil dibuat. Selamat datang!',
                        background: '#112240',
                        color: '#ccd6f6',
                        confirmButtonColor: '#64ffda'
                    }).then(() => window.location.href = 'chat.html');
                } else {
                    Swal.fire({ icon: 'error', title: 'Oops...', text: data.error, background: '#112240', color: '#ccd6f6' });
                }
            } catch (error) { console.error(error); }
            finally { btn.disabled = false; }
        });
    }

    // LOGIN
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('button');
            btn.disabled = true;

            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: document.getElementById('loginEmail').value,
                        password: document.getElementById('loginPassword').value
                    })
                });
                const data = await response.json();
                if (response.ok) {
                    saveUser(data.user);
                    window.location.href = 'chat.html';
                } else {
                    Swal.fire({ icon: 'error', title: 'Gagal Masuk', text: data.error, background: '#112240', color: '#ccd6f6' });
                }
            } catch (error) { console.error(error); }
            finally { btn.disabled = false; }
        });
    }

    // CHAT
    if (chatWindow && userInput && btnSend) {
        let currentSessionId = generateSessionId();

        if (user) {
            authArea.innerHTML = `
                <div class="d-flex flex-column align-items-center w-100">
                    <span class="text-light fw-bold mb-3 small"><i class="fa-solid fa-circle-user me-2" style="color: rgb(255, 255, 255);"></i>${user.username}</span>
                    <button id="btnLogout" class="btn btn-sm btn-outline-danger w-100 rounded-pill">Log out</button>
                </div>
            `;
            document.getElementById('btnLogout').addEventListener('click', logout);
            if (guestMessage) guestMessage.classList.add('d-none');
            
            const loadSessions = async () => {
                const res = await fetch(`${API_URL}/sessions/${user.id}`);
                const data = await res.json();
                if (res.ok && data.sessions) {
                    historyList.innerHTML = '';
                    data.sessions.forEach(s => {
                        const li = document.createElement('li');
                        li.className = 'nav-item mb-2';
                        li.innerHTML = `
                            <a href="#" class="nav-link btn-session p-2" data-id="${s.session_id}" style="background: rgba(100,255,218,0.05); color: var(--text-main); border-radius: 10px; font-size: 0.85rem;">
                                <span class="text-truncate d-inline-block ps-2" style="max-width: 150px;">${s.title}</span>
                            </a>`;
                        historyList.appendChild(li);
                    });

                    document.querySelectorAll('.btn-session').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            e.preventDefault();
                            const sid = btn.getAttribute('data-id');
                            currentSessionId = sid;
                            const mRes = await fetch(`${API_URL}/chat/${sid}`);
                            const mData = await mRes.json();
                            chatWindow.innerHTML = '';
                            mData.messages.forEach(m => appendMessage(m.message.role, m.message.content, false));
                        });
                    });
                }
            };
            loadSessions();
        }

        const appendMessage = async (sender, text, stream = false) => {
            const bubble = document.createElement('div');
            bubble.className = `message-bubble shadow-sm ${sender === 'user' ? 'message-user' : 'message-ai'}`;
            chatWindow.appendChild(bubble);
            if (stream) { 
                await typeWriter(bubble, text); 
            } else { 
                bubble.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); 
            }
            chatWindow.scrollTop = chatWindow.scrollHeight;
        };

        const sendMessage = async () => {
            const text = userInput.value.trim();
            if (!text) return;

            appendMessage('user', text);
            userInput.value = '';

            const indicator = document.createElement('div');
            indicator.id = 'loading-ai';
            indicator.className = 'message-bubble message-ai text-sec-custom small';
            indicator.innerHTML = '<i class="bi bi-stars"></i> ceritAIn...';
            chatWindow.appendChild(indicator);
            chatWindow.scrollTop = chatWindow.scrollHeight;

            try {
                const res = await fetch(`${API_URL}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: user ? currentSessionId : null,
                        userId: user ? user.id : null,
                        message: text
                    })
                });
                const data = await res.json();
                if (document.getElementById('loading-ai')) document.getElementById('loading-ai').remove();
                
                if (res.ok) { 
                    await appendMessage('ai', data.reply, true);
                    
                    if (user) { 
                        // Refresh sidebar secara dinamis jika sesi baru terdeteksi
                        const currentSidebarCount = historyList.children.length;
                        const resSes = await fetch(`${API_URL}/sessions/${user.id}`);
                        const dSes = await resSes.json();
                        
                        // Gunakan pengecekan ID atau jumlah untuk update sidebar tanpa reload
                        if (dSes.sessions.length > currentSidebarCount) {
                            // Fungsi loadSessions dipanggil ulang untuk update list sidebar
                            const loadSessions = async () => {
                                historyList.innerHTML = '';
                                dSes.sessions.forEach(s => {
                                    const li = document.createElement('li');
                                    li.className = 'nav-item mb-2';
                                    li.innerHTML = `
                                        <a href="#" class="nav-link btn-session p-2" data-id="${s.session_id}" style="background: rgba(100,255,218,0.05); color: var(--text-main); border-radius: 10px; font-size: 0.85rem;">
                                            <span class="text-truncate d-inline-block ps-2" style="max-width: 150px;">${s.title}</span>
                                        </a>`;
                                    historyList.appendChild(li);
                                });
                                // Re-bind click event
                                document.querySelectorAll('.btn-session').forEach(btn => {
                                    btn.addEventListener('click', async (e) => {
                                        e.preventDefault();
                                        const sid = btn.getAttribute('data-id');
                                        currentSessionId = sid;
                                        const mRes = await fetch(`${API_URL}/chat/${sid}`);
                                        const mData = await mRes.json();
                                        chatWindow.innerHTML = '';
                                        mData.messages.forEach(m => appendMessage(m.message.role, m.message.content, false));
                                    });
                                });
                            };
                            loadSessions();
                        }
                    }
                }
            } catch (e) { 
                if (document.getElementById('loading-ai')) document.getElementById('loading-ai').remove();
            }
        };

        btnSend.addEventListener('click', sendMessage);
        userInput.addEventListener('keypress', (e) => { 
            if(e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                sendMessage(); 
            } 
        });

        document.getElementById('btnNewChat').addEventListener('click', () => {
            currentSessionId = generateSessionId();
            chatWindow.innerHTML = `
                <div class="message-bubble message-ai shadow-sm">
                    Halo! Saya merupakan chatbot pendamping virtual yang siap mendengarkan ceritamu hari ini. Ada yang sedang membebani pikiranmu? <br><br>
                    <small class="text-sec-custom" style="font-size: 0.8rem;"><i>Catatan: Saya dirancang sebagai chatbot pendukung awal dan bukan tenaga medis. Jika kamu merasa sangat tertekan atau berada dalam krisis, mohon segera hubungi tenaga profesional.</i></small>
                </div>
            `;
        });
    }
});