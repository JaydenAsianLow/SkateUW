import { demoMode } from './guide/clock.js'; // first: the demo scene's virtual clock must be in place before anything reads the time
import { createRoot } from 'react-dom/client';
import './styles.css';
import Display from './display/Display.jsx';
import Controller from './controller/Controller.jsx';
import DemoStage from './guide/DemoStage.jsx';

// One entry, three pages: /controller is the phone, /?demo is the Controls guide's demo scene (an iframe inside the
// guide), everything else is the laptop display.
const isController = window.location.pathname.startsWith('/controller');
createRoot(document.getElementById('root')).render(demoMode ? <DemoStage /> : isController ? <Controller /> : <Display />);
