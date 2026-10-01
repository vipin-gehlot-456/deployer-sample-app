import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const TASK_TITLE_MAX_LENGTH = 200;

const STRINGS = {
  defaultTitle: 'Task Manager',
  readinessLabel: 'API status',
  readiness: {
    checking: 'checking…',
    ready: 'ready',
    not_ready: 'not ready',
    unreachable: 'unreachable',
  },
  newTaskLabel: 'New task',
  addTask: 'Add',
  noTasks: 'No tasks yet.',
  loadFailed: 'Could not load tasks.',
  addFailed: 'Could not add the task.',
};

const APP_TITLE = import.meta.env.VITE_APP_TITLE || STRINGS.defaultTitle;

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function App() {
  const [readiness, setReadiness] = useState('checking');
  const [tasks, setTasks] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadTasks = useCallback(async () => {
    try {
      const body = await fetchJson('/api/tasks');
      setTasks(body.data);
    } catch {
      setErrorMessage(STRINGS.loadFailed);
    }
  }, []);

  useEffect(() => {
    document.title = APP_TITLE;
    fetch('/api/health/ready')
      .then((response) => response.json())
      .then((body) => setReadiness(body.status === 'ready' ? 'ready' : 'not_ready'))
      .catch(() => setReadiness('unreachable'));
    loadTasks();
  }, [loadTasks]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    try {
      await fetchJson('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      setNewTitle('');
      await loadTasks();
    } catch {
      setErrorMessage(STRINGS.addFailed);
    }
  }

  return (
    <main>
      <h1>{APP_TITLE}</h1>
      <p>
        {STRINGS.readinessLabel}: {STRINGS.readiness[readiness]}
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          {STRINGS.newTaskLabel}{' '}
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            maxLength={TASK_TITLE_MAX_LENGTH}
            required
          />
        </label>{' '}
        <button type="submit">{STRINGS.addTask}</button>
      </form>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {tasks.length === 0 ? (
        <p>{STRINGS.noTasks}</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>{task.title}</li>
          ))}
        </ul>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
