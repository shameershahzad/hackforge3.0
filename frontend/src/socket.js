import { io } from "socket.io-client";

// create ONE socket instance for whole app
export const socket = io("http://localhost:3001", {
    autoConnect: false, // important
});