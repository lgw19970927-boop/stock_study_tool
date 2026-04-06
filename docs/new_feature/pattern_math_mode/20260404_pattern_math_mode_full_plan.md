# 型態篩選 - 數學判斷模式 完整設計方案（前端 + 後端）

- **日期**：2026-04-04（更新：含後端、靈敏度 Slider 說明）
- **現況**：型態篩選中，「盤整區」採用數學規則判斷（振幅閾值 + 趨勢斜率 + 上下觸碰驗證），其餘型態（W底、頭肩頂、頭肩底、三角收斂）全部採用深度學習模型辨識。

---

## 一、現有「靈敏度 Slider」的實際參數說明

### Slider 數值 → 後端參數的轉換

```python
# service.py, _detect_consolidation()
threshold = 0.05 + (sensitivity / 100) * 0.08
```

| Slider 值 | 對應 threshold | 含義 |
|-----------|---------------|------|
| 0（最嚴格） | 0.05（5%）   | 振幅超過 5% 即排除 |
| 50（中間）  | 0.09（9%）   | 振幅超過 9% 即排除 |
| 75（預設）  | 0.11（11%）  | 振幅超過 11% 即排除 |
| 100（最寬鬆）| 0.13（13%） | 振幅超過 13% 即排除 |

`threshold` 是「最大允許振幅」，計算方式：`(最高點 - 最低點) / 最低點`。

### 盤整區的完整判斷邏輯（三道關卡）

1. **振幅關卡**：`(最高點 - 最低點) / 最低點ˊ ≤ threshold`
2. **趨勢斜率關卡**：OLS 線性迴歸斜率 / 平均收盤價 ≤ 0.5%（硬限制，不受 Slider 影響）
3. **上下觸碰關卡**：K線必須同時觸碰過上緣（98% 最高點）與下緣（102% 最低點）

**結論：Slider 綁定「振幅容忍度」是合理的**，靈敏度越低 → threshold 越小 → 判斷越嚴格（僅認定極窄幅的盤整），反之越寬鬆。但斜率與觸碰驗證為硬邏輯，不受 Slider 控制。

### 建議：以參數面板取代靈敏度 Slider（盤整區）

> 盤整區在現行程式中是「固定走規則法」，不是 YOLO 模型類別；因此建議改成顯式數學參數，不再用單一 slider 映射。

| 參數鍵 | UI 名稱 | 建議預設 | 範圍 | 取代來源 |
|--------|---------|----------|------|----------|
| `max_amplitude_pct` | 最大振幅(%) | 11 | 3 ~ 20 | 取代 slider 映射出的 `threshold` |
| `max_slope_pct_per_bar` | 最大斜率(%/bar) | 0.5 | 0.1 ~ 2.0 | 原本硬編碼 0.5% |
| `touch_tolerance_pct` | 上下軌觸碰容忍(%) | 2.0 | 0.5 ~ 5.0 | 原本固定 98%/102% |
| `min_band_touches` | 最少觸碰次數 | 1 | 1 ~ 3 | 新增穩定度控制 |

盤整區建議判定條件（參數化後）：

1. `amplitude_pct <= max_amplitude_pct`
2. `abs(slope_pct_per_bar) <= max_slope_pct_per_bar`
3. `upper_touch_count >= min_band_touches` 且 `lower_touch_count >= min_band_touches`
4. 觸碰判定使用 `touch_tolerance_pct`

---

## 二、背景說明

| 型態 | 現有方式 |
|------|----------|
| 盤整區 | 數學判斷 ✅ |
| W 底 | 模型辨識 |
| 頭肩頂 | 模型辨識 |
| 頭肩底 | 模型辨識 |
| 三角收斂 | 模型辨識 |

數學判斷優點：速度快、可解釋、不依賴模型權重。
模型辨識優點：能捕捉非完美型態的模糊特徵。
**設計目標**：讓使用者可按型態自由選擇「使用哪種模式」。

### 模型支援檢查（專案現況）

- `service.py` 內明確註記「盤整區規則法（無 YOLO 模型支援）」。
- `service.py` 的 `_detect_with_yolo` 會把 `consolidation` 從 YOLO 目標中排除。
- `pattern_mapping.py` 的 YOLO class mapping 也沒有盤整區類別。

