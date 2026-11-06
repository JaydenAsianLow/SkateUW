import { createRoot } from 'react-dom/client';
import './styles.css';
import Display from './display/Display.jsx';
import Controller from './controller/Controller.jsx';

// One entry, two pages: /controller is the phone, everything else is the laptop display.
const isController = window.location.pathname.startsWith('/controller');
createRoot(document.getElementById('root')).render(isController ? <Controller /> : <Display />);
