/**
 * starterTemplate.js
 * The default workspace tree loaded on first run so the preview has something
 * to render immediately.
 */

export const STARTER_TREE = [
  {
    name: 'src',
    type: 'folder',
    children: [
      {
        name: 'components',
        type: 'folder',
        children: [
          {
            name: 'Counter.jsx',
            type: 'file',
            content: `import React, { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div className="counter">
      <button onClick={() => setCount((c) => c - 1)}>-</button>
      <span className="count">{count}</span>
      <button onClick={() => setCount((c) => c + 1)}>+</button>
    </div>
  );
}
`,
          },
        ],
      },
      {
        name: 'App.jsx',
        type: 'file',
        content: `import React from 'react';
import Counter from './components/Counter';
import './styles.css';

export default function App() {
  console.log('App mounted');
  return (
    <main className="app">
      <h1>OmniCode</h1>
      <p>Edit files on the left or ask the agent to build something.</p>
      <Counter />
    </main>
  );
}
`,
      },
      {
        name: 'styles.css',
        type: 'file',
        content: `* { box-sizing: border-box; }
body { margin: 0; }
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: radial-gradient(1200px 600px at 50% -10%, #18181b, #0c0c0e);
  color: #e4e4e7;
  font-family: 'Inter', system-ui, sans-serif;
}
.app h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0; }
.app p { color: #71717a; margin: 0 0 8px; }
.counter {
  display: flex; align-items: center; gap: 16px;
  padding: 10px 16px; border: 1px solid #27272a; border-radius: 12px;
  background: #121214;
}
.counter button {
  width: 36px; height: 36px; border-radius: 8px; border: 1px solid #27272a;
  background: #18181b; color: #e4e4e7; font-size: 18px; cursor: pointer;
  transition: all 0.15s ease;
}
.counter button:hover { background: #27272a; border-color: #3f3f46; }
.count { min-width: 32px; text-align: center; font-size: 20px; font-weight: 600; }
`,
      },
      {
        name: 'main.jsx',
        type: 'file',
        content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')).render(<App />);
`,
      },
    ],
  },
];
