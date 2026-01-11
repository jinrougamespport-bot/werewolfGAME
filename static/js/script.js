var socket = io();

// --- 2. グローバル変数の定義 ---
let currentRoomName = "";
let currentRoomUrl = "";
let currentMapUrl = "";
let myRole = "";
let isGM = false;
let currentPhase = "day";
let canMoveList = [];
let playerList = []; 
let myName = "";
let currentAuthMode = 'login'; // 'login' または 'register'

// 地図上の点の位置設定
const ROOM_COORDINATES = {
    "広場":        { top: "48%", left: "50%" },
    "畑":          { top: "9%",  left: "22%" },
    "貯水タンク":  { top: "9%",  left: "50%" },
    "村長の家":    { top: "9%",  left: "77%" },
    "配電室":      { top: "48%", left: "12%" },
    "風車":        { top: "48%", left: "82%" },
    "Mさんの家":   { top: "76%", left: "11%" },
    "Aさんの家":   { top: "76%", left: "30%" },
    "Sさんの家":   { top: "76%", left: "73%" },
    "パン屋":      { top: "76%", left: "91%" },
    "待機室":      { top: "50%", left: "50%" }
};

const ROLE_IMAGES = {
    "村人": "/static/村人テキスト付.png",
    "占い師": "/static/占い師テキスト付.png",
    "守り人": "/static/守り人テキスト付.png",
    "人狼": "/static/人狼テキスト付.png"
};

const MAP_IMAGES = {
    "day": "/static/マップ画像昼テキスト付.png",   // 朝のマップ画像ファイル名
    "night": "/static/マップ画像夜テキスト付.png", // 夜のマップ画像ファイル名
    "待機室": "/static/待機室テキスト付.png",
    "広場": "/static/広場テキスト付.png",
    "Aさんの家": "/static/Aさんの家テキスト付.png",
    "Mさんの家": "/static/Mさんの家テキスト付.png",
    "Sさんの家": "/static/Sさんの家テキスト付.png",
    "パン屋": "/static/パン屋テキスト付.png",
    "貯水タンク": "/static/貯水タンクテキスト付.png",
    "配電室": "/static/配電室テキスト付.png",
    "畑": "/static/畑テキスト付.png",
    "風車": "/static/風車テキスト付.png",
    "村長の家": "/static/村長の家テキスト付.png"
};


// --- 3. 認証関連の関数 ---

// ログイン・新規登録の切り替え
function switchAuthMode() {
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-submit-btn');
    const desc = document.getElementById('toggle-desc');
    const link = document.getElementById('toggle-link');
    const msg = document.getElementById('auth-msg');

    if (msg) msg.innerText = ""; 

    if (currentAuthMode === 'login') {
        currentAuthMode = 'register';
        title.innerText = "新規登録";
        btn.innerText = "登録して入村";
        desc.innerText = "既にアカウントをお持ちですか？";
        link.innerText = "ログインはこちら";
    } else {
        currentAuthMode = 'login';
        title.innerText = "ログイン";
        btn.innerText = "ログイン";
        desc.innerText = "アカウントをお持ちでないですか？";
        link.innerText = "新規登録はこちら";
    }
}

// 認証情報の送信
function submitAuth() {
    const nameInput = document.getElementById('auth-username');
    const passInput = document.getElementById('auth-password');
    
    if (!nameInput || !passInput) return;

    const name = nameInput.value.trim();
    const pass = passInput.value.trim();

    if (!name || !pass) {
        alert("名前とパスワードを入力してください");
        return;
    }

    socket.emit('authenticate', {
        action: currentAuthMode,
        username: name,
        password: pass
    });
}

function joinGame() {
    const nameInput = document.getElementById('username');
    const name = nameInput.value.trim();
    if (!name) return;
    
    myName = name; // グローバル変数に保存
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    socket.emit('join_game', { username: name });
}

