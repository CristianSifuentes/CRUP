import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

/*
 * createRoot() is the single switch that enables concurrent rendering.
 *
 * - Legacy ReactDOM.render()  → every update renders synchronously, start to
 *   finish, with no way to interrupt. One expensive update = one frozen UI.
 * - createRoot()              → React CAN render concurrently: it prepares the
 *   new tree in memory, in small time slices, and may pause / restart / abandon
 *   a render if something more urgent arrives.
 *
 * Concurrency is opt-in per update: only updates marked as non-urgent
 * (startTransition, useDeferredValue) are time-sliced and interruptible.
 * Everything else still commits synchronously — which is exactly what
 * Section 1 of this lab demonstrates.
 *
 * NOTE: <StrictMode> is intentionally NOT used here. StrictMode double-invokes
 * render functions in development, which would double every simulated
 * render cost and pollute the timing instrumentation this lab is built around.
 * In a real app, keep StrictMode on.
 */
createRoot(document.getElementById('root')).render(<App />);
