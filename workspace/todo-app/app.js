// Modern TaskMaster Application
let tasks = JSON.parse(localStorage.getItem('taskmaster_tasks')) || [
    {
        id: '1',
        title: 'Review pull request for VS Code clone',
        category: 'Coding',
        priority: 'high',
        dueDate: new Date().toISOString().split('T')[0],
        completed: false,
        important: true
    },
    {
        id: '2',
        title: 'Prepare project presentation slides',
        category: 'Work',
        priority: 'medium',
        dueDate: new Date().toISOString().split('T')[0],
        completed: true,
        important: false
    },
    {
        id: '3',
        title: 'Grocery shopping and gym workout',
        category: 'Personal',
        priority: 'low',
        dueDate: '',
        completed: false,
        important: false
    }
];

let currentFilter = 'all';
let searchQuery = '';

// DOM Elements
const taskList = document.getElementById('task-list');
const taskForm = document.getElementById('task-form');
const taskTitleInput = document.getElementById('task-title-input');
const taskCategory = document.getElementById('task-category');
const taskPriority = document.getElementById('task-priority');
const taskDueDate = document.getElementById('task-due-date');
const emptyState = document.getElementById('empty-state');
const currentDateEl = document.getElementById('current-date');
const searchInput = document.getElementById('task-search');
const themeBtn = document.getElementById('theme-btn');

document.addEventListener('DOMContentLoaded', () => {
    // Show current date
    const options = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
    currentDateEl.textContent = new Date().toLocaleDateString(undefined, options);

    // Initial render
    renderTasks();

    // Setup filter listeners
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            document.getElementById('current-view-title').textContent = btn.innerText.trim().split('\n')[0];
            renderTasks();
        });
    });

    // Form submit
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = taskTitleInput.value.trim();
        if (!title) return;

        const newTask = {
            id: Date.now().toString(),
            title,
            category: taskCategory.value,
            priority: taskPriority.value,
            dueDate: taskDueDate.value,
            completed: false,
            important: false
        };

        tasks.unshift(newTask);
        saveTasks();
        renderTasks();

        taskTitleInput.value = '';
        taskDueDate.value = '';
    });

    // Search
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderTasks();
    });

    // Dark mode toggle
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        themeBtn.innerHTML = isDark 
            ? '<i class="fa-solid fa-sun"></i> Light Mode' 
            : '<i class="fa-solid fa-moon"></i> Dark Mode';
    });
});

function saveTasks() {
    localStorage.setItem('taskmaster_tasks', JSON.stringify(tasks));
}

function renderTasks() {
    // Filter tasks
    const todayStr = new Date().toISOString().split('T')[0];

    const filtered = tasks.filter(task => {
        // Query match
        if (searchQuery && !task.title.toLowerCase().includes(searchQuery)) return false;

        if (currentFilter === 'today') return task.dueDate === todayStr;
        if (currentFilter === 'important') return task.important;
        if (currentFilter === 'completed') return task.completed;
        return true;
    });

    taskList.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.style.display = 'block';
    } else {
        emptyState.style.display = 'none';
        filtered.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''}`;

            li.innerHTML = `
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                <span class="task-title">${escapeHtml(task.title)}</span>
                <div class="task-badges">
                    <span class="tag tag-${task.category.toLowerCase()}">${task.category}</span>
                    <span class="priority-badge priority-${task.priority}" title="${task.priority} priority"></span>
                    ${task.dueDate ? `<span class="task-date"><i class="fa-regular fa-clock"></i> ${task.dueDate}</span>` : ''}
                </div>
                <div class="task-actions">
                    <button class="btn-icon star ${task.important ? 'active' : ''}" title="Star task">
                        <i class="fa-${task.important ? 'solid' : 'regular'} fa-star"></i>
                    </button>
                    <button class="btn-icon delete" title="Delete task">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            `;

            // Toggle complete
            li.querySelector('.task-checkbox').addEventListener('change', () => {
                task.completed = !task.completed;
                saveTasks();
                renderTasks();
            });

            // Toggle star
            li.querySelector('.btn-icon.star').addEventListener('click', () => {
                task.important = !task.important;
                saveTasks();
                renderTasks();
            });

            // Delete
            li.querySelector('.btn-icon.delete').addEventListener('click', () => {
                tasks = tasks.filter(t => t.id !== task.id);
                saveTasks();
                renderTasks();
            });

            taskList.appendChild(li);
        });
    }

    updateCounters();
}

function updateCounters() {
    const todayStr = new Date().toISOString().split('T')[0];
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const todayCount = tasks.filter(t => t.dueDate === todayStr).length;
    const importantCount = tasks.filter(t => t.important).length;

    document.getElementById('count-all').textContent = total;
    document.getElementById('count-today').textContent = todayCount;
    document.getElementById('count-important').textContent = importantCount;
    document.getElementById('count-completed').textContent = completed;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-done').textContent = completed;

    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
    document.getElementById('progress-pct').textContent = `${pct}%`;
    document.getElementById('progress-fill').style.width = `${pct}%`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
