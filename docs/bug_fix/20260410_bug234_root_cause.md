# Bug 2、Bug 3 與 Bug 4 根本原因分析

**日期**：2026-04-10  
**資料來源**：`[DIAG]` console log 截圖（含 baseline-before/after-drag、toggleExpand、loadStock、renderIndicators 等關鍵節點）

---

## 前置觀察：LW `setHeight` 的實際行為（與預期不同）

從 log 數據可確認 LightweightCharts v5 的 `setHeight` 行為：

| 情境 | `setHeight` 呼叫 | 實際渲染 |
|---|---|---|
| 2 pane：main=359, RSI=107 | `mainPane.setHeight(359)`, `panes[1].setHeight(107)` | RSI=107.33px, main=330px |
| 2 pane：main=234, RSI=232（EXPANDED）| `mainPane.setHeight(234)`, `panes[1].setHeight(232)` | RSI=232px, main=205.33px |

**結論：sub-pane（pane[1]+）得到約等於 setHeight 值的實際像素。main（pane[0]）得到 `paneArea - Σ(sub setHeight)` 的剩餘空間。**

其中：
- `paneArea`（LW 可用繪圖高度）= `panePxSum` ≈ `wrapperPx - 29px`（LW 內部 overhead，時間軸等）
- 本次測試：`wrapperPx = 466`，`paneArea ≈ 437px`

這代表 main 的 `setHeight` 值被忽略，main 永遠是剩餘空間。**`_baseMainPaneHeight` 若在計算 `expandedHeight` 時使用 `totalContH` 空間而非 `paneArea` 空間，就會造成 overhead 差額被錯誤地消耗在 sub-pane。**

---

## Bug 2：關閉 VOL 後 RSI 膨脹

### 實際 log 數據

| 節點 | 關鍵數值 |
|---|---|
| `baseline-after-drag`（VOL+RSI 均開，拖拉後）| main=204.67, VOL=168.67, RSI=61.33；`VOL.saved=133, RSI.saved=133`（未更新）|
| `renderIndicators-PRE-capture`（VOL 已關閉）| panePx 同上，`VOL.enabled=false` |
| `_captureCurrentPaneHeights` | `subEntries=[RSI only]`，`renderSum=266`，`RSI.saved: 133→107` |
| `_updateSub-NORMAL want` | `mainHeight=359, RSI.h=107` |
| `NORMAL-POST-setHeight+rAF` | `panePx=[330, 107.33]` ← RSI 應為 ~61px，實際得到 107px |

### 根本原因

`_captureCurrentPaneHeights` 在收集 subEntries 時以 `isGlobalEnabled` 過濾：

```javascript
['VOL', 'RSI'].forEach(name => {
    if (!state[name]?.isGlobalEnabled) return;  // ← VOL 已被標為 false，被排除
    ...
});
```

關閉 VOL 的操作順序：
1. UI 設定 `state.VOL.isGlobalEnabled = false`
2. 呼叫 `renderIndicators`
3. `_captureCurrentPaneHeights` 執行 → **此時 LW 仍有 3 個 pane**（VOL 尚未被移除），但 VOL 已被過濾

結果：
- `subEntries = [RSI only]`
- `renderSum = mainPx(204.67) + RSI_px(61.33) = 266`（VOL 的 168.67px **被排除**）
- `RSI.saved = 61.33 / 266 * 466 = 107`（從 61px 膨脹到 107px）

RSI 的 savedHeight 被錯誤地從 61px 膨脹至 107px，因為正規化公式用的分母是 2-pane 總和（266），而非實際 3-pane 總和（434）。

### 規格違反

規格情境 C：「移除副圖時，其 savedHeight **完整歸還給主圖**」。但 RSI 的 savedHeight 被膨脹，代表 VOL 移除後有部分空間被 RSI 吸走，而非全部歸還主圖。

---

## Bug 3：展開 RSI 壓縮主圖

### 實際 log 數據

| 節點 | 關鍵數值 |
|---|---|
| `baseline-after-drag`（第二次測試，拖拉後）| main=218, VOL=165.33, RSI=50.67 |
| `toggleExpand-BEFORE`（展開前）| 同上，`_baseMH=226` |
| `_captureCurrentPaneHeights`（展開前 capture）| `renderSum=434`，`_baseMH: 226→234`，`VOL.saved: 133→178`，`RSI.saved: 107→54` |
| `toggleExpand-LOCKED` | `after_expanded="RSI"`, `_baseMH=234`, `lockedMH=234` |
| `_updateSub-EXPANDED want` | `mainHeight=234, expandedHeight=232` |
| `EXPANDED-POST-setHeight+rAF` | `panePx=[205.33, 232]` ← 主圖應為 ~218px，實際得到 205.33px |

