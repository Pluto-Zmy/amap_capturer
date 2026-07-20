// content/panel.js
// Side panel UI module: builds panel DOM, binds events, manages state.

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

var PanelState = {
  READY: 'ready',
  CAPTURING: 'capturing',
  DOWNLOADING: 'downloading',
  DONE: 'done',
  ERROR: 'error',
};

class SidePanel {
  constructor() {
    this.state = PanelState.READY;
    this.zoomLevel = 14;
    this.stitchMode = 'auto';
    this.groupSize = 10;
    this.captureWidth  = 2000;
    this.captureHeight = 1600;
    this.sampleRate    = 10;
    this.capturedCount = 0;
    this.totalSteps = 0;
    this.capturedImages = [];
    this.capturedOffsets = [];
    this.capturedWidth = 0;
    this.capturedHeight = 0;
    this._abortController = null;

    this.root = null;
    this.elements = {};
  }

  mount() {
    if (document.getElementById('bmap-panel-root')) return;

    this.root = document.createElement('div');
    this.root.id = 'bmap-panel-root';
    this.root.innerHTML = this._renderHTML();
    document.body.appendChild(this.root);

    this._cacheElements();
    this._bindEvents();
    this._updateRouteInfo();
  }

  _renderHTML() {
    return `
      <div id="bmap-panel-inner">
        <div class="bmap-panel-header">
          <h3>🗺️ 地图截图拼接</h3>
          <button class="bmap-panel-toggle" id="bmap-toggle-btn" title="折叠面板">◀</button>
        </div>

        <div class="bmap-panel-section bmap-instructions">
          <div class="bmap-instructions-title">📋 使用说明</div>
          <ul class="bmap-instructions-list">
            <li>1. 设置起终点、途经点后，自动检测路线</li>
            <li>2. 开始截图前请关闭左侧路线规划面板，以防无关元素干扰</li>
            <li>3. 如未自动检测到路线，请刷新页面重试</li>
            <li>4. 截图过程中勿手动拖动地图</li>
          </ul>
        </div>

        <div class="bmap-panel-section">
          <label>缩放级别</label>
          <div class="bmap-zoom-row">
            <span>3</span>
            <input type="range" class="bmap-zoom-slider" id="bmap-zoom-slider"
                   min="3" max="18" value="14" step="1">
            <span class="bmap-zoom-value" id="bmap-zoom-value">14</span>
            <span>18</span>
          </div>
        </div>

        <div class="bmap-panel-section">
          <label>截图尺寸 & 采样率</label>
          <div class="bmap-size-row">
            <span>宽</span>
            <input type="number" class="bmap-size-input" id="bmap-capture-w"
                   value="2000" min="100" max="4000" step="50">
          </div>
          <div class="bmap-size-row">
            <span>高</span>
            <input type="number" class="bmap-size-input" id="bmap-capture-h"
                   value="1600" min="100" max="4000" step="50">
          </div>
          <div class="bmap-size-row">
            <span>采样</span>
            <input type="number" class="bmap-size-input" id="bmap-sample-rate"
                   value="10" min="1" max="100" step="1">
          </div>
          <div class="bmap-size-hint">采样 = 每隔 N 个中心点截一张 · 如下载后地图有断层请减小</div>
        </div>

        <div class="bmap-panel-section">
          <label>拼接模式</label>
          <div class="bmap-mode-option">
            <input type="radio" name="stitch-mode" value="auto" id="mode-auto" checked>
            <label for="mode-auto">自动分组（推荐）</label>
          </div>
          <div class="bmap-mode-option">
            <input type="radio" name="stitch-mode" value="all" id="mode-all">
            <label for="mode-all">全部拼接为一张</label>
          </div>
          <div class="bmap-mode-option">
            <input type="radio" name="stitch-mode" value="group" id="mode-group">
            <label for="mode-group">固定数量</label>
            <input type="number" class="bmap-group-size" id="bmap-group-size"
                   value="10" min="2" max="100" disabled>
            <span>张/组</span>
          </div>
        </div>

        <div class="bmap-panel-section">
          <label>路线信息</label>
          <div class="bmap-route-info" id="bmap-route-info">
            <div><span class="bmap-label">状态：</span><span class="bmap-value" id="bmap-route-status">检测中...</span></div>
            <div><span class="bmap-label">截图进度：</span><span class="bmap-value" id="bmap-progress-count">--</span></div>
          </div>
        </div>

        <button class="bmap-btn bmap-btn-primary" id="bmap-start-btn">开始截图</button>

        <div class="bmap-progress" id="bmap-progress-area" style="display:none;">
          <div class="bmap-progress-bar">
            <div class="bmap-progress-fill" id="bmap-progress-fill" style="width:0%;"></div>
          </div>
          <div class="bmap-progress-text" id="bmap-progress-text"></div>
        </div>

        <button class="bmap-btn bmap-btn-success" id="bmap-download-btn"
                style="display:none;">下载结果</button>

        <div id="bmap-message-area"></div>
      </div>
      <div class="bmap-minimized-progress" id="bmap-minimized-progress">
        <div class="bmap-minimized-progress-bar">
          <div class="bmap-minimized-progress-fill" id="bmap-minimized-progress-fill"></div>
        </div>
        <span class="bmap-minimized-progress-text" id="bmap-minimized-progress-text"></span>
      </div>
      <div class="bmap-minimized-btn" id="bmap-minimized-btn" title="展开面板">
        🗺️
      </div>
    `;
  }

