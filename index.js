const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const DEFAULT_API_ID = 6;
const DEFAULT_API_HASH = "eb0663570528e75ef40e3048b88ad95b";

const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

let activeUsers = [];
let activeBots = [];

// --- GÖMÜLÜ HTML ARAYÜZÜ ---
const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WAZER INAT SYSTEM</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        :root {
            --bg-color: #0b0b0f;
            --panel-bg: #121218;
            --accent: #8A2BE2;
            --accent-glow: rgba(138, 43, 226, 0.3);
            --text-main: #e0e0e0;
            --text-muted: #888899;
            --border: #222230;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background-color: var(--bg-color); color: var(--text-main); display: flex; height: 100vh; overflow: hidden; }
        
        /* Sol Menü & Paneller */
        .sidebar { width: 350px; background: var(--panel-bg); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 20px; gap: 20px; overflow-y: auto; }
        .logo { font-size: 20px; font-weight: bold; color: var(--accent); text-align: center; text-shadow: 0 0 10px var(--accent-glow); letter-spacing: 2px; }
        
        .section { background: #16161f; padding: 15px; border-radius: 8px; border: 1px solid var(--border); }
        .section h3 { font-size: 14px; margin-bottom: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
        
        input, select { width: 100%; padding: 10px; margin-bottom: 10px; background: #0b0b0f; border: 1px solid var(--border); border-radius: 5px; color: #fff; font-size: 13px; }
        input:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 5px var(--accent-glow); }
        
        button { width: 100%; padding: 10px; background: var(--accent); border: none; border-radius: 5px; color: #fff; font-weight: bold; cursor: pointer; transition: 0.2s; }
        button:hover { opacity: 0.85; box-shadow: 0 0 10px var(--accent-glow); }
        
        /* Sağ Terminal Alanı */
        .main-content { flex: 1; display: flex; flex-direction: column; padding: 20px; }
        .terminal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .stats { display: flex; gap: 15px; font-size: 13px; color: var(--text-muted); }
        .stats span { color: var(--accent); font-weight: bold; }
        
        .terminal { flex: 1; background: #07070a; border: 1px solid var(--border); border-radius: 8px; padding: 15px; font-family: 'Courier New', Courier, monospace; font-size: 13px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
        .log-line { line-height: 1.4; }
        .log-info { color: #00ffff; }
        .log-success { color: #00ff66; }
        .log-error { color: #ff3333; }
        .log-warning { color: #ffcc00; }
    </style>
</head>
<body>

    <div class="sidebar">
        <div class="logo">WAZER INAT SYSTEM</div>

        <!-- Hesap Ekleme -->
        <div class="section">
            <h3>User Girişi</h3>
            <input type="text" id="phone" placeholder="Telefon (+90...)">
            <button onclick="loginUser()">User Bağlan</button>
        </div>

        <div class="section" id="authCodeSection" style="display:none;">
            <h3>Doğrulama</h3>
            <input type="text" id="authCode" placeholder="Telegram Kod / 2FA">
            <button onclick="sendAuthCode()">Kodu Gönder</button>
        </div>

        <div class="section">
            <h3>Bot Token Ekle</h3>
            <input type="text" id="botToken" placeholder="Bot Token">
            <button onclick="addBot()">Bot Ekle</button>
        </div>

        <!-- Mesaj Otomasyonu -->
        <div class="section">
            <h3>Otomasyon Paneli</h3>
            <input type="text" id="target" placeholder="Hedef (Username / ID)">
            <input type="text" id="message" placeholder="Gönderilecek Mesaj">
            <input type="number" id="count" placeholder="Adet" value="5">
            <input type="number" id="interval" placeholder="Aralık (Saniye)" value="1" step="0.1">
            <select id="typing">
                <option value="true">Typing (Yazıyor...) Açık</option>
                <option value="false">Typing Kapalı</option>
            </select>
            <button onclick="startSpam()" style="background: #28a745;">BAŞLAT</button>
        </div>
    </div>

    <div class="main-content">
        <div class="terminal-header">
            <h3>Live Execution Terminal</h3>
            <div class="stats">
                <div>User: <span id="userCount">0</span></div>
                <div>Bot: <span id="botCount">0</span></div>
            </div>
        </div>
        <div class="terminal" id="terminal">
            <div class="log-line log-info">[SYSTEM] WAZER INAT SYSTEM v1.0 Web Arayüzü Hazır.</div>
        </div>
    </div>

    <script>
        const socket = io();

        socket.on('log', (data) => {
            const term = document.getElementById('terminal');
            const div = document.createElement('div');
            div.className = 'log-line ' + (data.type ? 'log-' + data.type : '');
            div.innerText = data.text;
            term.appendChild(div);
            term.scrollTop = term.scrollHeight;
        });

        socket.on('stats', (data) => {
            document.getElementById('userCount').innerText = data.users;
            document.getElementById('botCount').innerText = data.bots;
        });

        socket.on('require_code', () => {
            document.getElementById('authCodeSection').style.display = 'block';
        });

        function loginUser() {
            const phone = document.getElementById('phone').value;
            socket.emit('login_user', { phone });
        }

        function sendAuthCode() {
            const code = document.getElementById('authCode').value;
            socket.emit('submit_code', { code });
        }

        function addBot() {
            const token = document.getElementById('botToken').value;
            socket.emit('add_bot', { token });
        }

        function startSpam() {
            const data = {
                target: document.getElementById('target').value,
                message: document.getElementById('message').value,
                count: parseInt(document.getElementById('count').value),
                interval: parseFloat(document.getElementById('interval').value),
                typing: document.getElementById('typing').value === 'true'
            };
            socket.emit('start_spam', data);
        }
    </script>
</body>
</html>
`;

app.get('/', (req, res) => {
  res.send(HTML_CONTENT);
});

// --- SOCKET.IO İLETİŞİM VE TELEGRAM MANTIĞI ---
let pendingResolve = null;

io.on('connection', (socket) => {
  const sendLog = (text, type = 'info') => {
    socket.emit('log', { text, type });
  };

  const updateStats = () => {
    socket.emit('stats', { users: activeUsers.length, bots: activeBots.length });
  };

  updateStats();

  socket.on('login_user', async ({ phone }) => {
    sendLog(`[User] ${phone} için oturum açılıyor...`, 'warning');
    const sessionPath = path.join(SESSIONS_DIR, `user_${phone.replace(/\+/g, '')}.session`);
    let savedSession = fs.existsSync(sessionPath) ? fs.readFileSync(sessionPath, 'utf8') : '';

    const client = new TelegramClient(new StringSession(savedSession), DEFAULT_API_ID, DEFAULT_API_HASH, {
      connectionRetries: 5,
    });

    try {
      await client.start({
        phoneNumber: async () => phone,
        phoneCode: async () => {
          sendLog('[User] Telegram doğrulama kodu bekleniyor...', 'warning');
          socket.emit('require_code');
          return new Promise(resolve => { pendingResolve = resolve; });
        },
        password: async () => {
          sendLog('[User] 2FA Şifresi bekleniyor...', 'warning');
          socket.emit('require_code');
          return new Promise(resolve => { pendingResolve = resolve; });
        },
        onError: (err) => sendLog(`[Hata] ${err.message}`, 'error'),
      });

      fs.writeFileSync(sessionPath, client.session.save(), 'utf8');
      activeUsers.push(client);
      updateStats();
      sendLog(`[✓] ${phone} başarıyla bağlandı!`, 'success');
    } catch (err) {
      sendLog(`[Giriş Hatası] ${err.message}`, 'error');
    }
  });

  socket.on('submit_code', ({ code }) => {
    if (pendingResolve) {
      pendingResolve(code);
      pendingResolve = null;
      documentCodeSection = false;
    }
  });

  socket.on('add_bot', async ({ token }) => {
    try {
      const bot = new TelegramBot(token, { polling: false });
      const me = await bot.getMe();
      activeBots.push({ token, instance: bot, info: me });
      updateStats();
      sendLog(`[✓] Bot eklendi: @${me.username}`, 'success');
    } catch (err) {
      sendLog(`[Bot Hatası] Geçersiz Token!`, 'error');
    }
  });

  socket.on('start_spam', async (data) => {
    const { target, message, count, interval, typing } = data;
    if (activeUsers.length === 0 && activeBots.length === 0) {
      sendLog(`[X] Aktif hesap veya bot bulunamadı!`, 'error');
      return;
    }

    sendLog(`[!] Otomasyon başlatıldı -> Hedef: ${target} (${count} Adet)`, 'warning');

    for (let i = 1; i <= count; i++) {
      const timeStr = new Date().toLocaleTimeString();

      for (const client of activeUsers) {
        try {
          if (typing) {
            await client.invoke(new (require('telegram/tl').requests.messages.SetTyping)({
              peer: target,
              action: new (require('telegram/tl').types.SendMessageTypingAction)()
            }));
            await new Promise(r => setTimeout(r, 600));
          }
          await client.sendMessage(target, { message });
          sendLog(`[${timeStr}] [User] Mesaj #${i} gönderildi -> ${target}`, 'success');
        } catch (err) {
          sendLog(`[${timeStr}] [User Error] ${err.message}`, 'error');
        }
      }

      for (const botObj of activeBots) {
        try {
          if (typing) {
            await botObj.instance.sendChatAction(target, 'typing');
            await new Promise(r => setTimeout(r, 600));
          }
          await botObj.instance.sendMessage(target, message);
          sendLog(`[${timeStr}] [Bot: @${botObj.info.username}] Mesaj #${i} gönderildi`, 'success');
        } catch (err) {
          sendLog(`[${timeStr}] [Bot Error] ${err.message}`, 'error');
        }
      }

      if (i < count) {
        await new Promise(r => setTimeout(r, interval * 1000));
      }
    }
    sendLog(`[✓] İşlem tamamlandı.`, 'success');
  });
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` WAZER INAT SYSTEM ÇALIŞIYOR`);
  console.log(` Tarayıcıda açın: http://localhost:${PORT}`);
  console.log(`========================================\n`);
});