### 根本原因

#### 步驟 1：`_captureCurrentPaneHeights` 引入 overhead 膨脹

```
_baseMH = mainPx / renderSum * totalH
        = 218 / 434 * 466
        = 234
```

`renderSum=434`（3 pane 實際像素和）< `totalH=466`（容器高度），差距 32px 即 LW overhead。正規化公式將 `_baseMH` 從 218px 膨脹至 234px（比例 466/434 ≈ 1.074）。

#### 步驟 2：EXPANDED mode 用錯空間計算 expandedHeight

```javascript
const expandedHeight = Math.max(this._minSubPaneHeight, availableHeight - mainHeight);
// = 466 - 234 = 232
```

此處用 `availableHeight（totalContH=466）- _baseMH（234）= 232`。

#### 步驟 3：LW 以絕對像素分配給 RSI

- `panes[1].setHeight(232)` → RSI 得到 **232px 實際像素**
- main 得到剩餘：`paneArea(437.33) - 232 = 205.33px`

但我們期望 main 保持 ~218px。差距：**218 - 205.33 = 12.67px**，正好是 `_baseMH` 膨脹量（234-218=16px）除以 overhead 比例後的效應。

#### 根因總結

`expandedHeight` 在 `totalContH` 空間（466px）計算，但 LW 在 `paneArea` 空間（437px）執行 `setHeight`。兩個空間差距（~29px overhead）被直接轉嫁到 RSI，使 RSI 多佔了 overhead 差額，主圖相應縮小。

正確公式應為：
```
expandedHeight = paneArea - desiredMainPx
desiredMainPx  = _baseMH / totalH * paneArea
               = 234 / 466 * 437.33 ≈ 219
expandedHeight = 437.33 - 219 = 218.33 ≈ 218
```
→ RSI 得到 218px，main 得到 437.33 - 218 = **219.33 ≈ 219px** ✓（與預展開的 218px 相差 1px，可接受）

---

## Bug 4：切換股票後未保留拖拉後比例

### 實際 log 數據

| 節點 | 關鍵數值 |
|---|---|
| `baseline-before-drag` | main=241.33, VOL=132.67, RSI=60；`VOL.saved=178, RSI.saved=54`（saved 與實際已不同步） |
| `baseline-after-drag` | main=241.33, VOL=108, RSI=84.67；`VOL.saved=178, RSI.saved=54`（拖拉後 saved 仍未更新） |
| `loadStock-PRE-capture` | panePx 仍為 `[241.33, 108, 84.67]` |
| `_captureCurrentPaneHeights` | `_baseMH: 234→259`，`VOL.saved: 178→116`，`RSI.saved: 54→91` |
| `loadStock-POST-capture` | `_baseMH=259`，`VOL.saved=116`，`RSI.saved=91` |
| `_updateSub-NORMAL want` | `mainHeight=259`, `subs=[116, 91]` |
| `NORMAL-POST-setHeight+rAF` | main=235.33, VOL=109.33, RSI=91.33（切股後實際） |

切股前後對比（以 `baseline-after-drag` 為準）：

- 切股前：main=241.33, VOL=108, RSI=84.67
- 切股後：main=235.33, VOL=109.33, RSI=91.33
- 漂移量：main −6.00、VOL +1.33、RSI +6.66

### 根本原因

#### 步驟 1：loadStock capture 將實際 pane 像素重新正規化到 `totalContH`

`_captureCurrentPaneHeights` 在切股前執行：

```
_baseMH  = mainPx / renderSum * totalH
VOL.saved = volPx  / renderSum * totalH
RSI.saved = rsiPx  / renderSum * totalH
```

代入本次 log：

```
totalH=466, renderSum=434, scale=466/434=1.0737
main : 241.33 × 1.0737 = 259
VOL  : 108    × 1.0737 = 116
RSI  : 84.67  × 1.0737 = 91
```

也就是：切股前 capture 把拖拉後的真實像素 `[241,108,84]` 放大成 `[259,116,91]`，在切股前就已寫入 state。

#### 步驟 2：切股後重建副圖時，套用的是被放大的 saved 值

`renderIndicators-SKIP(loadStock-captured)` 確認後續流程不再重新 capture，`renderSubCharts` 直接使用 `VOL.saved=116`、`RSI.saved=91`。因此最終高度自然向放大後目標靠攏，而不是回到切股前拖拉值。