結論：此專案目前「盤整區 = 數學規則固定模式」。

---

## 三、UI 設計方案 — 「每個型態卡片內嵌模式切換」

### 3.1 整體版面示意圖

目前型態篩選版面（無模式切換）：
```
┌──────────────────────────┐
│  🗖 型態篩選     [PART 2] │
│  ---                      │
│  識別型態                  │
│  ┌──────────┐ ┌──────────┐│
│  │   盤整區  │ │   W 底   ││
│  └──────────┘ └──────────┘│
│  ┌──────────┐ ┌──────────┐│
│  │  頭肩頂   │ │  頭肩底  ││
│  └──────────┘ └──────────┘│
│  ┌──────────┐              │
│  │ 三角收斂  │              │
│  └──────────┘              │
└──────────────────────────┘
```

加入「模式選擇」後（型態卡片勾選後展開）：
```
┌──────────────────────────┐
│  🗖 型態篩選     [PART 2] │
│  ---                      │
│  識別型態                  │
│  ┌──────────┐ ┌──────────┐│
│  │ ☑ 盤整區 │ │ ☑  W 底  ││
│  │  ∑數學固定│ │ ○模型    ││
│  │ 振幅/斜率 │ │ ●數學    ││  ← 僅非盤整區顯示模型/數學切換
│  └──────────┘ └──────────┘│
│  ┌──────────┐ ┌──────────┐│
│  │ ☑ 頭肩頂 │ │ □ 頭肩底 ││
│  │          │ │ （未勾選，│
│  │ ●模型    │ │  不顯示） ││
│  │ ○數學    │ │           ││
│  └──────────┘ └──────────┘│
│  ┌──────────┐              │
│  │□ 三角收斂│              │
│  └──────────┘              │
└──────────────────────────┘
```

### 3.2 單一型態卡片放大示意（勾選後狀態）

```
╔════════════════════╗
║  ☑  W 底           ║  ← checkbox 勾選後觸發展開
║  ┌──────────────┐  ║
║  │  W 字 SVG圖  │  ║
║  └──────────────┘  ║
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║  ← 分隔線（勾選後才出現）
║  識別模式：          ║
║  ● 模型辨識         ║  ← radio button
║  ○ 數學規則         ║  ← radio button
╚════════════════════╝
```

### 3.3 數學規則模式展開後（額外參數）

```
╔════════════════════════════╗
║  ☑  W 底                   ║
║  ┌──────────────────────┐  ║
║  │      W 字 SVG圖      │  ║
║  └──────────────────────┘  ║
║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ║
║  識別模式：                  ║
║  ○ 模型辨識                 ║
║  ● 數學規則                 ║
║  ┌────────────────────┐    ║
║  │ 容忍誤差：[  5  ] %│    ║
║  │ 回看週期：[ 20  ]  │    ║
║  └────────────────────┘    ║
╚════════════════════════════╝
```

---

## 四、互動邏輯說明

```
使用者勾選型態 checkbox
        │
        ▼
型態卡片展開
        │
    ├─ 盤整區（consolidation）
    │       └─ 固定為「數學模式」：顯示盤整參數面板（振幅/斜率/觸碰）
        │
    └─ 非盤整區（W底、頭肩頂底、三角）
        ├─ 選「模型辨識」→ 使用模型 conf threshold
        └─ 選「數學規則」→ 顯示該型態對應參數（容忍誤差、回看週期等）
```

---

## 五、各型態數學判斷參數規劃

