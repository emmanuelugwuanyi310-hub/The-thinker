// VS Code Web Application Core Logic
let monacoEditor = null;
let xtermInstance = null;
let xtermFitAddon = null;
let terminalSocket = null;

// Application State
const state = {
    currentTab: null,
    openTabs: [], // { path, name, isDirty, model, viewState, language }
    fileTree: [],
    settings: {
        theme: 'vs-dark',
        fontSize: 14,
        tabSize: 4,
        wordWrap: 'on',
        minimap: true
    },
    contextTarget: null,
    gitStatus: { branch: 'main', files: [] },
    activeSidebarPane: 'explorer',
    searchOptions: {
        matchCase: false,
        regex: false
    }
};

// Language mapping helper
function getLanguageFromPath(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    switch (ext) {
        case 'js':
        case 'mjs':
        case 'cjs':
            return 'javascript';
        case 'ts':
        case 'tsx':
            return 'typescript';
        case 'json':
            return 'json';
        case 'html':
        case 'htm':
            return 'html';
        case 'css':
        case 'scss':
        case 'less':
            return 'css';
        case 'py':
            return 'python';
        case 'sh':
        case 'bash':
            return 'shell';
        case 'md':
            return 'markdown';
        case 'yml':
        case 'yaml':
            return 'yaml';
        case 'sql':
            return 'sql';
        case 'xml':
        case 'svg':
            return 'xml';
        default:
            return 'plaintext';
    }
}

// Icon helper for files
function getFileIconClass(name, isDirectory) {
    if (isDirectory) return 'codicon-folder';
    const ext = name.split('.').pop().toLowerCase();
    switch (ext) {
        case 'js':
        case 'mjs':
            return 'codicon-file-code';
        case 'json':
            return 'codicon-json';
        case 'html':
            return 'codicon-code';
        case 'css':
            return 'codicon-symbol-color';
        case 'md':
            return 'codicon-markdown';
        case 'py':
            return 'codicon-file-binary';
        case 'png':
        case 'jpg':
        case 'svg':
        case 'gif':
            return 'codicon-file-media';
        default:
            return 'codicon-file';
    }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    initActivityBar();
    initMenubar();
    initSidebarResizer();
    initTerminalResizer();
    initQuickOpenAndPalette();
    initContextMenu();
    initSettingsModal();
    initShortcutsModal();
    initHotkeys();
    initSearchPane();
    initSCM();
    initRunPane();
    initExtensionsPane();

    // Load Monaco Editor
    initMonaco();

    // Load File Tree
    await loadFileTree();

    // Initialize Terminal
    initTerminal();

    // Update Git Status
    loadGitStatus();

    // Quick open welcome page or sample file
    renderWelcome();
});

/* ========================================================
   Monaco Editor Setup
======================================================== */
function initMonaco() {
    require.config({ paths: { vs: '/vendor/monaco/vs' } });
    require(['vs/editor/editor.main'], function () {
        monacoEditor = monaco.editor.create(document.getElementById('monaco-container'), {
            value: '',
            language: 'plaintext',
            theme: state.settings.theme,
            automaticLayout: true,
            fontSize: state.settings.fontSize,
            tabSize: state.settings.tabSize,
            wordWrap: state.settings.wordWrap,
            minimap: { enabled: state.settings.minimap },
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true
        });

        // Listen for cursor position changes
        monacoEditor.onDidChangeCursorPosition((e) => {
            document.getElementById('status-cursor-pos').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
        });

        // Track content modification / dirty state
        monacoEditor.onDidChangeModelContent(() => {
            if (!state.currentTab) return;
            if (!state.currentTab.isDirty) {
                state.currentTab.isDirty = true;
                renderTabs();
            }
        });

        // If files exist, open README.md or index.html by default
        if (state.openTabs.length === 0) {
            openFile('README.md').catch(() => {});
        }
    });
}

/* ========================================================
   File Operations & Tabs Management
======================================================== */
async function loadFileTree() {
    try {
        const res = await fetch('/api/tree');
        const data = await res.json();
        if (data.success) {
            state.fileTree = data.tree;
            renderFileTree(data.tree, document.getElementById('file-tree'));
        }
    } catch (err) {
        console.error('Failed to load file tree', err);
    }
}

function renderFileTree(nodes, container, level = 0) {
    container.innerHTML = '';
    nodes.forEach(node => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'tree-item-group';

        const row = document.createElement('div');
        row.className = 'tree-node';
        row.style.paddingLeft = `${level * 16 + 8}px`;

        const arrow = document.createElement('span');
        arrow.className = `codicon node-arrow ${node.type === 'directory' ? 'codicon-chevron-right' : ''}`;
        row.appendChild(arrow);

        const icon = document.createElement('span');
        icon.className = `codicon node-icon ${getFileIconClass(node.name, node.type === 'directory')}`;
        row.appendChild(icon);

        const nameLabel = document.createElement('span');
        nameLabel.className = 'tree-node-name';
        nameLabel.textContent = node.name;
        row.appendChild(nameLabel);

        nodeEl.appendChild(row);

        let childrenContainer = null;
        if (node.type === 'directory' && node.children) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            childrenContainer.style.display = 'none';
            renderFileTree(node.children, childrenContainer, level + 1);
            nodeEl.appendChild(childrenContainer);

            row.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = childrenContainer.style.display !== 'none';
                childrenContainer.style.display = isOpen ? 'none' : 'block';
                arrow.className = `codicon node-arrow ${isOpen ? 'codicon-chevron-right' : 'codicon-chevron-down'}`;
                icon.className = `codicon node-icon ${isOpen ? 'codicon-folder' : 'codicon-folder-opened'}`;
            });
        } else {
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.tree-node').forEach(n => n.classList.remove('selected'));
                row.classList.add('selected');
                openFile(node.path);
            });
        }

        // Right-click context menu
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.contextTarget = node;
            showContextMenu(e.clientX, e.clientY, node);
        });

        container.appendChild(nodeEl);
    });
}