#### 步驟 3：同樣的 totalH/paneArea 不一致，造成比例保留失真

切股前 capture 使用 `totalH=466` 做正規化，但 LW 真正可分配的 pane 空間是 `panePxSum≈434~436`。此不一致在每次切股 capture 時都會把副圖高度往「totalH 空間」再拉一次，導致比例持續漂移。

### 規格違反

規格情境 H 要求：切換股票時需保留主圖與副圖高度佈局（savedHeight 與 totalContainerHeight 完整保留）。

本次 log 顯示：切股前後 RSI 從 84.67 漂移到 91.33，main 從 241.33 降到 235.33，已違反「切股不重置比例」規格。

---

## 修正方案

### Bug 2 修正：`_captureCurrentPaneHeights`

**將 subEntries 過濾條件從 `isGlobalEnabled` 改為 `paneIndex !== null`**（即 LW 中仍存在對應 pane），並只對仍啟用的 sub 更新 savedHeight：

```javascript
// 修改前
if (!state[name]?.isGlobalEnabled) return;

// 修改後
const pi = state[name]?.paneIndex;
if (!Number.isFinite(pi) || pi < 1 || pi >= panes.length) return;
const px = this._paneHeight(panes[pi]) || 0;
if (px <= 0) return;
subEntries.push({ name, px, pi });
subPxSum += px;
// ... 後續：updateSavedHeight 只在 state[name].isGlobalEnabled 時執行
if (state[name].isGlobalEnabled && !expanded) {
    state[name].savedHeight = Math.max(40, Math.round(px / renderSum * totalH));
}
```

效果：renderSum 包含 VOL 的 168.67px → `RSI.saved = 61.33/434*466 ≈ 66`（正確保留 RSI 高度）。

### Bug 3 修正：`_updateSubChartPaneHeights` EXPANDED mode

**以 `panePxSum`（實際 pane 像素和）取代 `totalContH` 計算 expandedHeight：**

```javascript
// 在 _updateSubChartPaneHeights 函式頂部，已有 panes 陣列
// 新增：
const panePxSum = panes.reduce((s, p) => s + (this._paneHeight(p) || 0), 0);

// EXPANDED mode 中修改：
// 修改前
const expandedHeight = Math.max(this._minSubPaneHeight, availableHeight - mainHeight);

// 修改後
const mainActualTarget = Math.round(mainHeight / totalHeight * panePxSum);
const expandedHeight = Math.max(this._minSubPaneHeight, panePxSum - mainActualTarget);
```

效果：`expandedHeight = 437.33 - round(234/466*437.33) = 437.33 - 219 = 218`，main 恢復至 ~219px（與展開前 218px 差 1px）。

### Bug 4 修正：`loadStock` 前 capture 與 savedHeight 的單位一致化

核心原則：切股保存時應保存「實際 pane 像素」，不要在 capture 階段把值放大到 `totalContH` 空間。

建議修正 ` _captureCurrentPaneHeights`：

```javascript
// 修改前（會把 434 空間放大到 466 空間）
_baseMainPaneHeight = Math.round(mainPx / renderSum * totalH);
state[name].savedHeight = Math.round(px / renderSum * totalH);

// 修改後（直接保存真實 pane 像素）
_baseMainPaneHeight = Math.max(this._minMainPaneHeight, Math.round(mainPx));
state[name].savedHeight = Math.max(40, Math.round(px));
```

若仍需做比例縮放，應只在「容器高度確實改變」時（例如底部 handle 拖拉）再做等比換算；切股流程本身只做讀取與重建，不應改變比例基準。

---

## 三個 Bug 的共同根源

三個 Bug 都源自同一個設計假設：**`paneArea = totalContH`**（LW 可用像素等於容器高度），但實際上 `paneArea ≈ totalContH - 29px`（LW 保留 overhead 給時間軸等）。

| Bug | 在哪個環節 | 症狀 |
|---|---|---|
| Bug 2 | `_captureCurrentPaneHeights` 以 `isGlobalEnabled` 過濾，renderSum 偏小 | RSI.saved 膨脹，移除 VOL 後 RSI 吸走部分空間 |
| Bug 3 | `expandedHeight = totalContH - _baseMH`，使用 totalContH 而非 paneArea | RSI 多佔 overhead 差額，主圖縮小 |
| Bug 4 | `loadStock` 前 capture 以 `totalH/renderSum` 放大實際 pane 像素 | 切股後主副圖比例漂移，無法維持拖拉後佈局 |

---
