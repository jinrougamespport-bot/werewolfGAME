import sys
import os
import random
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import threading
import time
import json
from werkzeug.security import generate_password_hash, check_password_hash

USER_DB = "users.json"

# タイマー管理用
game_timer = None
DAY_TIME = 300  # 昼の時間（秒）
NIGHT_TIME = 60 # 夜の時間（秒）

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")
app.config['JSON_AS_ASCII'] = False

players = {}
game_state = {"phase": "day"}

MAP_URLS = {
    "day": "/static/マップ画像昼テキスト付.png",
    "night": "/static/マップ画像夜テキスト付.png"
}

ROOM_DATA = {
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
    "村長の家": "/static/待機室テキスト付.png"
}

ROOM_MOVES = {
    "待機室": ["広場"],
    "風車": ["広場"],
    "広場": ["風車", "配電室", "貯水タンク", "Mさんの家", "Aさんの家", "畑", "村長の家", "Sさんの家", "パン屋"],
    "Mさんの家": ["広場", "Aさんの家"],
    "Aさんの家": ["Mさんの家", "広場"],
    "Sさんの家": ["広場", "パン屋"],
    "村長の家": ["貯水タンク", "畑", "広場"],
    "配電室": ["広場"],
    "貯水タンク": ["広場", "畑", "村長の家"],
    "畑": ["貯水タンク", "村長の家", "広場"],
    "パン屋": ["Sさんの家", "広場"]
}

