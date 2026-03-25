# ─────────────────────────────────────────────
# Stage 1: Build Tailwind CSS
# ─────────────────────────────────────────────
FROM node:18-alpine AS css-builder

WORKDIR /app

# Install Node deps first (cache layer)
COPY package.json ./
RUN npm install

# Copy Tailwind/PostCSS config
COPY tailwind.config.js postcss.config.js ./

# Copy all app source (HTML/JS for content scanning + CSS for @imports)
COPY App/ App/

# Build the CSS bundle
RUN npm run build:css

# ─────────────────────────────────────────────
# Stage 2: Python application (CUDA runtime)
# ─────────────────────────────────────────────
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

WORKDIR /workspace

# 安裝系統依賴
# libgl1 / libglib2.0-0: OpenCV headless 需要的底層共用函式庫
# libxcb1: 防止 ultralytics 依賴的 cv2 嘗試開啟 X11 視窗時報錯
RUN apt-get update && apt-get install -y \
    python3-pip \
    gcc \
    curl \
    default-libmysqlclient-dev \
    pkg-config \
    libgl1 \
    libglib2.0-0 \
    libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# 升級 pip 和 setuptools
RUN pip install --upgrade pip setuptools wheel

# 安裝 PyTorch for CUDA 12.1（先安裝，避免被 ultralytics 的依賴覆蓋）
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cu121 torch torchvision

# 複製 requirements 並安裝 Python 依賴
COPY Env/fastapi/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 強制以 headless 版本覆蓋 ultralytics 安裝時拉入的 opencv-python
# ultralytics 會把 opencv-python (有 GUI) 當作依賴安裝，覆蓋 headless 版本
RUN pip install --no-cache-dir --force-reinstall opencv-python-headless

# 複製整個應用程式碼到 /workspace（.dockerignore 已排除 tailwind.output.css）
COPY . /workspace

# 從 css-builder stage 複製建構好的 CSS（production 用；開發時由 volume mount 覆蓋）
COPY --from=css-builder /app/App/Static/css/tailwind.output.css /workspace/App/Static/css/tailwind.output.css

# ✅ 開啟多 worker（預設 4 個；也可改為 8）
# 使用 App.app:app 形式啟動（App 是包，app.py 是模組，app 是應用實例）
CMD ["python3", "-m", "uvicorn", "App.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