| 型態 | 建議數學規則 | 可調參數 | 後端實作狀態 |
|------|-------------|----------|-------------|
| 盤整區 | 振幅閾值 + 趨勢斜率 + 上下觸碰驗證（規則法固定） | 最大振幅%、最大斜率%/bar、觸碰容忍%、最少觸碰次數 | ✅ 已實作（可參數化） |
| W 底 | 兩個低點高度差 < 容忍率 × 平均低點，且中間反彈 > 最小幅度 | 容忍率 %、最小反彈幅度 %、回看週期 | ❌ 待實作 |
| 頭肩頂 | 三頂高度比較（左肩 ≈ 右肩 < 頭部），頸線斜率限制 | 肩部對稱容忍率 %、頸線最大斜率、回看週期 | ❌ 待實作 |
| 頭肩底 | 三底深度比較（左肩 ≈ 右肩 > 頭部） | 同頭肩頂 | ❌ 待實作 |
| 三角收斂 | 高點 OLS 斜率 < 0、低點 OLS 斜率 > 0，R² > 閾值 | R² 閾值、收斂角度上限、回看週期 | ❌ 待實作 |

---

## 六、前端實作方案

### 6.1 HTML 結構調整（`pattern_panel.html`）

```html
<label class="pattern-card">
    <input type="checkbox" name="pattern" value="w_bottom">
    <div class="pattern-icon"><!-- SVG --></div>
    <span>W 底</span>
    <!-- 新增：勾選後展開的模式選擇 -->
    <div class="pattern-mode-panel is-hidden">
        <div class="pattern-mode-label">識別模式</div>
        <label class="pattern-mode-radio">
            <input type="radio" name="w_bottom_mode" value="model" checked> 模型辨識
        </label>
        <label class="pattern-mode-radio">
            <input type="radio" name="w_bottom_mode" value="math"> 數學規則
        </label>
        <!-- 數學模式參數面板（預設隱藏）-->
        <div class="pattern-math-params is-hidden">
            <div class="pattern-param-row">
                <label>容忍誤差</label>
                <input type="number" class="pattern-param-input" value="5" min="1" max="20">
                <span>%</span>
            </div>
            <div class="pattern-param-row">
                <label>回看週期</label>
                <input type="number" class="pattern-param-input" value="20" min="5" max="100">
            </div>
        </div>
    </div>
</label>
```

### 6.2 JS 邏輯（`pattern_manager.js`）

1. 監聽 `.pattern-card input[type="checkbox"]` 的 change 事件 → toggle `.pattern-mode-panel` 的 `is-hidden`
2. 若型態是 `consolidation`：不顯示模型/數學 radio，直接顯示盤整參數（振幅/斜率/觸碰）
3. 監聽非盤整區 `.pattern-mode-radio input[type="radio"]` → 選「數學規則」才顯示 `.pattern-math-params`
4. 收集篩選條件時，輸出 per-pattern `mode`，並另外附上 `consolidation_params`

### 6.3 CSS 注意事項

- `.pattern-card` 現為 `flex-direction: column`，展開後高度自然增長，加入 `transition: all 0.2s` 可產生展開動畫
- 注意：`.pattern-grid` 為 grid 2欄，展開後兩欄高度可能不同，需確認是否可接受

---

## 七、後端實作方案

### 7.1 API 修改（`pattern/routes.py`）

現有 `sensitivity` 在所有型態間共用。建議改為「per-pattern mode + consolidation_params」：

```python
# 現有結構（僅供參考）
class PatternFilter(BaseModel):
    patterns: List[str]
    sensitivity: int = 75
    patternTimeframe: dict

# 擴充後
class PatternConfig(BaseModel):
    type: str
    mode: Literal["model", "math"] = "model"  # consolidation 固定 math
    params: dict = {}   # 數學模式專屬參數

class ConsolidationParams(BaseModel):
    max_amplitude_pct: float = 11.0
    max_slope_pct_per_bar: float = 0.5
    touch_tolerance_pct: float = 2.0
    min_band_touches: int = 1

class PatternFilter(BaseModel):
    patterns: List[PatternConfig]   # 改為物件陣列（consolidation 只允許 mode=math）
    consolidation_params: ConsolidationParams = ConsolidationParams()
    patternTimeframe: dict
```

### 7.2 後端 payload 格式（前後端通訊）

```json
{
  "patterns": [
        { "type": "consolidation", "mode": "math", "params": {} },
    { "type": "w_bottom", "mode": "model", "params": {} },
    { "type": "head_shoulders_top", "mode": "math", "params": { "shoulder_tolerance": 5, "lookback": 60 } }
  ],
    "consolidation_params": {
        "max_amplitude_pct": 11.0,
        "max_slope_pct_per_bar": 0.5,
        "touch_tolerance_pct": 2.0,
        "min_band_touches": 1
    },
  "patternTimeframe": { "min": 10, "max": 60, "interval": "1d" }
}
```

