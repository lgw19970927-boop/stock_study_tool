/**
 * App/Static/js/layout.js
 * 全域 Header Tab 管理
 * - HTMX 分頁切換（含 × 關閉、＋ 重開）
 * - ☰ 漢堡按鈕控制 Sidebar 收合/展開
 */

(function () {
    'use strict';

    // ============================================================
    // 分頁定義（可擴充）
    // ============================================================
    const TABS = [
        {
            id: 'screening',
            label: '股票篩選',
            url: '/screening',
            // 篩選漏斗 icon
            icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>`
        },
        {
            id: 'risk_management',
            label: '資金與風險管理',
            url: '/risk-management',
            // 錢包 icon
            icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>`
        },
    ];

    let openTabs = ['screening', 'risk_management'];
    let activeTab = 'screening';
    let sidebarOpen = true;
    let isInitialized = false;
    let dragSrcEl = null;

    // 移除容器中的空白文字節點與註解，避免在 content 區形成不可見但有高度的間隙
    function pruneNonElementNodes(container) {
        if (!container) return;
        Array.from(container.childNodes).forEach(node => {
            if (node.nodeType === Node.COMMENT_NODE) {
                node.remove();
                return;
            }
            if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
                node.remove();
            }
        });
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        if (isInitialized) return;
        isInitialized = true;

        const path = window.location.pathname.replace(/\/+$/, '') || '/screening';
        const fullPath = path.startsWith('/') ? path : '/' + path;
        const matched = TABS.find(t => t.url === fullPath) || TABS.find(t => t.id === path.replace(/^\//, '')) || TABS[0];

        // Mark the initially loaded pane — 不做 DOM 包裹，僅標記 data-pane-id
        // 頁面已由 Jinja2 渲染出正確的 .page-content.active 結構與 inline style，
        // 此處只補 layout 切頁所需的 pane 識別屬性。
        const contentArea = document.getElementById('content');
        pruneNonElementNodes(contentArea);
        if (contentArea && contentArea.firstElementChild) {
            const firstPane = contentArea.firstElementChild;
            firstPane.setAttribute('data-pane-id', matched.id);
            if (!firstPane.dataset.originalDisplay) {
                firstPane.dataset.originalDisplay = firstPane.style.display || 'flex';
            }
            firstPane.classList.add('active');
            firstPane.style.display = firstPane.dataset.originalDisplay;
        }

        activeTab = matched.id;

        renderTabs();
        bindAddTabBtn();
        bindHtmxEvents();

        window.addEventListener('popstate', () => {
            const currentPath = window.location.pathname.replace(/^\/+/g, '') || 'screening';
            const m = TABS.find(t => t.id === currentPath);
            if (m) activateTab(m.id, true);
        });
    }

    // ============================================================
    // 渲染分頁列
    // ============================================================
    function renderTabs() {
        const area = document.getElementById('tabArea');
        if (!area) return;
        area.innerHTML = '';

        openTabs.forEach(id => {
            const tab = TABS.find(t => t.id === id);
            if (!tab) return;

            const isActive = id === activeTab;

            const btn = document.createElement('button');
            btn.id = `tab-${id}`;
            btn.dataset.tabId = id;

            // VSCode/Browser tab 風格：改用 Tailwind 原生 class 確保不會因 CSS 快取失效
            const baseBtnClasses = 'group relative flex-shrink-0 cursor-pointer h-full border-l border-[#30363d] focus:outline-none flex flex-col items-stretch transition-colors min-w-0 htmx-tab-btn';
            const activeBtnClasses = 'bg-[#0d1117] border-b border-b-[#0d1117] htmx-tab-btn--active'; // 活躍時覆蓋 header 下邊框
            const inactiveBtnClasses = 'bg-transparent hover:bg-white/5 htmx-tab-btn--inactive';

            btn.className = `${baseBtnClasses} ${isActive ? activeBtnClasses : inactiveBtnClasses}`;

            // 底部 highlight bar：活躍时為漸層色，非活躍 hover 時出現灰色
            const bottomBarColor = isActive ? 'linear-gradient(90deg,#00d4aa,#7c3aed)' : 'transparent';
            const bottomBarClasses = `block h-[2px] w-full flex-shrink-0 transition-colors ${isActive ? '' : 'group-hover:bg-[#484f58]'} htmx-tab-bottom-bar pointer-events-none`;

            // 內容行：強制 flex-row, center，避免 Tailwind 預設 svg 為 block 造成垂直折行
            const innerClasses = 'htmx-tab-inner flex flex-row items-center gap-1.5 flex-1 px-3.5 whitespace-nowrap min-w-0';

            // 關閉按鈕 class
            const closeBtnClasses = 'htmx-tab-close-btn opacity-0 group-hover:opacity-100 flex items-center justify-center w-4 h-4 rounded-[3px] text-[14px] leading-none text-[#8b949e] hover:bg-white/15 hover:text-[#f0f6fc] transition-all cursor-pointer flex-shrink-0 ml-1';

            // 取消 HTMX 屬性，改用手動 DOM Caching 控制
            btn.addEventListener('click', (e) => {
                // 如果點擊的是關閉按鈕，不觸發切換
                if (e.target.closest('.htmx-tab-close-btn')) return;
                activateTab(id);
            });

            // Drag and Drop 屬性
            btn.setAttribute('draggable', 'true');
            btn.addEventListener('dragstart', handleDragStart);
            btn.addEventListener('dragover', handleDragOver);
            btn.addEventListener('dragenter', handleDragEnter);
            btn.addEventListener('dragleave', handleDragLeave);
            btn.addEventListener('drop', handleDrop);
            btn.addEventListener('dragend', handleDragEnd);

            const iconColor = isActive ? '#00d4aa' : '#6e7681';
            const labelColor = isActive ? '#f0f6fc' : '#8b949e';
            const iconHtml = (tab.icon || '')
                .replace(/width="14" height="14"/, 'width="14" height="14" class="pointer-events-none"')
                .replace(/stroke="currentColor"/, `stroke="${iconColor}"`);

            btn.innerHTML = `
                <span class="${innerClasses}">
                    ${iconHtml}
                    <span class="htmx-tab-label text-[13px] font-medium font-['Inter',sans-serif] transition-colors pointer-events-none" style="color:${labelColor};">${tab.label}</span>
                    <span class="${closeBtnClasses}" data-close-id="${id}" title="關閉">&#xD7;</span>
                </span>
                <span class="${bottomBarClasses}" style="background:${bottomBarColor};"></span>
            `;

            // 關閉按鈕
            const closeBtn = btn.querySelector('.htmx-tab-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeTab(id);
                });
            }

            area.appendChild(btn);
        });

        updateAddTabBtn();
        // 重新讓 HTMX 處理新加入的元素
        if (window.htmx) htmx.process(area);
    }

    // ============================================================
    // 關閉分頁
    // ============================================================
    function closeTab(id) {
        openTabs = openTabs.filter(t => t !== id);

        const pane = document.querySelector(`[data-pane-id="${id}"]`);
        if (pane) pane.remove();

        if (activeTab === id) {
            activeTab = null;
            if (openTabs.length > 0) {
                activateTab(openTabs[0]);
            } else {
                document.getElementById('content').innerHTML =
                    '<div class="flex items-center justify-center h-full text-gray-500">請點擊 ＋ 開啟頁面</div>';
            }
        }
        renderTabs();
    }

    // ============================================================
    // 設定 active（不觸發 HTMX，僅更新 UI）
    // ============================================================
    function setActive(id) {
        activeTab = id;
        renderTabs();
    }

    function loadTabContent(id, url, skipPushState = false) {
        const contentArea = document.getElementById('content');
        if (!contentArea) return;
        pruneNonElementNodes(contentArea);

        // 隱藏所有面板
        Array.from(contentArea.children).forEach(child => {
            // Hide wrapper + inner page-content，避免 active/display 狀態殘留
            child.classList.remove('active');
            if (!child.dataset.originalDisplay) {
                child.dataset.originalDisplay = 'flex';
            }
            child.style.display = 'none';

            const innerPage = child.querySelector('.page-content');
            if (innerPage) {
                innerPage.classList.remove('active');
                if (!innerPage.dataset.originalDisplay) {
                    innerPage.dataset.originalDisplay = 'flex';
                }
                innerPage.style.display = 'none';
            }
        });

        // 尋找是否已有快取的面板
        let pane = contentArea.querySelector(`[data-pane-id="${id}"]`);

        if (pane) {
            // 已有快取，直接顯示
            pruneNonElementNodes(pane);
            pane.style.display = pane.dataset.originalDisplay || 'flex';
            // 注意：不要在此強制覆蓋 flexDirection，否則會破壞
            // server-rendered 頁面（如 screening）的 row 佈局
            pane.style.minHeight = '0';
            pane.classList.add('active');

            const innerPage = pane.querySelector('.page-content');
            if (innerPage) {
                innerPage.classList.add('active');
                innerPage.style.display = innerPage.dataset.originalDisplay || 'flex';
            }

            if (!skipPushState && window.history.pushState) {
                window.history.pushState({ tabId: id }, '', url);
            }
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50); // 確保圖表重新渲染
        } else {
            // 需要動態載入
            pane = document.createElement('div');
            pane.setAttribute('data-pane-id', id);
            // 不要給外殼 .page-content，否則會跟子面版衝突。設定 flex 讓子元素能撐滿
            pane.classList.add('pane-wrapper', 'active');
            pane.style.width = '100%';
            pane.style.height = '100%';
            pane.style.overflow = 'hidden';
            pane.style.display = 'flex';
            pane.style.flexDirection = 'column';
            pane.style.minHeight = '0';
            pane.dataset.originalDisplay = 'flex';
            
            pane.innerHTML = '<div class="flex items-center justify-center h-full w-full"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00d4aa]"></div></div>';
            contentArea.appendChild(pane);

            if (window.htmx) {
                htmx.ajax('GET', url, {
                    target: pane,
                    // 使用 innerHTML，確保這個 pane 永遠存在，不會因為碎片中帶有 <script> 標籤導致失去追蹤
                    swap: 'innerHTML',
                    headers: {
                        'HX-Request': 'true'
                    }
                }).then(() => {
                    pruneNonElementNodes(pane);
                    const loadedPage = pane.querySelector('.page-content');
                    if (loadedPage) {
                        loadedPage.classList.add('active');
                        loadedPage.style.display = 'flex';
                        loadedPage.style.width = '100%';
                        loadedPage.style.height = '100%';
                        loadedPage.style.minHeight = '0';
                        loadedPage.dataset.originalDisplay = 'flex';
                    }

                    if (!skipPushState && window.history.pushState) {
                        window.history.pushState({ tabId: id }, '', url);
                    }
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
                }).catch(err => {
                    console.error('Failed to load tab:', err);
                    if (pane) pane.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">載入失敗</div>';
                });
            } else {
                pane.innerHTML = '<iframe src="' + url + '" style="width:100%; height:100%; border:none;"></iframe>';
            }
        }
    }

    // ============================================================
    // 以程式方式觸發切換
    // ============================================================
    function activateTab(id, skipPushState = false) {
        if (activeTab === id) return;

        const tab = TABS.find(t => t.id === id);
        if (!tab) return;

        setActive(id);
        loadTabContent(id, tab.url, skipPushState);
    }

    // ============================================================
    // ＋ 重新開啟按鈕
    // ============================================================
    function bindAddTabBtn() {
        const btn = document.getElementById('addTabBtn');
        const menu = document.getElementById('addTabMenu');
        if (!btn || !menu) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });
        document.addEventListener('click', () => menu.classList.add('hidden'));
    }

    function updateAddTabBtn() {
        const container = document.getElementById('addTabContainer');
        const menu = document.getElementById('addTabMenu');
        if (!container || !menu) return;

        // 永遠顯示 + 開啟頁面按鈕
        container.classList.remove('hidden');

        const closedTabs = TABS.filter(t => !openTabs.includes(t.id));

        if (closedTabs.length === 0) {
            // 全部已開啟：顯示提示文字
            menu.innerHTML = `
        <div class="px-3 py-2 text-xs text-gray-500 select-none">所有頁面已開啟</div>
      `;
            return;
        }

        menu.innerHTML = closedTabs.map(t => `
      <button class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
              data-reopen-id="${t.id}">
        ${t.icon || ''}
        ${t.label}
      </button>
    `).join('');

        menu.querySelectorAll('[data-reopen-id]').forEach(el => {
            el.addEventListener('click', () => {
                openTabs.push(el.dataset.reopenId);
                renderTabs();
                activateTab(el.dataset.reopenId);
                menu.classList.add('hidden');
            });
        });
    }

    function bindHtmxEvents() {
        // HTMX 事件已不再需要處理分頁 active，因為我們手動更新 DOM Caching
    }

    // ============================================================
    // 拖曳排序事件處理
    // ============================================================
    function handleDragStart(e) {
        dragSrcEl = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.tabId);
        this.classList.add('opacity-50'); // 拖曳時半透明
    }

    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault(); // 允許可以 drop
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDragEnter(e) {
        if (this !== dragSrcEl) {
            this.classList.add('bg-white/10'); // 視覺回饋：進入目標
        }
    }

    function handleDragLeave(e) {
        if (this !== dragSrcEl) {
            this.classList.remove('bg-white/10');
        }
    }

    function handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        if (dragSrcEl !== this) {
            const dragId = dragSrcEl.dataset.tabId;
            const dropId = this.dataset.tabId;

            const dragIndex = openTabs.indexOf(dragId);
            const dropIndex = openTabs.indexOf(dropId);

            if (dragIndex > -1 && dropIndex > -1) {
                openTabs.splice(dragIndex, 1);
                openTabs.splice(dropIndex, 0, dragId);
                // 拖曳完成後重新渲染，保留 activeTab 狀態
                renderTabs();
            }
        }
        return false;
    }

    function handleDragEnd(e) {
        this.classList.remove('opacity-50');
        const area = document.getElementById('tabArea');
        if (area) {
            area.querySelectorAll('.htmx-tab-btn').forEach(btn => {
                btn.classList.remove('bg-white/10');
            });
        }
    }

    // ============================================================
    // 漢堡 Sidebar 收合（供 base.html 按鈕呼叫）
    // ============================================================
    const LayoutManager = {
        toggleSidebar() {
            const sidebar = document.getElementById('app-sidebar');
            if (!sidebar) {
                // GoldenLayout 面板模式時由 layout-screening.js 處理
                if (window.ScreeningLayout) ScreeningLayout.toggleSidebar();
                return;
            }
            sidebarOpen = !sidebarOpen;
            sidebar.style.display = sidebarOpen ? '' : 'none';
        }
    };

    window.LayoutManager = LayoutManager;

    // ====== HTMX 相容初始化邏輯 ======
    function initLayout() {
        init();
    }

    // DOM Ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLayout);
    } else {
        initLayout();
    }

    // HTMX 動態載入
    document.addEventListener('htmx:afterSettle', initLayout);

})();
