import os
import json
from flask import Flask, render_template, jsonify, request

# 初始化Flask应用
app = Flask(__name__)

CHARACTER_JSON_PATH = os.path.join(os.path.dirname(__file__), 'config', 'characters.json')

@app.route('/')
def chara_manager():
    """渲染主控制页面"""
    return render_template('chara_manager.html')

def load_characters():
    try:
        with open(CHARACTER_JSON_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {"主人": {}, "猫娘": {}}

def save_characters(data):
    with open(CHARACTER_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route('/api/characters', methods=['GET'])
def get_characters():
    return jsonify(load_characters())

@app.route('/api/characters/master', methods=['POST'])
def update_master():
    data = request.get_json()
    if not data or not data.get('档案名'):
        return jsonify({'success': False, 'error': '档案名为必填项'}), 400
    characters = load_characters()
    characters['主人'] = {k: v for k, v in data.items() if v}
    save_characters(characters)
    return jsonify({'success': True})

@app.route('/api/characters/catgirl', methods=['POST'])
def add_catgirl():
    data = request.get_json()
    if not data or not data.get('档案名'):
        return jsonify({'success': False, 'error': '档案名为必填项'}), 400
    for field in ['live2d', 'voice_id', 'system_prompt']:
        if not data.get(field):
            return jsonify({'success': False, 'error': f'{field}为必填项'}), 400
    characters = load_characters()
    key = data['档案名']
    if key in characters.get('猫娘', {}):
        return jsonify({'success': False, 'error': '该猫娘已存在'}), 400
    if '猫娘' not in characters:
        characters['猫娘'] = {}
    characters['猫娘'][key] = {k: v for k, v in data.items() if k != '档案名' and v}
    save_characters(characters)
    return jsonify({'success': True})

@app.route('/api/characters/catgirl/<name>', methods=['PUT'])
def update_catgirl(name):
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': '无数据'}), 400
    characters = load_characters()
    if name not in characters.get('猫娘', {}):
        return jsonify({'success': False, 'error': '猫娘不存在'}), 404
    characters['猫娘'][name] = {k: v for k, v in data.items() if k != '档案名' and v}
    save_characters(characters)
    return jsonify({'success': True})

@app.route('/api/characters/catgirl/<name>', methods=['DELETE'])
def delete_catgirl(name):
    characters = load_characters()
    if name not in characters.get('猫娘', {}):
        return jsonify({'success': False, 'error': '猫娘不存在'}), 404
    del characters['猫娘'][name]
    save_characters(characters)
    return jsonify({'success': True})

@app.route('/api/characters/catgirl/<old_name>/rename', methods=['POST'])
def rename_catgirl(old_name):
    data = request.get_json()
    new_name = data.get('new_name') if data else None
    if not new_name:
        return jsonify({'success': False, 'error': '新档案名不能为空'}), 400
    characters = load_characters()
    if old_name not in characters.get('猫娘', {}):
        return jsonify({'success': False, 'error': '原猫娘不存在'}), 404
    if new_name in characters['猫娘']:
        return jsonify({'success': False, 'error': '新档案名已存在'}), 400
    # 重命名
    characters['猫娘'][new_name] = characters['猫娘'].pop(old_name)
    save_characters(characters)
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)