### 7.3 `service.py` 路由邏輯修改

```python
def detect_patterns(config: PatternConfig, prices, consolidation_params) -> List[dict]:
    if config.mode == "math":
        if config.type == "consolidation":
            return _detect_consolidation_math(prices, ..., consolidation_params)
        elif config.type == "w_bottom":
            # 待實作
            return _detect_w_bottom_math(prices, config.params)
        else:
            # 後端尚未實作：回傳標記
            return [{"name": config.type, "mode": "math", "status": "not_implemented"}]
    else:
        # 現有模型辨識邏輯
        return _detect_by_model(config.type, prices, conf_threshold)
```

### 7.4 各型態數學算法實作要點（待實作）

**W 底**
```python
def _detect_w_bottom_math(prices, params):
    tolerance = params.get("tolerance_pct", 5) / 100
    min_bounce = params.get("min_bounce_pct", 3) / 100
    lookback = params.get("lookback", 20)
    # 1. 找局部低點（scipy.signal.argrelmin 或滑動窗口）
    # 2. 找連續兩個低點，差距 < tolerance × 平均低點
    # 3. 兩低點之間的最高點（中間反彈）> 低點 × (1 + min_bounce)
    # 4. 返回符合條件的窗口
```

**頭肩頂 / 頭肩底**
```python
def _detect_head_shoulders_math(prices, params, is_top: bool):
    tolerance = params.get("shoulder_tolerance", 5) / 100
    lookback = params.get("lookback", 60)
    # 1. 找三個主要峰值（頂）或谷值（底）
    # 2. 驗證中間峰/谷（頭部）高於/低於兩側（肩部）
    # 3. 驗證左肩 ≈ 右肩（差距在 tolerance 內）
    # 4. 計算頸線並驗證斜率不超過上限
```

**三角收斂**
```python
def _detect_triangle_math(prices, params):
    r2_threshold = params.get("r2_threshold", 0.7)
    lookback = params.get("lookback", 30)
    # 1. 取窗口內局部高點，OLS 擬合 → 斜率應 < 0
    # 2. 取窗口內局部低點，OLS 擬合 → 斜率應 > 0
    # 3. 兩條線的 R² 均 > r2_threshold
    # 4. 兩線交叉點在窗口右側（尚未突破）
```

---

## 八、風險與替代方案

| 風險 | 說明 | 緩解 |
|------|------|------|
| 卡片高度不一致 | 展開數學參數後高度不同，grid 版面可能錯位 | grid 改 flex-column 並允許各行獨立高度，或展開時改為全寬卡片 |
| 數學規則後端未實作 | 前端選「數學規則」但後端回傳 `not_implemented` | 前端顯示「後端計算中（開發中）」灰色 badge，不當錯誤處理 |
| consolidation_params 向下相容 | 新 payload 可能與舊版 API 不相容 | 路由暫時保留 `sensitivity` 並映射到 `max_amplitude_pct` 作過渡 |
| 數學判斷效能 | 全量股票 × 多窗口大小 × 複雜算法，延遲可能增加 | 數學模式加入最大回看週期上限（例如 100 bars），並考慮快取 |

---

## 九、實作優先順序建議

1. **Phase A**（前端 UI skeleton）：HTML 結構 + CSS 展開動畫，不接 JS 邏輯
2. **Phase B**（前端互動）：checkbox 展開 + radio 切換 + 參數收集 + payload 格式調整
3. **Phase C-1**（後端 payload 接收）：routes.py 接受新格式，數學型態回傳 `not_implemented`
4. **Phase C-2**（後端算法）：逐一實作 W底、頭肩、三角收斂的數學判斷
5. **Phase D**（整合測試）：前後端串接 + 回歸測試盤整區現有邏輯不受影響

---

## 十、我的策略卡摘要（技術型態）改寫方案

> 目標：你在「我的策略」Tab 看到的摘要，不再只有「模型辨識模式」描述，而是能同時表達每一個型態使用的是「模型」或「數學」，並顯示關鍵參數。