// 認証成功時
socket.on('auth_success', (data) => {
    // URLに情報をくっつけてダッシュボードに移動
    const url = `/dashboard?name=${data.username}&wins=${data.wins}&losses=${data.losses}`;
    window.location.href = url;
});

// 認証エラー受信
socket.on('auth_error', (data) => {
    const msgEl = document.getElementById('auth-msg');
    if (msgEl) msgEl.innerText = data.msg;
});

// --- 4. ゲームイベント受信 (サーバーからの通知) ---

socket.on('role_assigned', (data) => {
    myRole = data.role;
    isGM = data.is_gm;

    const roleCard = document.getElementById('role-card');
    const roleImg = document.getElementById('role-img');

    // GM以外は全員、役職画像を表示する設定に変更
    if (!isGM) {
        roleCard.style.display = 'block';
        // 役職に応じた画像を設定。リストにない場合は「村人」を予備として出す
        const imagePath = ROLE_IMAGES[myRole] || "/static/村人テキスト付.png";
        roleImg.src = imagePath;
    } else {
        roleCard.style.display = 'none';
    }

    if (isGM) {
        document.getElementById('gm-console').style.display = 'block';
    }
});


socket.on('room_update', (data) => {
    currentRoomName = data.room;
    // サーバーからのURL、または MAP_IMAGES からその部屋の画像を取得
    currentRoomUrl = data.url || MAP_IMAGES[data.room] || MAP_IMAGES["待機室"];
    canMoveList = data.can_move_to || [];

    console.log("サーバーから移動完了を受信:", data); // これを追加
    currentRoomName = data.room;

    // 1. 移動ボタンを再描画
    refreshButtons(); 
    
    // 2. 赤い点の位置を更新
    updateDotPosition(); 

    console.log("現在地を更新しました:", currentRoomName, "移動可能:", canMoveList);
});


socket.on('role_update', (data) => {
    console.log("役職データを受信:", data);
    myRole = data.role;

    const roleImg = document.getElementById('role-image');
    const roleText = document.getElementById('role-name-text');

    if (roleImg && roleText) {
        // 画像をセット
        const imgPath = ROLE_IMAGES[myRole] || "/static/村人.png";
        roleImg.src = imgPath;
        roleImg.style.display = "block";
        
        // テキストを更新
        roleText.innerText = myRole;
        
        // CSSを少し調整して見やすくする
        roleText.style.color = (myRole === "人狼") ? "#ff4d4d" : "#ffffff";
    }
});


socket.on('phase_update', (data) => {
    currentPhase = data.phase;
    
    // サーバーからの data.url が空でも、MAP_IMAGES からパスを取得する
    // data.phase が "day" なら "/static/マップ画像昼テキスト付.png" が入ります
    currentMapUrl = data.url || MAP_IMAGES[data.phase]; 
    
    const mapDisplay = document.getElementById('map-display');
    if (mapDisplay && currentMapUrl) {
        mapDisplay.src = currentMapUrl; 
        console.log("マップ表示を更新しました:", currentMapUrl);
    }
    
    document.body.style.backgroundColor = (data.phase === 'night') ? "#1a1a2e" : "#7494C0";
    
    // システムメッセージの追加
    const message = (data.phase === 'day') ? "☀️ 朝になりました。" : "🌙 夜になりました。";
    addSystemMessage(message);

    refreshButtons();
});

// チャットの受信
socket.on('new_chat', (data) => {
    const area = document.getElementById('chat-area');
    if (!area) return;
    area.innerHTML += `
        <div class="msg-container">
            <div class="user-name">${data.name}</div>
            <div class="msg-item">${data.msg}</div>
        </div>`;
    area.scrollTop = area.scrollHeight;
});

