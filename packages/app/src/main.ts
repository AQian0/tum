import { createApp } from "vue";
import { createSessionTransport, initSessionStore } from "@tum/core";
import App from "./App.vue";
import "dockview-vue/dist/styles/dockview.css";
import "./assets/main.css";

const transport = createSessionTransport();
initSessionStore(transport);

createApp(App).mount("#app");