### 10.1 現況（你畫面中的模型模式寫法）

目前摘要近似：

```text
技術型態: 頭肩底 | 敏感度: 40% | 週期: 8~50根 (1D)
```

問題：
- 只看得出「整體敏感度」，看不出每個型態的辨識模式。
- 當某些型態切到數學模式後，摘要無法說明數學參數。

---

### 10.2 新摘要格式（推薦）

第一行（維持全域資訊）：

```text
技術型態: 盤整區, W底, 頭肩底 | 週期: 8~50根 (1D)
```

第二行（新增模式明細）：

```text
型態模式: 盤整區[數學 振幅<=11%]、W底[模型 s=40]、頭肩底[數學 對稱<=5% N=60]
```

說明：
- `模型` 顯示 `s`（模型 conf 門檻）。
- `數學` 顯示該型態最關鍵 1~2 個參數，避免策略卡過長。

---

### 10.3 策略卡示意圖（我的策略 Tab）

#### A. 全模型模式（與目前行為相容）

```text
┌──────────────────────────────────────────────────────┐
│ 測試型態功能                               2026/04/04 │
│ 市場範圍: 上市/上櫃/興櫃 | 篩選頻率: 每日             │
│ 技術型態: 頭肩底, 三角收斂 | 週期: 8~50根 (1D)       │
│ 型態模式: 頭肩底[模型 s=40]、三角收斂[模型 s=40]     │
└──────────────────────────────────────────────────────┘
```

#### B. 全數學模式

```text
┌────────────────────────────────────────────────────────────┐
│ 測試型態功能（數學）                             2026/04/04 │
│ 市場範圍: 上市/上櫃/興櫃 | 篩選頻率: 每日                 │
│ 技術型態: 盤整區, W底 | 週期: 8~50根 (1D)                │
│ 型態模式: 盤整區[數學 振幅<=11%]、W底[數學 誤差<=5% N=20] │
└────────────────────────────────────────────────────────────┘
```

#### C. 混合模式（模型 + 數學）

```text
┌────────────────────────────────────────────────────────────────┐
│ 測試型態+數學混合                                       2026/04/04 │
│ 市場範圍: 上市/上櫃/興櫃 | 篩選頻率: 每日                     │
│ 技術型態: 盤整區, W底, 頭肩底 | 週期: 8~50根 (1D)             │
│ 型態模式: 盤整區[數學 振幅<=11%]、W底[模型 s=40]、頭肩底[數學 對稱<=5%] │
└────────────────────────────────────────────────────────────────┘
```

---

### 10.4 技術型態摘要字串規則（可直接對應前端）

| 型態 | 模型模式字串 | 數學模式字串（建議） |
|------|--------------|----------------------|
| 盤整區 | `N/A（固定數學模式）` | `盤整區[數學 振幅<={amp}% 斜率<={slope}%]` |
| W底 | `W底[模型 s={s}]` | `W底[數學 誤差<={tol}% N={lookback}]` |
| 頭肩頂 | `頭肩頂[模型 s={s}]` | `頭肩頂[數學 對稱<={tol}% N={lookback}]` |
| 頭肩底 | `頭肩底[模型 s={s}]` | `頭肩底[數學 對稱<={tol}% N={lookback}]` |
| 三角收斂 | `三角收斂[模型 s={s}]` | `三角收斂[數學 R²>={r2} N={lookback}]` |

備註：
- 盤整區改用 `consolidation_params` 直出（不再依賴 slider 映射）。
- 若策略卡需維持兩行預覽，第三行（型態模式詳情）可放入 `更多 ▼` 展開區。

---

### 10.5 前端實作落點（對應目前程式）

- 位置：`strategy_manager.js` 的 `_generateDescriptionFromData(filters)`
- 目前只組 `技術型態 + 敏感度 + 週期`
- 調整為：
    1. 保留「技術型態 + 週期」
    2. 新增「型態模式」行（逐一輸出 `pattern + mode + params`）
    3. 舊資料（只有 patterns:string[]）預設回退為模型模式，確保向下相容
