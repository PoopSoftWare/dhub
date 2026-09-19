// ==UserScript==
// @name         Tooltip
// @namespace    KeyDESK
// @version      8.0
// @description  Показ непрочитки в ИИ срм
// @match        *://chat.telegram-agents.ru/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let lastIndex = 0;
    let totalCount = 0;

    // Создаем tooltip
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        position: fixed;
        background: rgba(0, 0, 0, 0.95);
        color: white;
        padding: 10px 14px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        font-size: 13px;
        z-index: 100000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.1);
        white-space: nowrap;
    `;
    document.body.appendChild(tooltip);

    function updateStats() {
        const chats = document.querySelectorAll('[data-index]');
        totalCount = chats.length;
        lastIndex = 0;

        chats.forEach(chat => {
            const index = parseInt(chat.getAttribute('data-index'));
            if (!isNaN(index) && index > lastIndex) {
                lastIndex = index;
            }
        });
    }

    // Находим все кнопки категорий
    function findCategoryButtons() {
        return document.querySelectorAll('button[class*="_itemHorizontal"]');
    }

    // Добавляем обработчики на кнопки
    function attachHandlers() {
        const buttons = findCategoryButtons();

        buttons.forEach(button => {
            // Проверяем, не добавлены ли уже обработчики
            if (button.dataset.tooltipAttached) return;
            button.dataset.tooltipAttached = 'true';

            button.addEventListener('mouseenter', (e) => {
                updateStats();

                const label = button.querySelector('[class*="_labelHorizontal"]')?.textContent || 'Категория';
                const badge = button.querySelector('[class*="_badgeInline"]')?.textContent || '0';

                tooltip.innerHTML = `
                    <div style="font-weight: 600; margin-bottom: 6px; font-size: 14px;">${label}</div>
                    <div style="display: flex; gap: 12px; font-size: 12px;">
                        <div>
                            <div style="opacity: 0.7; font-size: 11px;">В списке</div>
                            <div style="font-weight: 600;">${badge}</div>
                        </div>
                        <div>
                            <div style="opacity: 0.7; font-size: 11px;">Всего на экране</div>
                            <div style="font-weight: 600;">${totalCount}</div>
                        </div>
                        <div>
                            <div style="opacity: 0.7; font-size: 11px;">Непрочитка</div>
                            <div style="font-weight: 600; color: #FFD700;">${lastIndex}</div>
                        </div>
                    </div>
                `;

                tooltip.style.opacity = '1';

                const rect = button.getBoundingClientRect();
                tooltip.style.left = rect.left + 'px';
                tooltip.style.top = (rect.bottom + 8) + 'px';
            });

            button.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
            });
        });
    }

    // Observer для отслеживания появления кнопок
    const observer = new MutationObserver(() => {
        attachHandlers();
    });

    // Запуск
    setTimeout(() => {
        attachHandlers();
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }, 1000);

})();
