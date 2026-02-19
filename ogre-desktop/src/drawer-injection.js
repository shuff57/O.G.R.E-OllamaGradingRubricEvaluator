(function() {
  console.log('[O.G.R.E Drawer] Injection script running');
  
  // Singleton check - if drawer exists, just show it
  if (window.OgreDrawer) {
    console.log('[O.G.R.E Drawer] Already exists, showing');
    const existingDrawer = document.getElementById('ogre-drawer-root');
    if (existingDrawer) {
      existingDrawer.style.display = 'flex';
    }
    return;
  }

  class OgreDrawer {
    constructor() {
      console.log('[O.G.R.E Drawer] Initializing');
      this.state = {
        isCollapsed: false,
        width: 400,
        activeMode: 'grader', // grader, solver, batch, discovery
        batchRunning: false,
        activeProvider: 'ollama-local',
        activeModel: '',
        selectedRubric: null,
        screenshots: [],
        capturedImage: '',
        isCapturing: false,
        captureError: '',
        theme: 'dark' // Default to dark mode
      };

      this.modes = [
        { id: 'grader', label: 'Grader', icon: '📝' },
        { id: 'solver', label: 'Solver', icon: '💡' },
        { id: 'batch', label: 'Batch', icon: '⚡' },
        { id: 'discovery', label: 'Discover', icon: '🔍' }
      ];

      this.init();
    }

    init() {
      // Detect system preference for dark mode
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        this.state.theme = 'light';
      }

      this.injectStyles();
      this.createDOM();
      this.attachEventListeners();
      this.notifyDrawerChanged();
      window.OgreDrawer = this;
      console.log('O.G.R.E Drawer injected successfully');
    }

    injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        /* =========================================
           O.G.R.E Drawer Design System (Ported from sidepanel.html)
           ========================================= */
        
        /* Font Imports (load if possible, fallback to system) */
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Outfit:wght@400;700&family=Fredoka:wght@400;700&display=swap');
        @import url('https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css');

        #ogre-drawer-root {
          /* =========================================
             DARK MODE (Default / Technical / VS Code)
             ========================================= */
          --theme-name: 'dark';
          
          /* Colors */
          --color-bg-main: #0d1117;     /* GitHub Dark Dimmed / VS Code deeply dark */
          --color-bg-sidebar: #161b22;  /* Slightly lighter for sidebar */
          --color-bg-card: #161b22;
          --color-bg-card-hover: #21262d;
          
          --color-text-primary: #c9d1d9;
          --color-text-secondary: #8b949e;
          --color-text-muted: #484f58;

          /* Syntax Highlighting Accents */
          --color-primary: #58a6ff;     /* VS Code Blue */
          --color-primary-hover: #79c0ff;
          --color-primary-text: #0d1117;

          --color-secondary: #d2a8ff;   /* Purple */
          --color-accent: #79c0ff;      /* Cyan/Blue */
          
          --color-border: #30363d;
          --color-border-hover: #8b949e;

          /* Status Colors (Terminal Style) */
          --color-success: #3fb950;     /* Terminal Green */
          --color-warning: #d29922;     /* Terminal Yellow */
          --color-error: #f85149;       /* Terminal Red */
          --color-info: #58a6ff;        /* Blue */

          --color-success-ring: rgba(63, 185, 80, 0.2);
          --color-warning-ring: rgba(210, 153, 34, 0.2);
          --color-error-ring: rgba(248, 81, 73, 0.2);
          --color-info-ring: rgba(88, 166, 255, 0.2);

          --color-primary-bg: rgba(88, 166, 255, 0.1);
          --color-success-bg: rgba(63, 185, 80, 0.1);
          --color-warning-bg: rgba(210, 153, 34, 0.1);
          --color-error-bg: rgba(248, 81, 73, 0.1);
          --color-info-bg: rgba(88, 166, 255, 0.1);
          
          --color-bg-user-message: #1f6feb; /* Darker blue for dark mode */
          --color-bg-secondary: #30363d; /* Dark gray for secondary backgrounds */


          /* Typography - Technical */
          --font-display: 'JetBrains Mono', monospace, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
          --font-body: 'JetBrains Mono', monospace, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace; /* Monospace everything for that dev feel */
          --font-mono: 'JetBrains Mono', monospace, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;

          /* Spacing & Layout */
          --spacing-1: 0.25rem;
          --spacing-2: 0.5rem;
          --spacing-3: 0.75rem;
          --spacing-4: 1rem;
          --spacing-6: 1.5rem;
          --spacing-8: 2rem;
          --spacing-12: 3rem;
          
          /* Visual Details */
          --radius-sm: 2px;
          --radius-md: 4px;
          --radius-lg: 6px;
          --radius-full: 9999px;

          --shadow-sm: 0 1px 0 rgba(27, 31, 35, 0.04);
          --shadow-md: 0 3px 6px rgba(0, 0, 0, 0.4);
          --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);

          --transition-fast: 100ms cubic-bezier(0.4, 0, 0.2, 1);
          --transition-normal: 200ms cubic-bezier(0.4, 0, 0.2, 1);
          --transition-spring: 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275);

          /* Special Effects */
          --code-line-height: 1.5;
          --border-style: solid;

          /* Mode Specific Accents (Default Grader) */
          --color-mode-accent: #16a34a;
          --color-mode-accent-hover: #15803d;
          --color-mode-accent-ring: rgba(22, 163, 74, 0.2);

          /* Structural Base */
          position: fixed;
          top: 0;
          right: 0;
          height: 100vh;
          background-color: var(--color-bg-main);
          border-left: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          transition: width var(--transition-normal);
          overflow: hidden;
          z-index: 2147483647; /* Max z-index */
          box-shadow: -2px 0 8px rgba(0, 0, 0, 0.2);
          font-family: var(--font-body);
          color: var(--color-text-primary);
          box-sizing: border-box;
          line-height: 1.5;
        }
        
        #ogre-drawer-root[data-theme="light"] {
          --theme-name: 'light';

          /* Colors - Warm & Vibrant */
          --color-bg-main: #fffcf5;      /* Cream / Warm Paper */
          --color-bg-sidebar: #ffffff;
          --color-bg-card: #ffffff;
          --color-bg-card-hover: #fff9e6; /* Very subtle yellow tint on hover */

          --color-text-primary: #2d3748;
          --color-text-secondary: #718096;
          --color-text-muted: #a0aec0;

          /* Playful Accents */
          --color-primary: #ff6b6b;      /* Coral / Post-it Red-Pink */
          --color-primary-hover: #ff5252;
          --color-primary-text: #ffffff;

          --color-secondary: #4ecdc4;    /* Teal */
          --color-accent: #ffe66d;       /* Bright Yellow */

          --color-border: #edf2f7;
          --color-border-hover: #cbd5e0;

          /* Status Colors (Friendly) */
          --color-success: #06d6a0;      /* Minty Green */
          --color-warning: #ffd166;      /* Sunny Yellow */
          --color-error: #ef476f;        /* Berry Red */
          --color-info: #38bdf8;         /* Sky Blue */

          --color-success-ring: rgba(6, 214, 160, 0.3);
          --color-warning-ring: rgba(255, 209, 102, 0.4);
          --color-error-ring: rgba(239, 71, 111, 0.2);
          --color-info-ring: rgba(56, 189, 248, 0.3);

          --color-primary-bg: rgba(255, 107, 107, 0.1);
          --color-success-bg: rgba(6, 214, 160, 0.1);
          --color-warning-bg: rgba(255, 209, 102, 0.1);
          --color-error-bg: rgba(239, 71, 111, 0.1);
          --color-info-bg: #e0f2fe;      /* Light Blue */
          
          --color-bg-user-message: #e3f2fd; /* Light Blue */
          --color-bg-secondary: #eee;

          /* Typography - Friendly */
          --font-display: 'Fredoka', sans-serif, system-ui, -apple-system, BlinkMacSystemFont;
          --font-body: 'Outfit', sans-serif, system-ui, -apple-system, BlinkMacSystemFont;
          --font-mono: 'JetBrains Mono', monospace; /* Keep mono for code */

          /* Visual Details - Bubbly (Capped for Side Panel) */
          --radius-sm: 8px;
          --radius-md: 12px;
          --radius-lg: 20px;
          --radius-full: 9999px;

          --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.05);
          --shadow-md: 0 6px 12px rgba(0, 0, 0, 0.08), 0 3px 6px rgba(0,0,0,0.05);
          --shadow-lg: 0 15px 30px rgba(0, 0, 0, 0.1);

          --border-style: solid;
        }

        /* Mode Overrides via body class on #ogre-drawer-root */
        #ogre-drawer-root.solver-mode {
          --color-mode-accent: #2563eb;
          --color-mode-accent-hover: #1d4ed8;
          --color-mode-accent-ring: rgba(37, 99, 235, 0.2);
        }

        #ogre-drawer-root.batch-mode {
          --color-mode-accent: #d97706;
          --color-mode-accent-hover: #b45309;
          --color-mode-accent-ring: rgba(217, 119, 6, 0.2);
        }
        
        #ogre-drawer-root.discovery-mode {
          --color-mode-accent: #06b6d4; /* Cyan-500 */
          --color-mode-accent-hover: #0891b2;
          --color-mode-accent-ring: rgba(6, 182, 212, 0.2);
        }

        /* Reset box-sizing */
        #ogre-drawer-root * {
          box-sizing: border-box;
        }

        /* Drawer-specific Structural Classes */
        #ogre-drawer-root.collapsed {
          width: 60px !important;
        }
        
        #ogre-drawer-root.resizing {
          transition: none;
          user-select: none;
        }

        .ogre-resize-handle {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 8px;
          cursor: ew-resize;
          z-index: 2147483648;
        }
        
        /* Header & Navigation - Styled to match sidepanel.html logic */
        .ogre-panel-header {
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--spacing-4);
          border-bottom: 1px solid var(--color-border);
          flex-shrink: 0;
          background: var(--color-bg-sidebar);
        }

        .ogre-panel-title {
          font-family: var(--font-display);
          font-size: 1.1rem;
          margin: 0;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--color-text-primary);
        }

        .ogre-icon-btn {
          background: transparent;
          border: 1px solid transparent;
          color: var(--color-text-secondary);
          cursor: pointer;
          padding: var(--spacing-2);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition-fast);
        }
        .ogre-icon-btn:hover {
          background-color: var(--color-bg-card-hover);
          color: var(--color-text-primary);
          border-color: var(--color-border);
        }

        .ogre-mode-tabs {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          padding: var(--spacing-2);
          gap: var(--spacing-1);
          border-bottom: 1px solid var(--color-border);
          flex-shrink: 0;
          background: var(--color-bg-sidebar);
        }
        
        .collapsed .ogre-mode-tabs {
          grid-template-columns: 1fr;
        }

        .ogre-mode-tab {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: var(--spacing-1) var(--spacing-2);
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          cursor: pointer;
          color: var(--color-text-secondary);
          font-size: 0.75rem;
          font-weight: 500;
          transition: all 0.2s;
          font-family: var(--font-body);
        }
        .ogre-mode-tab:hover {
          background-color: var(--color-bg-card-hover);
          color: var(--color-text-primary);
        }
        .ogre-mode-tab.active {
          background-color: var(--color-primary-bg);
          color: var(--color-primary); /* Default to primary, overridden by mode */
          font-weight: 600;
          border-color: var(--color-primary);
        }
        
        /* Mode-specific active tab colors */
        #ogre-drawer-root.grader-mode .ogre-mode-tab.active { color: #16a34a; background: rgba(22, 163, 74, 0.1); border-color: #16a34a; }
        #ogre-drawer-root.solver-mode .ogre-mode-tab.active { color: #2563eb; background: rgba(37, 99, 235, 0.1); border-color: #2563eb; }
        #ogre-drawer-root.batch-mode .ogre-mode-tab.active { color: #d97706; background: rgba(217, 119, 6, 0.1); border-color: #d97706; }
        #ogre-drawer-root.discovery-mode .ogre-mode-tab.active { color: #06b6d4; background: rgba(6, 182, 212, 0.1); border-color: #06b6d4; }

        .ogre-mode-icon { font-size: 1.1rem; }
        
        .ogre-panel-content {
          flex: 1;
          overflow-y: auto;
          padding: var(--spacing-4);
          display: flex;
          flex-direction: column;
          gap: var(--spacing-4);
          background: var(--color-bg-main);
        }
        
        /* Scrollbar Styling */
        .ogre-panel-content::-webkit-scrollbar { width: 8px; }
        .ogre-panel-content::-webkit-scrollbar-track { background: var(--color-bg-sidebar); }
        .ogre-panel-content::-webkit-scrollbar-thumb { 
          background: var(--color-border); 
          border-radius: var(--radius-full);
        }
        .ogre-panel-content::-webkit-scrollbar-thumb:hover { background: var(--color-border-hover); }

        /* =========================================
           Core Component Styles (Scoped)
           ========================================= */
        
        /* Card */
        #ogre-drawer-root .card { 
          position: relative; 
          background: var(--color-bg-card); 
          padding: var(--spacing-2); 
          border-radius: var(--radius-lg); 
          box-shadow: none; 
          margin-bottom: var(--spacing-3); 
          border: 1px solid var(--color-border);
          overflow: hidden;
        }

        #ogre-drawer-root .card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--color-primary), var(--color-primary-hover));
          opacity: 0;
          transition: opacity 0.2s;
        }
        
        #ogre-drawer-root[data-theme="dark"] .card::before { opacity: 1; }
        
        #ogre-drawer-root .card:hover {
          border-color: var(--color-border-hover);
          box-shadow: var(--shadow-md);
          transition: border-color var(--transition-normal), box-shadow var(--transition-normal);
        }
        
        /* Typography */
        #ogre-drawer-root h3 { margin-top: 0; font-size: 14px; color: var(--color-text-primary); font-family: var(--font-display); font-weight: 700; }
        #ogre-drawer-root label { font-size: 12px; font-weight: bold; color: var(--color-text-secondary); display: block; margin-bottom: var(--spacing-1); }
        #ogre-drawer-root p { font-size: 13px; color: var(--color-text-secondary); line-height: 1.5; margin: 0 0 var(--spacing-2) 0; }
        
        /* Forms */
        #ogre-drawer-root input, 
        #ogre-drawer-root textarea, 
        #ogre-drawer-root select { 
          width: 100%; 
          padding: 8px; 
          box-sizing: border-box; 
          margin-bottom: var(--spacing-2); 
          border: 1px solid var(--color-border); 
          border-radius: var(--radius-sm);
          background-color: var(--color-bg-main);
          color: var(--color-text-primary);
          transition: all 0.2s;
          font-family: var(--font-body);
        }
        #ogre-drawer-root input:focus, 
        #ogre-drawer-root select:focus, 
        #ogre-drawer-root textarea:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-bg);
          outline: none;
        }
        
        /* Buttons */
        #ogre-drawer-root button.btn { 
          display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
          width: 100%; 
          background-color: var(--color-bg-sidebar); 
          border: 1px solid var(--color-border); 
          color: var(--color-text-primary);
          padding: 0.5rem 1rem; 
          border-radius: var(--radius-sm); 
          cursor: pointer; 
          font-weight: bold; 
          margin-bottom: var(--spacing-1); 
          transition: all 0.2s ease; 
          font-family: var(--font-body);
        }
        #ogre-drawer-root button.btn:hover { background-color: var(--color-bg-card-hover); border-color: var(--color-text-muted); }
        
        /* Primary Action Button */
        #ogre-drawer-root .btn-primary { 
          background-color: var(--color-mode-accent); 
          border-color: var(--color-mode-accent); 
          color: var(--color-primary-text); 
        }
        #ogre-drawer-root .btn-primary:hover { opacity: 0.9; background-color: var(--color-mode-accent-hover); }

        #ogre-drawer-root button.secondary { background: var(--color-bg-card-hover); color: var(--color-text-primary); }
        #ogre-drawer-root button.secondary:hover { background: var(--color-border-hover); }

        /* Utility */
        #ogre-drawer-root .flex-row { display: flex; gap: var(--spacing-2); }
        #ogre-drawer-root .flex-1 { flex: 1; }
        #ogre-drawer-root .hidden { display: none !important; }
      `;
      document.head.appendChild(style);
    }

    createDOM() {
      this.root = document.createElement('div');
      this.root.id = 'ogre-drawer-root';
      this.root.style.width = `${this.state.width}px`;
      
      // Apply theme
      this.root.setAttribute('data-theme', this.state.theme);
      this.root.classList.add(`${this.state.activeMode}-mode`);

      this.render();
      document.body.appendChild(this.root);
    }

    render() {
      // Clean update
      this.root.innerHTML = '';
      
      const { isCollapsed, activeMode, width, theme } = this.state;
      this.root.style.width = isCollapsed ? '60px' : `${width}px`;
      if (isCollapsed) this.root.classList.add('collapsed');
      else this.root.classList.remove('collapsed');
      
      // Update mode class on root for CSS variables
      this.root.className = ''; // Clear classes
      if (isCollapsed) this.root.classList.add('collapsed');
      this.root.classList.add(`${activeMode}-mode`);

      // Resize Handle
      if (!isCollapsed) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'ogre-resize-handle';
        resizeHandle.onmousedown = (e) => this.handleResizeStart(e);
        this.root.appendChild(resizeHandle);
      }

      // Header
      const header = document.createElement('div');
      header.className = 'ogre-panel-header';
      
      if (!isCollapsed) {
        const title = document.createElement('h2');
        title.className = 'ogre-panel-title';
        title.innerHTML = 'O.G.R.E <span style="opacity:0.6; font-size:0.8em; font-weight:400">Assistant</span>';
        header.appendChild(title);
        
        // Theme Toggle (Sun/Moon)
        const themeBtn = document.createElement('button');
        themeBtn.className = 'ogre-icon-btn';
        themeBtn.title = 'Toggle Theme';
        themeBtn.style.marginLeft = 'auto'; // Push to right
        themeBtn.onclick = () => this.toggleTheme();
        themeBtn.innerHTML = theme === 'dark' 
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-moon-stars-fill" viewBox="0 0 16 16"><path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/><path d="M10.794 3.148a.217.217 0 0 1 .412 0l.528 1.162c.06.134.233.134.293 0l.528-1.162a.217.217 0 0 1 .412 0l.528 1.162c.06.134.233.134.293 0l.528-1.162a.217.217 0 0 1 .412 0l.528 1.162c.06.134.233.134.293 0l.528-1.162a.217.217 0 0 1 .412 0l.528 1.162c.06.134.233.134.293 0l.528-1.162z"/></svg>` 
          : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-sun-fill" viewBox="0 0 16 16"><path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/></svg>`;
        header.appendChild(themeBtn);
      }

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'ogre-icon-btn';
      toggleBtn.onclick = () => this.toggleCollapse();
      toggleBtn.innerHTML = isCollapsed 
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>`;
      header.appendChild(toggleBtn);
      this.root.appendChild(header);

      // Mode Tabs
      const tabs = document.createElement('div');
      tabs.className = 'ogre-mode-tabs';
      this.modes.forEach(mode => {
        const tab = document.createElement('button');
        tab.className = `ogre-mode-tab ${activeMode === mode.id ? 'active' : ''}`;
        tab.onclick = () => this.setMode(mode.id);
        tab.innerHTML = `<span class="ogre-mode-icon">${mode.icon}</span>${!isCollapsed ? `<span>${mode.label}</span>` : ''}`;
        tabs.appendChild(tab);
      });
      this.root.appendChild(tabs);

      // Content Area
      if (!isCollapsed) {
        const content = document.createElement('div');
        content.className = 'ogre-panel-content';
        this.renderContent(content);
        this.root.appendChild(content);
      }
    }

    renderContent(container) {
      const { activeMode } = this.state;
      
      // Common: Provider Selector (Placeholder for now)
      if (['grader', 'batch', 'discovery'].includes(activeMode)) {
        const providerCard = document.createElement('div');
        providerCard.className = 'card';
        providerCard.innerHTML = `
          <label>AI Provider</label>
          <div class="flex-row">
            <select class="ogre-select flex-1">
              <option value="ollama-local" selected>Ollama (Local)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
              <option value="github">GitHub Models</option>
            </select>
            <div class="status-indicator" style="width:10px; height:10px; border-radius:50%; background:var(--color-success); align-self:center;"></div>
          </div>
          <select class="ogre-select" style="margin-bottom:0">
            <option value="llama3">Llama 3 (8B)</option>
            <option value="gemma2">Gemma 2 (9B)</option>
            <option value="mistral">Mistral v0.3</option>
          </select>
        `;
        container.appendChild(providerCard);
      }

      if (activeMode === 'grader') {
        const rubricCard = document.createElement('div');
        rubricCard.className = 'card';
        rubricCard.innerHTML = `
          <h3><i class="bi bi-card-checklist"></i> Rubric</h3>
          <p>Define criteria for assessment.</p>
          <button class="btn secondary"><i class="bi bi-pencil-square"></i> Edit Rubric</button>
        `;
        container.appendChild(rubricCard);

        const workCard = document.createElement('div');
        workCard.className = 'card';
        workCard.innerHTML = `
          <h3><i class="bi bi-easel"></i> Student Work</h3>
          <p>Capture screen area or select text to grade.</p>
          <button class="btn btn-primary" id="ogre-capture-btn"><i class="bi bi-camera-fill"></i> Capture & Grade</button>
        `;
        container.appendChild(workCard);
        
        // Bind events after adding to DOM
        setTimeout(() => {
          const btn = container.querySelector('#ogre-capture-btn');
          if(btn) btn.onclick = () => this.handleScreenshot();
        }, 0);
      }
      else if (activeMode === 'solver') {
        const chatCard = document.createElement('div');
        chatCard.className = 'card';
        chatCard.innerHTML = `
          <h3><i class="bi bi-chat-dots"></i> Solver Chat</h3>
          <div style="height: 200px; background: var(--color-bg-main); border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-bottom: var(--spacing-2); display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); font-size: 0.9em;">
            Start a conversation...
          </div>
          <div style="display: flex; gap: var(--spacing-1);">
            <input type="text" placeholder="Ask a question..." style="margin-bottom:0">
            <button class="btn btn-primary" style="width: auto; margin-bottom:0"><i class="bi bi-send-fill"></i></button>
          </div>
        `;
        container.appendChild(chatCard);
      }
      else if (activeMode === 'batch') {
         const batchCard = document.createElement('div');
         batchCard.className = 'card';
         batchCard.innerHTML = `
           <h3><i class="bi bi-lightning-charge-fill"></i> Batch Processing</h3>
           <p>Automated grading for supported platforms.</p>
           <div style="padding: var(--spacing-2); background: var(--color-warning-bg); border: 1px solid var(--color-warning-ring); border-radius: var(--radius-md); color: var(--color-warning); font-size: 0.9em; margin-bottom: var(--spacing-2);">
             <i class="bi bi-exclamation-triangle-fill"></i> No active batch page detected.
           </div>
           <button class="btn btn-primary" disabled>Start Batch</button>
         `;
         container.appendChild(batchCard);
      }
      else if (activeMode === 'discovery') {
         const discoveryCard = document.createElement('div');
         discoveryCard.className = 'card';
         discoveryCard.innerHTML = `
           <h3><i class="bi bi-search"></i> Element Discovery</h3>
           <p>Inspect page elements for custom selectors.</p>
           <button class="btn secondary"><i class="bi bi-crosshair"></i> Pick Element</button>
         `;
         container.appendChild(discoveryCard);
      }
    }

    toggleCollapse() {
      this.state.isCollapsed = !this.state.isCollapsed;
      this.render();
      this.notifyDrawerChanged();
    }
    
    toggleTheme() {
      this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
      this.root.setAttribute('data-theme', this.state.theme);
      this.render(); // Re-render to update icon
    }

    setMode(modeId) {
      this.state.activeMode = modeId;
      this.render();
    }

    handleResizeStart(e) {
      this.isResizing = true;
      e.preventDefault();
      this.root.classList.add('resizing');
      
      const moveHandler = (e) => {
        const newWidth = window.innerWidth - e.clientX;
        this.state.width = Math.max(300, Math.min(800, newWidth));
        this.root.style.width = `${this.state.width}px`;
      };

      const upHandler = () => {
        this.isResizing = false;
        this.root.classList.remove('resizing');
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
        this.notifyDrawerChanged();
      };

      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', upHandler);
    }

    async handleScreenshot() {
      console.log('Screenshot requested');
      
      // Set flag for polling system
      window.OgreDrawer._screenshotRequested = true;
      window.OgreDrawer._screenshotTimestamp = Date.now();
      
      // Hide drawer temporarily for clean screenshot
      const drawer = document.getElementById('ogre-drawer-root');
      if (drawer) {
        drawer.style.display = 'none';
      }
      
      // Listen for screenshot result
      const handleScreenshotResult = (event) => {
        if (drawer) {
          drawer.style.display = 'flex';
        }
        
        if (event.detail.success) {
          this.state.capturedImage = event.detail.dataUrl;
          this.state.screenshots.push(event.detail.dataUrl);
          // this.updateUI(); // Method not defined in original, implicit re-render needed?
          // For now, assume state update triggers something or just log
          console.log('Screenshot captured successfully');
        } else {
          this.state.captureError = event.detail.error || 'Screenshot capture failed';
          console.error('Screenshot capture failed:', event.detail.error);
        }
        
        window.removeEventListener('ogre-screenshot-result', handleScreenshotResult);
      };
      
      window.addEventListener('ogre-screenshot-result', handleScreenshotResult);
      
      // Restore drawer after timeout (failsafe)
      setTimeout(() => {
        if (drawer && drawer.style.display === 'none') {
          drawer.style.display = 'flex';
        }
      }, 5000);
    }

    notifyDrawerChanged() {
      // IPC to main process to let it know drawer size changed (if needed)
    }
    
    attachEventListeners() {
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
          e.preventDefault();
          this.toggleCollapse();
        }
      });
    }
  }

  // Initialize
  new OgreDrawer();
})();
