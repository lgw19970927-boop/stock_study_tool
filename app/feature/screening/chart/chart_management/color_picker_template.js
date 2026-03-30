/**
 * Color Picker Modal HTML Template
 * 色板選擇器的 HTML 結構
 */
var ColorPickerTemplate = `
<!-- ========== 色板選擇器彈窗 ========== -->
<div id="colorPickerModal" class="color-picker-overlay is-hidden fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 [animation:fadeIn_0.15s_ease]">
    <div class="color-picker-container pointer-events-auto w-[420px] rounded-md border border-border-color bg-bg-elevated shadow-lg [animation:slideUp_0.2s_ease]">
        <div class="color-picker-header flex cursor-move select-none items-center justify-between border-b border-border-color px-4 py-2">
            <span class="text-sm font-semibold text-text-primary">色彩</span>
            <button class="btn-modal-close flex h-8 w-8 items-center justify-center rounded-sm border-0 bg-transparent text-[1.75rem] leading-none text-text-secondary transition-colors duration-fast hover:bg-bg-hover hover:text-text-primary" id="btnCloseColorPicker">×</button>
        </div>

        <div class="color-picker-body p-4">
            <!-- 基本色彩 -->
            <div class="color-section mb-4">
                <label class="mb-2 block text-xs text-text-secondary">基本色彩(B):</label>
                <div class="color-grid grid grid-cols-8 gap-1" id="basicColors">
                    <!-- 由 JS 動態生成 -->
                </div>
            </div>

            <!-- 自訂色彩 -->
            <div class="color-section mb-4">
                <label class="mb-2 block text-xs text-text-secondary">自訂色彩(C):</label>
                <div class="color-grid custom-colors grid grid-cols-8 gap-1" id="customColors">
                    <!-- 8個空白槽位 -->
                </div>
                <button class="btn btn-sm btn-ghost" id="btnDefineCustomColor">定義自訂色彩(D) >></button>
            </div>

            <!-- Bug 4: 自訂 Canvas 色彩選擇器（展開式） -->
            <div id="customColorPanel" class="custom-color-panel is-hidden mt-2 rounded-sm border border-border-color bg-bg-tertiary p-2">
                <div class="cp-canvas-row mb-2 flex items-start gap-1.5">
                    <canvas id="colorSpectrumCanvas" width="200" height="150"
                        class="cursor-crosshair rounded-[4px]"></canvas>
                    <canvas id="hueSliderCanvas" width="18" height="150"
                        class="ml-1.5 cursor-crosshair rounded-[3px]"></canvas>
                </div>
                <div class="cp-preview-row mb-2 flex items-center gap-2">
                    <div class="cp-preview h-9 w-9 shrink-0 rounded-sm border border-border-color bg-[#ff0000]" id="colorPreview"></div>
                    <div class="cp-inputs flex gap-1">
                        <label class="flex flex-col items-center gap-0.5 text-[0.65rem] text-text-muted">R<input class="w-11 rounded-sm border border-border-color bg-bg-primary px-1 py-0.5 text-center text-xs text-text-primary focus:border-accent-primary focus:outline-none" type="number" id="cpInputR" min="0" max="255" value="255" /></label>
                        <label class="flex flex-col items-center gap-0.5 text-[0.65rem] text-text-muted">G<input class="w-11 rounded-sm border border-border-color bg-bg-primary px-1 py-0.5 text-center text-xs text-text-primary focus:border-accent-primary focus:outline-none" type="number" id="cpInputG" min="0" max="255" value="0" /></label>
                        <label class="flex flex-col items-center gap-0.5 text-[0.65rem] text-text-muted">B<input class="w-11 rounded-sm border border-border-color bg-bg-primary px-1 py-0.5 text-center text-xs text-text-primary focus:border-accent-primary focus:outline-none" type="number" id="cpInputB" min="0" max="255" value="0" /></label>
                    </div>
                    <input type="text" id="cpInputHex" class="cp-hex-input w-20 rounded-sm border border-border-color bg-bg-primary px-1.5 py-1 font-mono text-xs text-text-primary focus:border-accent-primary focus:outline-none" value="#ff0000" maxlength="7" placeholder="#rrggbb" />
                </div>
                <button class="btn btn-sm btn-ghost cp-add-btn w-full text-xs" id="btnAddCustomColor">加入自訂色彩</button>
            </div>
        </div>

        <div class="color-picker-footer flex justify-end gap-2 border-t border-border-color px-4 py-2">
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
