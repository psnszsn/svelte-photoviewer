import { crossfade, fade, scale } from "svelte/transition";

const [send, receive] = crossfade({
        duration: 300,
        // fallback: fade,
    });

export {send, receive};

