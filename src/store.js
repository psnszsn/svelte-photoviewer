import {writable, derived, get} from 'svelte/store';

const prev = (x, max) => (x - 1 < 0 ? max : x - 1);
const next = (x, max) => (x + 1 > max ? 0 : x + 1);

const photos = writable([]);
let currentIndex = writable(-1);
const currentPhotoStatus = writable({loading: false, loaded: false});

const photosLength = derived(photos, (a) => a.length);
const prevPhoto = derived([photos, currentIndex], ([a, b]) => a[prev(b, a.length - 1)])
const currentPhoto = derived([photos, currentIndex], ([a, b]) => a[b])
const nextPhoto = derived([photos, currentIndex], ([a, b]) => a[next(b, a.length - 1)])

currentIndex = {
    ...currentIndex,
    next: () => currentIndex.update(x => next(x, get(photosLength) - 1)),
    prev: () => currentIndex.update(x => prev(x, get(photosLength) - 1)),
    setKey: (key) => currentIndex.set(get(photos).findIndex(x => x.key === key))

}

export {
    photos as _photos,
    currentIndex as _currentIndex, currentPhoto, nextPhoto, prevPhoto, currentPhotoStatus
}
