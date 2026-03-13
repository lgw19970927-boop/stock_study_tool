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

            <!-- 原生顏色選擇器（隱藏） -->
            <input type="color" id="nativeColorPicker" style="display: none;">
        </div>

        <div class="color-picker-footer">
            <button class="btn btn-ghost btn-sm" id="btnCancelColor">取消</button>
            <button class="btn btn-primary btn-sm" id="btnConfirmColor">確定</button>
        </div>
    </div>
</div>
`;

// Inject into body
if (!document.getElementById('colorPickerModal')) {
    document.body.insertAdjacentHTML('beforeend', ColorPickerTemplate);
}
