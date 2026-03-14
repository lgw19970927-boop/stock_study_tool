#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
架構 Refactor 第一階段：檔案複製腳本
"""
import shutil
import os
from pathlib import Path

def main():
    # 設置路徑
    project_root = Path(r"d:\Projects\stock_study_tool")
    lib_path = project_root / "App" / "Lib"
    data_sync_path = project_root / "App" / "Feature" / "data_sync"
    mysql_seed_path = project_root / "App" / "Env" / "mysql" / "seed"
    fastapi_path = project_root / "App" / "Env" / "fastapi"

    print("🔄 開始複製檔案...\n")

    # 1. 複製 Python 檔案
    print("[1] 複製 Python 檔案...")
    for file in ["db.py", "market_data.py"]:
        src = lib_path / file
        dst = data_sync_path / file
        if src.exists():
            shutil.copy2(src, dst)
            print(f"  ✓ {file}")
        else:
            print(f"  ⚠️ {file} 不存在")

    # 2. 複製 data_sync 目錄
    print("\n[2] 複製 data_sync 目錄...")
    data_sync_src = lib_path / "data_sync"
    data_sync_dst = data_sync_path / "data_sync"
    if data_sync_src.exists():
        if data_sync_dst.exists():
            shutil.rmtree(data_sync_dst)
        shutil.copytree(data_sync_src, data_sync_dst)
        print(f"  ✓ data_sync/ 目錄複製完成")
    else:
        print(f"  ⚠️ data_sync/ 目錄不存在")

    # 3. 複製 seed SQL
    print("\n[3] 複製 seed SQL...")
    data_path = project_root / "App" / "Env" / "data"
    mysql_seed_path.mkdir(parents=True, exist_ok=True)
    if data_path.exists():
        for sql_file in data_path.glob("seed_*.sql"):
            dst = mysql_seed_path / sql_file.name
            shutil.copy2(sql_file, dst)
            print(f"  ✓ {sql_file.name}")
    else:
        print(f"  ⚠️ App/Env/data 目錄不存在")

    # 4. 複製 requirements.txt
    print("\n[4] 複製 requirements.txt...")
    req_src = project_root / "App" / "Env" / "requirements.txt"
    req_dst = fastapi_path / "requirements.txt"
    if req_src.exists():
        fastapi_path.mkdir(parents=True, exist_ok=True)
        shutil.copy2(req_src, req_dst)
        print(f"  ✓ requirements.txt 複製到 App/Env/fastapi/")
    else:
        print(f"  ⚠️ requirements.txt 不存在")

    # 5. 建立 __init__.py
    print("\n[5] 建立 __init__.py...")
    init_content = '''"""
App/Feature/data_sync/__init__.py
資料同步 Feature 模組
"""
'''
    init_path = data_sync_path / "__init__.py"
    with open(init_path, 'w', encoding='utf-8') as f:
        f.write(init_content)
    print(f"  ✓ __init__.py 已建立")

    print("\n✨ 第一階段檔案複製完成！")

if __name__ == '__main__':
    main()
