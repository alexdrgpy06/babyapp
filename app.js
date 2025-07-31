/*
 * Baby schedule manager
 *
 * This script provides functionality to add recurring activities for a baby
 * (medicamentos, tomas de leche, cambios de pañal, etc.), calculate the
 * next due time based on a last time and an interval, display a live
 * countdown, and send a local notification when it is time for the
 * activity. Data persists across reloads using localStorage.
 */

(() => {
  // DOM references
  const taskForm = document.getElementById('taskForm');
  const taskListEl = document.getElementById('taskList');
  const darkModeToggle = document.getElementById('darkModeToggle');

  // In-memory store of tasks
  let tasks = [];

  // Store active timers to cancel when a task is deleted or updated
  const activeTimers = {};

  /**
   * Load tasks from localStorage on startup. If tasks are due in the past,
   * roll them forward until their nextDue is in the future.
   */
  function loadTasks() {
    const stored = localStorage.getItem('babyTasks');
    if (stored) {
      try {
        tasks = JSON.parse(stored);
        const now = Date.now();
        tasks.forEach(task => {
          // Ensure numbers are numbers
          task.lastTime = new Date(task.lastTime).getTime();
          task.intervalHours = parseFloat(task.intervalHours);
          task.nextDue = new Date(task.nextDue).getTime();
          // If task interval or nextDue are invalid, recompute
          if (!task.nextDue || isNaN(task.nextDue)) {
            task.nextDue = task.lastTime + task.intervalHours * 3600 * 1000;
          }
          // If due date in the past, roll forward
          while (task.nextDue <= now) {
            task.lastTime = task.nextDue;
            task.nextDue = task.lastTime + task.intervalHours * 3600 * 1000;
          }
        });
      } catch (e) {
        console.error('Error parsing stored tasks', e);
        tasks = [];
      }
    }
  }

  /**
   * Save current tasks to localStorage
   */
  function saveTasks() {
    localStorage.setItem('babyTasks', JSON.stringify(tasks));
  }

  /**
   * Generate a simple unique identifier for tasks
   */
  function generateId() {
    return 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
  }

  /**
   * Convert milliseconds into a human readable countdown string
   * e.g. 2h 15m 30s. If negative, return "00:00:00".
   */
  function formatCountdown(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
  }

  /**
   * Request the user for notification permission if not already granted/denied.
   */
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(err => {
        console.warn('No se pudo solicitar permiso de notificaciones:', err);
      });
    }
  }

  /**
   * Theme management
   */
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.body.classList.add('dark');
      if (darkModeToggle) darkModeToggle.checked = true;
    } else {
      document.body.classList.remove('dark');
      if (darkModeToggle) darkModeToggle.checked = false;
    }
    updateThemeColor(theme);
  }

  function loadTheme() {
    return localStorage.getItem('theme') || 'light';
  }

  function saveTheme(theme) {
    localStorage.setItem('theme', theme);
  }

  function updateThemeColor(theme) {
    const meta = document.getElementById('themeColor');
    if (!meta) return;
    if (theme === 'dark') {
      meta.setAttribute('content', '#1e1e1e');
    } else {
      meta.setAttribute('content', '#4caf50');
    }
  }

  /**
   * Schedule a notification and reminder for a given task. Clears existing
   * timers for that task before scheduling a new one.
   *
   * @param {Object} task The task object
   */
  function scheduleTask(task) {
    // Clear any existing timer
    if (activeTimers[task.id]) {
      clearTimeout(activeTimers[task.id]);
    }
    const now = Date.now();
    const delay = task.nextDue - now;
    if (delay <= 0) {
      // If due now or in the past, immediately trigger
      handleTaskDue(task);
    } else {
      // Schedule future notification
      activeTimers[task.id] = setTimeout(() => handleTaskDue(task), delay);
    }
  }

  /**
   * Handler executed when a task becomes due. Displays a notification and
   * reschedules the next occurrence.
   *
   * @param {Object} task The task object that is due
   */
  function handleTaskDue(task) {
    // Show a notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      const title = `Recordatorio de ${formatCategory(task.category)}`;
      const body = `Es hora de ${task.name}.`;
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.showNotification) {
          reg.showNotification(title, { body });
        } else {
          try {
            new Notification(title, { body });
          } catch (err) {
            console.warn('No se pudo mostrar la notificación:', err);
          }
        }
      });
    }
    // Update the lastTime to the current nextDue and compute new nextDue
    task.lastTime = task.nextDue;
    task.nextDue = task.lastTime + task.intervalHours * 3600 * 1000;
    // Persist changes
    saveTasks();
    // Update UI display
    updateTaskCard(task);
    // Reschedule
    scheduleTask(task);
  }

  /**
   * Create a DOM element representing a task and insert it into the list.
   *
   * @param {Object} task The task to render
   */
  function renderTask(task) {
    // Create container
    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.id = task.id;
    card.dataset.category = task.category;
    // Header section with name and category label
    const header = document.createElement('div');
    header.className = 'task-header';
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.name;
    const category = document.createElement('div');
    category.className = 'task-meta';
    category.textContent = formatCategory(task.category);
    header.appendChild(title);
    header.appendChild(category);
    // Countdown element
    const countdown = document.createElement('div');
    countdown.className = 'countdown';
    // Actions buttons
    const actions = document.createElement('div');
    actions.className = 'task-actions';
    const completeBtn = document.createElement('button');
    completeBtn.className = 'btn complete-btn';
    completeBtn.textContent = 'Marcar como hecho';
    completeBtn.addEventListener('click', () => completeTask(task.id));
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn delete-btn';
    deleteBtn.textContent = 'Eliminar';
    deleteBtn.addEventListener('click', () => deleteTask(task.id));
    actions.appendChild(completeBtn);
    actions.appendChild(deleteBtn);
    // Assemble card
    card.appendChild(header);
    card.appendChild(countdown);
    card.appendChild(actions);
    // Attach to list
    taskListEl.appendChild(card);
    // Store reference on task
    task.element = card;
    task.countdownEl = countdown;
    // Initial countdown update
    updateCountdownForTask(task);
  }

  /**
   * Update the countdown display for all tasks every second.
   */
  function startCountdownTimer() {
    setInterval(() => {
      tasks.forEach(task => updateCountdownForTask(task));
    }, 1000);
  }

  /**
   * Update the countdown text for a single task.
   *
   * @param {Object} task The task to update
   */
  function updateCountdownForTask(task) {
    if (!task.countdownEl) return;
    const remainingMs = task.nextDue - Date.now();
    task.countdownEl.textContent = formatCountdown(remainingMs);
  }

  /**
   * Update the DOM card of a task when its data changes (e.g. after due).
   *
   * @param {Object} task The task to update
   */
  function updateTaskCard(task) {
    if (!task.element) return;
    // Update the category label in header
    const headerNodes = task.element.querySelectorAll('.task-header .task-meta');
    if (headerNodes.length > 0) {
      headerNodes[0].textContent = formatCategory(task.category);
    }
    // Force update of category color bar
    task.element.dataset.category = task.category;
    // Update countdown immediately
    updateCountdownForTask(task);
  }

  /**
   * Format category codes into readable Spanish labels.
   *
   * @param {string} code
   * @returns {string}
   */
  function formatCategory(code) {
    switch (code) {
      case 'medicamento':
        return 'Medicamento';
      case 'toma_leche':
        return 'Toma de leche';
      case 'cambio_pañal':
        return 'Cambio de pañal';
      default:
        return 'Otro';
    }
  }

  /**
   * Handle form submission to create a new task. Validates input and
   * calculates the first due time.
   *
   * @param {Event} e
   */
  function handleFormSubmit(e) {
    e.preventDefault();
    const category = document.getElementById('taskCategory').value;
    const name = document.getElementById('taskName').value.trim();
    const lastTimeStr = document.getElementById('taskLastTime').value;
    const intervalHours = parseFloat(document.getElementById('taskInterval').value);
    // Validate inputs
    if (!name || !lastTimeStr || isNaN(intervalHours) || intervalHours <= 0) {
      alert('Por favor rellena todos los campos correctamente.');
      return;
    }
    const lastTime = new Date(lastTimeStr).getTime();
    if (isNaN(lastTime)) {
      alert('La fecha/hora de la última vez es inválida.');
      return;
    }
    // Compute next due time
    const nextDue = lastTime + intervalHours * 3600 * 1000;
    // Create task object
    const newTask = {
      id: generateId(),
      category,
      name,
      lastTime,
      intervalHours,
      nextDue
    };
    // Add to list and persist
    tasks.push(newTask);
    saveTasks();
    // Render on page
    renderTask(newTask);
    // Schedule notification
    scheduleTask(newTask);
    // Reset form
    taskForm.reset();
  }

  /**
   * Mark a task as completed now. Updates lastTime and nextDue to the
   * current time + interval.
   *
   * @param {string} taskId
   */
  function completeTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    // Set lastTime to now and compute new nextDue
    task.lastTime = Date.now();
    task.nextDue = task.lastTime + task.intervalHours * 3600 * 1000;
    saveTasks();
    updateTaskCard(task);
    scheduleTask(task);
  }

  /**
   * Delete a task from the list. Clears timers, removes from DOM and
   * persists changes.
   *
   * @param {string} taskId
   */
  function deleteTask(taskId) {
    const index = tasks.findIndex(t => t.id === taskId);
    if (index === -1) return;
    const task = tasks[index];
    // Clear timers
    if (activeTimers[task.id]) {
      clearTimeout(activeTimers[task.id]);
      delete activeTimers[task.id];
    }
    // Remove DOM element
    if (task.element && task.element.parentNode) {
      task.element.parentNode.removeChild(task.element);
    }
    // Remove from array
    tasks.splice(index, 1);
    saveTasks();
  }

  /**
   * Initialize the app: load stored tasks, render them, schedule notifications
   * and start countdown updates.
   */
  function init() {
    requestNotificationPermission();
    // Theme initialization
    const storedTheme = loadTheme();
    applyTheme(storedTheme);
    if (darkModeToggle) {
      darkModeToggle.addEventListener('change', () => {
        const theme = darkModeToggle.checked ? 'dark' : 'light';
        applyTheme(theme);
        saveTheme(theme);
      });
    }
    loadTasks();
    // Render tasks
    tasks.forEach(task => {
      renderTask(task);
      scheduleTask(task);
    });
    // Start global countdown updates
    startCountdownTimer();
    // Register service worker for offline support if supported
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(err => {
        console.warn('Error al registrar Service Worker:', err);
      });
    }
    // Form submission
    taskForm.addEventListener('submit', handleFormSubmit);
  }

  // Kick off
  document.addEventListener('DOMContentLoaded', init);
})();