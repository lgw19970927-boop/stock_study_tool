/**
 * Color Picker Modal HTML Template
 * 色板選擇器的 HTML 結構
 */
var ColorPickerTemplate = `
<!-- ========== 色板選擇器彈窗 ========== -->
<div id="colorPickerModal" class="color-picker-overlay" style="display: none;">
    <div class="color-picker-container">
        <div class="color-picker-header">
            <span>色彩</span>
            <button class="btn-modal-close" id="btnCloseColorPicker">×</button>
        </div>

        <div class="color-picker-body">
            <!-- 基本色彩 -->
            <div class="color-section">
                <label>基本色彩(B):</label>
                <div class="color-grid" id="basicColors">
                    <!-- 由 JS 動態生成 -->
                </div>
            </div>

            <!-- 自訂色彩 -->
            <div class="color-section">
                <label>自訂色彩(C):</label>
                <div class="color-grid custom-colors" id="customColors">
                    <!-- 8個空白槽位 -->
                </div>
                <button class="btn btn-sm btn-ghost" id="btnDefineCustomColor">定義自訂色彩(D) >></button>
            </div>

            <!-- Bug 4: 自訂 Canvas 色彩選擇器（展開式） -->
            <div id="customColorPanel" class="custom-color-panel" style="display:none;">
                <div class="cp-canvas-row">
                    <canvas id="colorSpectrumCanvas" width="200" height="150"
                        style="cursor:crosshair; border-radius:4px;"></canvas>
                    <canvas id="hueSliderCanvas" width="18" height="150"
                        style="cursor:crosshair; border-radius:3px; margin-left:6px;"></canvas>
                </div>
                <div class="cp-preview-row">
                    <div class="cp-preview" id="colorPreview"></div>
                    <div class="cp-inputs">
                        <label>R<input type="number" id="cpInputR" min="0" max="255" value="255" /></label>
                        <label>G<input type="number" id="cpInputG" min="0" max="255" value="0" /></label>
                        <label>B<input type="number" id="cpInputB" min="0" max="255" value="0" /></label>
                    </div>
                    <input type="text" id="cpInputHex" class="cp-hex-input" value="#ff0000" maxlength="7" placeholder="#rrggbb" />
                </div>
                <button class="btn btn-sm btn-ghost cp-add-btn" id="btnAddCustomColor">加入自訂色彩</button>
            </div>
        </div>

        <div class="color-picker-footer">
            <button class="btn btn-ghost btn-sm" id="btnCancelColor">取消</button>
            <button class="btn btn-primary btn-sm" id="btnConfirmColor">確定</button>
        </div>
    </div>
</div>
`;

// 強制替換舊有 DOM（確保色板內容含 customColorPanel 後始終最新）
const _existingColorPicker = document.getElementById('colorPickerModal');
if (_existingColorPicker) _existingColorPicker.parentNode.removeChild(_existingColorPicker);
document.body.insertAdjacentHTML('beforeend', ColorPickerTemplate);
