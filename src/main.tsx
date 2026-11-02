// Filter benign Emscripten / TensorFlow Lite WASM informational stderr messages
// that are erroneously routed to console.error by Emscripten's default Module.printErr.
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function isIgnoredConsoleMessage(args: unknown[]): boolean {
  return args.some((arg) => {
    if (typeof arg !== 'string') return false;
    return (
      arg.includes('Created TensorFlow Lite XNNPACK delegate') ||
      arg.includes('TensorFlow Lite XNNPACK delegate') ||
      arg.includes('XNNPACK delegate for CPU') ||
      arg.startsWith('INFO: Created TensorFlow Lite') ||
      (arg.startsWith('INFO:') && arg.includes('delegate')) ||
      (arg.startsWith('INFO:') && arg.includes('TensorFlow')) ||
      arg.includes('WebSocket') ||
      arg.includes('createWebSocketModuleRunnerTransport') ||
      arg.includes('failed to connect to websocket') ||
      arg.includes('[vite] failed to connect to websocket')
    );
  });
}

console.error = (...args: unknown[]) => {
  if (isIgnoredConsoleMessage(args)) {
    return;
  }
  originalConsoleError.apply(console, args);
};

console.warn = (...args: unknown[]) => {
  if (isIgnoredConsoleMessage(args)) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

if (typeof window !== 'undefined') {
  // @ts-expect-error - Configure global Module printErr for Emscripten WASM modules
  window.Module = window.Module || {};
  // @ts-expect-error - Emscripten printErr interceptor
  window.Module.printErr = (text: string) => {
    if (
      typeof text === 'string' &&
      (text.includes('Created TensorFlow Lite XNNPACK delegate') ||
        text.includes('TensorFlow Lite XNNPACK delegate') ||
        text.startsWith('INFO:'))
    ) {
      console.info(text);
      return;
    }
    originalConsoleError(text);
  };
}

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext';
import IrisFloatingWidget from './components/IrisFloatingWidget';
import IrisScreenEdgeOverlay from './components/IrisScreenEdgeOverlay';
import './index.css';

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const windowTarget = params ? params.get('window') : null;

if (windowTarget === 'widget') {
  document.documentElement.classList.add('iris-widget-window');
  createRoot(document.getElementById('root')!).render(<IrisFloatingWidget />);
} else if (windowTarget === 'edge-overlay') {
  document.documentElement.classList.add('iris-edge-window');
  createRoot(document.getElementById('root')!).render(<IrisScreenEdgeOverlay />);
} else {
  createRoot(document.getElementById('root')!).render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}