async function openFile(relPath) {
    try {
        // Check if tab already exists
        let tab = state.openTabs.find(t => t.path === relPath);
        if (!tab) {
            const res = await fetch(`/api/file?path=${encodeURIComponent(relPath)}`);
            const data = await res.json();
            if (!data.success) {
                alert(`Error opening file: ${data.error}`);
                return;
            }
            const lang = getLanguageFromPath(relPath);
            const model = monaco.editor.createModel(data.content, lang, monaco.Uri.file(relPath));
            
            tab = {
                path: relPath,
                name: relPath.split('/').pop(),
                isDirty: false,
                model: model,
                viewState: null,
                language: lang
            };
            state.openTabs.push(tab);
        }

        selectTab(tab);
        saveRecentFile(relPath);
    } catch (err) {
        console.error('Error opening file:', err);
    }
}

function selectTab(tab) {
    // Save previous tab view state
    if (state.currentTab && state.currentTab.model && monacoEditor) {
        state.currentTab.viewState = monacoEditor.saveViewState();
    }

    state.currentTab = tab;
    renderTabs();

    if (!tab) {
        // No open tabs
        document.getElementById('welcome-view').style.display = 'flex';
        document.getElementById('breadcrumb-path').textContent = 'The-thinker';
        return;
    }

    document.getElementById('welcome-view').style.display = 'none';
    if (monacoEditor) {
        monacoEditor.setModel(tab.model);
        if (tab.viewState) {
            monacoEditor.restoreViewState(tab.viewState);
        }
        monacoEditor.focus();
    }

    // Update Status Bar and Breadcrumbs
    document.getElementById('breadcrumb-path').textContent = `The-thinker > ${tab.path.replace(/\//g, ' > ')}`;
    document.getElementById('status-language').textContent = tab.language.toUpperCase();
}

function renderTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';

    state.openTabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = `editor-tab ${state.currentTab === tab ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`;
        
        const icon = document.createElement('span');
        icon.className = `codicon ${getFileIconClass(tab.name, false)}`;
        tabEl.appendChild(icon);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = tab.name;
        tabEl.appendChild(nameSpan);

        const dirtyDot = document.createElement('span');
        dirtyDot.className = 'tab-dirty-indicator';
        tabEl.appendChild(dirtyDot);

        const closeBtn = document.createElement('span');
        closeBtn.className = 'codicon codicon-close tab-close';
        closeBtn.title = 'Close (Ctrl+W)';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(tab);
        });
        tabEl.appendChild(closeBtn);

        tabEl.addEventListener('click', () => {
            selectTab(tab);
        });

        container.appendChild(tabEl);
    });
}

function closeTab(tabToClose) {
    const index = state.openTabs.indexOf(tabToClose);
    if (index === -1) return;

    if (tabToClose.isDirty) {
        const discard = confirm(`${tabToClose.name} has unsaved changes. Close anyway?`);
        if (!discard) return;
    }

    if (tabToClose.model) {
        tabToClose.model.dispose();
    }

    state.openTabs.splice(index, 1);
    if (state.currentTab === tabToClose) {
        const nextTab = state.openTabs[index] || state.openTabs[index - 1] || null;
        selectTab(nextTab);
    } else {
        renderTabs();
    }
}

async function saveCurrentFile() {
    if (!state.currentTab) return;
    const content = state.currentTab.model.getValue();
    try {
        const res = await fetch('/api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: state.currentTab.path, content })
        });
        const data = await res.json();
        if (data.success) {
            state.currentTab.isDirty = false;
            renderTabs();
            loadGitStatus();
            printOutput(`Saved file: ${state.currentTab.path}`);
        } else {
            alert('Save failed: ' + data.error);
        }
    } catch (e) {
        alert('Save error: ' + e.message);
    }
}

async function saveAllFiles() {
    for (const tab of state.openTabs) {
        if (tab.isDirty) {
            const content = tab.model.getValue();
            await fetch('/api/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: tab.path, content })
            });
            tab.isDirty = false;
        }
    }
    renderTabs();
    loadGitStatus();
    printOutput('All open files saved.');
}

