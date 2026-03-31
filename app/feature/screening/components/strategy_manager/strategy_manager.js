/**
 * Strategy Manager - 策略管理模組
 * 負責策略的 CRUD 操作和列表渲染
 */
window.StrategyManager = {
    /**
     * 保存策略（新增或覆蓋）
     * @param {boolean} overwrite - 是否覆蓋同名策略
     */
    save(overwrite) {
        const nameInput = document.getElementById('strategyName');
        const name = nameInput ? nameInput.value.trim() : '';

        if (!name) {
            alert('請輸入策略名稱');
            return;
        }

        // 1. 驗證篩選條件（依賴 ScreeningPage）
        if (!window.ScreeningPage || !window.ScreeningPage.validateRunFilter()) {
            return;
        }

        // 2. 檢查是否有未確認的指標
        if (window.ScreeningBlockIndicator && window.ScreeningBlockIndicator.hasUnconfirmed()) {
            alert('尚有指標未確認，請先完成指標設定');
            return;
        }

        // 3. 捕獲當前篩選條件
        const filters = JSON.parse(JSON.stringify(window.state.filters)); // Deep copy

        // 4. 生成描述行
        const descLines = this._generateDescription(filters);

        // 5. 保存策略
        const strategies = window.state.savedStrategies || [];

        if (overwrite) {
            const existingIndex = strategies.findIndex(s => s.name === name);
            if (existingIndex !== -1) {
                strategies[existingIndex].data = filters;
                strategies[existingIndex].descLines = descLines;
                strategies[existingIndex].timestamp = Date.now();
                alert(`策略 "${name}" 已更新！`);
            } else {
                this._saveAsNew(name, filters, descLines, strategies);
            }
        } else {
            this._saveAsNew(name, filters, descLines, strategies);
        }

        window.state.savedStrategies = strategies;
        this.renderList();
    },

    /**
     * 內部方法：保存為新策略（處理名稱衝突）
     * @private
     */
    _saveAsNew(baseName, filters, descLines, strategies) {
        let newName = baseName;
        let counter = 1;
        while (strategies.some(s => s.name === newName)) {
            newName = `${baseName}(${counter})`;
            counter++;
        }

        strategies.push({
            id: 'strat-' + Date.now(),
            name: newName,
            timestamp: Date.now(),
            descLines: descLines,
            data: filters
        });
        alert(`策略 "${newName}" 已儲存！`);
    },

    /**
     * 內部方法：生成策略描述行
     * @private
     */
    _generateDescription(filters) {
        const descLines = [];

        // Line 1: 市場 & 頻率
        const marketMap = { 'listed': '上市', 'otc': '上櫃', 'ipo': '興櫃' };
        const freqMap = { 'daily': '每日', 'weekly': '每周', 'monthly': '每月' };

        const markets = filters.markets.map(m => marketMap[m] || m).join('/');
        const frequency = freqMap[filters.frequency] || filters.frequency;

        descLines.push(`市場範圍: ${markets} | 篩選頻率: ${frequency}`);

        // 指標 - 從 Summary 讀取
        const indicatorCards = document.querySelectorAll('.indicator-card');
        indicatorCards.forEach(card => {
            const summaryItem = card.querySelector('.indicator-summary-item');
            if (!summaryItem) return;

            // 提取文字（移除按鈕）
            const clone = summaryItem.cloneNode(true);
            clone.querySelectorAll('button, .btn-icon').forEach(btn => btn.remove());
            const line = clone.textContent.trim();
            descLines.push(line);
        });

        // 技術型態
        if (filters.patterns && filters.patterns.length > 0) {
            const patternMap = {
                'consolidation': '盤整區',
                'w_bottom': 'W 底',
                'head_shoulders_top': '頭肩頂',
                'head_shoulders_bottom': '頭肩底',
                'triangle': '三角收斂'
            };
            const patternNames = filters.patterns.map(p => patternMap[p] || p).join(', ');

            const parts = [`技術型態: ${patternNames}`];

            if (filters.sensitivity) {
                parts.push(`敏感度: ${filters.sensitivity}%`);
            }

            if (filters.patternTimeframe) {
                const pt = filters.patternTimeframe;
                const min = pt.min !== undefined ? pt.min : (pt.count || 20);
                const max = pt.max !== undefined ? pt.max : 60;
                parts.push(`週期: ${min}~${max}根 (${pt.interval})`);
            }

            descLines.push(parts.join(' | '));
        }

        return descLines;
    },

    /**
     * 載入策略
     * @param {string} id - 策略 ID
     */
    load(id) {
        const strat = window.state.savedStrategies.find(s => s.id === id);
        if (!strat) return;

        // 1. 恢復篩選條件
        window.state.filters = JSON.parse(JSON.stringify(strat.data));

        // 2. 更新 UI DOM
        // 市場
        document.querySelectorAll('.market-select').forEach(cb => {
            cb.checked = strat.data.markets.includes(cb.value);
        });

        // 頻率
        const freqRadio = document.querySelector(`input[name="frequency"][value="${strat.data.frequency}"]`);
        if (freqRadio) freqRadio.checked = true;

        // 策略名稱
        const nameInput = document.getElementById('strategyName');
        if (nameInput) nameInput.value = strat.name;

        // 技術型態
        if (strat.data) {
            const d = strat.data;

            // Patterns
            document.querySelectorAll('input[name="pattern"]').forEach(cb => {
                cb.checked = (d.patterns || []).includes(cb.value);
            });

            // Sensitivity
            const sense = document.getElementById('sensitivityRange');
            const senseVal = document.getElementById('sensitivityValue');
            if (sense) {
                sense.value = d.sensitivity || 75;
                if (senseVal) senseVal.textContent = sense.value + '%';
            }

            // Timeframe
            if (d.patternTimeframe) {
                const pt = d.patternTimeframe;
                const pMin = document.getElementById('patternBarsMin');
                const pMax = document.getElementById('patternBarsMax');
                const pInterval = document.getElementById('patternTimeInterval');
                const pMinPreview = document.getElementById('barsMinPreview');
                const pMaxPreview = document.getElementById('barsMaxPreview');
                const pIntervalPreview = document.getElementById('intervalPreview');

                if (pMin) pMin.value = pt.min !== undefined ? pt.min : (pt.count || 20);
                if (pMax) pMax.value = pt.max !== undefined ? pt.max : 60;
                if (pInterval) pInterval.value = pt.interval || '1D';

                // Update Previews
                if (pMinPreview && pMin) pMinPreview.textContent = pMin.value;
                if (pMaxPreview && pMax) pMaxPreview.textContent = pMax.value;
                if (pIntervalPreview && pInterval) {
                    pIntervalPreview.textContent = pInterval.options[pInterval.selectedIndex].text;
                }
            }
        }

        // 3. 恢復指標（直接顯示為摘要模式）
        const list = document.getElementById('indicatorList');
        if (list) list.innerHTML = ''; // Clear

        if (strat.data.indicators && Array.isArray(strat.data.indicators)) {
            strat.data.indicators.forEach(ind => {
                if (window.ScreeningBlockIndicator) {
                    window.ScreeningBlockIndicator.addIndicatorCard();
                    const cards = list.querySelectorAll('.indicator-card');
                    const lastCard = cards[cards.length - 1];
                    if (lastCard) {
                        // 切換類型
                        const select = lastCard.querySelector('.indicator-type-select');
                        if (select) select.value = ind.type;

                        // 觸發 change 事件載入配置 UI
                        const event = new Event('change');
                        select.dispatchEvent(event);

                        // 等待 DOM 更新後恢復狀態並直接確認（顯示摘要）
                        setTimeout(() => {
                            // 先恢復數據
                            window.ScreeningBlockIndicator.editIndicatorConfig(lastCard, ind);
                            // 再確認以顯示摘要模式
                            setTimeout(() => {
                                window.ScreeningBlockIndicator.confirmIndicatorConfig(lastCard, ind.type);
                            }, 10);
                        }, 50);
                    }
                }
            });
        }

        // 4. 切換到篩選設計 Tab
        if (window.ScreeningPage && window.ScreeningPage.switchTab) {
            window.ScreeningPage.switchTab('filter-design');
        }
    },

    /**
     * 刪除策略
     * @param {string} id - 策略 ID
     */
    delete(id) {
        if (!confirm('確定要刪除此策略嗎？')) return;
        window.state.savedStrategies = window.state.savedStrategies.filter(s => s.id !== id);
        this.renderList();
    },

    /**
     * 複製策略
     * @param {string} id - 策略 ID
     */
    copy(id) {
        const strategies = window.state.savedStrategies;
        const target = strategies.find(s => s.id === id);
        if (!target) return;

        // 生成唯一名稱
        let baseName = target.name;
        let newName = baseName;
        let counter = 1;
        while (strategies.some(s => s.name === newName)) {
            newName = `${baseName}(${counter})`;
            counter++;
        }

        const newStrat = {
            id: 'strat-' + Date.now(),
            name: newName,
            timestamp: Date.now(),
            descLines: [...target.descLines],
            data: JSON.parse(JSON.stringify(target.data))
        };

        strategies.unshift(newStrat); // Add to top
        this.renderList();
    },

    /**
     * 選擇策略（高亮顯示）
     * @param {string} id - 策略 ID
     */
    select(id) {
        window.state.currentStrategyId = id;
        this.renderList();
    },

    /**
     * 渲染策略列表
     */
    renderList() {
        const container = document.getElementById('strategiesList');
        if (!container) {
            console.error('[StrategyManager] Container #strategiesList not found');
            return;
        }

        container.innerHTML = '';
        const strategies = window.state.savedStrategies || [];

        if (strategies.length === 0) {
            container.innerHTML = '<div class="strategy-list-empty">尚無已儲存的策略</div>';
            return;
        }

        strategies.forEach(strat => {
            // 時間格式化：YYYY/MM/DD
            const date = new Date(strat.timestamp);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}/${month}/${day}`;

            // 預覽行（前 2 行）
            const previewLines = strat.descLines.slice(0, 2);
            // 詳細行（剩餘行）
            const detailLines = strat.descLines.slice(2);

            // 生成 HTML
            const previewHTML = previewLines.map(line => `<div class="strat-line">${line}</div>`).join('');

            const detailsHTML = detailLines.map(line => {
                const isIndicator = line.includes('MA-') || line.includes('成交額');
                const className = isIndicator ? 'strat-line strat-indicator-text' : 'strat-line';
                return `<div class="${className}">${line}</div>`;
            }).join('');

            const isActive = strat.id === window.state.currentStrategyId ? 'active' : '';

            const card = document.createElement('div');
            card.className = `strategy-card ${isActive}`;
            card.setAttribute('onclick', `window.StrategyManager.select('${strat.id}')`);

            card.innerHTML = `
                <div class="strat-header">
                    <span class="strat-name">${strat.name}</span>
                    <span class="strat-date">${dateStr}</span>
                </div>
                <div class="strat-content">
                    ${previewHTML}
                </div>
                
                <!-- Expanded Content -->
                <div class="strat-details" id="details-${strat.id}">
                     <div class="strat-content">
                        ${detailsHTML}
                     </div>
                </div>

                <!-- Toggle More -->
                ${detailLines.length > 0 ? `
                <div class="strat-more">
                    <span class="strat-more-link" onclick="event.stopPropagation(); window.StrategyManager.toggleDetails('${strat.id}')">更多 ▼</span>
                </div>` : ''}

                <!-- Hover Actions -->
                <div class="strat-actions">
                    <button class="action-btn" title="複製" onclick="event.stopPropagation(); window.StrategyManager.copy('${strat.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="action-btn" title="修改" onclick="event.stopPropagation(); window.StrategyManager.load('${strat.id}')">
                         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="action-btn" title="刪除" onclick="event.stopPropagation(); window.StrategyManager.delete('${strat.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    },

    /**
     * 展開/收起策略詳情
     * @param {string} id - 策略 ID
     */
    toggleDetails(id) {
        const details = document.getElementById(`details-${id}`);
        const link = details.parentNode.querySelector('.strat-more-link');

        if (details) {
            const isHidden = !details.classList.contains('open');
            if (isHidden) {
                details.classList.add('open');
                if (link) link.textContent = '收起 ▲';
            } else {
                details.classList.remove('open');
                if (link) link.textContent = '更多 ▼';
            }
        }
    }
};
