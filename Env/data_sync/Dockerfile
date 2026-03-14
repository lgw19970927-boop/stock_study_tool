FROM python:3.11-slim

WORKDIR /workspace

RUN apt-get update && apt-get install -y \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# 複製 requirements.txt
COPY Env/data_sync/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 複製整個應用程式碼到 /workspace
COPY . /workspace

CMD ["python", "-m", "App.Feature.data_sync.data_sync.scheduler"]