/* ========================================================
   Activity Bar & Sidebar Panes
======================================================== */
function initActivityBar() {
    const icons = document.querySelectorAll('#activitybar .activity-icon[data-view]');
    icons.forEach(icon => {
        icon.addEventListener('click', () => {
            const view = icon.getAttribute('data-view');
            const sidebar = document.getElementById('sidebar');

            if (state.activeSidebarPane === view && sidebar.style.display !== 'none') {
                // Toggle off
                sidebar.style.display = 'none';
                icon.classList.remove('active');
            } else {
                sidebar.style.display = 'flex';
                icons.forEach(i => i.classList.remove('active'));
                icon.classList.add('active');
                state.activeSidebarPane = view;

                // Show corresponding pane
                document.querySelectorAll('.sidebar-pane').forEach(p => p.classList.remove('active'));
                const pane = document.getElementById(`pane-${view}`);
                if (pane) pane.classList.add('active');

                // Trigger specialized updates
                if (view === 'scm') loadGitStatus();
            }
        });
    });

    document.getElementById('activity-settings').addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'flex';
    });
}

/* ========================================================
   Top Menubar
======================================================== */
function initMenubar() {
    document.querySelectorAll('.menubar .menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            item.classList.toggle('active');
        });
    });

    // Dismiss active menus on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.menubar .menu-item').forEach(m => m.classList.remove('active'));
    });

    // Menubar Actions Handlers
    document.querySelectorAll('.menu-row').forEach(row => {
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.menubar .menu-item').forEach(m => m.classList.remove('active'));
            const action = row.getAttribute('data-action');
            handleMenuAction(action);
        });
    });

    // Header buttons
    document.getElementById('btn-toggle-terminal-header').addEventListener('click', toggleTerminal);
    document.getElementById('btn-run-header').addEventListener('click', executeActiveFile);
    document.getElementById('btn-new-file').addEventListener('click', promptNewFile);
    document.getElementById('btn-new-folder').addEventListener('click', promptNewFolder);
    document.getElementById('btn-refresh-files').addEventListener('click', loadFileTree);
    document.getElementById('btn-collapse-folders').addEventListener('click', loadFileTree);
}

function handleMenuAction(action) {
    switch (action) {
        case 'new-file':
            promptNewFile();
            break;
        case 'new-folder':
            promptNewFolder();
            break;
        case 'save-file':
            saveCurrentFile();
            break;
        case 'save-all':
            saveAllFiles();
            break;
        case 'close-editor':
            if (state.currentTab) closeTab(state.currentTab);
            break;
        case 'close-all-editors':
            [...state.openTabs].forEach(closeTab);
            break;
        case 'undo':
            if (monacoEditor) monacoEditor.trigger('menu', 'undo');
            break;
        case 'redo':
            if (monacoEditor) monacoEditor.trigger('menu', 'redo');
            break;
        case 'find':
            if (monacoEditor) monacoEditor.getAction('actions.find').run();
            break;
        case 'replace':
            if (monacoEditor) monacoEditor.getAction('editor.action.startFindReplaceAction').run();
            break;
        case 'format-document':
            if (monacoEditor) monacoEditor.getAction('editor.action.formatDocument').run();
            break;
        case 'select-all':
            if (monacoEditor) monacoEditor.setSelection(monacoEditor.getModel().getFullModelRange());
            break;
        case 'copy-line-down':
            if (monacoEditor) monacoEditor.trigger('menu', 'editor.action.copyLinesDownAction');
            break;
        case 'command-palette':
            openCommandPalette('>');
            break;
        case 'quick-open':
            openCommandPalette('');
            break;
        case 'toggle-sidebar':
            toggleSidebar();
            break;
        case 'toggle-terminal':
            toggleTerminal();
            break;
        case 'toggle-minimap':
            state.settings.minimap = !state.settings.minimap;
            monacoEditor.updateOptions({ minimap: { enabled: state.settings.minimap } });
            break;
        case 'toggle-wordwrap':
            state.settings.wordWrap = state.settings.wordWrap === 'on' ? 'off' : 'on';
            monacoEditor.updateOptions({ wordWrap: state.settings.wordWrap });
            break;
        case 'run-code':
            executeActiveFile();
            break;
        case 'run-selection':
            executeSelection();
            break;
        case 'new-terminal':
            restartTerminal();
            break;
        case 'clear-terminal':
            if (xtermInstance) xtermInstance.clear();
            break;
        case 'welcome':
            selectTab(null);
            break;
        case 'keyboard-shortcuts':
            document.getElementById('shortcuts-modal').style.display = 'flex';
            break;
        case 'about':
            alert('Visual Studio Code — Web Edition\nPowered by Monaco Editor, XTerm.js, and Node.js');
            break;
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isHidden = sidebar.style.display === 'none';
    sidebar.style.display = isHidden ? 'flex' : 'none';
}

/* ========================================================
   Interactive Terminal (xterm.js + WebSocket + PTY)
======================================================== */
function initTerminal() {
    const container = document.getElementById('terminal-container');
    xtermInstance = new Terminal({
        theme: {
            background: '#181818',
            foreground: '#cccccc',
            cursor: '#ffffff',
            selection: '#3a3d41',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#e5e5e5'
        },
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 13,
        cursorBlink: true,
        convertEol: true
    });

    xtermFitAddon = new FitAddon.FitAddon();
    xtermInstance.loadAddon(xtermFitAddon);
    xtermInstance.open(container);
    xtermFitAddon.fit();

    connectTerminalSocket();

    window.addEventListener('resize', () => {
        if (xtermFitAddon) {
            xtermFitAddon.fit();
            sendTerminalResize();
        }
    });

    // Panel tabs switching
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panel = tab.getAttribute('data-panel');
            document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel-view').forEach(v => v.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`view-${panel}`).classList.add('active');
            if (panel === 'terminal' && xtermFitAddon) {
                setTimeout(() => {
                    xtermFitAddon.fit();
                    sendTerminalResize();
                }, 50);
            }
        });
    });

    document.getElementById('btn-terminal-clear').addEventListener('click', () => {
        if (xtermInstance) xtermInstance.clear();
    });
    document.getElementById('btn-terminal-new').addEventListener('click', restartTerminal);
    document.getElementById('btn-terminal-close').addEventListener('click', toggleTerminal);
    document.getElementById('btn-terminal-maximize').addEventListener('click', () => {
        const panel = document.getElementById('panel-area');
        if (panel.style.height === '70vh') {
            panel.style.height = '220px';
        } else {
            panel.style.height = '70vh';
        }
        if (xtermFitAddon) xtermFitAddon.fit();
    });
}

function connectTerminalSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${protocol}//${window.location.host}`;
    terminalSocket = new WebSocket(socketUrl);

    terminalSocket.onopen = () => {
        sendTerminalResize();
    };

    terminalSocket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'output') {
                xtermInstance.write(msg.data);
            } else if (msg.type === 'exit') {
                xtermInstance.write('\r\n[Process exited. Restarting shell...]\r\n');
                setTimeout(connectTerminalSocket, 1000);
            }
        } catch (e) {
            xtermInstance.write(event.data);
        }
    };

    xtermInstance.onData((data) => {
        if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
            terminalSocket.send(JSON.stringify({ type: 'input', data }));
        }
    });
}

function sendTerminalResize() {
    if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN && xtermInstance) {
        terminalSocket.send(JSON.stringify({
            type: 'resize',
            cols: xtermInstance.cols,
            rows: xtermInstance.rows
        }));
    }
}

function restartTerminal() {
    if (terminalSocket) {
        terminalSocket.close();
    }
    if (xtermInstance) {
        xtermInstance.reset();
    }
    connectTerminalSocket();
}

function toggleTerminal() {
    const panel = document.getElementById('panel-area');
    const resizer = document.getElementById('resizer-terminal');
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        resizer.style.display = 'block';
        if (xtermFitAddon) {
            setTimeout(() => {
                xtermFitAddon.fit();
                sendTerminalResize();
            }, 50);
        }
    } else {
        panel.style.display = 'none';
        resizer.style.display = 'none';
    }
}

