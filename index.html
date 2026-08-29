// The Thinker - Code Editor (JavaScript Module / Script Version)
// This file contains the logic and initialization code for the web-based code editor interface.

document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('openBtn');
    const fileList = document.getElementById('fileList');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const editorContainer = document.getElementById('editorContainer');
    const fileTitle = document.getElementById('fileTitle');
    const codeEditor = document.getElementById('codeEditor');
    const saveBtn = document.getElementById('saveBtn');
    const renameBtn = document.getElementById('renameBtn');

    let currentDirectoryHandle = null;
    let currentFileHandle = null;

    // Handle opening a local directory using the File System Access API
    if (openBtn) {
        openBtn.addEventListener('click', async () => {
            try {
                currentDirectoryHandle = await window.showDirectoryPicker();
                welcomeScreen.style.display = 'none';
                editorContainer.style.display = 'flex';
                await loadFiles(currentDirectoryHandle);
            } catch (err) {
                console.log("Folder selection cancelled or not supported.");
            }
        });
    }

    // Recursively or flatly load files and directories into the sidebar catalog
    async function loadFiles(dirHandle) {
        fileList.innerHTML = '';
        for await (const entry of dirHandle.values()) {
            const li = document.createElement('li');
            li.textContent = entry.kind === 'directory' ? `📁 ${entry.name}` : `📄 ${entry.name}`;
            
            if (entry.kind === 'file') {
                li.addEventListener('click', () => openFile(entry));
            }
            
            fileList.appendChild(li);
        }
    }

    // Read and display the contents of a selected file
    async function openFile(fileHandle) {
        currentFileHandle = fileHandle;
        try {
            const file = await fileHandle.getFile();
            const text = await file.text();
            
            fileTitle.textContent = file.name;
            codeEditor.value = text;
        } catch (err) {
            alert("Error reading file: " + err.message);
        }
    }

    // Save changes back to the local file system
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!currentFileHandle) return;
            try {
                const writable = await currentFileHandle.createWritable();
                await writable.write(codeEditor.value);
                await writable.close();
                alert("Changes saved successfully!");
            } catch (err) {
                alert("Save failed: " + err.message);
            }
        });
    }

    // Rename the currently open file
    if (renameBtn) {
        renameBtn.addEventListener('click', async () => {
            if (!currentFileHandle || !currentDirectoryHandle) return;
            const newName = prompt("New file name:", currentFileHandle.name);
            if (newName && newName !== currentFileHandle.name) {
                try {
                    // Check if move method is supported (File System Access API standard feature)
                    if (typeof currentFileHandle.move === 'function') {
                        await currentFileHandle.move(newName);
                    } else {
                        throw new Error("Rename/move operation is not supported in this browser environment.");
                    }
                    fileTitle.textContent = newName;
                    await loadFiles(currentDirectoryHandle);
                } catch (err) {
                    alert("Rename failed: " + err.message);
                }
            }
        });
    }
});
