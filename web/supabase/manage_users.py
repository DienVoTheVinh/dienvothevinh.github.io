#!/usr/bin/env python3
import os
import sys
import re
import random
import string
import json
from dotenv import load_dotenv

# Load environment variables
script_dir = os.path.dirname(os.path.abspath(__file__))
# Check for .env in current dir and parent dirs
dotenv_path = os.path.join(script_dir, '.env')
if not os.path.exists(dotenv_path):
    dotenv_path = os.path.join(script_dir, '..', '.env')
if not os.path.exists(dotenv_path):
    dotenv_path = os.path.join(script_dir, '..', '..', '.env')

load_dotenv(dotenv_path)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def clean_name(name):
    name = name.lower().strip()
    # Replace Vietnamese specific characters
    replacements = {
        'đ': 'd', 'á': 'a', 'à': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
        'ă': 'a', 'ắ': 'a', 'ằ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
        'â': 'a', 'ấ': 'a', 'ầ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
        'é': 'e', 'è': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
        'ê': 'e', 'ế': 'e', 'ề': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
        'í': 'i', 'ì': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
        'ó': 'o', 'ò': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
        'ô': 'o', 'ố': 'o', 'ồ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
        'ơ': 'o', 'ớ': 'o', 'ờ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
        'ú': 'u', 'ù': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
        'ư': 'u', 'ứ': 'u', 'ừ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
        'ý': 'y', 'ỳ': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y'
    }
    for k, v in replacements.items():
        name = name.replace(k, v)
    # Split by spaces and join to remove spaces
    parts = [re.sub(r'[^a-z0-9]', '', p) for p in name.split()]
    return "".join(parts)

def generate_password():
    # Generate vm + 6 digits
    digits = "".join(random.choices(string.digits, k=6))
    return f"vm{digits}"

def create_user(full_name, class_name=None, role='student'):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured in .env file.")
        sys.exit(1)
        
    import urllib.request
    import urllib.error
    
    # Format username and email
    cleaned_name = clean_name(full_name)
    
    if role == 'student':
        if not class_name:
            print("Error: Student account creation requires a class name.")
            return None
        cleaned_class = clean_name(class_name)
        username = f"{cleaned_name}.{cleaned_class}"
        email = f"{username}@hs.vinhmath.com"
        role_display = "Học sinh"
    elif role == 'teacher':
        username = f"gv.{cleaned_name}"
        email = f"{username}@gv.vinhmath.com"
        role_display = "Giáo viên"
    elif role == 'assistant':
        username = f"tg.{cleaned_name}"
        email = f"{username}@tg.vinhmath.com"
        role_display = "Trợ giảng"
    elif role == 'admin':
        username = f"admin.{cleaned_name}"
        email = f"{username}@admin.vinhmath.com"
        role_display = "Quản trị viên"
    else:
        print(f"Error: Invalid role '{role}'")
        return None
        
    password = generate_password()
    
    # Payload for Auth Admin API
    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {
            "full_name": full_name
        }
    }
    
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    
    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/admin/users"
    
    import ssl
    context = ssl._create_unverified_context()
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req, context=context) as response:
            status_code = response.getcode()
            response_text = response.read().decode('utf-8')
            user_data = json.loads(response_text)
            
            # Print output strictly conforming to the global rule:
            # 1. Email hệ thống (tk)
            # 2. Mật khẩu
            # 3. Vai trò
            print("=== THÔNG TIN TÀI KHOẢN ===")
            print(f"1. Email hệ thống (tk): {username}")
            print(f"2. Mật khẩu: {password}")
            print(f"3. Vai trò: {role_display}")
            print("===========================")
            return user_data
    except urllib.error.HTTPError as e:
        print(f"Error creating user: Status {e.code}")
        print(e.read().decode('utf-8'))
        return None
    except Exception as e:
        print(f"Connection error: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  For students:  python manage_users.py \"<Full Name>\" \"<Class>\"")
        print("  For others:    python manage_users.py \"<Full Name>\" \"\" \"<role: teacher/assistant/admin>\"")
        sys.exit(1)
        
    name = sys.argv[1]
    cls = sys.argv[2] if len(sys.argv) > 2 else ""
    role = sys.argv[3] if len(sys.argv) > 3 else "student"
    
    create_user(name, cls, role)