/* ========================================================
   Resizers for Sidebar & Terminal
======================================================== */
function initSidebarResizer() {
    const resizer = document.getElementById('resizer-sidebar');
    const sidebar = document.getElementById('sidebar');

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX - 48; // Activity bar is 48px
        if (newWidth > 120 && newWidth < 800) {
            sidebar.style.width = `${newWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = 'default';
        }
    });
}

function initTerminalResizer() {
    const resizer = document.getElementById('resizer-terminal');
    const panel = document.getElementById('panel-area');

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'row-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newHeight = window.innerHeight - e.clientY - 22; // Statusbar is 22px
        if (newHeight > 60 && newHeight < window.innerHeight * 0.85) {
            panel.style.height = `${newHeight}px`;
            if (xtermFitAddon) xtermFitAddon.fit();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = 'default';
            if (xtermFitAddon) {
                xtermFitAddon.fit();
                sendTerminalResize();
            }
        }
    });
}

/* ========================================================
   Quick Open & Command Palette (Ctrl+P, Ctrl+Shift+P)
======================================================== */
const COMMANDS = [
    { label: 'File: New File', action: () => promptNewFile(), kbd: 'Ctrl+N' },
    { label: 'File: Save', action: () => saveCurrentFile(), kbd: 'Ctrl+S' },
    { label: 'File: Save All', action: () => saveAllFiles(), kbd: '' },
    { label: 'View: Toggle Terminal', action: () => toggleTerminal(), kbd: 'Ctrl+`' },
    { label: 'View: Toggle Side Bar', action: () => toggleSidebar(), kbd: 'Ctrl+B' },
    { label: 'View: Toggle Minimap', action: () => handleMenuAction('toggle-minimap'), kbd: '' },
    { label: 'View: Toggle Word Wrap', action: () => handleMenuAction('toggle-wordwrap'), kbd: 'Alt+Z' },
    { label: 'Preferences: Color Theme', action: () => openSettings(), kbd: '' },
    { label: 'Help: Keyboard Shortcuts', action: () => { document.getElementById('shortcuts-modal').style.display = 'flex'; }, kbd: 'Ctrl+K Ctrl+S' },
    { label: 'Run: Execute Active File', action: () => executeActiveFile(), kbd: 'F5' },
    { label: 'Git: Refresh Status', action: () => loadGitStatus(), kbd: '' },
    { label: 'Terminal: Clear Terminal', action: () => { if (xtermInstance) xtermInstance.clear(); }, kbd: '' }
];

function initQuickOpenAndPalette() {
    const modal = document.getElementById('palette-modal');
    const input = document.getElementById('palette-input');
    const trigger = document.getElementById('quick-open-trigger');

    trigger.addEventListener('click', () => openCommandPalette(''));

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    input.addEventListener('input', () => {
        renderPaletteItems(input.value);
    });

    input.addEventListener('keydown', (e) => {
        const list = document.getElementById('palette-list');
        const items = list.querySelectorAll('.palette-item');
        let selectedIndex = [...items].findIndex(i => i.classList.contains('selected'));

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (selectedIndex < items.length - 1) {
                items[selectedIndex]?.classList.remove('selected');
                items[selectedIndex + 1]?.classList.add('selected');
                items[selectedIndex + 1]?.scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (selectedIndex > 0) {
                items[selectedIndex]?.classList.remove('selected');
                items[selectedIndex - 1]?.classList.add('selected');
                items[selectedIndex - 1]?.scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const activeItem = list.querySelector('.palette-item.selected');
            if (activeItem) activeItem.click();
        } else if (e.key === 'Escape') {
            modal.style.display = 'none';
        }
    });
}

function openCommandPalette(prefix = '') {
    const modal = document.getElementById('palette-modal');
    const input = document.getElementById('palette-input');
    modal.style.display = 'flex';
    input.value = prefix;
    input.focus();
    renderPaletteItems(prefix);
}

function renderPaletteItems(query) {
    const list = document.getElementById('palette-list');
    list.innerHTML = '';

    const isCommand = query.startsWith('>');
    const filter = isCommand ? query.substring(1).trim().toLowerCase() : query.trim().toLowerCase();

    if (isCommand) {
        const filtered = COMMANDS.filter(c => c.label.toLowerCase().includes(filter));
        filtered.forEach((cmd, idx) => {
            const item = document.createElement('div');
            item.className = `palette-item ${idx === 0 ? 'selected' : ''}`;
            item.innerHTML = `<span>${cmd.label}</span><kbd>${cmd.kbd}</kbd>`;
            item.addEventListener('click', () => {
                document.getElementById('palette-modal').style.display = 'none';
                cmd.action();
            });
            list.appendChild(item);
        });
    } else {
        // Search files in tree
        const flatFiles = [];
        function flatten(nodes) {
            for (const n of nodes) {
                if (n.type === 'file') flatFiles.push(n);
                if (n.children) flatten(n.children);
            }
        }
        flatten(state.fileTree);

        const filtered = flatFiles.filter(f => f.path.toLowerCase().includes(filter));
        filtered.slice(0, 30).forEach((file, idx) => {
            const item = document.createElement('div');
            item.className = `palette-item ${idx === 0 ? 'selected' : ''}`;
            item.innerHTML = `<span><i class="codicon ${getFileIconClass(file.name, false)}"></i> ${file.path}</span>`;
            item.addEventListener('click', () => {
                document.getElementById('palette-modal').style.display = 'none';
                openFile(file.path);
            });
            list.appendChild(item);
        });
    }
}

/* ========================================================
   Search Pane (Global Workspace Search)
======================================================== */
function initSearchPane() {
    const searchInput = document.getElementById('search-input');
    const matchCaseBtn = document.getElementById('opt-match-case');
    const regexBtn = document.getElementById('opt-regex');
    const replaceInput = document.getElementById('replace-input');
    const replaceAllBtn = document.getElementById('btn-replace-all');

    matchCaseBtn.addEventListener('click', () => {
        state.searchOptions.matchCase = !state.searchOptions.matchCase;
        matchCaseBtn.classList.toggle('active', state.searchOptions.matchCase);
        runGlobalSearch();
    });

    regexBtn.addEventListener('click', () => {
        state.searchOptions.regex = !state.searchOptions.regex;
        regexBtn.classList.toggle('active', state.searchOptions.regex);
        runGlobalSearch();
    });

    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runGlobalSearch, 300);
    });

    replaceAllBtn.addEventListener('click', async () => {
        const query = searchInput.value;
        const replaceWith = replaceInput.value;
        if (!query) return;
        if (!confirm(`Replace all occurrences of "${query}" with "${replaceWith}"?`)) return;

        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&matchCase=${state.searchOptions.matchCase}&regex=${state.searchOptions.regex}`);
            const data = await res.json();
            if (data.success && data.results.length > 0) {
                // Group by file
                const files = [...new Set(data.results.map(r => r.file))];
                for (const file of files) {
                    const fRes = await fetch(`/api/file?path=${encodeURIComponent(file)}`);
                    const fData = await fRes.json();
                    if (fData.success) {
                        let newContent = '';
                        if (state.searchOptions.regex) {
                            const reg = new RegExp(query, state.searchOptions.matchCase ? 'g' : 'gi');
                            newContent = fData.content.replace(reg, replaceWith);
                        } else {
                            newContent = fData.content.replaceAll(query, replaceWith);
                        }
                        await fetch('/api/file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: file, content: newContent })
                        });
                    }
                }
                alert('Replace complete!');
                runGlobalSearch();
                loadFileTree();
            }
        } catch (e) {
            alert('Replace error: ' + e.message);
        }
    });
}

async function runGlobalSearch() {
    const query = document.getElementById('search-input').value.trim();
    const resultsContainer = document.getElementById('search-results');
    const summary = document.getElementById('search-summary');

    if (!query) {
        resultsContainer.innerHTML = '';
        summary.textContent = '';
        return;
    }

    summary.textContent = 'Searching...';
    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&matchCase=${state.searchOptions.matchCase}&regex=${state.searchOptions.regex}`);
        const data = await res.json();
        if (data.success) {
            summary.textContent = `${data.results.length} results found`;
            resultsContainer.innerHTML = '';
            data.results.forEach(item => {
                const row = document.createElement('div');
                row.className = 'search-result-item';
                row.innerHTML = `<div class="search-result-file">${item.file}:${item.line}</div><div class="search-result-match">${escapeHtml(item.text)}</div>`;
                row.addEventListener('click', async () => {
                    await openFile(item.file);
                    if (monacoEditor) {
                        monacoEditor.revealLineInCenter(item.line);
                        monacoEditor.setPosition({ lineNumber: item.line, column: 1 });
                    }
                });
                resultsContainer.appendChild(row);
            });
        }
    } catch (e) {
        summary.textContent = 'Search failed: ' + e.message;
    }
}

