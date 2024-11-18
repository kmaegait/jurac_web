import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { 
  ThemeProvider, 
  createTheme, 
  CssBaseline,
  Container,
  Paper,
  Box,
  TextField,
  IconButton,
  List,
  ListItem,
  Typography,
  CircularProgress
} from '@mui/material';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

export {};