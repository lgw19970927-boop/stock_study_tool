"""
Test/data_sync/validate_db.py
MySQL 資料庫驗證報告（測試工具，取代 reference 的 SQLite 版本）
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.Lib.db import get_market_cursor, get_user_cursor


def validate_database() -> bool:
    print("=" * 60)
    print("MySQL 資料庫驗證報告")
    print("=" * 60)

    try:
        with get_market_cursor() as cursor:
            # ── 1. stock_meta ──────────────────────────────────────
            print("\n1. 股票清單 (stock_meta)")
            print("-" * 60)
            cursor.execute("SELECT COUNT(*) AS cnt FROM stock_meta")
            total_stocks = cursor.fetchone()['cnt']
            print(f"   總股票數: {total_stocks:,}")
            if total_stocks == 0:
                print("   ⚠️  沒有 stock_meta 資料！")
                return False

            cursor.execute(
                "SELECT market, COUNT(*) AS cnt FROM stock_meta GROUP BY market"
            )
            for row in cursor.fetchall():
                print(f"   - {row['market'] or 'unknown'}: {row['cnt']:,} 支")

            print("\n   樣本（前 5 筆）：")
            cursor.execute("SELECT symbol, name, market FROM stock_meta LIMIT 5")
            for r in cursor.fetchall():
                name = (r['name'] or '')[:30]
                print(f"     {r['symbol']:<8} {name:<32} [{r['market']}]")

            # ── 2. market_data_ohlcv ───────────────────────────────
            print("\n\n2. K 線資料 (market_data_ohlcv)")
            print("-" * 60)
            cursor.execute("SELECT COUNT(*) AS cnt FROM market_data_ohlcv")
            total_rows = cursor.fetchone()['cnt']
            print(f"   總資料筆數: {total_rows:,}")
            if total_rows == 0:
                print("   ⚠️  沒有 K 線資料！")
                return False

            cursor.execute(
                "SELECT timeframe, COUNT(*) AS cnt FROM market_data_ohlcv GROUP BY timeframe"
            )
            print("\n   按 timeframe 統計：")
            for row in cursor.fetchall():
                print(f"     {row['timeframe']:<6}: {row['cnt']:,}")

            cursor.execute(
                "SELECT MIN(datetime) AS earliest, MAX(datetime) AS latest FROM market_data_ohlcv"
            )
            r = cursor.fetchone()
            print(f"\n   最早: {r['earliest']}")
            print(f"   最新: {r['latest']}")

            # ── 3. 覆蓋率 ─────────────────────────────────────────
            print("\n\n3. 資料完整性")
            print("-" * 60)
            cursor.execute(
                "SELECT COUNT(DISTINCT symbol) AS cnt FROM market_data_ohlcv"
            )
            stocks_with_data = cursor.fetchone()['cnt']
            coverage = (stocks_with_data / total_stocks * 100) if total_stocks else 0
            print(f"   有資料的股票: {stocks_with_data:,} / {total_stocks:,} ({coverage:.1f}%)")

        # ── 4. user_data ───────────────────────────────────────────
        print("\n\n4. 使用者資料 (user_data)")
        print("-" * 60)
        with get_user_cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS cnt FROM strategies")
            strat_cnt = cursor.fetchone()['cnt']
            print(f"   strategies: {strat_cnt} 筆")

        # ── 總結 ───────────────────────────────────────────────────
        print("\n" + "=" * 60)
        if total_stocks > 1000 and total_rows > 10000 and coverage > 5:
            print("✅ 資料庫狀態良好，可進行後端開發")
            return True
        elif total_stocks > 0 and total_rows > 0:
            print("⚠️  有基本資料，但可能需要更多下載")
            return True
        else:
            print("❌ 資料不足，請先執行資料下載")
            return False

    except Exception as e:
        print(f"\n❌ 錯誤：{e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = validate_database()
    sys.exit(0 if success else 1)
