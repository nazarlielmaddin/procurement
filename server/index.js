// Standalone Procurement server entrypoint.
import { createApp } from './app.js';

const PORT = process.env.PORT || 4173;
createApp().listen(PORT, () => console.log(`procurement on :${PORT}`));
