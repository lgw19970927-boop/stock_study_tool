import sys
import os
import pandas as pd

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from App.Feature.data_sync.db import get_market_cursor, init_db
from App.config import get_config

def verify_a():
    init_db(get_config())
    
    with get_market_cursor() as cursor:
        cursor.execute(
            """
            SELECT datetime, close 
            FROM market_data_ohlcv 
            WHERE symbol = 'A' AND timeframe = '1d' 
            ORDER BY datetime DESC LIMIT 20
            """
        )
        rows = cursor.fetchall()

    df = pd.DataFrame(rows).iloc[::-1].reset_index(drop=True)
    df['close'] = df['close'].astype(float)
    
    lines = ["=== 股票 A 最近 20 筆日 K 的收盤價 ==="]
    for i, row in df.iterrows():
        dt = str(row['datetime']).split(' ')[0]
        lines.append(f"[{i+1:02d}] 日期: {dt}, 收盤價: {row['close']}")

    avg = df['close'].mean()
    lines.append(f"\n=> 這 20 天的平均價 (MIDDLE): {avg:.4f}")
    
    std = df['close'].std(ddof=0)
    lines.append(f"=> 這 20 天的母體標準差: {std:.4f}")
    lines.append(f"=> 上軌 (UPPER): {avg + 2*std:.4f}")
    lines.append(f"=> 下軌 (LOWER): {avg - 2*std:.4f}")
    
    out_path = os.path.join(os.path.dirname(__file__), 'A_dump.txt')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines))
        
    print(f"結果已寫出至 {out_path}")

if __name__ == "__main__":
    verify_a()
