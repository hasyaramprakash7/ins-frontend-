import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // CRITICAL: Import Tailwind CSS file here
import { Provider } from 'react-redux';
import { store } from './redux/store';

// Wrap the entire application in the Redux Provider
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);