  _cacheElements() {
    const ids = [
      'bmap-toggle-btn', 'bmap-minimized-btn', 'bmap-zoom-slider', 'bmap-zoom-value',
      'bmap-capture-w', 'bmap-capture-h', 'bmap-sample-rate',
      'mode-auto', 'mode-all', 'mode-group', 'bmap-group-size',
      'bmap-start-btn', 'bmap-download-btn',
      'bmap-progress-area', 'bmap-progress-fill', 'bmap-progress-text',
      'bmap-route-status', 'bmap-progress-count', 'bmap-message-area',
      'bmap-minimized-progress', 'bmap-minimized-progress-fill', 'bmap-minimized-progress-text',
    ];
    for (const id of ids) {
      this.elements[id] = document.getElementById(id);
    }
  }

  _bindEvents() {
    this.elements['bmap-toggle-btn'].addEventListener('click', () => this._collapse());
    this.elements['bmap-minimized-btn'].addEventListener('click', () => this._expand());

    this.elements['bmap-zoom-slider'].addEventListener('input', (e) => {
      this.zoomLevel = parseInt(e.target.value);
      this.elements['bmap-zoom-value'].textContent = this.zoomLevel;
    });

    // Capture dimensions — clamp to valid range
    var self = this;
    this.elements['bmap-capture-w'].addEventListener('change', function() {
      self.captureWidth = clamp(parseInt(this.value) || 2000, 100, 4000);
      this.value = self.captureWidth;
    });
    this.elements['bmap-capture-h'].addEventListener('change', function() {
      self.captureHeight = clamp(parseInt(this.value) || 1600, 100, 4000);
      this.value = self.captureHeight;
    });
    this.elements['bmap-sample-rate'].addEventListener('change', function() {
      self.sampleRate = clamp(parseInt(this.value) || 10, 1, 100);
      this.value = self.sampleRate;
    });

    this.elements['mode-auto'].addEventListener('change', () => {
      this.stitchMode = 'auto';
      this.elements['bmap-group-size'].disabled = true;
    });
    this.elements['mode-all'].addEventListener('change', () => {
      this.stitchMode = 'all';
      this.elements['bmap-group-size'].disabled = true;
    });
    this.elements['mode-group'].addEventListener('change', () => {
      this.stitchMode = 'group';
      this.elements['bmap-group-size'].disabled = false;
    });

    this.elements['bmap-group-size'].addEventListener('change', (e) => {
      this.groupSize = Math.max(2, parseInt(e.target.value) || 10);
    });

    this.elements['bmap-start-btn'].addEventListener('click', () => this._onStartClick());
    this.elements['bmap-download-btn'].addEventListener('click', () => this._onDownloadClick());
  }

  _collapse() {
    this.root.classList.add('bmap-collapsed');
    // Show minimized progress only when capturing
    if (this.state === PanelState.CAPTURING) {
      this.elements['bmap-minimized-progress'].style.display = 'flex';
    }
  }

  _expand() {
    this.root.classList.remove('bmap-collapsed');
    // Hide minimized progress — expanded panel has its own progress bar
    this.elements['bmap-minimized-progress'].style.display = 'none';
  }

  onStart(callback) { this._startCallback = callback; }
  onCancel(callback) { this._cancelCallback = callback; }
  onDownload(callback) { this._downloadCallback = callback; }

  _onStartClick() {
    if (this.state === PanelState.CAPTURING) {
      if (this._cancelCallback) this._cancelCallback();
    } else {
      // Auto-collapse panel to avoid appearing in captured screenshots
      this._collapse();
      if (this._startCallback) this._startCallback();
    }
  }

  _onDownloadClick() {
    if (this._downloadCallback) this._downloadCallback();
  }