// プレイヤーリストの更新
socket.on('update_player_list', (data) => {
    playerList = data; 
    const listArea = document.getElementById('player-list-area');
    if (listArea) {
        listArea.innerHTML = data.map(p => `
            <div style="padding:8px; border-bottom:1px solid #444; color: ${p.alive ? '#fff' : '#ff4444'}">
                ${p.name} [${p.role}] - ${p.alive ? '生存' : '死亡'}
            </div>`).join('');
    }
});

socket.on('player_died', (data) => {
    // 画面全体を覆うゲームオーバー画面を動的に作成
    const deadOverlay = document.createElement('div');
    deadOverlay.style.position = 'fixed';
    deadOverlay.style.top = '0';
    deadOverlay.style.left = '0';
    deadOverlay.style.width = '100%';
    deadOverlay.style.height = '100%';
    deadOverlay.style.background = 'rgba(139, 0, 0, 0.9)'; // 暗い赤
    deadOverlay.style.color = 'white';
    deadOverlay.style.display = 'flex';
    deadOverlay.style.flexDirection = 'column';
    deadOverlay.style.justifyContent = 'center';
    deadOverlay.style.alignItems = 'center';
    deadOverlay.style.zIndex = '10000';
    deadOverlay.style.fontSize = '40px';
    deadOverlay.style.fontWeight = 'bold';
    
    deadOverlay.innerHTML = `
        <div>GAME OVER</div>
        <div style="font-size: 18px; margin-top: 20px;">${data.msg}</div>
        <div style="font-size: 14px; margin-top: 40px; color: #ccc;">(観戦モード)</div>
    `;
    
    document.body.appendChild(deadOverlay);

    // 操作不能にするための処理
    document.getElementById('chat-input').disabled = true;
    document.getElementById('quick-reply').style.pointerEvents = 'none';
    document.getElementById('quick-reply').style.opacity = '0.5';
});

// --- 5. プレイヤー操作関連の関数 ---

// メッセージ送信
function sendMessage() {
    const input = document.getElementById('chat-input');
    if (!input || !input.value.trim()) return;
    socket.emit('chat_message', { message: input.value });
    input.value = "";
}

function refreshButtons() {
    const container = document.getElementById('scroll-actions');
    if (!container) return;
    container.innerHTML = ""; 

    // 移動ボタンの生成
    if (canMoveList && canMoveList.length > 0) {
        canMoveList.forEach(roomName => {
            const btn = document.createElement('button');
            btn.className = "qr-btn";
            btn.innerText = roomName + "へ移動";
            
            btn.onclick = () => {
                console.log("移動ボタン押下:", roomName); // ログで確認
                // サーバー側の引数名が 'room' か 'destination' か確認が必要ですが、
                // 一般的には {'room': roomName} で送ります
                socket.emit('move', { room: roomName });
            };
            
            container.appendChild(btn);
        });
    }
}
// 補助関数：スキルボタン作成用
function addSkillBtn(actionName) {
    const container = document.getElementById('scroll-actions');
    const btn = document.createElement('button');
    btn.className = "qr-btn skill-btn";
    btn.innerText = actionName;
    btn.onclick = () => {
        const target = prompt(actionName + "対象のプレイヤー名を入力してください");
        if (target) socket.emit('use_skill', { action: actionName, target: target });
    };
    container.appendChild(btn);
}

// --- 6. UI表示・画像関連 ---

// 現在地のドット移動
function updateDotPosition() {
    const coord = ROOM_COORDINATES[currentRoomName];
    const miniDot = document.getElementById('location-dot');
    
    // 全画面用のドットがある場合も考慮
    const fullDot = document.getElementById('fullscreen-dot');

    [miniDot, fullDot].forEach(dot => {
        if (dot && coord) {
            dot.style.display = "block";
            dot.style.top = coord.top;
            dot.style.left = coord.left;
        } else if (dot) {
            dot.style.display = "none";
        }
    });
}

// プレイヤー統計の表示
function updateStatsUI(wins, losses) {
    const statsArea = document.getElementById('user-stats-display');
    if (statsArea) {
        statsArea.innerHTML = `👤 ${myName}<br>🏆 勝利: ${wins} / 💀 敗北: ${losses}`;
    }
}

