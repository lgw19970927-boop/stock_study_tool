FROM ubuntu:22.04

WORKDIR /workspace

# 安裝系統依賴 + Python
RUN apt-get update && apt-get install -y \
    python3-pip \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# 升級 pip
RUN pip install --upgrade pip setuptools wheel

# 複製 requirements.txt
COPY env/data_sync/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 複製整個應用程式碼到 /workspace
COPY . /workspace

CMD ["python3", "/workspace/env/data_sync/scheduler.py"]
