import { createApp } from "vue";
import { createSessionTransport, initSessionStore } from "@tum/core";
import App from "./App.vue";
import "./assets/main.css";

// Bootstrap the session store with the real IPC transport.
// This must happen before any component uses getSessionStore().
const transport = createSessionTransport();
initSessionStore(transport);

createApp(App).mount("#app");