def load_users():
    if not os.path.exists(USER_DB):
        return {}
    try:
        with open(USER_DB, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

def save_users(users):
    with open(USER_DB, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=4, ensure_ascii=False)

def emit_player_list():
    plist = []
    for sid, p in players.items():
        if p.get('name'):
            plist.append({
                "name": p["name"],
                "role": p["role"],
                "alive": p["is_alive"],
                "is_gm": p["is_gm"]
            })
    socketio.emit('update_player_list', plist)


def login_user_process(username, user_info, sid):
    """
    ユーザーのログイン・登録成功後の内部処理。
    プレイヤー情報を登録し、待機室へ入室させる。
    """
    is_gm = (username == "gm_jinrouGM")
    
    # プレイヤー情報をメモリに保存
    players[sid] = {
        "name": username, 
        "room": "待機室", 
        "role": "未定",
        "is_alive": True, 
        "is_gm": is_gm,
        "wins": user_info.get("wins", 0), 
        "losses": user_info.get("losses", 0)
    }
    
    # Socket.IOのルーム機能で「待機室」に参加（sidを指定して確実に実行）
    join_room("待機室", sid=sid)
    
    # クライアントへ認証成功を通知（to=sid で送信先を固定）
    emit('auth_success', {
        "username": username, 
        "wins": user_info.get("wins", 0), 
        "losses": user_info.get("losses", 0),
        "is_gm": (username == "gm_jinrouGM")
    }, to=sid)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('authenticate')
def handle_authentication(data):
    """
    フロントエンドからのログイン・新規登録リクエストを処理する。
    """
    action = data.get('action') # 'register' または 'login'
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    users = load_users()

    # 入力チェック
    if not username or not password:
        emit('auth_error', {"msg": "未入力の項目があります。"})
        return

    if action == 'register':
        # 新規登録処理
        if username in users:
            emit('auth_error', {"msg": "その名前は既に登録されています。"})
        else:
            # パスワードをハッシュ化して保存
            users[username] = {
                "password": generate_password_hash(password), 
                "wins": 0, 
                "losses": 0
            }
            save_users(users)
            # 登録完了後、そのままログイン処理へ（sidとしてrequest.sidを渡す）
            login_user_process(username, users[username], request.sid)
            
    elif action == 'login':
        # ログイン照合処理
        if username in users:
            if check_password_hash(users[username]['password'], password):
                # パスワード一致：ログイン実行
                login_user_process(username, users[username], request.sid)
            else:
                # パスワード不一致
                emit('auth_error', {"msg": "パスワードが正しくありません。"})
        else:
            # ユーザーが存在しない
            emit('auth_error', {"msg": "ユーザーが見つかりません。新規登録してください。"})

@socketio.on('join_game')
def handle_join(data):
    username = data.get('username')

    players[request.sid] = {
        'name': username,
        'room': '待機室'
    }
    print(f"DEBUG: ログイン成功 - {username} (SID: {request.sid})")

    user = players.get(request.sid)
    if not user:
        return

    if user['is_gm']:
        user['role'] = "GM"
    else:
        user['role'] = random.choice(["人狼", "占い師", "守り人", "村人"])

    join_room("待機室")
    emit('role_assigned', {"role": user['role'], "is_gm": user['is_gm']})
    emit('phase_update', {"phase": game_state["phase"], "url": MAP_URLS[game_state["phase"]]})
    emit('room_update', {
        "room": "待機室",
        "url": ROOM_DATA["待機室"],
        "can_move_to": ROOM_MOVES.get("待機室", [])
    })
    emit_player_list()


@socketio.on('chat_message')
def handle_chat(data):
    user = players.get(request.sid)
    if not user: return
    msg = data.get('message', '').strip()
    if msg:
        emit('new_chat', {'name': user['name'], 'msg': msg}, to=user['room'])


# app.py
@socketio.on('join_game')
def handle_join(data):
    username = data.get('username')
    sid = request.sid
    
    # 役職リスト（テスト用にランダムに割り当てる例）
    import random
    roles = ["村人", "人狼", "占い師", "守り人"]
    assigned_role = random.choice(roles)

    # プレイヤー情報を保存
    players[sid] = {
        'name': username,
        'room': '待機室',
        'role': assigned_role # 役職を保存
    }

    print(f"DEBUG: {username} 入村。役職: {assigned_role}")

    # 【重要】入村した本人に役職を通知する
    emit('role_update', {'role': assigned_role}, to=sid)
    
    # ついでに初期の部屋情報も送る
    emit('room_update', {
        'room': '待機室',
        'url': ROOM_DATA.get('待機室', '/static/待機室テキスト付.png'),
        'can_move_to': ROOM_MOVES.get('待機室', ["広場"])
    }, to=sid)
    

@socketio.on('move')
def handle_move(data):
    new_room = data.get('room')
    user = players.get(request.sid)
    
    print(f"DEBUG: 移動リクエスト受信 - ユーザー: {user}, 行き先: {new_room}")

    if user and new_room in ROOM_MOVES.get(user['room'], []):
        # 以前の部屋から退出して新しい部屋へ（Socket.IOのルーム機能）
        leave_room(user['room'])
        join_room(new_room)
        
        # ユーザー情報を更新
        user['room'] = new_room
        
        print(f"DEBUG: 移動成功 - {user['name']} は {new_room} に移動しました")

        # 本人に更新情報を送る (to=request.sid を追加)
        emit('room_update', {
            "room": new_room,
            "url": ROOM_DATA.get(new_room, f"/static/{new_room}テキスト付.png"), # URLが空なら補完
            "can_move_to": ROOM_MOVES.get(new_room, [])
        }, to=request.sid)
    else:
        print(f"DEBUG: 移動失敗 - 条件を満たしていません (user={user})")

@socketio.on('use_skill')
def handle_skill(data):
    user = players.get(request.sid)
    target_name = data.get('target')
    skill_type = data.get('skill')
    if not user or not user['is_alive']: return

    target_sid = next((sid for sid, p in players.items() if p['name'] == target_name), None)
    if not target_sid: return

    # GMログ
    log_msg = f"【能力】{user['name']}({user['role']}) -> {target_name}: {skill_type}"
    for sid, p in players.items():
        if p.get('is_gm'):
            emit('new_chat', {'name': 'GMログ', 'msg': log_msg}, to=sid)

    if skill_type == "襲撃する":
        players[target_sid]['is_alive'] = False
        emit('player_died', {"msg": "人狼に襲撃されました。"}, to=target_sid)
        emit('new_chat', {'name': 'システム', 'msg': f"【速報】{target_name} さんが無残な姿で発見されました。"}, broadcast=True)
        emit_player_list()

@socketio.on('change_phase')
def handle_phase(data):
    user = players.get(request.sid)
    if not user or not user['is_gm']: return
    new_phase = data.get('phase')
    if new_phase in MAP_URLS:
        game_state["phase"] = new_phase
        emit('phase_update', {"phase": new_phase, "url": MAP_URLS[new_phase]}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in players:
        del players[request.sid]
        emit_player_list()

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')
    

@app.route('/game')
def game_page():
    # 元の index.html をゲーム専用画面として使う
    return render_template('index.html')

@app.after_request
def add_security_headers(response):
    # Content-Typeが設定されている場合、charset=utf-8を付加する
    if response.mimetype == 'text/plain' or response.mimetype == 'application/json':
        response.set_data(response.get_data()) # データの再セット
        response.headers["Content-Type"] = f"{response.mimetype}; charset=utf-8"
    
    # 前回のセキュリティ警告（nosniff）もここで一緒に解決できます
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=10000, debug=True)