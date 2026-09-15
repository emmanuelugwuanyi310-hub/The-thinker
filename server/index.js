const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static vendor files
app.use('/vendor/monaco', express.static(path.join(WORKSPACE_ROOT, 'node_modules/monaco-editor/min')));
app.use('/vendor/xterm', express.static(path.join(WORKSPACE_ROOT, 'node_modules/xterm')));
app.use('/vendor/xterm-addon-fit', express.static(path.join(WORKSPACE_ROOT, 'node_modules/xterm-addon-fit')));
app.use('/vendor/codicons', express.static(path.join(WORKSPACE_ROOT, 'node_modules/@vscode/codicons/dist')));

// Serve root and public assets
app.use(express.static(WORKSPACE_ROOT));
app.use(express.static(path.join(WORKSPACE_ROOT, 'public')));

// Safe path resolution
function safePath(relPath) {
    if (!relPath) return WORKSPACE_ROOT;
    const cleanRel = relPath.replace(/^(\.\.[\/\\])+/, '');
    const resolved = path.resolve(WORKSPACE_ROOT, cleanRel);
    if (!resolved.startsWith(WORKSPACE_ROOT)) {
        return WORKSPACE_ROOT;
    }
    return resolved;
}

// API: File tree
app.get('/api/tree', (req, res) => {
    try {
        function getDirectoryTree(dir, depth = 0) {
            if (depth > 6) return [];
            const items = fs.readdirSync(dir, { withFileTypes: true });
            const result = [];
            for (const item of items) {
                if (item.name === '.git' || item.name === 'node_modules') continue;
                const fullPath = path.join(dir, item.name);
                const relPath = path.relative(WORKSPACE_ROOT, fullPath);
                if (item.isDirectory()) {
                    result.push({
                        name: item.name,
                        path: relPath,
                        type: 'directory',
                        children: getDirectoryTree(fullPath, depth + 1)
                    });
                } else {
                    result.push({
                        name: item.name,
                        path: relPath,
                        type: 'file',
                        size: fs.statSync(fullPath).size
                    });
                }
            }
            // Sort: directories first, then files alphabetically
            return result.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            });
        }
        const tree = getDirectoryTree(WORKSPACE_ROOT);
        res.json({ success: true, root: WORKSPACE_ROOT, tree });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Read file
app.get('/api/file', (req, res) => {
    try {
        const filePath = safePath(req.query.path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            return res.status(400).json({ success: false, error: 'Target is a directory' });
        }
        const content = fs.readFileSync(filePath, 'utf8');
        res.json({ success: true, content, path: path.relative(WORKSPACE_ROOT, filePath) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Save file
app.post('/api/file', (req, res) => {
    try {
        const { path: relPath, content } = req.body;
        if (!relPath) return res.status(400).json({ success: false, error: 'Path required' });
        const filePath = safePath(relPath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content || '', 'utf8');
        res.json({ success: true, path: path.relative(WORKSPACE_ROOT, filePath) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Create new file or directory
app.post('/api/create', (req, res) => {
    try {
        const { path: relPath, type } = req.body;
        if (!relPath) return res.status(400).json({ success: false, error: 'Path required' });
        const fullPath = safePath(relPath);
        if (fs.existsSync(fullPath)) {
            return res.status(400).json({ success: false, error: 'Item already exists' });
        }
        if (type === 'directory') {
            fs.mkdirSync(fullPath, { recursive: true });
        } else {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, '', 'utf8');
        }
        res.json({ success: true, path: path.relative(WORKSPACE_ROOT, fullPath) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Rename
app.post('/api/rename', (req, res) => {
    try {
        const { oldPath, newPath } = req.body;
        const oldFullPath = safePath(oldPath);
        const newFullPath = safePath(newPath);
        if (!fs.existsSync(oldFullPath)) {
            return res.status(404).json({ success: false, error: 'Source does not exist' });
        }
        fs.renameSync(oldFullPath, newFullPath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Delete
app.post('/api/delete', (req, res) => {
    try {
        const { path: relPath } = req.body;
        const fullPath = safePath(relPath);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ success: false, error: 'Item does not exist' });
        }
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Git status
app.get('/api/git/status', (req, res) => {
    const git = spawn('git', ['status', '--porcelain', '-b'], { cwd: WORKSPACE_ROOT });
    let stdout = '';
    let stderr = '';
    git.stdout.on('data', d => { stdout += d; });
    git.stderr.on('data', d => { stderr += d; });
    git.on('close', code => {
        if (code !== 0) {
            return res.json({ success: false, error: stderr || 'Git error' });
        }
        const lines = stdout.split('\n').filter(Boolean);
        const branchLine = lines.find(l => l.startsWith('##')) || '## main';
        const branch = branchLine.replace('##', '').split('...')[0].trim();
        const files = lines.filter(l => !l.startsWith('##')).map(l => {
            const status = l.substring(0, 2);
            const file = l.substring(3).trim();
            return { status, file };
        });
        res.json({ success: true, branch, files });
    });
});

// API: Git diff
app.get('/api/git/diff', (req, res) => {
    const filePath = req.query.path ? [req.query.path] : [];
    const git = spawn('git', ['diff', 'HEAD', '--', ...filePath], { cwd: WORKSPACE_ROOT });
    let diff = '';
    git.stdout.on('data', d => { diff += d; });
    git.on('close', () => {
        res.json({ success: true, diff });
    });
});

// API: Git commit
app.post('/api/git/commit', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Commit message required' });
    const add = spawn('git', ['add', '-A'], { cwd: WORKSPACE_ROOT });
    add.on('close', () => {
        const commit = spawn('git', ['commit', '-m', message], { cwd: WORKSPACE_ROOT });
        let out = '';
        let err = '';
        commit.stdout.on('data', d => { out += d; });
        commit.stderr.on('data', d => { err += d; });
        commit.on('close', code => {
            if (code === 0) res.json({ success: true, message: out });
            else res.json({ success: false, error: err || out });
        });
    });
});

// API: Search in files
app.get('/api/search', (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ success: true, results: [] });
    const isRegex = req.query.regex === 'true';
    const isCaseSensitive = req.query.matchCase === 'true';

    const results = [];
    function walk(dir) {
        if (results.length > 300) return;
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            if (item.name === '.git' || item.name === 'node_modules') continue;
            const full = path.join(dir, item.name);
            if (item.isDirectory()) {
                walk(full);
            } else {
                try {
                    const content = fs.readFileSync(full, 'utf8');
                    const lines = content.split('\n');
                    lines.forEach((line, idx) => {
                        let matched = false;
                        if (isRegex) {
                            try {
                                const reg = new RegExp(query, isCaseSensitive ? 'g' : 'gi');
                                matched = reg.test(line);
                            } catch (e) {}
                        } else {
                            if (isCaseSensitive) matched = line.includes(query);
                            else matched = line.toLowerCase().includes(query.toLowerCase());
                        }
                        if (matched) {
                            results.push({
                                file: path.relative(WORKSPACE_ROOT, full),
                                line: idx + 1,
                                text: line.trim()
                            });
                        }
                    });
                } catch (e) {
                    // Ignore binary files or unreadable
                }
            }
        }
    }
    walk(WORKSPACE_ROOT);
    res.json({ success: true, results });
});

// API: Execute code (Quick Run)
app.post('/api/run', (req, res) => {
    const { code, language } = req.body;
    let cmd = 'node';
    let args = ['-e', code];
    if (language === 'python') {
        cmd = 'python3';
        args = ['-c', code];
    } else if (language === 'bash' || language === 'shell') {
        cmd = 'bash';
        args = ['-c', code];
    }

    const runner = spawn(cmd, args, { cwd: WORKSPACE_ROOT });
    let stdout = '';
    let stderr = '';
    runner.stdout.on('data', d => { stdout += d; });
    runner.stderr.on('data', d => { stderr += d; });
    
    // Safety timeout: 10s
    const timer = setTimeout(() => {
        runner.kill('SIGKILL');
        stderr += '\nExecution timed out (10s limit)';
    }, 10000);

    runner.on('close', code => {
        clearTimeout(timer);
        res.json({
            success: true,
            exitCode: code,
            stdout,
            stderr
        });
    });
});

// WebSocket Terminal Management
wss.on('connection', (ws) => {
    const ptyHostPath = path.join(__dirname, 'pty_host.py');
    const py = spawn('python3', [ptyHostPath, WORKSPACE_ROOT]);

    let buffer = '';
    py.stdout.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                if (msg.type === 'data') {
                    const text = Buffer.from(msg.data, 'base64').toString('utf-8');
                    ws.send(JSON.stringify({ type: 'output', data: text }));
                } else if (msg.type === 'exit') {
                    ws.send(JSON.stringify({ type: 'exit' }));
                }
            } catch (err) {}
        }
    });

    py.on('error', (err) => {
        ws.send(JSON.stringify({ type: 'output', data: `\r\nPTY Error: ${err.message}\r\n` }));
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'input') {
                py.stdin.write(JSON.stringify({ type: 'input', data: data.data }) + '\n');
            } else if (data.type === 'resize') {
                py.stdin.write(JSON.stringify({ type: 'resize', cols: data.cols, rows: data.rows }) + '\n');
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        try {
            py.kill('SIGTERM');
        } catch (e) {}
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`VS Code Web server running on http://0.0.0.0:${PORT}`);
});