/* ========================================================
   Source Control (Git Integration)
======================================================== */
function initSCM() {
    document.getElementById('btn-git-refresh').addEventListener('click', loadGitStatus);
    document.getElementById('btn-git-commit').addEventListener('click', commitChanges);

    document.getElementById('git-commit-msg').addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            commitChanges();
        }
    });
}

async function loadGitStatus() {
    try {
        const res = await fetch('/api/git/status');
        const data = await res.json();
        if (data.success) {
            state.gitStatus = data;
            document.getElementById('status-branch-name').textContent = data.branch;
            const badge = document.getElementById('git-badge');
            const scmCount = document.getElementById('scm-changes-count');
            const count = data.files.length;

            scmCount.textContent = count;
            if (count > 0) {
                badge.style.display = 'block';
                badge.textContent = count;
            } else {
                badge.style.display = 'none';
            }

            const list = document.getElementById('scm-files-list');
            list.innerHTML = '';
            data.files.forEach(f => {
                const item = document.createElement('div');
                item.className = 'scm-item';
                item.innerHTML = `<span>${f.file}</span><span class="scm-badge ${f.status.trim()}">${f.status.trim()}</span>`;
                item.addEventListener('click', () => {
                    openFile(f.file);
                });
                list.appendChild(item);
            });
        }
    } catch (e) {
        console.error('Git status error', e);
    }
}

async function commitChanges() {
    const msg = document.getElementById('git-commit-msg').value.trim();
    if (!msg) {
        alert('Please enter a commit message.');
        return;
    }

    try {
        const res = await fetch('/api/git/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('git-commit-msg').value = '';
            loadGitStatus();
            printOutput(`[Git Commit] ${data.message}`);
        } else {
            alert('Commit error: ' + data.error);
        }
    } catch (e) {
        alert('Commit failed: ' + e.message);
    }
}

/* ========================================================
   Run & Debug Execution
======================================================== */
function initRunPane() {
    document.getElementById('btn-run-project').addEventListener('click', executeActiveFile);
}

async function executeActiveFile() {
    if (!state.currentTab) {
        alert('No active file to run!');
        return;
    }

    // Auto-save before running
    if (state.currentTab.isDirty) {
        await saveCurrentFile();
    }

    const outputArea = document.getElementById('run-output');
    outputArea.textContent = `Running ${state.currentTab.path}...\n`;

    // Activate panel & run tab
    const activityIcon = document.querySelector('.activity-icon[data-view="run"]');
    activityIcon.click();

    try {
        const code = state.currentTab.model.getValue();
        const res = await fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                language: state.currentTab.language
            })
        });
        const data = await res.json();
        outputArea.textContent = `[Exit Code ${data.exitCode}]\n`;
        if (data.stdout) outputArea.textContent += `--- Standard Output ---\n${data.stdout}\n`;
        if (data.stderr) outputArea.textContent += `--- Standard Error ---\n${data.stderr}\n`;
    } catch (e) {
        outputArea.textContent += `Execution failed: ${e.message}\n`;
    }
}

async function executeSelection() {
    if (!monacoEditor || !state.currentTab) return;
    const selection = monacoEditor.getSelection();
    const selectedText = monacoEditor.getModel().getValueInRange(selection);
    if (!selectedText) {
        executeActiveFile();
        return;
    }

    const outputArea = document.getElementById('run-output');
    outputArea.textContent = `Running selected code (${state.currentTab.language})...\n`;

    const activityIcon = document.querySelector('.activity-icon[data-view="run"]');
    activityIcon.click();

    try {
        const res = await fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: selectedText,
                language: state.currentTab.language
            })
        });
        const data = await res.json();
        outputArea.textContent = `[Exit Code ${data.exitCode}]\n`;
        if (data.stdout) outputArea.textContent += data.stdout;
        if (data.stderr) outputArea.textContent += data.stderr;
    } catch (e) {
        outputArea.textContent += `Execution error: ${e.message}`;
    }
}