// システムメッセージをチャット欄に追加
function addSystemMessage(msg) {
    const area = document.getElementById('chat-area');
    if (!area) return;
    area.innerHTML += `
        <div class="msg-container">
            <div class="msg-item" style="background: #ffeb3b; color: #000; font-weight: bold; border: none;">${msg}</div>
        </div>`;
    area.scrollTop = area.scrollHeight;
}

// GM用：フェーズ変更
function changePhase(p) { socket.emit('change_phase', { phase: p }); }
function openPlayerList() { document.getElementById('gm-player-modal').style.display = 'flex'; }
function closePlayerList() { document.getElementById('gm-player-modal').style.display = 'none'; }

// 全画面表示機能
function showRoleFullscreen() { showFull(ROLE_IMAGES[myRole], "あなたの役職: " + myRole); }

function showFullMap() { 
    // 変数が空ならデフォルトの昼マップを指定
    const url = currentMapUrl || MAP_IMAGES["day"];
    showFull(url, "🗺️ 全体図"); 
}
function showCurrentLocation() { 
    // currentRoomUrl が空なら現在の部屋名から画像を探す
    const url = currentRoomUrl || MAP_IMAGES[currentRoomName] || MAP_IMAGES["待機室"];
    showFull(url, "📍 現在地：" + currentRoomName); 
}

function showFull(src, title) {
    const overlay = document.getElementById('fullscreen-overlay');
    const img = document.getElementById('fullscreen-img');
    const titleEl = document.getElementById('fullscreen-title');
    const fullDot = document.getElementById('fullscreen-dot');
    
    if (!overlay || !img || !titleEl) return;
    img.src = src;
    titleEl.innerText = title;
    overlay.style.display = 'flex';
    
    // 地図の時だけ現在地ドットを表示
    if (fullDot) {
        fullDot.style.visibility = title.includes("全体図") ? "visible" : "hidden";
    }
}

function closeFullscreen() { 
    document.getElementById('fullscreen-overlay').style.display = 'none'; 
}

// エンターキーでの送信・ログイン対応
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const activeEl = document.activeElement;
        if (activeEl.id === 'chat-input') {
            sendMessage();
        } else if (activeEl.classList.contains('auth-input')) {
            submitAuth();
        }
    }
});

window.onload = function() {
    const params = new URLSearchParams(window.location.search);
    const nameFromUrl = params.get('name');
    const overlay = document.getElementById('login-overlay');
    const gameCon = document.getElementById('game-container');

    if (nameFromUrl) {
        if (overlay) overlay.style.display = 'none';
        if (gameCon) gameCon.style.display = 'flex';
        
        myName = nameFromUrl;
        
        const usernameInput = document.getElementById('username'); 
        if (usernameInput) {
            usernameInput.value = nameFromUrl;
        }

        currentRoomName = "待機室";
        // py側の ROOM_MOVES に基づいて「広場」を初期リストに入れる
        canMoveList = ["広場"]; 

        // 画面を更新（ドットとボタンを表示）
        updateDotPosition(); 
        refreshButtons();

        // --- ミニマップの初期表示処理を追加 ---
        const mapDisplay = document.getElementById('map-display');
        if (mapDisplay) {
            // currentMapUrlが空なら、現在のフェーズ(day)の画像をセットする
            const initialMap = currentMapUrl || MAP_IMAGES[currentPhase] || MAP_IMAGES["day"];
            mapDisplay.src = initialMap;
            console.log("ミニマップを初期化しました:", initialMap);
        }

        setTimeout(() => {
            console.log("自動入村実行:", myName);
            socket.emit('join_game', { username: myName });
        }, 500);

    } else {
        if (overlay) overlay.style.display = 'flex';
        if (gameCon) gameCon.style.display = 'none';
    }
};