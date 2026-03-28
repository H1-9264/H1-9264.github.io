/**
 * buzhidao edu - 核心应用逻辑
 * 离线优先，高性能，数学学习工具
 */

(function() {
    'use strict';

    // ==================== 全局状态 ====================
    const state = {
        currentTab: 'math',
        theme: localStorage.getItem('theme') || 'light',
        canvas: null,
        ctx: null,
        functions: [],
        activeFunction: null,
        points: [],
        xMin: -10,
        xMax: 10,
        yMin: -10,
        yMax: 10,
        gridEnabled: true,
        axisEnabled: true,
        axisLabelsEnabled: true,
        showIntersections: true,
        showFormulas: false,
        showPoints: true,
        isRatio1to1: false,
        dragging: null
    };

    // 更多预设颜色 - 20种不同颜色
    const colorPresets = [
        '#0d9488', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6',
        '#ec4899', '#10b981', '#06b6d4', '#84cc16', '#f97316',
        '#6366f1', '#14b8a6', '#f43f5e', '#a855f7', '#22c55e',
        '#0ea5e9', '#eab308', '#e879f9', '#22d3d8', '#f472b6'
    ];

    // ==================== DOM元素 ====================
    const elements = {};

    // 初始化DOM引用
    function initElements() {
        elements.mainCanvas = document.getElementById('mainCanvas');
        elements.functionInput = document.getElementById('functionInput');
        elements.functionList = document.getElementById('functionList');
        elements.addFunctionBtn = document.getElementById('addFunctionBtn');
        elements.drawBtn = document.getElementById('drawBtn');
        elements.clearBtn = document.getElementById('clearBtn');
        elements.downloadBtn = document.getElementById('downloadBtn');
        elements.themeToggle = document.getElementById('themeToggle');
        elements.canvasTitle = document.getElementById('canvasTitle');
        elements.mathKeyboard = document.getElementById('mathKeyboard');
        elements.xMinInput = document.getElementById('xMin');
        elements.xMaxInput = document.getElementById('xMax');
        elements.yMinInput = document.getElementById('yMin');
        elements.yMaxInput = document.getElementById('yMax');
        elements.gridCheck = document.getElementById('gridCheck');
        elements.axisCheck = document.getElementById('axisCheck');
        elements.labelsCheck = document.getElementById('labelsCheck');
        elements.ratioCheck = document.getElementById('ratioCheck');
        elements.intersectionCheck = document.getElementById('intersectionCheck');
        elements.formulaCheck = document.getElementById('formulaCheck');
        elements.pointsCheck = document.getElementById('pointsCheck');
        elements.lineWidthSlider = document.getElementById('lineWidth');
        elements.presetSelect = document.getElementById('presetSelect');
        elements.toast = document.getElementById('toast');
        elements.modal = document.getElementById('functionModal');
        elements.modalOverlay = document.getElementById('modalOverlay');
        elements.modalClose = document.getElementById('modalClose');
        elements.modalContent = document.getElementById('modalContent');
        elements.navTabs = document.querySelectorAll('.nav-tab');
        elements.tabContents = document.querySelectorAll('.tab-content');
        elements.canvasSection = document.querySelector('.canvas-section');
        elements.controlPanel = document.querySelector('.control-panel');
        elements.panelHeaders = document.querySelectorAll('.panel-header');
        elements.formulaOverlay = document.getElementById('formulaOverlay');
        elements.pointsList = document.getElementById('pointsList');
    }

    // ==================== 主题管理 ====================
    function initTheme() {
        document.documentElement.setAttribute('data-theme', state.theme);
        updateThemeIcon();
    }

    function toggleTheme() {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', state.theme);
        localStorage.setItem('theme', state.theme);
        updateThemeIcon();
        redraw();
    }

    function updateThemeIcon() {
        const icon = elements.themeToggle.querySelector('svg');
        if (state.theme === 'dark') {
            icon.innerHTML = '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>';
        } else {
            icon.innerHTML = '<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>';
        }
    }

    // ==================== 画布初始化 ====================
    function initCanvas() {
        state.canvas = elements.mainCanvas;
        state.ctx = state.canvas.getContext('2d');

        // 高DPI支持
        const dpr = window.devicePixelRatio || 1;
        const rect = state.canvas.parentElement.getBoundingClientRect();
        state.canvas.width = rect.width * dpr;
        state.canvas.height = rect.height * dpr;
        state.ctx.scale(dpr, dpr);

        // 事件监听
        state.canvas.addEventListener('mousedown', handleCanvasMouseDown);
        state.canvas.addEventListener('mousemove', handleCanvasMouseMove);
        state.canvas.addEventListener('mouseup', handleCanvasMouseUp);
        state.canvas.addEventListener('click', handleCanvasClick);

        window.addEventListener('resize', handleResize);

        draw();
    }

    function handleResize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = state.canvas.parentElement.getBoundingClientRect();
        state.canvas.width = rect.width * dpr;
        state.canvas.height = rect.height * dpr;
        state.ctx.scale(dpr, dpr);
        redraw();
    }

    // ==================== 坐标转换 ====================
    function getCanvasSize() {
        let width = state.canvas.clientWidth;
        let height = state.canvas.clientHeight;

        // 1:1 等比例处理
        if (state.isRatio1to1) {
            const xRange = state.xMax - state.xMin;
            const yRange = state.yMax - state.yMin;
            const ratio = xRange / yRange;

            if (width > height * ratio) {
                width = height * ratio;
            } else {
                height = width / ratio;
            }
        }

        return { width, height };
    }

    function getCanvasOffset() {
        if (!state.isRatio1to1) return { x: 0, y: 0 };

        const fullWidth = state.canvas.clientWidth;
        const fullHeight = state.canvas.clientHeight;
        const { width, height } = getCanvasSize();

        return {
            x: (fullWidth - width) / 2,
            y: (fullHeight - height) / 2
        };
    }

    function xToCanvas(x) {
        const { width } = getCanvasSize();
        const offset = getCanvasOffset();
        return offset.x + ((x - state.xMin) / (state.xMax - state.xMin)) * width;
    }

    function yToCanvas(y) {
        const { height } = getCanvasSize();
        const offset = getCanvasOffset();
        return offset.y + height - ((y - state.yMin) / (state.yMax - state.yMin)) * height;
    }

    function canvasToX(px) {
        const { width } = getCanvasSize();
        const offset = getCanvasOffset();
        return state.xMin + ((px - offset.x) / width) * (state.xMax - state.xMin);
    }

    function canvasToY(py) {
        const { height } = getCanvasSize();
        const offset = getCanvasOffset();
        return state.yMin + ((offset.y + height - py) / height) * (state.yMax - state.yMin);
    }

    // ==================== 绘图函数 ====================
    function draw() {
        const { width, height } = getCanvasSize();
        const offset = getCanvasOffset();
        const ctx = state.ctx;

        // 清空画布
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#ffffff';
        ctx.fillRect(0, 0, state.canvas.clientWidth, state.canvas.clientHeight);

        // 绘制背景（使用裁剪区域）
        ctx.save();
        if (state.isRatio1to1) {
            ctx.beginPath();
            ctx.rect(offset.x, offset.y, width, height);
            ctx.clip();
        }

        // 绘制网格
        if (state.gridEnabled) {
            drawGrid();
        }

        // 绘制坐标轴
        if (state.axisEnabled) {
            drawAxes();
        }

        // 绘制函数图像
        state.functions.forEach(fn => {
            if (fn.visible) {
                drawFunction(fn);
            }
        });

        // 绘制点
        if (state.showPoints) {
            state.points.forEach(point => {
                drawPoint(point);
            });
        }

        // 绘制交点
        if (state.showIntersections && state.functions.length > 1) {
            drawIntersections();
        }

        ctx.restore();

        // 绘制1:1比例的边框
        if (state.isRatio1to1) {
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0d9488';
            ctx.lineWidth = 2;
            ctx.strokeRect(offset.x, offset.y, width, height);
        }

        // 更新坐标显示
        updateCanvasInfo();
    }

    function drawGrid() {
        const { width, height } = getCanvasSize();
        const offset = getCanvasOffset();
        const ctx = state.ctx;
        const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim() || '#e2e8f0';

        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;

        // 垂直网格线
        const xStep = (state.xMax - state.xMin) / 20;
        for (let x = Math.ceil(state.xMin / xStep) * xStep; x <= state.xMax; x += xStep) {
            const px = xToCanvas(x);
            ctx.beginPath();
            ctx.moveTo(px, offset.y);
            ctx.lineTo(px, offset.y + height);
            ctx.stroke();
        }

        // 水平网格线
        const yStep = (state.yMax - state.yMin) / 20;
        for (let y = Math.ceil(state.yMin / yStep) * yStep; y <= state.yMax; y += yStep) {
            const py = yToCanvas(y);
            ctx.beginPath();
            ctx.moveTo(offset.x, py);
            ctx.lineTo(offset.x + width, py);
            ctx.stroke();
        }
    }

    function drawAxes() {
        const { width, height } = getCanvasSize();
        const offset = getCanvasOffset();
        const ctx = state.ctx;
        const axisColor = getComputedStyle(document.documentElement).getPropertyValue('--axis-color').trim() || '#475569';

        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 2;

        // X轴
        const y0 = yToCanvas(0);
        if (y0 >= offset.y && y0 <= offset.y + height) {
            ctx.beginPath();
            ctx.moveTo(offset.x, y0);
            ctx.lineTo(offset.x + width, y0);
            ctx.stroke();
        }

        // Y轴
        const x0 = xToCanvas(0);
        if (x0 >= offset.x && x0 <= offset.x + width) {
            ctx.beginPath();
            ctx.moveTo(x0, offset.y);
            ctx.lineTo(x0, offset.y + height);
            ctx.stroke();
        }

        // 刻度标签
        if (state.axisLabelsEnabled) {
            drawAxisLabels();
        }
    }

    function drawAxisLabels() {
        const { width, height } = getCanvasSize();
        const offset = getCanvasOffset();
        const ctx = state.ctx;
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#64748b';

        ctx.fillStyle = textColor;
        ctx.font = '12px Consolas, monospace';
        ctx.textAlign = 'center';

        const xStep = Math.ceil((state.xMax - state.xMin) / 10);
        for (let x = Math.ceil(state.xMin / xStep) * xStep; x <= state.xMax; x += xStep) {
            if (Math.abs(x) > 0.001) {
                const px = xToCanvas(x);
                const py = yToCanvas(0);
                ctx.fillText(formatNumber(x), px, py + 18);
            }
        }

        ctx.textAlign = 'right';
        const yStep = Math.ceil((state.yMax - state.yMin) / 10);
        for (let y = Math.ceil(state.yMin / yStep) * yStep; y <= state.yMax; y += yStep) {
            if (Math.abs(y) > 0.001) {
                const px = xToCanvas(0);
                const py = yToCanvas(y);
                ctx.fillText(formatNumber(y), px - 5, py + 4);
            }
        }
    }

    function drawFunction(fn) {
        const { width, height } = getCanvasSize();
        const offset = getCanvasOffset();
        const ctx = state.ctx;

        ctx.strokeStyle = fn.color;
        ctx.lineWidth = fn.lineWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let drawing = false;
        let prevY = null;

        // 遍历实际的像素位置（包括偏移）
        for (let px = Math.floor(offset.x); px <= Math.ceil(offset.x + width); px++) {
            const x = canvasToX(px);
            const y = evaluateFunction(fn.expr, x);

            if (y !== null && isFinite(y) && y >= state.yMin - 100 && y <= state.yMax + 100) {
                const py = yToCanvas(y);

                if (!drawing) {
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    drawing = true;
                } else {
                    // 检测不连续点
                    if (prevY !== null && Math.abs(py - prevY) > height * 0.5) {
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                    } else {
                        ctx.lineTo(px, py);
                    }
                }
                prevY = py;
            } else {
                if (drawing) {
                    ctx.stroke();
                    drawing = false;
                    prevY = null;
                }
            }
        }

        if (drawing) {
            ctx.stroke();
        }
    }

    function drawPoint(point) {
        const { width, height } = getCanvasSize();
        const offset = getCanvasOffset();
        const px = xToCanvas(point.x);
        const py = yToCanvas(point.y);

        // 检查是否在1:1裁剪区域内
        if (px < offset.x - 10 || px > offset.x + width + 10 ||
            py < offset.y - 10 || py > offset.y + height + 10) {
            return;
        }

        const ctx = state.ctx;

        // 绘制点
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = point.color || '#0d9488';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 标签（点名称）
        if (point.label) {
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary');
            ctx.font = 'bold 11px Consolas';
            ctx.textAlign = 'left';
            ctx.fillText(point.label, px + 8, py - 8);
        }

        // 坐标
        if (point.showCoords) {
            ctx.fillStyle = point.color || '#0d9488';
            ctx.font = '10px Consolas';
            ctx.textAlign = 'left';
            ctx.fillText(`(${formatNumber(point.x)}, ${formatNumber(point.y)})`, px + 8, py + 4);
        }
    }

    function drawIntersections() {
        const intersections = findAllIntersections();
        const { width, height } = getCanvasSize();
        const offset = getCanvasOffset();

        intersections.forEach(pt => {
            const px = xToCanvas(pt.x);
            const py = yToCanvas(pt.y);

            // 检查是否在1:1裁剪区域内
            if (px < offset.x - 10 || px > offset.x + width + 10 ||
                py < offset.y - 10 || py > offset.y + height + 10) {
                return;
            }

            const ctx = state.ctx;

            // 绘制交点圆圈（调小一点）
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 坐标标签
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 9px Consolas';
            ctx.textAlign = 'center';
            ctx.fillText(`(${formatNumber(pt.x)},${formatNumber(pt.y)})`, px, py - 10);
        });
    }

    function drawGeometry() {
        const ctx = state.ctx;

        state.geometryObjects.forEach(obj => {
            switch (obj.type) {
                case 'point':
                    drawGeometryPoint(obj);
                    break;
                case 'line':
                    drawGeometryLine(obj);
                    break;
                case 'circle':
                    drawGeometryCircle(obj);
                    break;
                case 'segment':
                    drawGeometrySegment(obj);
                    break;
                case 'ray':
                    drawGeometryRay(obj);
                    break;
            }
        });
    }

    function drawGeometryPoint(obj) {
        const px = xToCanvas(obj.x);
        const py = yToCanvas(obj.y);
        const ctx = state.ctx;

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = obj.color || '#0d9488';
        ctx.fill();

        if (obj.label) {
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary');
            ctx.font = '12px Consolas';
            ctx.fillText(obj.label, px + 8, py - 8);
        }
    }

    function drawGeometryLine(obj) {
        const ctx = state.ctx;
        const { width, height } = getCanvasSize();

        // 计算线在画布边缘的交点
        const points = lineBoxIntersection(
            obj.x1, obj.y1, obj.x2, obj.y2,
            state.xMin, state.yMin, state.xMax, state.yMax
        );

        if (points.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(xToCanvas(points[0].x), yToCanvas(points[0].y));
            ctx.lineTo(xToCanvas(points[1].x), yToCanvas(points[1].y));
            ctx.strokeStyle = obj.color || '#0d9488';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function drawGeometryCircle(obj) {
        const cx = xToCanvas(obj.x);
        const cy = yToCanvas(obj.y);
        const r = Math.abs(yToCanvas(obj.y + obj.r) - cy);
        const ctx = state.ctx;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = obj.color || '#0d9488';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function drawGeometrySegment(obj) {
        const ctx = state.ctx;

        ctx.beginPath();
        ctx.moveTo(xToCanvas(obj.x1), yToCanvas(obj.y1));
        ctx.lineTo(xToCanvas(obj.x2), yToCanvas(obj.y2));
        ctx.strokeStyle = obj.color || '#0d9488';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 端点
        drawGeometryPoint({ x: obj.x1, y: obj.y1, color: obj.color });
        drawGeometryPoint({ x: obj.x2, y: obj.y2, color: obj.color });
    }

    function drawGeometryRay(obj) {
        const ctx = state.ctx;
        const { width, height } = getCanvasSize();

        // 从起点向方向延伸
        const dx = obj.x2 - obj.x1;
        const dy = obj.y2 - obj.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;

        let x2 = obj.x1 + ux * 1000;
        let y2 = obj.y1 + uy * 1000;

        // 裁剪到边界
        const clipped = lineBoxIntersection(
            obj.x1, obj.y1, x2, y2,
            state.xMin, state.yMin, state.xMax, state.yMax
        );

        if (clipped.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(xToCanvas(obj.x1), yToCanvas(obj.y1));
            ctx.lineTo(xToCanvas(clipped[1].x), yToCanvas(clipped[1].y));
            ctx.strokeStyle = obj.color || '#0d9488';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        drawGeometryPoint({ x: obj.x1, y: obj.y1, color: obj.color });
    }

    function lineBoxIntersection(x1, y1, x2, y2, xMin, yMin, xMax, yMax) {
        const points = [];

        // 检测与四条边的交点
        const edges = [
            { x1: xMin, y1: yMin, x2: xMax, y2: yMin },  // 下边
            { x1: xMin, y1: yMax, x2: xMax, y2: yMax },  // 上边
            { x1: xMin, y1: yMin, x2: xMin, y2: yMax },  // 左边
            { x1: xMax, y1: yMin, x2: xMax, y2: yMax }  // 右边
        ];

        edges.forEach(edge => {
            const pt = lineLineIntersection(x1, y1, x2, y2, edge.x1, edge.y1, edge.x2, edge.y2);
            if (pt && pt.x >= xMin - 0.001 && pt.x <= xMax + 0.001 &&
                pt.y >= yMin - 0.001 && pt.y <= yMax + 0.001) {
                points.push(pt);
            }
        });

        return points;
    }

    function lineLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 0.0001) return null;

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1)
            };
        }
        return null;
    }

    function updateCanvasInfo() {
        const info = document.getElementById('canvasInfo');
        if (info) {
            info.textContent = `x: [${state.xMin}, ${state.xMax}] y: [${state.yMin}, ${state.yMax}]`;
        }
    }

    // ==================== 函数解析式显示 ====================
    function formatFormula(expr) {
        // 检查是否包含等号，如果是则直接显示右边部分
        if (expr.includes('=')) {
            const parts = expr.split('=');
            return parts[1] + ' = ' + parts[0];
        }
        return 'y = ' + expr;
    }

    function updateFormulaOverlay() {
        const overlay = elements.formulaOverlay;
        if (!overlay) return;

        if (!state.showFormulas || state.functions.length === 0) {
            overlay.innerHTML = '';
            return;
        }

        let html = '<div class="formula-list">';
        state.functions.forEach(fn => {
            if (fn.visible) {
                html += `<div class="formula-item" style="color: ${fn.color}">`;
                html += `<span style="display: inline-block; width: 12px; height: 12px; background: ${fn.color}; border-radius: 2px; margin-right: 6px;"></span>`;
                html += `<strong>${formatFormula(fn.expr)}</strong>`;
                html += '</div>';
            }
        });
        html += '</div>';
        overlay.innerHTML = html;
    }

    // ==================== 点管理 ====================
    function addPoint(x, y, label, showCoords = true) {
        const point = {
            id: Date.now(),
            x: x,
            y: y,
            label: label || `P${state.points.length + 1}`,
            showCoords: showCoords,
            color: colorPresets[state.points.length % colorPresets.length]
        };
        state.points.push(point);
        renderPointsList();
        redraw();
        showToast(`已添加点 ${point.label}`, 'success');
    }

    function removePoint(id) {
        state.points = state.points.filter(p => p.id !== id);
        renderPointsList();
        redraw();
    }

    function renderPointsList() {
        const list = elements.pointsList;
        if (!list) return;

        if (state.points.length === 0) {
            list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center;">点击画布上的添加点按钮来添加点</p>';
            return;
        }

        let html = '';
        state.points.forEach(point => {
            const showCoords = point.showCoords !== false;
            html += `
                <div class="point-item" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 0.5rem;">
                    <input type="color" value="${point.color}" style="width: 24px; height: 24px; border: none; border-radius: 4px; cursor: pointer;" onchange="updatePointColor(${point.id}, this.value)">
                    <div style="flex: 1;">
                        <input type="text" value="${point.label}" class="form-input" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onchange="updatePointLabel(${point.id}, this.value)">
                        <span style="font-size: 0.75rem; color: var(--text-muted);">(${formatNumber(point.x)}, ${formatNumber(point.y)})</span>
                        <label style="display: flex; align-items: center; gap: 0.25rem; margin-top: 0.25rem; font-size: 0.75rem; color: var(--text-secondary);">
                            <input type="checkbox" ${showCoords ? 'checked' : ''} onchange="togglePointCoords(${point.id}, this.checked)"> 显示坐标
                        </label>
                    </div>
                    <button onclick="removePoint(${point.id})" style="background: none; border: none; color: var(--error); cursor: pointer; padding: 0.25rem;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            `;
        });
        list.innerHTML = html;
    }

    // 全局函数供HTML调用
    window.updatePointColor = function(id, color) {
        const point = state.points.find(p => p.id === id);
        if (point) {
            point.color = color;
            redraw();
        }
    };

    window.updatePointLabel = function(id, label) {
        const point = state.points.find(p => p.id === id);
        if (point) {
            point.label = label;
            redraw();
        }
    };

    window.togglePointCoords = function(id, show) {
        const point = state.points.find(p => p.id === id);
        if (point) {
            point.showCoords = show;
            redraw();
        }
    };

    window.removePoint = removePoint;

    function redraw() {
        draw();
    }

    // ==================== 函数解析 ====================
    function parseFunction(expr) {
        let parsed = expr.toLowerCase().replace(/\s+/g, '');

        // 常量替换
        parsed = parsed.replace(/\bpi\b/g, 'Math.PI');
        parsed = parsed.replace(/([^e\d])e([^e\d]|$)/g, '$1Math.E$2');
        parsed = parsed.replace(/^e$/g, 'Math.E');

        // 函数替换
        const functions = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan',
                          'abs', 'sqrt', 'log', 'ln', 'exp', 'floor', 'ceil', 'pow'];
        functions.forEach(fn => {
            parsed = parsed.replace(new RegExp(`\\b${fn}\\b`, 'g'), `Math.${fn}`);
        });

        // 幂运算转换 x^2 -> pow(x, 2)
        parsed = parsed.replace(/(\w+|\))(\^)(\d+(\.\d+)?)/g, 'Math.pow($1,$3)');
        parsed = parsed.replace(/(\w+)(\^)\(([^)]+)\)/g, 'Math.pow($1,($3))');

        return parsed;
    }

    function evaluateFunction(expr, x) {
        try {
            const parsed = parseFunction(expr);
            // 使用函数作用域
            const result = new Function('x', `return ${parsed}`)(x);
            if (!isFinite(result) || isNaN(result)) return null;
            return result;
        } catch (e) {
            return null;
        }
    }

    function evaluateFunctionAtPoint(expr, xVal) {
        return evaluateFunction(expr, xVal);
    }

    // ==================== 交点计算 ====================
    function findAllIntersections() {
        const intersections = [];
        const fns = state.functions.filter(f => f.visible);

        if (fns.length < 2) return intersections;

        // 遍历所有函数对
        for (let i = 0; i < fns.length; i++) {
            for (let j = i + 1; j < fns.length; j++) {
                const pts = findIntersection(fns[i].expr, fns[j].expr);
                pts.forEach(pt => {
                    // 检查是否已存在
                    const exists = intersections.some(p =>
                        Math.abs(p.x - pt.x) < 0.01 && Math.abs(p.y - pt.y) < 0.01
                    );
                    if (!exists) {
                        intersections.push(pt);
                    }
                });
            }
        }

        return intersections;
    }

    function findIntersection(expr1, expr2) {
        const intersections = [];
        const step = (state.xMax - state.xMin) / 500;

        let prevDiff = null;
        let prevX = null;

        for (let x = state.xMin; x <= state.xMax; x += step) {
            const y1 = evaluateFunction(expr1, x);
            const y2 = evaluateFunction(expr2, x);

            if (y1 !== null && y2 !== null) {
                const diff = y1 - y2;

                if (prevDiff !== null) {
                    if (prevDiff * diff <= 0) {
                        // 符号改变，找到交点
                        const ix = prevX + step / 2;
                        const iy = evaluateFunction(expr1, ix);
                        if (iy !== null) {
                            intersections.push({ x: ix, y: iy });
                        }
                    }
                }

                prevDiff = diff;
                prevX = x;
            }
        }

        return intersections;
    }

    // ==================== 函数分析 ====================
    function analyzeFunction(expr) {
        const analysis = {
            type: getFunctionType(expr),
            derivative: getDerivative(expr),
            integral: getIntegral(expr),
            min: findMinimum(expr),
            max: findMaximum(expr),
            zeros: findZeros(expr),
            yIntercept: evaluateFunction(expr, 0)
        };

        return analysis;
    }

    function getFunctionType(expr) {
        const e = expr.toLowerCase();
        if (e.includes('sin') && e.includes('cos')) return '三角复合函数';
        if (e.includes('sin')) return '正弦函数';
        if (e.includes('cos')) return '余弦函数';
        if (e.includes('tan')) return '正切函数';
        if (e.includes('sqrt')) return '根号函数';
        if (e.includes('abs')) return '绝对值函数';
        if (e.includes('log')) return '对数函数';
        if (e.includes('exp') || e.includes('^')) return '指数/幂函数';
        if (e.includes('/') || e.includes('1/')) return '分式函数';
        return '多项式/代数函数';
    }

    function getDerivative(expr) {
        // 简化版导数计算
        let e = expr.toLowerCase().replace(/\s+/g, '');

        // 基础规则
        e = e.replace(/(\w+)\^(\d+)/g, '$1^$2'); // 保持幂形式
        e = e.replace(/sin\(([^)]+)\)/g, 'cos($1)'); // sin -> cos
        e = e.replace(/cos\(([^)]+)\)/g, '-sin($1)'); // cos -> -sin
        e = e.replace(/e\^(.+)/g, 'e^($1)'); // e^x -> e^x
        e = e.replace(/ln\(([^)]+)\)/g, '1/($1)'); // ln(x) -> 1/x
        e = e.replace(/sqrt\(([^)]+)\)/g, '1/(2*sqrt($1))'); // sqrt(x) -> 1/(2*sqrt(x))

        return `d/dx[${expr}] ≈ ${e}`;
    }

    function getIntegral(expr) {
        return `∫[${expr}]dx (积分计算需要更多工具)`;
    }

    function findMinimum(expr) {
        let minY = Infinity;
        let minX = 0;
        const step = (state.xMax - state.xMin) / 500;

        for (let x = state.xMin; x <= state.xMax; x += step) {
            const y = evaluateFunction(expr, x);
            if (y !== null && y < minY) {
                minY = y;
                minX = x;
            }
        }

        return { x: minX, y: minY };
    }

    function findMaximum(expr) {
        let maxY = -Infinity;
        let maxX = 0;
        const step = (state.xMax - state.xMin) / 500;

        for (let x = state.xMin; x <= state.xMax; x += step) {
            const y = evaluateFunction(expr, x);
            if (y !== null && y > maxY) {
                maxY = y;
                maxX = x;
            }
        }

        return { x: maxX, y: maxY };
    }

    function findZeros(expr) {
        const zeros = [];
        const step = (state.xMax - state.xMin) / 500;
        let prevY = null;
        let prevX = null;

        for (let x = state.xMin; x <= state.xMax; x += step) {
            const y = evaluateFunction(expr, x);

            if (y !== null) {
                if (prevY !== null && prevY * y <= 0 && Math.abs(y - prevY) < 10) {
                    // 穿过x轴
                    const zeroX = x - step / 2;
                    zeros.push(zeroX);
                }
                prevY = y;
                prevX = x;
            }
        }

        return zeros;
    }

    // ==================== 函数管理 ====================
    function addFunction(expr, options = {}) {
        const colorIndex = state.functions.length % colorPresets.length;

        const fn = {
            id: Date.now(),
            expr: expr,
            color: options.color || colorPresets[colorIndex],
            lineWidth: options.lineWidth || 2,
            visible: options.visible !== false,
            range: options.range || { min: state.xMin, max: state.xMax },
            label: options.label || `f${state.functions.length + 1}`
        };

        state.functions.push(fn);
        renderFunctionList();
        redraw();
        return fn;
    }

    function removeFunction(id) {
        state.functions = state.functions.filter(f => f.id !== id);
        renderFunctionList();
        redraw();
    }

    function updateFunction(id, updates) {
        const fn = state.functions.find(f => f.id === id);
        if (fn) {
            Object.assign(fn, updates);
            renderFunctionList();
            redraw();
        }
    }

    function clearFunctions() {
        state.functions = [];
        renderFunctionList();
        redraw();
    }

    function renderFunctionList() {
        elements.functionList.innerHTML = '';

        state.functions.forEach((fn, index) => {
            const item = document.createElement('div');
            item.className = 'function-item';
            item.dataset.id = fn.id;

            item.innerHTML = `
                <input type="color" class="function-color" value="${fn.color}" data-id="${fn.id}">
                <input type="text" class="function-expr" value="${fn.expr}" data-id="${fn.id}" placeholder="输入函数...">
                <input type="number" class="function-range" value="${fn.range.min}" data-id="${fn.id}" data-field="min" step="0.1">
                <span style="color: var(--text-muted)">~</span>
                <input type="number" class="function-range" value="${fn.range.max}" data-id="${fn.id}" data-field="max" step="0.1">
                <div class="function-actions">
                    <button class="function-btn info-btn" data-id="${fn.id}" title="函数信息">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 16v-4M12 8h.01"/>
                        </svg>
                    </button>
                    <button class="function-btn delete" data-id="${fn.id}" title="删除">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            `;

            elements.functionList.appendChild(item);
        });

        // 绑定事件
        elements.functionList.querySelectorAll('.function-color').forEach(input => {
            input.addEventListener('change', (e) => {
                updateFunction(parseInt(e.target.dataset.id), { color: e.target.value });
            });
        });

        elements.functionList.querySelectorAll('.function-expr').forEach(input => {
            input.addEventListener('change', (e) => {
                updateFunction(parseInt(e.target.dataset.id), { expr: e.target.value });
            });
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    updateFunction(parseInt(e.target.dataset.id), { expr: e.target.value });
                }
            });
        });

        elements.functionList.querySelectorAll('.function-range').forEach(input => {
            input.addEventListener('change', (e) => {
                const id = parseInt(e.target.dataset.id);
                const field = e.target.dataset.field;
                const fn = state.functions.find(f => f.id === id);
                if (fn) {
                    fn.range[field] = parseFloat(e.target.value);
                    redraw();
                }
            });
        });

        elements.functionList.querySelectorAll('.function-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                removeFunction(parseInt(e.currentTarget.dataset.id));
            });
        });

        elements.functionList.querySelectorAll('.function-btn.info-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                showFunctionInfo(id);
            });
        });
    }

    function showFunctionInfo(id) {
        const fn = state.functions.find(f => f.id === id);
        if (!fn) return;

        const analysis = analyzeFunction(fn.expr);

        const content = `
            <div class="function-details">
                <div class="detail-row">
                    <span class="detail-label">函数</span>
                    <span class="detail-value">${fn.expr}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">类型</span>
                    <span class="detail-value">${analysis.type}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">最小值</span>
                    <span class="detail-value">y = ${formatNumber(analysis.min.y)} @ x = ${formatNumber(analysis.min.x)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">最大值</span>
                    <span class="detail-value">y = ${formatNumber(analysis.max.y)} @ x = ${formatNumber(analysis.max.x)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Y轴截距</span>
                    <span class="detail-value">${analysis.yIntercept !== null ? formatNumber(analysis.yIntercept) : '无'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">零点</span>
                    <span class="detail-value">${analysis.zeros.length > 0 ? analysis.zeros.map(z => formatNumber(z)).join(', ') : '无'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">导数</span>
                    <span class="detail-value" style="font-size: 0.75rem">${analysis.derivative}</span>
                </div>
            </div>
        `;

        showModal('函数分析', content);
    }

    // ==================== 多项式处理 ====================
    function parsePolynomial(expr) {
        // 展开多项式并返回图像
        // 简化实现：直接返回原表达式
        return expr;
    }

    // ==================== 几何画板 ====================
    let geometryStartPoint = null;

    function handleGeometryClick(e) {
        const rect = state.canvas.getBoundingClientRect();
        const x = canvasToX(e.clientX - rect.left);
        const y = canvasToY(e.clientY - rect.top);

        switch (state.geometryTool) {
            case 'point':
                addGeometryPoint(x, y);
                break;
            case 'line':
            case 'segment':
            case 'ray':
                if (!geometryStartPoint) {
                    geometryStartPoint = { x, y };
                    showToast('点击确定终点');
                } else {
                    addGeometryLine(geometryStartPoint.x, geometryStartPoint.y, x, y);
                    geometryStartPoint = null;
                }
                break;
            case 'circle':
                if (!geometryStartPoint) {
                    geometryStartPoint = { x, y };
                    showToast('点击确定半径');
                } else {
                    const r = Math.sqrt(
                        Math.pow(x - geometryStartPoint.x, 2) +
                        Math.pow(y - geometryStartPoint.y, 2)
                    );
                    addGeometryCircle(geometryStartPoint.x, geometryStartPoint.y, r);
                    geometryStartPoint = null;
                }
                break;
        }

        redraw();
    }

    function addGeometryPoint(x, y, label = null) {
        const point = {
            type: 'point',
            x, y,
            label: label || `P${state.geometryObjects.length + 1}`,
            color: colorPresets[state.geometryObjects.length % colorPresets.length]
        };
        state.geometryObjects.push(point);
        redraw();
    }

    function addGeometryLine(x1, y1, x2, y2) {
        state.geometryObjects.push({
            type: state.geometryTool,
            x1, y1, x2, y2,
            color: colorPresets[state.geometryObjects.length % colorPresets.length]
        });
        redraw();
    }

    function addGeometryCircle(x, y, r) {
        state.geometryObjects.push({
            type: 'circle',
            x, y, r,
            color: colorPresets[state.geometryObjects.length % colorPresets.length]
        });
        redraw();
    }

    function clearGeometry() {
        state.geometryObjects = [];
        geometryStartPoint = null;
        redraw();
    }

    // ==================== 化学方程 ====================
    const chemElements = [
        'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
        'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
        'Fe', 'Cu', 'Zn', 'Ag', 'Au', 'Hg', 'Pb'
    ];

    function initChemistryKeyboard() {
        const container = document.getElementById('chemKeyboard');
        if (!container) return;

        chemElements.forEach(el => {
            const btn = document.createElement('button');
            btn.className = 'chem-element-btn';
            btn.textContent = el;
            btn.addEventListener('click', () => insertChemElement(el));
            container.appendChild(btn);
        });
    }

    function insertChemElement(el) {
        const input = document.getElementById('chemInput');
        const start = input.selectionStart;
        const value = input.value;

        input.value = value.slice(0, start) + el + value.slice(start);
        input.focus();
        updateChemPreview();
    }

    function updateChemPreview() {
        const input = document.getElementById('chemInput');
        const preview = document.getElementById('chemPreview');
        if (!input || !preview) return;

        let formula = input.value;

        // 处理下标数字
        formula = formula.replace(/(\d+)/g, '<sub>$1</sub>');
        // 处理电荷
        formula = formula.replace(/\^([+-]?\d*)$/g, '<sup>$1</sup>');
        formula = formula.replace(/\^([+-])$/g, '<sup>$1</sup>');

        preview.innerHTML = formula || '请输入化学式...';
    }

    // ==================== 鼠标交互 ====================
    function handleCanvasMouseDown(e) {
        const rect = state.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 检查是否点击了点
        state.points.forEach((point, index) => {
            const px = xToCanvas(point.x);
            const py = yToCanvas(point.y);
            if (Math.abs(x - px) < 10 && Math.abs(y - py) < 10) {
                state.dragging = { type: 'point', index };
            }
        });
    }

    function handleCanvasMouseMove(e) {
        if (!state.dragging) return;

        const rect = state.canvas.getBoundingClientRect();
        const x = canvasToX(e.clientX - rect.left);
        const y = canvasToY(e.clientY - rect.top);

        if (state.dragging.type === 'point') {
            state.points[state.dragging.index].x = x;
            state.points[state.dragging.index].y = y;
            redraw();
        }
    }

    function handleCanvasMouseUp() {
        state.dragging = null;
    }

    function handleCanvasClick(e) {
        if (state.currentTab === 'geometry') {
            handleGeometryClick(e);
        }
    }

    // ==================== 工具函数 ====================
    function formatNumber(n) {
        if (Math.abs(n) < 0.001 && n !== 0) return n.toExponential(2);
        if (Math.abs(n) >= 10000) return n.toExponential(2);
        return Math.round(n * 1000) / 1000;
    }

    function showToast(message, type = 'info') {
        const toast = elements.toast;
        toast.querySelector('span').textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function showModal(title, content) {
        elements.modal.querySelector('.modal-title').textContent = title;
        elements.modalContent.innerHTML = content;
        elements.modalOverlay.classList.add('show');
    }

    function hideModal() {
        elements.modalOverlay.classList.remove('show');
    }

    // ==================== 文件操作 ====================
    function downloadImage() {
        const { width, height } = getCanvasSize();
        const offset = getCanvasOffset();
        const dpr = window.devicePixelRatio || 1;

        // 创建临时Canvas进行裁剪
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width * dpr;
        tempCanvas.height = height * dpr;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.scale(dpr, dpr);

        // 复制裁剪区域
        tempCtx.drawImage(
            state.canvas,
            offset.x, offset.y, width, height,  // 源区域
            0, 0, width, height                  // 目标区域
        );

        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:-]/g, '').slice(0, 14);
        link.download = `buzhidao-math-${timestamp}.png`;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
        showToast('图像已下载', 'success');
    }

    // ==================== 事件绑定 ====================
    function bindEvents() {
        // 主题切换
        elements.themeToggle.addEventListener('click', toggleTheme);

        // 导航标签
        elements.navTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                elements.navTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const tabId = tab.dataset.tab;
                elements.tabContents.forEach(content => {
                    content.classList.toggle('active', content.id === tabId);
                });

                state.currentTab = tabId;
                redraw();
            });
        });

        // 添加函数
        elements.addFunctionBtn.addEventListener('click', () => {
            const expr = elements.functionInput.value.trim();
            if (expr) {
                addFunction(expr);
                elements.functionInput.value = '';
            } else {
                showToast('请输入函数表达式', 'warning');
            }
        });

        // 绘制按钮
        elements.drawBtn.addEventListener('click', () => {
            const expr = elements.functionInput.value.trim();
            if (expr) {
                addFunction(expr);
            }
        });

        // 清除按钮
        elements.clearBtn.addEventListener('click', () => {
            if (state.currentTab === 'math') {
                clearFunctions();
                state.points = [];
            } else if (state.currentTab === 'geometry') {
                clearGeometry();
            }
            elements.functionInput.value = '';
            redraw();
        });

        // 下载按钮
        elements.downloadBtn.addEventListener('click', downloadImage);

        // 回车添加函数
        elements.functionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const expr = elements.functionInput.value.trim();
                if (expr) {
                    addFunction(expr);
                    elements.functionInput.value = '';
                }
            }
        });

        // 预设函数
        elements.presetSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                addFunction(e.target.value);
                e.target.value = '';
            }
        });

        // 数学符号键盘
        elements.mathKeyboard.querySelectorAll('.math-key').forEach(key => {
            key.addEventListener('click', () => {
                const symbol = key.dataset.symbol;
                const start = elements.functionInput.selectionStart;
                const end = elements.functionInput.selectionEnd;
                const text = elements.functionInput.value;

                let insertValue = symbol;
                if (symbol === '2') insertValue = '^2';

                elements.functionInput.value = text.slice(0, start) + insertValue + text.slice(end);
                elements.functionInput.focus();
                elements.functionInput.setSelectionRange(start + insertValue.length, start + insertValue.length);
            });
        });

        // 坐标范围
        [elements.xMinInput, elements.xMaxInput, elements.yMinInput, elements.yMaxInput].forEach(input => {
            input.addEventListener('change', updateAxisRange);
        });

        // 网格和坐标轴
        elements.gridCheck.addEventListener('change', (e) => {
            state.gridEnabled = e.target.checked;
            redraw();
        });

        elements.axisCheck.addEventListener('change', (e) => {
            state.axisEnabled = e.target.checked;
            redraw();
        });

        elements.labelsCheck.addEventListener('change', (e) => {
            state.axisLabelsEnabled = e.target.checked;
            redraw();
        });

        // 1:1 比例
        elements.ratioCheck.addEventListener('change', (e) => {
            state.isRatio1to1 = e.target.checked;
            handleResize();
        });

        // 交点显示
        elements.intersectionCheck.addEventListener('change', (e) => {
            state.showIntersections = e.target.checked;
            redraw();
        });

        // 函数解析式显示
        elements.formulaCheck.addEventListener('change', (e) => {
            state.showFormulas = e.target.checked;
            updateFormulaOverlay();
            redraw();
        });

        // 点显示
        elements.pointsCheck.addEventListener('change', (e) => {
            state.showPoints = e.target.checked;
            redraw();
        });

        // 线宽
        elements.lineWidthSlider.addEventListener('input', (e) => {
            const width = parseFloat(e.target.value);
            document.getElementById('lineWidthValue').textContent = width + 'px';
            if (state.activeFunction) {
                updateFunction(state.activeFunction.id, { lineWidth: width });
            }
        });

        // 清除点按钮
        const clearPointsBtn = document.getElementById('clearPointsBtn');
        if (clearPointsBtn) {
            clearPointsBtn.addEventListener('click', () => {
                state.points = [];
                renderPointsList();
                redraw();
            });
        }

        // 下载按钮2
        const downloadBtn2 = document.getElementById('downloadBtn2');
        if (downloadBtn2) {
            downloadBtn2.addEventListener('click', downloadImage);
        }

        // 重置全部按钮
        const resetAllBtn = document.getElementById('resetAllBtn');
        if (resetAllBtn) {
            resetAllBtn.addEventListener('click', () => {
                state.functions = [];
                state.points = [];
                state.xMin = -10;
                state.xMax = 10;
                state.yMin = -10;
                state.yMax = 10;
                elements.xMinInput.value = -10;
                elements.xMaxInput.value = 10;
                elements.yMinInput.value = -10;
                elements.yMaxInput.value = 10;
                elements.functionInput.value = '';
                renderFunctionList();
                renderPointsList();
                redraw();
                showToast('已重置全部', 'success');
            });
        }

        // 模态框
        elements.modalClose.addEventListener('click', hideModal);
        elements.modalOverlay.addEventListener('click', (e) => {
            if (e.target === elements.modalOverlay) {
                hideModal();
            }
        });

        // 面板折叠
        elements.panelHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                const toggle = header.querySelector('.panel-toggle');
                if (content) {
                    content.classList.toggle('collapsed');
                }
                if (toggle) {
                    toggle.classList.toggle('collapsed');
                }
            });
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideModal();
            }
        });
    }

    function updateAxisRange() {
        state.xMin = parseFloat(elements.xMinInput.value) || -10;
        state.xMax = parseFloat(elements.xMaxInput.value) || 10;
        state.yMin = parseFloat(elements.yMinInput.value) || -10;
        state.yMax = parseFloat(elements.yMaxInput.value) || 10;
        redraw();
    }

    // ==================== 初始化 ====================
    function init() {
        initElements();
        initTheme();
        initCanvas();
        bindEvents();

        // 添加示例函数
        addFunction('sin(x)', { label: 'sin(x)' });
        addFunction('x^2/4', { label: 'x²/4' });

        // 渲染初始点列表
        renderPointsList();

        showToast('欢迎使用 buzhidao edu!', 'success');
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 导出到全局
    window.buzhidao = {
        state,
        addFunction,
        removeFunction,
        updateFunction,
        clearFunctions,
        addPoint,
        removePoint,
        redraw,
        showToast,
        showModal,
        analyzeFunction,
        downloadImage
    };

})();
