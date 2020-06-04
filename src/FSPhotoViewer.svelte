<script>
    import { tweened } from "svelte/motion";
    import { sineOut } from "svelte/easing";
    import { fade } from "svelte/transition";
    import { onMount, tick, createEventDispatcher } from "svelte";
    import { pannable } from "./pannable.js";
    import {
        _photos,
        _currentIndex,
        currentPhoto,
        nextPhoto,
        prevPhoto,
        currentPhotoStatus,
    } from "./store.js";
    import { send, receive } from "./crossfade.js";
    import { writable } from "svelte/store";
    import { spring } from "svelte/motion";

    export let photos = [
        {
            src: "https://source.unsplash.com/2ShvY8Lf6l0/800x599",
            width: 4,
            height: 3,
            key: "1",
        },
        {
            src: "https://source.unsplash.com/Dm-qxdynoEc/800x799",
            width: 1,
            height: 1,
            key: "2",
        },
        {
            src: "https://source.unsplash.com/qDkso9nvCg0/600x799",
            width: 3,
            height: 4,
            key: "3",
        },
    ];

    export let currentIndex = 0;

    _photos.set(photos);
    /* _currentIndex.set(currentIndex); */

    const loadPhoto = p => {
        if (!p) return;
        const timeout = setTimeout(
            () =>
                currentPhotoStatus.update(a => {
                    return { ...a, loading: true };
                }),
            100
        );

        const img = new Image();

        img.onload = () => {
            clearTimeout(timeout);
            currentPhotoStatus.set({ loading: false, loaded: true });
            console.log("done loading");
        };

        img.src = p.src;

        new Image().src = $prevPhoto.src;
        new Image().src = $nextPhoto.src;
    };

    currentPhoto.subscribe(p => {
        console.log("current: ", p);
        loadPhoto(p);
    });

    // Web components event workaround
    import { get_current_component } from "svelte/internal";
    const component = get_current_component();
    const svelteDispatch = createEventDispatcher();
    const dispatch = (name, detail) => {
        svelteDispatch(name, detail);
        component.dispatchEvent &&
            component.dispatchEvent(new CustomEvent(name, { detail }));
    };

    const imageScale = spring(1);
    const coords = spring({ x: 0, y: 0 });

    function changePhoto(n) {
        if ($imageScale > 1) return;
        console.log($_currentIndex);
        if (n > 0) {
            _currentIndex.next();
        } else {
            _currentIndex.prev();
        }

        /* dispatch("next"); */
    }

    function handleKeydown(e) {
        //console.log(e)
        if (e.key === "ArrowRight") {
            changePhoto(1);
        } else if (e.key === "ArrowLeft") {
            changePhoto(-1);
        } else if (["ArrowUp", "Escape"].includes(e.key)) {
            closeModal();
        }
    }

    function handlePanMove(e) {
        coords.set(
            {
                x: e.detail.panX,
                y: e.detail.panY,
            },
            { hard: !e.detail.spring }
        );
    }

    function handleZoom(e) {
        imageScale.set(e.detail.scale, { hard: !e.detail.spring });
    }

    function closeModal() {
        console.log("cclosing");
        /* dispatch("ccclose"); */
        coords.set({ x: 0, y: 0 });
        imageScale.set(1);

        currentPhotoStatus.set({ loading: false, loaded: false });
        _currentIndex.set(-1);
    }

    $: console.log("loaded ", $currentPhotoStatus.loaded);
</script>

<svelte:options tag="fs-photo-viewer" />
<svelte:window on:keydown={handleKeydown} />

{#if $currentPhotoStatus.loaded}
    {#await $currentPhoto then d}

        <section>
            <!-- <h1 class="title">{photo.uuid}</h1> -->
            <div
                transition:fade={{ duration: 200 }}
                class="modal-background"
                on:click={closeModal}
            />
            <div class="slidecontainer">
                <div
                    use:pannable
                    on:panmove={handlePanMove}
                    on:zoomchanged={handleZoom}
                    style="transform: scale({$imageScale}) translate({$coords.x}px,{$coords.y}px)"
                    class="slider"
                >
                    <img
                        draggable="false"
                        on:mousedown|preventDefault
                        alt="Photo"
                        src={d.src}
                        in:receive={{ key: d.key }}
                        out:send={{ key: d.key }}
                    />
                </div>
            </div>

        </section>
    {/await}
{/if}

<style>
    .modal-background {
        background-color: rgba(10, 10, 10, 0.86);
        bottom: 0;
        left: 0;
        position: absolute;
        right: 0;
        top: 0;
    }
    section {
        position: fixed;
        width: 100vw;
        height: 100vh;
        padding: 0;
        margin: 0;

        top: 0;
        left: 0;
        z-index: 100;
    }

    .slidecontainer {
        /* padding: 50px; */
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
    }

    img {
        max-width: unset;

        max-width: 100vw;
        max-height: 100vh;
        object-fit: contain;
        user-select: none;
    }

    img.active {
        display: block;
        -webkit-animation: fadeImg 0.8s;
        animation: fadeImg 0.8s;
    }

    @keyframes fadeImg {
        from {
            opacity: 0;
        }

        to {
            opacity: 1;
        }
    }

    .navigation {
        position: fixed;
        top: 0;
        left: 0;
    }

    svg {
        fill: lightgray;
        width: 5em;
    }

    svg:hover {
        fill: slategray;
    }
    .is-hidden {
        display: none;
    }
</style>
