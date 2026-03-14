#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
搜尋所有需要修改 imports 的檔案
"""
import re
from pathlib import Path

def find_lib_imports():
    project_root = Path(r"d:\Projects\stock_study_tool")
    pattern = re.compile(r'(from|import)\s+App\.Lib')
    
    files_to_modify = []
    
    # 搜尋 App/ 和 Test/ 目錄
    for py_file in project_root.rglob("*.py"):
        # 跳過 __pycache__ 和特定的系統檔案
        if "__pycache__" in str(py_file) or py_file.name.startswith('.'):
            continue
        
        try:
            with open(py_file, 'r', encoding='utf-8') as f:
                content = f.read()
                if pattern.search(content):
                    rel_path = py_file.relative_to(project_root)
                    files_to_modify.append(rel_path)
        except UnicodeDecodeError:
            pass
    
    print(f"找到 {len(files_to_modify)} 個需要修改的檔案：\n")
    for file_path in sorted(files_to_modify):
        print(f"  • {file_path}")
    
    return files_to_modify

if __name__ == '__main__':
    find_lib_imports()