/* ========================================================
   Extensions Marketplace
======================================================== */
function initExtensionsPane() {
    const list = document.getElementById('extensions-list');
    const extensions = [
        { name: 'JavaScript and TypeScript Language Features', publisher: 'Microsoft', desc: 'Provides rich language support for JS/TS', icon: 'codicon-code' },
        { name: 'Python', publisher: 'Microsoft', desc: 'IntelliSense, linting, debugging, code navigation for Python', icon: 'codicon-file-binary' },
        { name: 'GitHub Copilot', publisher: 'GitHub', desc: 'AI pair programmer that helps you write code faster', icon: 'codicon-copilot' },
        { name: 'Prettier - Code formatter', publisher: 'Prettier', desc: 'Code formatter using prettier', icon: 'codicon-symbol-misc' },
        { name: 'GitLens — Git supercharged', publisher: 'GitKraken', desc: 'Supercharge Git within VS Code', icon: 'codicon-git-branch' },
        { name: 'ESLint', publisher: 'Microsoft', desc: 'Integrates ESLint into VS Code', icon: 'codicon-check' }
    ];

    list.innerHTML = '';
    extensions.forEach(ext => {
        const card = document.createElement('div');
        card.className = 'extension-card';
        card.innerHTML = `
            <div class="codicon ${ext.icon} ext-icon"></div>
            <div>
                <h4>${ext.name}</h4>
                <p style="font-size:10px; color:#007acc;">${ext.publisher}</p>
                <p>${ext.desc}</p>
                <button class="btn-primary" style="margin-top:6px; font-size:11px; padding:2px 8px;">Installed</button>
            </div>
        `;
        list.appendChild(card);
    });

    document.getElementById('ext-search-input').addEventListener('input', (e) => {
        const filter = e.target.value.toLowerCase();
        const cards = list.querySelectorAll('.extension-card');
        cards.forEach((card, idx) => {
            const match = extensions[idx].name.toLowerCase().includes(filter) || extensions[idx].desc.toLowerCase().includes(filter);
            card.style.display = match ? 'flex' : 'none';
        });
    });
}

/* ========================================================
   Context Menu (Right Click on Files)
======================================================== */
function initContextMenu() {
    const menu = document.getElementById('context-menu');
    document.addEventListener('click', () => {
        menu.style.display = 'none';
    });
}

function showContextMenu(x, y, target) {
    const menu = document.getElementById('context-menu');
    menu.innerHTML = `
        <div class="context-menu-item" id="ctx-new-file"><i class="codicon codicon-new-file"></i> New File</div>
        <div class="context-menu-item" id="ctx-new-folder"><i class="codicon codicon-new-folder"></i> New Folder</div>
        <div class="menu-separator"></div>
        <div class="context-menu-item" id="ctx-rename"><i class="codicon codicon-edit"></i> Rename...</div>
        <div class="context-menu-item" id="ctx-delete"><i class="codicon codicon-trash"></i> Delete</div>
    `;

    menu.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 150)}px`;
    menu.style.display = 'block';

    const parentDir = target.type === 'directory' ? target.path : target.path.split('/').slice(0, -1).join('/');

    document.getElementById('ctx-new-file').addEventListener('click', () => promptNewFile(parentDir));
    document.getElementById('ctx-new-folder').addEventListener('click', () => promptNewFolder(parentDir));
    document.getElementById('ctx-rename').addEventListener('click', () => promptRename(target.path));
    document.getElementById('ctx-delete').addEventListener('click', () => promptDelete(target.path));
}

/* ========================================================
   File System Modals / Actions
======================================================== */
async function promptNewFile(baseDir = '') {
    const fileName = prompt('Enter new file path (e.g. src/app.js):', baseDir ? `${baseDir}/newFile.js` : 'newFile.js');
    if (!fileName) return;

    try {
        const res = await fetch('/api/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fileName, type: 'file' })
        });
        const data = await res.json();
        if (data.success) {
            await loadFileTree();
            openFile(fileName);
        } else {
            alert('Error creating file: ' + data.error);
        }
    } catch (e) {
        alert('Request failed: ' + e.message);
    }
}

async function promptNewFolder(baseDir = '') {
    const folderName = prompt('Enter new directory path:', baseDir ? `${baseDir}/newFolder` : 'newFolder');
    if (!folderName) return;

    try {
        const res = await fetch('/api/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: folderName, type: 'directory' })
        });
        const data = await res.json();
        if (data.success) {
            await loadFileTree();
        } else {
            alert('Error creating directory: ' + data.error);
        }
    } catch (e) {
        alert('Request failed: ' + e.message);
    }
}

async function promptRename(oldPath) {
    const newPath = prompt('Enter new name or path:', oldPath);
    if (!newPath || newPath === oldPath) return;

    try {
        const res = await fetch('/api/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath, newPath })
        });
        const data = await res.json();
        if (data.success) {
            // Update open tab if renamed
            const tab = state.openTabs.find(t => t.path === oldPath);
            if (tab) {
                tab.path = newPath;
                tab.name = newPath.split('/').pop();
            }
            await loadFileTree();
            renderTabs();
        } else {
            alert('Rename failed: ' + data.error);
        }
    } catch (e) {
        alert('Rename error: ' + e.message);
    }
}

async function promptDelete(relPath) {
    if (!confirm(`Are you sure you want to delete '${relPath}'?`)) return;

    try {
        const res = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: relPath })
        });
        const data = await res.json();
        if (data.success) {
            const tab = state.openTabs.find(t => t.path === relPath);
            if (tab) closeTab(tab);
            await loadFileTree();
        } else {
            alert('Delete failed: ' + data.error);
        }
    } catch (e) {
        alert('Delete error: ' + e.message);
    }
}

/* ========================================================
   Keyboard Shortcuts & Hotkeys
======================================================== */
function initHotkeys() {
    window.addEventListener('keydown', (e) => {
        // Ctrl+S: Save
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.shiftKey) {
            e.preventDefault();
            saveCurrentFile();
        }
        // Ctrl+Shift+S: Save All
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveAllFiles();
        }
        // Ctrl+P: Quick Open
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && !e.shiftKey) {
            e.preventDefault();
            openCommandPalette('');
        }
        // Ctrl+Shift+P: Command Palette
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            openCommandPalette('>');
        }
        // Ctrl+W: Close Tab
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
            e.preventDefault();
            if (state.currentTab) closeTab(state.currentTab);
        }
        // Ctrl+B: Toggle Sidebar
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
        // Ctrl+`: Toggle Terminal
        else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
            e.preventDefault();
            toggleTerminal();
        }
        // F5: Run active code
        else if (e.key === 'F5') {
            e.preventDefault();
            executeActiveFile();
        }
        // Ctrl+Shift+F: Global Search
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            const searchIcon = document.querySelector('.activity-icon[data-view="search"]');
            searchIcon.click();
            setTimeout(() => document.getElementById('search-input').focus(), 50);
        }
        // Escape closes any modal
        else if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
        }
    });
}