  setState(state) {
    this.state = state;
    var btn = this.elements['bmap-start-btn'];
    var progressArea = this.elements['bmap-progress-area'];
    var downloadBtn = this.elements['bmap-download-btn'];
    var minimizedProgress = this.elements['bmap-minimized-progress'];

    switch (state) {
      case PanelState.READY:
        this._expand();
        btn.textContent = '开始截图';
        btn.className = 'bmap-btn bmap-btn-primary';
        btn.disabled = false;
        progressArea.style.display = 'none';
        downloadBtn.style.display = 'none';
        minimizedProgress.style.display = 'none';
        this._setControlsEnabled(true);
        break;
      case PanelState.CAPTURING:
        btn.textContent = '取消';
        btn.className = 'bmap-btn bmap-btn-danger';
        btn.disabled = false;
        progressArea.style.display = 'block';
        downloadBtn.style.display = 'none';
        minimizedProgress.style.display = 'flex';
        this._setControlsEnabled(false);
        break;
      case PanelState.DOWNLOADING:
        btn.textContent = '下载中...';
        btn.className = 'bmap-btn bmap-btn-primary';
        btn.disabled = true;
        progressArea.style.display = 'block';
        downloadBtn.style.display = 'none';
        this._setControlsEnabled(false);
        break;
      case PanelState.DONE:
        this._expand();
        btn.textContent = '重新开始';
        btn.className = 'bmap-btn bmap-btn-primary';
        btn.disabled = false;
        progressArea.style.display = 'block';
        downloadBtn.style.display = 'block';
        minimizedProgress.style.display = 'none';
        this._setControlsEnabled(true);
        break;
      case PanelState.ERROR:
        this._expand();
        btn.textContent = '重试';
        btn.className = 'bmap-btn bmap-btn-primary';
        btn.disabled = false;
        minimizedProgress.style.display = 'none';
        this._setControlsEnabled(true);
        break;
    }
  }

  _setControlsEnabled(enabled) {
    this.elements['bmap-zoom-slider'].disabled = !enabled;
    this.elements['mode-auto'].disabled = !enabled;
    this.elements['mode-all'].disabled = !enabled;
    this.elements['mode-group'].disabled = !enabled;
    this.elements['bmap-group-size'].disabled = !enabled || this.stitchMode !== 'group';
    this.elements['bmap-capture-w'].disabled = !enabled;
    this.elements['bmap-capture-h'].disabled = !enabled;
    this.elements['bmap-sample-rate'].disabled = !enabled;
  }

  setTotalSteps(total) {
    this.totalSteps = total;
    this._updateProgressText();
  }

  setCapturedCount(count) {
    this.capturedCount = count;
    this._updateProgressText();
    var pct = this.totalSteps > 0 ? Math.round((count / this.totalSteps) * 100) : 0;
    this.elements['bmap-progress-fill'].style.width = pct + '%';
    // Sync minimized progress bar
    this.elements['bmap-minimized-progress-fill'].style.width = pct + '%';
    this.elements['bmap-minimized-progress-text'].textContent = count + ' / ' + this.totalSteps;
  }

  _updateProgressText() {
    this.elements['bmap-progress-text'].textContent =
      '已截 ' + this.capturedCount + ' / ' + this.totalSteps + ' 张';
    this.elements['bmap-progress-count'].textContent =
      this.capturedCount + ' / ' + this.totalSteps;
  }

  _updateRouteInfo() {
    var hasRoute = (typeof hasValidRoute === 'function') ? hasValidRoute() : false;
    if (hasRoute) {
      this.elements['bmap-route-status'].textContent = '路线已检测 ✓';
      this.elements['bmap-route-status'].style.color = '#34a853';
      this.elements['bmap-start-btn'].disabled = false;
    } else {
      this.elements['bmap-route-status'].textContent = '请在页面上搜索路线';
      this.elements['bmap-route-status'].style.color = '#ea4335';
      this.elements['bmap-start-btn'].disabled = true;
    }
  }

  refreshRouteInfo() {
    this._updateRouteInfo();
  }

  showError(message) {
    var area = this.elements['bmap-message-area'];
    area.innerHTML = '<div class="bmap-error">' + message + '</div>';
  }

  showWarning(message) {
    var area = this.elements['bmap-message-area'];
    area.innerHTML = '<div class="bmap-warning">' + message + '</div>';
  }

  clearMessages() {
    this.elements['bmap-message-area'].innerHTML = '';
  }

  getConfig() {
    return {
      zoomLevel: this.zoomLevel,
      stitchMode: this.stitchMode,
      groupSize: this.groupSize,
      captureWidth:  this.captureWidth,
      captureHeight: this.captureHeight,
      sampleRate:    this.sampleRate,
    };
  }
}

// Global singleton — use var for cross-file accessibility
var sidePanel = new SidePanel();
