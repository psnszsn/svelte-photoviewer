export function pannable(node) {
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let zoomTimeout = null;

    let touchData = {
        t: [],
        pinchDist: 0,
        lastE: null,
    };

    function handleMousedown(event) {
        const x = event.clientX;
        const y = event.clientY;

        // console.dir(node)
        // console.log(panX * scale, (node.clientWidth * scale - window.innerWidth) / 2)

        node.style.cursor = "all-scroll";

        node.dispatchEvent(new CustomEvent('panstart', {
            detail: {x, y}
        }));

        window.addEventListener('mousemove', handleMousemove);
        window.addEventListener('mouseup', handleMouseup);
    }

    function handleWheel(e) {
        e.preventDefault();
        let unit = 0.3;
        let delta = e.deltaY < 0 ? unit : -unit;
        scale = Math.min(Math.max(0.95, scale + delta), 4);

        if (zoomTimeout) clearTimeout(zoomTimeout)
        if (scale < 1) zoomTimeout = setTimeout(resetScale, 500)

        recenter();

        node.dispatchEvent(new CustomEvent('panmove', {
            detail: {panX, panY, spring: true}
        }));

        node.dispatchEvent(new CustomEvent('zoomchanged', {
            detail: {scale, spring: true}
        }));
    }

    function resetScale() {
        scale = 1
        node.dispatchEvent(new CustomEvent('zoomchanged', {
            detail: {scale, spring: true}
        }));
    }

    function handleMousemove(event) {
        panX = panX + event.movementX / scale;
        panY = panY + event.movementY / scale;

        node.dispatchEvent(new CustomEvent('panmove', {
            detail: {panX, panY, spring: false}
        }));

    }

    function handleMouseup(event) {
        const x = event.clientX;
        const y = event.clientY;

        node.style.cursor = "unset";
        recenter();

        node.dispatchEvent(new CustomEvent('panend', {
            detail: {x, y}
        }));
        node.dispatchEvent(new CustomEvent('panmove', {
            detail: {panX, panY, spring: true}
        }));

        window.removeEventListener('mousemove', handleMousemove);
        window.removeEventListener('mouseup', handleMouseup);
    }

    function recenter() {
        console.log("RECENTERING")
        let w = node.clientWidth * scale;
        let h = node.clientHeight * scale;
        let wdiff = w - window.innerWidth;
        let hdiff = h - window.innerHeight;

        if (wdiff > 0) {
            if (Math.abs(panX * scale) > wdiff / 2) {
                const sign = panX > 0 ? 1 : -1;
                panX = wdiff / 2 / scale * sign;
            }
        } else {
            panX = 0;
        }
        if (hdiff > 0) {
            if (Math.abs(panY * scale) > hdiff / 2) {
                const sign = panY > 0 ? 1 : -1;
                panY = hdiff / 2 / scale * sign;
            }
        } else {
            panY = 0;
        }

        node.dispatchEvent(new CustomEvent('panmove', {
            detail: {panX, panY, spring: true}
        }));
    }



    function handleTouchstart(e) {
        if (e.touches.length == 2) {
            for (let i = 0; i < e.touches.length; i++) {
                touchData.t.push(e.touches[i]);
            }
        }
    }

    const pointsDistance = (p1, p2) => {
        let x = Math.abs(p1.clientX - p2.clientX);
        let y = Math.abs(p1.clientY - p2.clientY);
        return Math.sqrt(x * x + y * y);
    };

    function handleTouchmove(e) {

        e.preventDefault();
        if (e.touches.length == 1 && e.changedTouches.length == 1) {
            if (!touchData.lastE) touchData.lastE = e.changedTouches[0];
            let diffX = e.changedTouches[0].clientX - touchData.lastE.clientX;
            let diffY = e.changedTouches[0].clientY - touchData.lastE.clientY;

            //console.log(diffX,diffY)

            panX += diffX / scale;
            panY += diffY / scale;

            node.dispatchEvent(new CustomEvent('panmove', {
                detail: {panX, panY, spring: false}
            }));

            touchData.lastE = e.changedTouches[0];

        }
        if (e.touches.length == 2 && e.changedTouches.length == 2) {
            // Check if the two target touches are the same ones that started
            // the 2-touch
            let point1 = -1, point2 = -1;
            for (let i = 0; i < touchData.t.length; i++) {
                if (touchData.t[i].identifier == e.touches[0].identifier) point1 = i;
                if (touchData.t[i].identifier == e.touches[1].identifier) point2 = i;
            }
            if (point1 >= 0 && point2 >= 0) {
                // Calculate the difference between the start and move coordinates
                let dist1 = pointsDistance(touchData.t[point1], touchData.t[point2]);
                let dist2 = pointsDistance(e.touches[0], e.touches[1]);

                if (touchData.pinchDist === 0) touchData.pinchDist = dist1;

                let diff = touchData.pinchDist - dist2;

                touchData.pinchDist = dist2;

                scale = Math.min(Math.max(1, scale - diff / 100), 4);
                node.dispatchEvent(new CustomEvent('zoomchanged', {
                    detail: {scale, spring: false}
                }));
            }
            else {
                console.log("else")
                touchData.t = [];
                touchData.pinchDist = 0;
            }
        }



    }

    function handleTouchend(e) {

        touchData.pinchDist = 0;
        touchData.lastE = null;
        console.log("touch ended")

        if (scale < 1.02) resetScale();
        recenter();

    }

    node.addEventListener('mousedown', handleMousedown);
    window.addEventListener('wheel', handleWheel, {passive: false});
    node.addEventListener('touchstart', handleTouchstart, {passive: true});
    node.addEventListener('touchmove', handleTouchmove, {passive: true});
    node.addEventListener('touchend', handleTouchend, {passive: true});

    return {
        destroy() {
            node.removeEventListener('mousedown', handleMousedown);
            window.removeEventListener('wheel', handleWheel);
            node.removeEventListener('touchstart', handleTouchstart);
            node.removeEventListener('touchmove', handleTouchmove);
            node.removeEventListener('touchend', handleTouchend);
        }
    };
}
