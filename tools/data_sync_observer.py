"""
Standalone observer for data_sync progress.

Watch mode renders a compact dashboard with in-place updates:
- live progress bar for current running job
- completed / unfinished / pending counters
- latest coverage timestamps per timeframe

Run inside data_sync container:
    python3 /workspace/tools/data_sync_observer.py --watch --interval 2
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from typing import Any

import mysql.connector
from mysql.connector import Error


INCREMENTAL_INTERVALS = ["1d", "1h", "5m", "1m"]
BACKFILL_INTERVALS = ["1d", "1h"]


def _read_secret(var_name: str, default: str | None = None) -> str | None:
    file_path = os.environ.get(f"{var_name}_FILE")
    if file_path and os.path.isfile(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read().strip()

    secret_path = f"/run/secrets/{var_name.lower()}"
    if os.path.isfile(secret_path):
        with open(secret_path, "r", encoding="utf-8") as f:
            return f.read().strip()

    value = os.environ.get(var_name)
    if value is not None:
        return value

    return default


def _db_config_from_env(args: argparse.Namespace) -> dict[str, Any]:
    password = args.password or _read_secret("MYSQL_PASSWORD", "stockapp_password")
    return {
        "host": args.host,
        "port": args.port,
        "user": args.user,
        "password": password,
        "database": args.database,
        "charset": "utf8mb4",
    }


def _connect_db(args: argparse.Namespace):
    cfg = _db_config_from_env(args)
    return mysql.connector.connect(**cfg)


def _fetchall_dict(conn, query: str, params: tuple[Any, ...] | None = None) -> list[dict[str, Any]]:
    with conn.cursor(dictionary=True) as cur:
        cur.execute(query, params or ())
        return cur.fetchall()


def _fetchone_dict(conn, query: str, params: tuple[Any, ...] | None = None) -> dict[str, Any] | None:
    with conn.cursor(dictionary=True) as cur:
        cur.execute(query, params or ())
        return cur.fetchone()


def _fetchone_scalar(conn, query: str, params: tuple[Any, ...] | None = None) -> Any:
    with conn.cursor() as cur:
        cur.execute(query, params or ())
        row = cur.fetchone()
        if not row:
            return None
        return row[0]


def _table_exists(conn, table_name: str, database: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = %s AND table_name = %s",
            (database, table_name),
        )
        row = cur.fetchone()
        return bool(row and int(row[0]) > 0)


def _query_job_state(conn, status: str | None, limit: int) -> list[dict[str, Any]]:
    base = (
        "SELECT job_name, interval_type, status, last_ticker, last_chunk_idx, "
        "target_start, target_end, started_at, updated_at "
        "FROM job_state"
    )
    params: list[Any] = []
    if status:
        base += " WHERE status = %s"
        params.append(status)
    base += " ORDER BY updated_at DESC, id DESC LIMIT %s"
    params.append(limit)
    return _fetchall_dict(conn, base, tuple(params))


def _query_coverage(conn) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for timeframe in INCREMENTAL_INTERVALS:
        latest_dt = _fetchone_scalar(
            conn,
            "SELECT datetime FROM market_data_ohlcv "
            "WHERE timeframe = %s ORDER BY datetime DESC LIMIT 1",
            (timeframe,),
        )
        rows.append({
            "timeframe": timeframe,
            "latest_dt": latest_dt,
        })
    return rows


def _query_backfill_non_completed(conn, limit: int) -> list[dict[str, Any]]:
    query = (
        "SELECT interval_type, start_date, end_date, status, completed_at "
        "FROM backfill_history "
        "WHERE status <> 'completed' "
        "ORDER BY id DESC LIMIT %s"
    )
    return _fetchall_dict(conn, query, (limit,))


def _pending_interval_checks(conn) -> list[str]:
    pending: list[str] = []

    for interval in INCREMENTAL_INTERVALS:
        completed_today = _fetchone_scalar(
            conn,
            "SELECT COUNT(*) FROM job_state "
            "WHERE status = 'completed' AND interval_type = %s "
            "AND job_name LIKE %s AND DATE(updated_at) = CURDATE()",
            (interval, f"incremental_{interval}_%"),
        ) or 0
        running_now = _fetchone_scalar(
            conn,
            "SELECT COUNT(*) FROM job_state "
            "WHERE status = 'running' AND interval_type = %s "
            "AND job_name LIKE %s",
            (interval, f"incremental_{interval}_%"),
        ) or 0
        if completed_today == 0 and running_now == 0:
            pending.append(f"incremental {interval}: no run today")

    for interval in BACKFILL_INTERVALS:
        completed_today = _fetchone_scalar(
            conn,
            "SELECT COUNT(*) FROM job_state "
            "WHERE status = 'completed' AND interval_type = %s "
            "AND job_name = %s AND DATE(updated_at) = CURDATE()",
            (interval, f"backfill_{interval}"),
        ) or 0
        running_now = _fetchone_scalar(
            conn,
            "SELECT COUNT(*) FROM job_state "
            "WHERE status = 'running' AND interval_type = %s "
            "AND job_name = %s",
            (interval, f"backfill_{interval}"),
        ) or 0
        if completed_today == 0 and running_now == 0:
            pending.append(f"backfill {interval}: not completed today")

    return pending


def _parse_timestamp(line: str) -> datetime | None:
    match = re.search(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:,\d+)?", line)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def _get_container_logs(container_name: str, tail: int) -> str:
    cmd = ["docker", "logs", "--tail", str(tail), container_name]
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stdout.strip() or f"docker logs failed with code {proc.returncode}")
    return proc.stdout


def _parse_log_progress(raw_logs: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    start_re = re.compile(
        r"Starting sync for (?P<total>\d+) tickers\..*interval=(?P<interval>\S+).*job=(?P<job>\S+)"
    )
    progress_re = re.compile(r"\[Progress:\s*(?P<done>\d+)/(?P<total>\d+)\s*\(")
    incremental_re = re.compile(r"Running Incremental Update for (?P<interval>\S+)\.\.\.")
    backfill_re = re.compile(r"Running Progressive Backfill for (?P<interval>\S+)\.\.\.")

    jobs: dict[str, dict[str, Any]] = {}
    ordered: list[str] = []
    current_job: str | None = None
    current_interval_hint: str | None = None

    for line in raw_logs.splitlines():
        ts = _parse_timestamp(line)

        match_start = start_re.search(line)
        if match_start:
            job_name = match_start.group("job")
            interval = match_start.group("interval")
            total = int(match_start.group("total"))
            jobs[job_name] = {
                "job_name": job_name,
                "interval_type": interval,
                "status": "running",
                "last_ticker": None,
                "last_chunk_idx": None,
                "updated_at": ts,
                "progress_done": 0,
                "progress_total": total,
            }
            ordered.append(job_name)
            current_job = job_name
            continue

        match_inc = incremental_re.search(line)
        if match_inc:
            current_interval_hint = match_inc.group("interval")
            continue

        match_backfill = backfill_re.search(line)
        if match_backfill:
            current_interval_hint = match_backfill.group("interval")
            continue

        match_progress = progress_re.search(line)
        if match_progress:
            if current_job is None:
                fallback_job = f"log_only_{current_interval_hint or 'unknown'}"
                if fallback_job not in jobs:
                    jobs[fallback_job] = {
                        "job_name": fallback_job,
                        "interval_type": current_interval_hint or "-",
                        "status": "running",
                        "last_ticker": None,
                        "last_chunk_idx": None,
                        "updated_at": ts,
                        "progress_done": 0,
                        "progress_total": 0,
                    }
                    ordered.append(fallback_job)
                current_job = fallback_job

            done = int(match_progress.group("done"))
            total = int(match_progress.group("total"))
            jobs[current_job]["progress_done"] = done
            jobs[current_job]["progress_total"] = total
            jobs[current_job]["updated_at"] = ts or jobs[current_job].get("updated_at")
            continue

        if "Sync batch completed." in line and current_job is not None:
            jobs[current_job]["status"] = "completed"
            total = int(jobs[current_job].get("progress_total") or 0)
            jobs[current_job]["progress_done"] = total
            jobs[current_job]["updated_at"] = ts or jobs[current_job].get("updated_at")
            current_job = None
            continue

    ordered_jobs = [jobs[key] for key in ordered if key in jobs]
    running = [job for job in ordered_jobs if job.get("status") == "running"]
    completed = [job for job in ordered_jobs if job.get("status") == "completed"]
    interrupted: list[dict[str, Any]] = []
    return running, list(reversed(completed)), interrupted


def _fmt_dt(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value)


def _fmt_timeframe_cell(coverage_map: dict[str, dict[str, Any]], timeframe: str) -> str:
    row = coverage_map.get(timeframe)
    if not row:
        return f"{timeframe}: -"
    latest = _fmt_dt(row.get("latest_dt"))
    return f"{timeframe}: {latest}"


def _build_progress_bar(done: int, total: int | None, width: int) -> str:
    if total is None or total <= 0:
        filled = max(1, min(width, (done % width) + 1)) if done > 0 else 1
        return f"[{'#' * filled}{'-' * (width - filled)}] n/a (processed>={done})"

    ratio = max(0.0, min(float(done) / float(total), 1.0))
    filled = int(width * ratio)
    return f"[{'#' * filled}{'-' * (width - filled)}] {ratio * 100:5.1f}% ({done}/{total})"


def _collect_snapshot(args: argparse.Namespace) -> dict[str, Any]:
    try:
        conn = _connect_db(args)
    except Error as error:
        return {"error": f"Cannot connect to MySQL: {error}"}

    try:
        has_job_state = _table_exists(conn, "job_state", args.database)
        has_backfill_history = _table_exists(conn, "backfill_history", args.database)
        has_market_data = _table_exists(conn, "market_data_ohlcv", args.database)

        coverage_rows = _query_coverage(conn) if has_market_data else []
        coverage_map: dict[str, dict[str, Any]] = {}
        for row in coverage_rows:
            timeframe = str(row.get("timeframe") or "")
            coverage_map[timeframe] = row

        if has_job_state:
            running = _query_job_state(conn, "running", args.limit)
            completed = _query_job_state(conn, "completed", args.limit)
            interrupted = _query_job_state(conn, "interrupted", args.limit)
            pending = _pending_interval_checks(conn)
            source_mode = "job_state"

            total_tickers = 0
            try:
                if _table_exists(conn, "tickers", args.database):
                    total_tickers = int(
                        _fetchone_scalar(
                            conn,
                            "SELECT COUNT(*) FROM tickers WHERE is_active = 1 AND is_suspected_delisted = 0",
                        )
                        or 0
                    )
                elif _table_exists(conn, "stock_meta", args.database):
                    total_tickers = int(
                        _fetchone_scalar(
                            conn,
                            "SELECT COUNT(*) FROM stock_meta WHERE status = 'Active'",
                        )
                        or 0
                    )
            except Error as count_error:
                pending.append(f"ticker count unavailable: {count_error}")
        else:
            raw_logs = _get_container_logs(args.container_name, args.log_tail)
            running, completed, interrupted = _parse_log_progress(raw_logs)
            pending = ["job_state table missing: using log fallback mode"]
            source_mode = "container_logs"
            total_tickers = 0

        backfill_non_completed = _query_backfill_non_completed(conn, args.limit) if has_backfill_history else []

        timeframe_status: list[dict[str, Any]] = []
        if has_job_state:
            for interval in INCREMENTAL_INTERVALS:
                running_now = int(
                    _fetchone_scalar(
                        conn,
                        "SELECT COUNT(*) FROM job_state "
                        "WHERE status = 'running' AND interval_type = %s AND job_name LIKE %s",
                        (interval, f"incremental_{interval}_%"),
                    )
                    or 0
                )
                completed_today = int(
                    _fetchone_scalar(
                        conn,
                        "SELECT COUNT(*) FROM job_state "
                        "WHERE status = 'completed' AND interval_type = %s "
                        "AND job_name LIKE %s AND DATE(updated_at) = CURDATE()",
                        (interval, f"incremental_{interval}_%"),
                    )
                    or 0
                )

                latest_row = _fetchone_dict(
                    conn,
                    "SELECT job_name, interval_type, status, last_chunk_idx, updated_at "
                    "FROM job_state "
                    "WHERE interval_type = %s AND job_name LIKE %s "
                    "ORDER BY updated_at DESC, id DESC LIMIT 1",
                    (interval, f"incremental_{interval}_%"),
                )

                chunk_idx = latest_row.get("last_chunk_idx") if latest_row else None
                progress_done = (chunk_idx + 1) * args.chunk_size if isinstance(chunk_idx, int) and chunk_idx >= 0 else 0
                progress_total = total_tickers if total_tickers > 0 else None

                if running_now > 0:
                    status_label = "RUNNING"
                elif completed_today > 0:
                    status_label = "DONE"
                else:
                    status_label = "PENDING"

                timeframe_status.append(
                    {
                        "timeframe": interval,
                        "job_type": "INCREMENTAL",
                        "status": status_label,
                        "progress_done": progress_done,
                        "progress_total": progress_total,
                        "coverage": _fmt_dt((coverage_map.get(interval) or {}).get("latest_dt")),
                    }
                )

            for interval in BACKFILL_INTERVALS:
                running_now = int(
                    _fetchone_scalar(
                        conn,
                        "SELECT COUNT(*) FROM job_state "
                        "WHERE status = 'running' AND interval_type = %s "
                        "AND (job_name = %s OR job_name = %s)",
                        (interval, f"backfill_{interval}", f"startup_backfill_{interval}"),
                    )
                    or 0
                )
                completed_today = int(
                    _fetchone_scalar(
                        conn,
                        "SELECT COUNT(*) FROM job_state "
                        "WHERE status = 'completed' AND interval_type = %s "
                        "AND (job_name = %s OR job_name = %s) AND DATE(updated_at) = CURDATE()",
                        (interval, f"backfill_{interval}", f"startup_backfill_{interval}"),
                    )
                    or 0
                )

                latest_row = _fetchone_dict(
                    conn,
                    "SELECT job_name, interval_type, status, last_chunk_idx, updated_at "
                    "FROM job_state "
                    "WHERE interval_type = %s AND (job_name = %s OR job_name = %s) "
                    "ORDER BY updated_at DESC, id DESC LIMIT 1",
                    (interval, f"backfill_{interval}", f"startup_backfill_{interval}"),
                )

                chunk_idx = latest_row.get("last_chunk_idx") if latest_row else None
                progress_done = (chunk_idx + 1) * args.chunk_size if isinstance(chunk_idx, int) and chunk_idx >= 0 else 0
                progress_total = total_tickers if total_tickers > 0 else None

                if running_now > 0:
                    status_label = "RUNNING"
                elif completed_today > 0:
                    status_label = "DONE"
                else:
                    status_label = "PENDING"

                oldest_reached = "-"
                if has_backfill_history:
                    oldest_val = _fetchone_scalar(
                        conn,
                        "SELECT MIN(start_date) FROM backfill_history "
                        "WHERE interval_type = %s AND status = 'completed'",
                        (interval,),
                    )
                    oldest_reached = _fmt_dt(oldest_val)

                timeframe_status.append(
                    {
                        "timeframe": interval,
                        "job_type": "BACKFILL",
                        "status": status_label,
                        "progress_done": progress_done,
                        "progress_total": progress_total,
                        "coverage": oldest_reached,
                    }
                )
        else:
            timeframe_status = []
    except (Error, RuntimeError) as error:
        return {"error": str(error)}
    finally:
        conn.close()

    active_job = running[0] if running else None
    progress_done = 0
    progress_total: int | None = None

    if active_job:
        if active_job.get("progress_done") is not None:
            progress_done = int(active_job.get("progress_done") or 0)
        chunk_idx = active_job.get("last_chunk_idx")
        if progress_done == 0 and isinstance(chunk_idx, int) and chunk_idx >= 0:
            progress_done = (chunk_idx + 1) * args.chunk_size

        if active_job.get("progress_total") is not None:
            maybe_total = int(active_job.get("progress_total") or 0)
            progress_total = maybe_total if maybe_total > 0 else None
        if progress_total is None and total_tickers > 0:
            progress_total = total_tickers

    unfinished_count = len(interrupted)
    if has_backfill_history:
        unfinished_count += len(backfill_non_completed)

    last_completed_at = completed[0].get("updated_at") if completed else None

    active_ticker = active_job.get("last_ticker") if active_job else None
    active_time_range = None
    if active_job:
        active_time_range = {
            "start": active_job.get("target_start"),
            "end": active_job.get("target_end"),
        }

    return {
        "snapshot_at": datetime.now(),
        "source_mode": source_mode,
        "active_job": active_job,
        "active_ticker": active_ticker,
        "active_time_range": active_time_range,
        "total_tickers": total_tickers,
        "progress_done": progress_done,
        "progress_total": progress_total,
        "completed_count": len(completed),
        "unfinished_count": unfinished_count,
        "pending_count": len(pending),
        "pending": pending,
        "coverage_map": coverage_map,
        "timeframe_status": timeframe_status,
        "last_completed_at": last_completed_at,
    }


def _snapshot_to_lines(snapshot: dict[str, Any], args: argparse.Namespace) -> list[str]:
    if snapshot.get("error"):
        return [
            "Data Sync Observer",
            f"[ERROR] {snapshot['error']}",
            "Hint: verify mysql/data_sync containers are running.",
        ]

    active_job = snapshot.get("active_job")
    if active_job:
        active_label = f"{active_job.get('job_name')} ({active_job.get('interval_type')})"
    else:
        active_label = "none"

    progress = _build_progress_bar(
        int(snapshot.get("progress_done") or 0),
        snapshot.get("progress_total"),
        args.bar_width,
    )

    pending_text = "none"
    pending_items = snapshot.get("pending") or []
    if pending_items:
        pending_text = " | ".join(pending_items[:2])

    coverage_map = snapshot.get("coverage_map") or {}
    active_ticker = snapshot.get("active_ticker") or "-"
    active_range = snapshot.get("active_time_range") or {}
    active_start = _fmt_dt(active_range.get("start")) if active_range else "-"
    active_end = _fmt_dt(active_range.get("end")) if active_range else "-"

    lines = [
        "Data Sync Observer Dashboard",
        f"snapshot: {snapshot['snapshot_at'].strftime('%Y-%m-%d %H:%M:%S')}  source_mode: {snapshot.get('source_mode')}",
        f"db: {args.host}:{args.port}/{args.database}",
        f"active_job: {active_label}",
        f"active_ticker: {active_ticker}",
        f"active_range: {active_start} ~ {active_end}",
        f"progress: {progress}",
        (
            "counters: "
            f"completed={snapshot.get('completed_count', 0)}  "
            f"unfinished={snapshot.get('unfinished_count', 0)}  "
            f"pending={snapshot.get('pending_count', 0)}"
        ),
        f"last_completed_at: {_fmt_dt(snapshot.get('last_completed_at'))}",
        f"pending_detail: {pending_text}",
        "",
        "TIMEFRAME STATUS TABLE (Coverage Latest / Oldest Reached)",
        "TF  | Type        | Status   | Progress      | Coverage",
        "----|-------------|----------|---------------|---------------------",
    ]

    timeframe_status = snapshot.get("timeframe_status") or []
    if timeframe_status:
        for row in timeframe_status:
            done = int(row.get("progress_done") or 0)
            total = row.get("progress_total")
            progress_text = f"{done}/{total}" if total else (f"{done}/-" if done else "-")
            lines.append(
                f"{str(row.get('timeframe', '-')):<3} | "
                f"{str(row.get('job_type', '-')):<11} | "
                f"{str(row.get('status', '-')):<8} | "
                f"{progress_text:<13} | "
                f"{str(row.get('coverage', '-'))}"
            )
    else:
        lines.append("-   | -           | -        | -             | -")

    lines.extend(
        [
            "",
            (
                "coverage_latest: "
                f"{_fmt_timeframe_cell(coverage_map, '1d')}  |  "
                f"{_fmt_timeframe_cell(coverage_map, '1h')}"
            ),
            (
                "coverage_latest: "
                f"{_fmt_timeframe_cell(coverage_map, '5m')}  |  "
                f"{_fmt_timeframe_cell(coverage_map, '1m')}"
            ),
            "Ctrl+C to stop watching",
        ]
    )

    return lines


def _render_in_place(lines: list[str], previous_line_count: int, use_ansi: bool) -> int:
    if not use_ansi or not sys.stdout.isatty():
        print("\n".join(lines), flush=True)
        return len(lines)

    if previous_line_count > 0:
        sys.stdout.write(f"\033[{previous_line_count}F")

    line_count = max(previous_line_count, len(lines))
    for idx in range(line_count):
        text = lines[idx] if idx < len(lines) else ""
        sys.stdout.write("\033[2K" + text + "\n")

    sys.stdout.flush()
    return len(lines)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Observe data_sync progress from MySQL and container logs.")
    parser.add_argument("--host", default=os.environ.get("MYSQL_HOST", "mysql"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("MYSQL_PORT", "3306")))
    parser.add_argument("--user", default=os.environ.get("MYSQL_USER", "stockapp"))
    parser.add_argument("--password", default=None, help="MySQL password; defaults to MYSQL_PASSWORD(_FILE).")
    parser.add_argument("--database", default=os.environ.get("MYSQL_MARKET_DB", "market_data"))

    parser.add_argument("--watch", action="store_true", help="Refresh dashboard continuously.")
    parser.add_argument("--interval", type=int, default=5, help="Watch refresh interval in seconds.")
    parser.add_argument("--limit", type=int, default=20, help="Rows fetched from job_state/log parser.")
    parser.add_argument("--chunk-size", type=int, default=20, help="Chunk size for processed estimate when total is unknown.")
    parser.add_argument("--container-name", default="stock-data-sync", help="Container name for log fallback mode.")
    parser.add_argument("--log-tail", type=int, default=4000, help="Number of log lines to parse in fallback mode.")
    parser.add_argument("--bar-width", type=int, default=42, help="Progress bar width.")
    parser.add_argument("--no-ansi", action="store_true", help="Disable ANSI in-place rendering.")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()

    if not args.watch:
        snapshot = _collect_snapshot(args)
        lines = _snapshot_to_lines(snapshot, args)
        print("\n".join(lines))
        return 0 if not snapshot.get("error") else 1

    previous_line_count = 0
    use_ansi = not args.no_ansi

    while True:
        snapshot = _collect_snapshot(args)
        lines = _snapshot_to_lines(snapshot, args)
        previous_line_count = _render_in_place(lines, previous_line_count, use_ansi)

        if snapshot.get("error"):
            return 1

        time.sleep(max(args.interval, 1))


if __name__ == "__main__":
    sys.exit(main())