/* ========================================================
   Settings & Customization
======================================================== */
function initSettingsModal() {
    const modal = document.getElementById('settings-modal');
    document.getElementById('btn-close-settings').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    const themeSelect = document.getElementById('setting-theme');
    const fontSizeInput = document.getElementById('setting-font-size');
    const tabSizeInput = document.getElementById('setting-tab-size');
    const wrapSelect = document.getElementById('setting-word-wrap');
    const minimapCheck = document.getElementById('setting-minimap');

    themeSelect.addEventListener('change', () => {
        const val = themeSelect.value;
        state.settings.theme = val;
        monaco.editor.setTheme(val);
        document.body.className = val === 'vs' ? 'theme-light' : (val === 'hc-black' ? 'theme-hc' : 'theme-dark');
    });

    fontSizeInput.addEventListener('change', () => {
        const val = parseInt(fontSizeInput.value, 10);
        state.settings.fontSize = val;
        monacoEditor.updateOptions({ fontSize: val });
    });

    tabSizeInput.addEventListener('change', () => {
        const val = parseInt(tabSizeInput.value, 10);
        state.settings.tabSize = val;
        monacoEditor.updateOptions({ tabSize: val });
    });

    wrapSelect.addEventListener('change', () => {
        const val = wrapSelect.value;
        state.settings.wordWrap = val;
        monacoEditor.updateOptions({ wordWrap: val });
    });

    minimapCheck.addEventListener('change', () => {
        const val = minimapCheck.checked;
        state.settings.minimap = val;
        monacoEditor.updateOptions({ minimap: { enabled: val } });
    });

    document.getElementById('status-theme-toggle').addEventListener('click', () => {
        modal.style.display = 'flex';
    });
}

function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
}

function initShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    document.getElementById('btn-close-shortcuts').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

/* ========================================================
   Welcome Page & Utilities
======================================================== */
function renderWelcome() {
    document.getElementById('welcome-new-file').addEventListener('click', (e) => {
        e.preventDefault();
        promptNewFile();
    });
    document.getElementById('welcome-open-folder').addEventListener('click', (e) => {
        e.preventDefault();
        loadFileTree();
    });
    document.getElementById('welcome-quick-open').addEventListener('click', (e) => {
        e.preventDefault();
        openCommandPalette('');
    });

    renderRecentFiles();
}

function saveRecentFile(filePath) {
    let recents = JSON.parse(localStorage.getItem('vscode_recents') || '[]');
    recents = recents.filter(r => r !== filePath);
    recents.unshift(filePath);
    if (recents.length > 8) recents.pop();
    localStorage.setItem('vscode_recents', JSON.stringify(recents));
    renderRecentFiles();
}

function renderRecentFiles() {
    const recentsContainer = document.getElementById('recent-files-list');
    const recents = JSON.parse(localStorage.getItem('vscode_recents') || '["index.html", "README.md", "server/index.js"]');
    recentsContainer.innerHTML = '';
    recents.forEach(file => {
        const a = document.createElement('a');
        a.href = '#';
        a.innerHTML = `<i class="codicon ${getFileIconClass(file, false)}"></i> ${file}`;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            openFile(file);
        });
        recentsContainer.appendChild(a);
    });
}

function printOutput(msg) {
    const pre = document.getElementById('output-console-log');
    pre.textContent += `\n[${new Date().toLocaleTimeString()}] ${msg}`;
    pre.scrollTop = pre.scrollHeight;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
