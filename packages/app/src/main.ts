import { createApp } from "vue";
import { createSessionTransport, initSessionStore } from "@tum/core";
import App from "./App.vue";
import "./assets/main.css";

const transport = createSessionTransport();
initSessionStore(transport);

createApp(App).mount("#app");
