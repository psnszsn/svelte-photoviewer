function noop() { }
const identity = x => x;
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function is_promise(value) {
    return value && typeof value === 'object' && typeof value.then === 'function';
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function subscribe(store, ...callbacks) {
    if (store == null) {
        return noop;
    }
    const unsub = store.subscribe(...callbacks);
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
function get_store_value(store) {
    let value;
    subscribe(store, _ => value = _)();
    return value;
}
function component_subscribe(component, store, callback) {
    component.$$.on_destroy.push(subscribe(store, callback));
}
function create_slot(definition, ctx, $$scope, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, $$scope, fn) {
    return definition[1] && fn
        ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
        : $$scope.ctx;
}
function get_slot_changes(definition, $$scope, dirty, fn) {
    if (definition[2] && fn) {
        const lets = definition[2](fn(dirty));
        if ($$scope.dirty === undefined) {
            return lets;
        }
        if (typeof lets === 'object') {
            const merged = [];
            const len = Math.max($$scope.dirty.length, lets.length);
            for (let i = 0; i < len; i += 1) {
                merged[i] = $$scope.dirty[i] | lets[i];
            }
            return merged;
        }
        return $$scope.dirty | lets;
    }
    return $$scope.dirty;
}
function action_destroyer(action_result) {
    return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
}

const is_client = typeof window !== 'undefined';
let now = is_client
    ? () => window.performance.now()
    : () => Date.now();
let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

const tasks = new Set();
function run_tasks(now) {
    tasks.forEach(task => {
        if (!task.c(now)) {
            tasks.delete(task);
            task.f();
        }
    });
    if (tasks.size !== 0)
        raf(run_tasks);
}
/**
 * Creates a new task that runs on each raf frame
 * until it returns a falsy value or is aborted
 */
function loop(callback) {
    let task;
    if (tasks.size === 0)
        raf(run_tasks);
    return {
        promise: new Promise(fulfill => {
            tasks.add(task = { c: callback, f: fulfill });
        }),
        abort() {
            tasks.delete(task);
        }
    };
}

function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function prevent_default(fn) {
    return function (event) {
        event.preventDefault();
        // @ts-ignore
        return fn.call(this, event);
    };
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_style(node, key, value, important) {
    node.style.setProperty(key, value, important ? 'important' : '');
}
function custom_event(type, detail) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, false, false, detail);
    return e;
}

const active_docs = new Set();
let active = 0;
// https://github.com/darkskyapp/string-hash/blob/master/index.js
function hash(str) {
    let hash = 5381;
    let i = str.length;
    while (i--)
        hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
    return hash >>> 0;
}
function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
    const step = 16.666 / duration;
    let keyframes = '{\n';
    for (let p = 0; p <= 1; p += step) {
        const t = a + (b - a) * ease(p);
        keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
    }
    const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
    const name = `__svelte_${hash(rule)}_${uid}`;
    const doc = node.ownerDocument;
    active_docs.add(doc);
    const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
    const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
    if (!current_rules[name]) {
        current_rules[name] = true;
        stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
    }
    const animation = node.style.animation || '';
    node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
    active += 1;
    return name;
}
function delete_rule(node, name) {
    const previous = (node.style.animation || '').split(', ');
    const next = previous.filter(name
        ? anim => anim.indexOf(name) < 0 // remove specific animation
        : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
    );
    const deleted = previous.length - next.length;
    if (deleted) {
        node.style.animation = next.join(', ');
        active -= deleted;
        if (!active)
            clear_rules();
    }
}
function clear_rules() {
    raf(() => {
        if (active)
            return;
        active_docs.forEach(doc => {
            const stylesheet = doc.__svelte_stylesheet;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            doc.__svelte_rules = {};
        });
        active_docs.clear();
    });
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error(`Function called outside component initialization`);
    return current_component;
}
function createEventDispatcher() {
    const component = get_current_component();
    return (type, detail) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail);
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
        }
    };
}
// TODO figure out if we still want to support
// shorthand events, or if we want to implement
// a real bubbling mechanism
function bubble(component, event) {
    const callbacks = component.$$.callbacks[event.type];
    if (callbacks) {
        callbacks.slice().forEach(fn => fn(event));
    }
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
let flushing = false;
const seen_callbacks = new Set();
function flush() {
    if (flushing)
        return;
    flushing = true;
    do {
        // first, call beforeUpdate functions
        // and update components
        for (let i = 0; i < dirty_components.length; i += 1) {
            const component = dirty_components[i];
            set_current_component(component);
            update(component.$$);
        }
        dirty_components.length = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    flushing = false;
    seen_callbacks.clear();
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}

let promise;
function wait() {
    if (!promise) {
        promise = Promise.resolve();
        promise.then(() => {
            promise = null;
        });
    }
    return promise;
}
function dispatch(node, direction, kind) {
    node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
}
const null_transition = { duration: 0 };
function create_in_transition(node, fn, params) {
    let config = fn(node, params);
    let running = false;
    let animation_name;
    let task;
    let uid = 0;
    function cleanup() {
        if (animation_name)
            delete_rule(node, animation_name);
    }
    function go() {
        const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
        if (css)
            animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
        tick(0, 1);
        const start_time = now() + delay;
        const end_time = start_time + duration;
        if (task)
            task.abort();
        running = true;
        add_render_callback(() => dispatch(node, true, 'start'));
        task = loop(now => {
            if (running) {
                if (now >= end_time) {
                    tick(1, 0);
                    dispatch(node, true, 'end');
                    cleanup();
                    return running = false;
                }
                if (now >= start_time) {
                    const t = easing((now - start_time) / duration);
                    tick(t, 1 - t);
                }
            }
            return running;
        });
    }
    let started = false;
    return {
        start() {
            if (started)
                return;
            delete_rule(node);
            if (is_function(config)) {
                config = config();
                wait().then(go);
            }
            else {
                go();
            }
        },
        invalidate() {
            started = false;
        },
        end() {
            if (running) {
                cleanup();
                running = false;
            }
        }
    };
}
function create_out_transition(node, fn, params) {
    let config = fn(node, params);
    let running = true;
    let animation_name;
    const group = outros;
    group.r += 1;
    function go() {
        const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
        if (css)
            animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
        const start_time = now() + delay;
        const end_time = start_time + duration;
        add_render_callback(() => dispatch(node, false, 'start'));
        loop(now => {
            if (running) {
                if (now >= end_time) {
                    tick(0, 1);
                    dispatch(node, false, 'end');
                    if (!--group.r) {
                        // this will result in `end()` being called,
                        // so we don't need to clean up here
                        run_all(group.c);
                    }
                    return false;
                }
                if (now >= start_time) {
                    const t = easing((now - start_time) / duration);
                    tick(1 - t, t);
                }
            }
            return running;
        });
    }
    if (is_function(config)) {
        wait().then(() => {
            // @ts-ignore
            config = config();
            go();
        });
    }
    else {
        go();
    }
    return {
        end(reset) {
            if (reset && config.tick) {
                config.tick(1, 0);
            }
            if (running) {
                if (animation_name)
                    delete_rule(node, animation_name);
                running = false;
            }
        }
    };
}
function create_bidirectional_transition(node, fn, params, intro) {
    let config = fn(node, params);
    let t = intro ? 0 : 1;
    let running_program = null;
    let pending_program = null;
    let animation_name = null;
    function clear_animation() {
        if (animation_name)
            delete_rule(node, animation_name);
    }
    function init(program, duration) {
        const d = program.b - t;
        duration *= Math.abs(d);
        return {
            a: t,
            b: program.b,
            d,
            duration,
            start: program.start,
            end: program.start + duration,
            group: program.group
        };
    }
    function go(b) {
        const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
        const program = {
            start: now() + delay,
            b
        };
        if (!b) {
            // @ts-ignore todo: improve typings
            program.group = outros;
            outros.r += 1;
        }
        if (running_program) {
            pending_program = program;
        }
        else {
            // if this is an intro, and there's a delay, we need to do
            // an initial tick and/or apply CSS animation immediately
            if (css) {
                clear_animation();
                animation_name = create_rule(node, t, b, duration, delay, easing, css);
            }
            if (b)
                tick(0, 1);
            running_program = init(program, duration);
            add_render_callback(() => dispatch(node, b, 'start'));
            loop(now => {
                if (pending_program && now > pending_program.start) {
                    running_program = init(pending_program, duration);
                    pending_program = null;
                    dispatch(node, running_program.b, 'start');
                    if (css) {
                        clear_animation();
                        animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                    }
                }
                if (running_program) {
                    if (now >= running_program.end) {
                        tick(t = running_program.b, 1 - t);
                        dispatch(node, running_program.b, 'end');
                        if (!pending_program) {
                            // we're done
                            if (running_program.b) {
                                // intro — we can tidy up immediately
                                clear_animation();
                            }
                            else {
                                // outro — needs to be coordinated
                                if (!--running_program.group.r)
                                    run_all(running_program.group.c);
                            }
                        }
                        running_program = null;
                    }
                    else if (now >= running_program.start) {
                        const p = now - running_program.start;
                        t = running_program.a + running_program.d * easing(p / running_program.duration);
                        tick(t, 1 - t);
                    }
                }
                return !!(running_program || pending_program);
            });
        }
    }
    return {
        run(b) {
            if (is_function(config)) {
                wait().then(() => {
                    // @ts-ignore
                    config = config();
                    go(b);
                });
            }
            else {
                go(b);
            }
        },
        end() {
            clear_animation();
            running_program = pending_program = null;
        }
    };
}

function handle_promise(promise, info) {
    const token = info.token = {};
    function update(type, index, key, value) {
        if (info.token !== token)
            return;
        info.resolved = value;
        let child_ctx = info.ctx;
        if (key !== undefined) {
            child_ctx = child_ctx.slice();
            child_ctx[key] = value;
        }
        const block = type && (info.current = type)(child_ctx);
        let needs_flush = false;
        if (info.block) {
            if (info.blocks) {
                info.blocks.forEach((block, i) => {
                    if (i !== index && block) {
                        group_outros();
                        transition_out(block, 1, 1, () => {
                            info.blocks[i] = null;
                        });
                        check_outros();
                    }
                });
            }
            else {
                info.block.d(1);
            }
            block.c();
            transition_in(block, 1);
            block.m(info.mount(), info.anchor);
            needs_flush = true;
        }
        info.block = block;
        if (info.blocks)
            info.blocks[index] = block;
        if (needs_flush) {
            flush();
        }
    }
    if (is_promise(promise)) {
        const current_component = get_current_component();
        promise.then(value => {
            set_current_component(current_component);
            update(info.then, 1, info.value, value);
            set_current_component(null);
        }, error => {
            set_current_component(current_component);
            update(info.catch, 2, info.error, error);
            set_current_component(null);
        });
        // if we previously had a then/catch block, destroy it
        if (info.current !== info.pending) {
            update(info.pending, 0);
            return true;
        }
    }
    else {
        if (info.current !== info.then) {
            update(info.then, 1, info.value, promise);
            return true;
        }
        info.resolved = promise;
    }
}
function create_component(block) {
    block && block.c();
}
function mount_component(component, target, anchor) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    // onMount happens before the initial afterUpdate
    add_render_callback(() => {
        const new_on_destroy = on_mount.map(run).filter(is_function);
        if (on_destroy) {
            on_destroy.push(...new_on_destroy);
        }
        else {
            // Edge case - component was destroyed immediately,
            // most likely as a result of a binding initialising
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const prop_values = options.props || {};
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, prop_values, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if ($$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor);
        flush();
    }
    set_current_component(parent_component);
}
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set() {
        // overridden by instance, if it has props
    }
}

const subscriber_queue = [];
/**
 * Creates a `Readable` store that allows reading by subscription.
 * @param value initial value
 * @param {StartStopNotifier}start start and stop notifications for subscriptions
 */
function readable(value, start) {
    return {
        subscribe: writable(value, start).subscribe,
    };
}
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
function writable(value, start = noop) {
    let stop;
    const subscribers = [];
    function set(new_value) {
        if (safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (let i = 0; i < subscribers.length; i += 1) {
                    const s = subscribers[i];
                    s[1]();
                    subscriber_queue.push(s, value);
                }
                if (run_queue) {
                    for (let i = 0; i < subscriber_queue.length; i += 2) {
                        subscriber_queue[i][0](subscriber_queue[i + 1]);
                    }
                    subscriber_queue.length = 0;
                }
            }
        }
    }
    function update(fn) {
        set(fn(value));
    }
    function subscribe(run, invalidate = noop) {
        const subscriber = [run, invalidate];
        subscribers.push(subscriber);
        if (subscribers.length === 1) {
            stop = start(set) || noop;
        }
        run(value);
        return () => {
            const index = subscribers.indexOf(subscriber);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
            if (subscribers.length === 0) {
                stop();
                stop = null;
            }
        };
    }
    return { set, update, subscribe };
}
function derived(stores, fn, initial_value) {
    const single = !Array.isArray(stores);
    const stores_array = single
        ? [stores]
        : stores;
    const auto = fn.length < 2;
    return readable(initial_value, (set) => {
        let inited = false;
        const values = [];
        let pending = 0;
        let cleanup = noop;
        const sync = () => {
            if (pending) {
                return;
            }
            cleanup();
            const result = fn(single ? values[0] : values, set);
            if (auto) {
                set(result);
            }
            else {
                cleanup = is_function(result) ? result : noop;
            }
        };
        const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
            values[i] = value;
            pending &= ~(1 << i);
            if (inited) {
                sync();
            }
        }, () => {
            pending |= (1 << i);
        }));
        inited = true;
        sync();
        return function stop() {
            run_all(unsubscribers);
            cleanup();
        };
    });
}

function cubicOut(t) {
    const f = t - 1.0;
    return f * f * f + 1.0;
}

function is_date(obj) {
    return Object.prototype.toString.call(obj) === '[object Date]';
}

function tick_spring(ctx, last_value, current_value, target_value) {
    if (typeof current_value === 'number' || is_date(current_value)) {
        // @ts-ignore
        const delta = target_value - current_value;
        // @ts-ignore
        const velocity = (current_value - last_value) / (ctx.dt || 1 / 60); // guard div by 0
        const spring = ctx.opts.stiffness * delta;
        const damper = ctx.opts.damping * velocity;
        const acceleration = (spring - damper) * ctx.inv_mass;
        const d = (velocity + acceleration) * ctx.dt;
        if (Math.abs(d) < ctx.opts.precision && Math.abs(delta) < ctx.opts.precision) {
            return target_value; // settled
        }
        else {
            ctx.settled = false; // signal loop to keep ticking
            // @ts-ignore
            return is_date(current_value) ?
                new Date(current_value.getTime() + d) : current_value + d;
        }
    }
    else if (Array.isArray(current_value)) {
        // @ts-ignore
        return current_value.map((_, i) => tick_spring(ctx, last_value[i], current_value[i], target_value[i]));
    }
    else if (typeof current_value === 'object') {
        const next_value = {};
        for (const k in current_value)
            // @ts-ignore
            next_value[k] = tick_spring(ctx, last_value[k], current_value[k], target_value[k]);
        // @ts-ignore
        return next_value;
    }
    else {
        throw new Error(`Cannot spring ${typeof current_value} values`);
    }
}
function spring(value, opts = {}) {
    const store = writable(value);
    const { stiffness = 0.15, damping = 0.8, precision = 0.01 } = opts;
    let last_time;
    let task;
    let current_token;
    let last_value = value;
    let target_value = value;
    let inv_mass = 1;
    let inv_mass_recovery_rate = 0;
    let cancel_task = false;
    function set(new_value, opts = {}) {
        target_value = new_value;
        const token = current_token = {};
        if (value == null || opts.hard || (spring.stiffness >= 1 && spring.damping >= 1)) {
            cancel_task = true; // cancel any running animation
            last_time = now();
            last_value = new_value;
            store.set(value = target_value);
            return Promise.resolve();
        }
        else if (opts.soft) {
            const rate = opts.soft === true ? .5 : +opts.soft;
            inv_mass_recovery_rate = 1 / (rate * 60);
            inv_mass = 0; // infinite mass, unaffected by spring forces
        }
        if (!task) {
            last_time = now();
            cancel_task = false;
            task = loop(now => {
                if (cancel_task) {
                    cancel_task = false;
                    task = null;
                    return false;
                }
                inv_mass = Math.min(inv_mass + inv_mass_recovery_rate, 1);
                const ctx = {
                    inv_mass,
                    opts: spring,
                    settled: true,
                    dt: (now - last_time) * 60 / 1000
                };
                const next_value = tick_spring(ctx, last_value, value, target_value);
                last_time = now;
                last_value = value;
                store.set(value = next_value);
                if (ctx.settled)
                    task = null;
                return !ctx.settled;
            });
        }
        return new Promise(fulfil => {
            task.promise.then(() => {
                if (token === current_token)
                    fulfil();
            });
        });
    }
    const spring = {
        set,
        update: (fn, opts) => set(fn(target_value, value), opts),
        subscribe: store.subscribe,
        stiffness,
        damping,
        precision
    };
    return spring;
}

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}
function fade(node, { delay = 0, duration = 400, easing = identity }) {
    const o = +getComputedStyle(node).opacity;
    return {
        delay,
        duration,
        easing,
        css: t => `opacity: ${t * o}`
    };
}
function crossfade(_a) {
    var { fallback } = _a, defaults = __rest(_a, ["fallback"]);
    const to_receive = new Map();
    const to_send = new Map();
    function crossfade(from, node, params) {
        const { delay = 0, duration = d => Math.sqrt(d) * 30, easing = cubicOut } = assign(assign({}, defaults), params);
        const to = node.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        const dw = from.width / to.width;
        const dh = from.height / to.height;
        const d = Math.sqrt(dx * dx + dy * dy);
        const style = getComputedStyle(node);
        const transform = style.transform === 'none' ? '' : style.transform;
        const opacity = +style.opacity;
        return {
            delay,
            duration: is_function(duration) ? duration(d) : duration,
            easing,
            css: (t, u) => `
				opacity: ${t * opacity};
				transform-origin: top left;
				transform: ${transform} translate(${u * dx}px,${u * dy}px) scale(${t + (1 - t) * dw}, ${t + (1 - t) * dh});
			`
        };
    }
    function transition(items, counterparts, intro) {
        return (node, params) => {
            items.set(params.key, {
                rect: node.getBoundingClientRect()
            });
            return () => {
                if (counterparts.has(params.key)) {
                    const { rect } = counterparts.get(params.key);
                    counterparts.delete(params.key);
                    return crossfade(rect, node, params);
                }
                // if the node is disappearing altogether
                // (i.e. wasn't claimed by the other list)
                // then we need to supply an outro
                items.delete(params.key);
                return fallback && fallback(node, params, intro);
            };
        };
    }
    return [
        transition(to_send, to_receive, false),
        transition(to_receive, to_send, true)
    ];
}

function pannable(node) {
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

        if (zoomTimeout) clearTimeout(zoomTimeout);
        if (scale < 1) zoomTimeout = setTimeout(resetScale, 500);

        recenter();

        node.dispatchEvent(new CustomEvent('panmove', {
            detail: {panX, panY, spring: true}
        }));

        node.dispatchEvent(new CustomEvent('zoomchanged', {
            detail: {scale, spring: true}
        }));
    }

    function resetScale() {
        scale = 1;
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
        // console.log("RECENTERING")
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
                // console.log("else")
                touchData.t = [];
                touchData.pinchDist = 0;
            }
        }



    }

    function handleTouchend(e) {

        touchData.pinchDist = 0;
        touchData.lastE = null;
        // console.log("touch ended")

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

const prev = (x, max) => (x - 1 < 0 ? max : x - 1);
const next = (x, max) => (x + 1 > max ? 0 : x + 1);

const photos = writable([]);
let currentIndex = writable(-1);
const currentPhotoStatus = writable({loading: false, loaded: false});

const photosLength = derived(photos, (a) => a.length);
const prevPhoto = derived([photos, currentIndex], ([a, b]) => a[prev(b, a.length - 1)]);
const currentPhoto = derived([photos, currentIndex], ([a, b]) => a[b]);
const nextPhoto = derived([photos, currentIndex], ([a, b]) => a[next(b, a.length - 1)]);

currentIndex = {
    ...currentIndex,
    next: () => currentIndex.update(x => next(x, get_store_value(photosLength) - 1)),
    prev: () => currentIndex.update(x => prev(x, get_store_value(photosLength) - 1)),
    setKey: (key) => currentIndex.set(get_store_value(photos).findIndex(x => x.key === key))

};

const [send, receive] = crossfade({
        duration: 300,
        // fallback: fade,
    });

/* src/FSPhotoViewer.svelte generated by Svelte v3.21.0 */

function add_css() {
	var style = element("style");
	style.id = "svelte-1m22xjp-style";
	style.textContent = ".modal-background.svelte-1m22xjp{background-color:rgba(10, 10, 10, 0.86);bottom:0;left:0;position:absolute;right:0;top:0}section.svelte-1m22xjp{position:fixed;width:100vw;height:100vh;padding:0;margin:0;top:0;left:0;z-index:100}.slidecontainer.svelte-1m22xjp{display:flex;justify-content:center;align-items:center;height:100%}img.svelte-1m22xjp{max-width:unset;max-width:100vw;max-height:100vh;object-fit:contain;user-select:none}@keyframes svelte-1m22xjp-fadeImg{from{opacity:0}to{opacity:1}}";
	append(document.head, style);
}

// (145:0) {#if $currentPhotoStatus.loaded}
function create_if_block(ctx) {
	let await_block_anchor;
	let promise;
	let current;

	let info = {
		ctx,
		current: null,
		token: null,
		pending: create_pending_block,
		then: create_then_block,
		catch: create_catch_block,
		value: 20,
		blocks: [,,,]
	};

	handle_promise(promise = /*$currentPhoto*/ ctx[2], info);

	return {
		c() {
			await_block_anchor = empty();
			info.block.c();
		},
		m(target, anchor) {
			insert(target, await_block_anchor, anchor);
			info.block.m(target, info.anchor = anchor);
			info.mount = () => await_block_anchor.parentNode;
			info.anchor = await_block_anchor;
			current = true;
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			info.ctx = ctx;

			if (dirty & /*$currentPhoto*/ 4 && promise !== (promise = /*$currentPhoto*/ ctx[2]) && handle_promise(promise, info)) ; else {
				const child_ctx = ctx.slice();
				child_ctx[20] = info.resolved;
				info.block.p(child_ctx, dirty);
			}
		},
		i(local) {
			if (current) return;
			transition_in(info.block);
			current = true;
		},
		o(local) {
			for (let i = 0; i < 3; i += 1) {
				const block = info.blocks[i];
				transition_out(block);
			}

			current = false;
		},
		d(detaching) {
			if (detaching) detach(await_block_anchor);
			info.block.d(detaching);
			info.token = null;
			info = null;
		}
	};
}

// (1:0) <script>     import { tweened }
function create_catch_block(ctx) {
	return {
		c: noop,
		m: noop,
		p: noop,
		i: noop,
		o: noop,
		d: noop
	};
}

// (146:33)           <section>             <!-- <h1 class="title">{photo.uuid}
function create_then_block(ctx) {
	let section;
	let div0;
	let div0_transition;
	let t;
	let div2;
	let div1;
	let img;
	let img_src_value;
	let img_intro;
	let img_outro;
	let pannable_action;
	let current;
	let dispose;

	return {
		c() {
			section = element("section");
			div0 = element("div");
			t = space();
			div2 = element("div");
			div1 = element("div");
			img = element("img");
			attr(div0, "class", "modal-background svelte-1m22xjp");
			attr(img, "draggable", "false");
			attr(img, "alt", "Photo");
			if (img.src !== (img_src_value = /*d*/ ctx[20].src)) attr(img, "src", img_src_value);
			attr(img, "class", "svelte-1m22xjp");
			set_style(div1, "transform", "scale(" + /*$imageScale*/ ctx[0] + ") translate(" + /*$coords*/ ctx[3].x + "px," + /*$coords*/ ctx[3].y + "px)");
			attr(div1, "class", "slider");
			attr(div2, "class", "slidecontainer svelte-1m22xjp");
			attr(section, "class", "svelte-1m22xjp");
		},
		m(target, anchor, remount) {
			insert(target, section, anchor);
			append(section, div0);
			append(section, t);
			append(section, div2);
			append(div2, div1);
			append(div1, img);
			current = true;
			if (remount) run_all(dispose);

			dispose = [
				listen(div0, "click", /*closeModal*/ ctx[9]),
				listen(img, "mousedown", prevent_default(/*mousedown_handler*/ ctx[19])),
				action_destroyer(pannable_action = pannable.call(null, div1)),
				listen(div1, "panmove", /*handlePanMove*/ ctx[7]),
				listen(div1, "zoomchanged", /*handleZoom*/ ctx[8])
			];
		},
		p(ctx, dirty) {
			if (!current || dirty & /*$currentPhoto*/ 4 && img.src !== (img_src_value = /*d*/ ctx[20].src)) {
				attr(img, "src", img_src_value);
			}

			if (!current || dirty & /*$imageScale, $coords*/ 9) {
				set_style(div1, "transform", "scale(" + /*$imageScale*/ ctx[0] + ") translate(" + /*$coords*/ ctx[3].x + "px," + /*$coords*/ ctx[3].y + "px)");
			}
		},
		i(local) {
			if (current) return;

			add_render_callback(() => {
				if (!div0_transition) div0_transition = create_bidirectional_transition(div0, fade, { duration: 200 }, true);
				div0_transition.run(1);
			});

			add_render_callback(() => {
				if (img_outro) img_outro.end(1);
				if (!img_intro) img_intro = create_in_transition(img, receive, { key: /*d*/ ctx[20].key });
				img_intro.start();
			});

			current = true;
		},
		o(local) {
			if (!div0_transition) div0_transition = create_bidirectional_transition(div0, fade, { duration: 200 }, false);
			div0_transition.run(0);
			if (img_intro) img_intro.invalidate();
			img_outro = create_out_transition(img, send, { key: /*d*/ ctx[20].key });
			current = false;
		},
		d(detaching) {
			if (detaching) detach(section);
			if (detaching && div0_transition) div0_transition.end();
			if (detaching && img_outro) img_outro.end();
			run_all(dispose);
		}
	};
}

// (1:0) <script>     import { tweened }
function create_pending_block(ctx) {
	return {
		c: noop,
		m: noop,
		p: noop,
		i: noop,
		o: noop,
		d: noop
	};
}

function create_fragment(ctx) {
	let if_block_anchor;
	let current;
	let dispose;
	let if_block = /*$currentPhotoStatus*/ ctx[1].loaded && create_if_block(ctx);

	return {
		c() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		m(target, anchor, remount) {
			if (if_block) if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
			current = true;
			if (remount) dispose();
			dispose = listen(window, "keydown", /*handleKeydown*/ ctx[6]);
		},
		p(ctx, [dirty]) {
			if (/*$currentPhotoStatus*/ ctx[1].loaded) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty & /*$currentPhotoStatus*/ 2) {
						transition_in(if_block, 1);
					}
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
			dispose();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $prevPhoto;
	let $nextPhoto;
	let $imageScale;
	let $currentPhotoStatus;
	let $currentPhoto;
	let $coords;
	component_subscribe($$self, prevPhoto, $$value => $$invalidate(12, $prevPhoto = $$value));
	component_subscribe($$self, nextPhoto, $$value => $$invalidate(13, $nextPhoto = $$value));
	component_subscribe($$self, currentPhotoStatus, $$value => $$invalidate(1, $currentPhotoStatus = $$value));
	component_subscribe($$self, currentPhoto, $$value => $$invalidate(2, $currentPhoto = $$value));

	let { photos: photos$1 = [
		{
			src: "https://source.unsplash.com/2ShvY8Lf6l0/800x599",
			width: 4,
			height: 3,
			key: "1"
		},
		{
			src: "https://source.unsplash.com/Dm-qxdynoEc/800x799",
			width: 1,
			height: 1,
			key: "2"
		},
		{
			src: "https://source.unsplash.com/qDkso9nvCg0/600x799",
			width: 3,
			height: 4,
			key: "3"
		}
	] } = $$props;

	let { currentIndex: currentIndex$1 = 0 } = $$props;
	photos.set(photos$1);

	/* _currentIndex.set(currentIndex); */
	const loadPhoto = p => {
		if (!p) return;

		const timeout = setTimeout(
			() => currentPhotoStatus.update(a => {
				return { ...a, loading: true };
			}),
			100
		);

		const img = new Image();

		img.onload = () => {
			clearTimeout(timeout);
			currentPhotoStatus.set({ loading: false, loaded: true });
		}; /* console.log("done loading"); */

		img.onerror = () => {
			clearTimeout(timeout);
			currentPhotoStatus.set({ loading: false, loaded: false });
			console.log("IMAGE ERROR");
		};

		img.src = p.src;
		new Image().src = $prevPhoto.src;
		new Image().src = $nextPhoto.src;
	};

	currentPhoto.subscribe(p => {
		/* console.log("current: ", p); */
		loadPhoto(p);
	});

	const component = get_current_component();
	const svelteDispatch = createEventDispatcher();

	const dispatch = (name, detail) => {
		svelteDispatch(name, detail);
		component.dispatchEvent && component.dispatchEvent(new CustomEvent(name, { detail }));
	};

	const imageScale = spring(1);
	component_subscribe($$self, imageScale, value => $$invalidate(0, $imageScale = value));
	const coords = spring({ x: 0, y: 0 });
	component_subscribe($$self, coords, value => $$invalidate(3, $coords = value));

	function changePhoto(n) {
		if ($imageScale > 1) return;

		// console.log($_currentIndex);
		if (n > 0) {
			currentIndex.next();
		} else {
			currentIndex.prev();
		}
	} /* dispatch("next"); */

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
		coords.set({ x: e.detail.panX, y: e.detail.panY }, { hard: !e.detail.spring });
	}

	function handleZoom(e) {
		imageScale.set(e.detail.scale, { hard: !e.detail.spring });
	}

	function closeModal() {
		//console.log("cclosing");
		/* dispatch("ccclose"); */
		coords.set({ x: 0, y: 0 });

		imageScale.set(1);
		currentPhotoStatus.set({ loading: false, loaded: false });
		currentIndex.set(-1);
	}

	function mousedown_handler(event) {
		bubble($$self, event);
	}

	$$self.$set = $$props => {
		if ("photos" in $$props) $$invalidate(10, photos$1 = $$props.photos);
		if ("currentIndex" in $$props) $$invalidate(11, currentIndex$1 = $$props.currentIndex);
	};

	return [
		$imageScale,
		$currentPhotoStatus,
		$currentPhoto,
		$coords,
		imageScale,
		coords,
		handleKeydown,
		handlePanMove,
		handleZoom,
		closeModal,
		photos$1,
		currentIndex$1,
		$prevPhoto,
		$nextPhoto,
		loadPhoto,
		component,
		svelteDispatch,
		dispatch,
		changePhoto,
		mousedown_handler
	];
}

class FSPhotoViewer extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-1m22xjp-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, { photos: 10, currentIndex: 11 });
	}
}

/* src/Thumbnail.svelte generated by Svelte v3.21.0 */

function add_css$1() {
	var style = element("style");
	style.id = "svelte-i8gzlb-style";
	style.textContent = ".container.svelte-i8gzlb{position:relative;display:block;height:100%;width:100%}.thumbnail.svelte-i8gzlb{height:100%;width:100%}.is-overlay.svelte-i8gzlb{background-color:rgba(1, 1, 1, 0.5);bottom:0;left:0;position:absolute;right:0;top:0}.loader.svelte-i8gzlb{position:absolute;left:calc(50% - (1em / 2));top:calc(50% - (1em / 2))}.loader.svelte-i8gzlb{animation:svelte-i8gzlb-spinAround 500ms infinite linear;border:2px solid #dbdbdb;border-radius:290486px;border-right-color:transparent;border-top-color:transparent;content:\"\";display:block;height:1em;position:relative;width:1em}@keyframes svelte-i8gzlb-spinAround{from{transform:rotate(0deg)}to{transform:rotate(359deg)}}.svelte-i8gzlb:host{position:relative;display:inline-flex}";
	append(document.head, style);
}

// (57:29) 
function create_if_block_2(ctx) {
	let div;

	return {
		c() {
			div = element("div");
			attr(div, "class", "thumbnail svelte-i8gzlb");
			set_style(div, "width", /*containerEl*/ ctx[3].clientWidth + "px");
		},
		m(target, anchor) {
			insert(target, div, anchor);
		},
		p(ctx, dirty) {
			if (dirty & /*containerEl*/ 8) {
				set_style(div, "width", /*containerEl*/ ctx[3].clientWidth + "px");
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

// (42:4) {#if !isCurrent || (isCurrent && !$currentPhotoStatus.loaded)}
function create_if_block$1(ctx) {
	let div;
	let t;
	let div_intro;
	let div_outro;
	let current;
	let dispose;
	const default_slot_template = /*$$slots*/ ctx[7].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[6], null);
	let if_block = /*isCurrent*/ ctx[2] && /*$currentPhotoStatus*/ ctx[4].loading && create_if_block_1();

	return {
		c() {
			div = element("div");
			if (default_slot) default_slot.c();
			t = space();
			if (if_block) if_block.c();
			attr(div, "class", "thumbnail svelte-i8gzlb");
		},
		m(target, anchor, remount) {
			insert(target, div, anchor);

			if (default_slot) {
				default_slot.m(div, null);
			}

			append(div, t);
			if (if_block) if_block.m(div, null);
			current = true;
			if (remount) dispose();
			dispose = listen(div, "click", /*handleClick*/ ctx[5]);
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && dirty & /*$$scope*/ 64) {
					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[6], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[6], dirty, null));
				}
			}

			if (/*isCurrent*/ ctx[2] && /*$currentPhotoStatus*/ ctx[4].loading) {
				if (if_block) ; else {
					if_block = create_if_block_1();
					if_block.c();
					if_block.m(div, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);

			add_render_callback(() => {
				if (div_outro) div_outro.end(1);
				if (!div_intro) div_intro = create_in_transition(div, receive, { key: /*key*/ ctx[0] });
				div_intro.start();
			});

			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			if (div_intro) div_intro.invalidate();
			div_outro = create_out_transition(div, send, { key: /*key*/ ctx[0] });
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);
			if (default_slot) default_slot.d(detaching);
			if (if_block) if_block.d();
			if (detaching && div_outro) div_outro.end();
			dispose();
		}
	};
}

// (50:12) {#if isCurrent && $currentPhotoStatus.loading}
function create_if_block_1(ctx) {
	let div;

	return {
		c() {
			div = element("div");
			div.innerHTML = `<span class="loader svelte-i8gzlb"></span>`;
			attr(div, "class", "is-overlay svelte-i8gzlb");
		},
		m(target, anchor) {
			insert(target, div, anchor);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

function create_fragment$1(ctx) {
	let div;
	let current_block_type_index;
	let if_block;
	let current;
	const if_block_creators = [create_if_block$1, create_if_block_2];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (!/*isCurrent*/ ctx[2] || /*isCurrent*/ ctx[2] && !/*$currentPhotoStatus*/ ctx[4].loaded) return 0;
		if (/*addPlaceholder*/ ctx[1]) return 1;
		return -1;
	}

	if (~(current_block_type_index = select_block_type(ctx))) {
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
	}

	return {
		c() {
			div = element("div");
			if (if_block) if_block.c();
			attr(div, "class", "container svelte-i8gzlb");
		},
		m(target, anchor) {
			insert(target, div, anchor);

			if (~current_block_type_index) {
				if_blocks[current_block_type_index].m(div, null);
			}

			/*div_binding*/ ctx[8](div);
			current = true;
		},
		p(ctx, [dirty]) {
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);

			if (current_block_type_index === previous_block_index) {
				if (~current_block_type_index) {
					if_blocks[current_block_type_index].p(ctx, dirty);
				}
			} else {
				if (if_block) {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
				}

				if (~current_block_type_index) {
					if_block = if_blocks[current_block_type_index];

					if (!if_block) {
						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block.c();
					}

					transition_in(if_block, 1);
					if_block.m(div, null);
				} else {
					if_block = null;
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);

			if (~current_block_type_index) {
				if_blocks[current_block_type_index].d();
			}

			/*div_binding*/ ctx[8](null);
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let $currentPhotoStatus;
	component_subscribe($$self, currentPhotoStatus, $$value => $$invalidate(4, $currentPhotoStatus = $$value));
	let { key } = $$props;
	let { addPlaceholder = false } = $$props;
	let isCurrent = false;
	let containerEl;

	function handleClick() {
		currentIndex.setKey(key);
	}

	currentPhoto.subscribe(v => {
		if (!v) {
			$$invalidate(2, isCurrent = false);
			return;
		}

		let newCurrent = v.key == key;
		if (isCurrent === newCurrent) return;

		$$invalidate(2, isCurrent = newCurrent);
	});

	let { $$slots = {}, $$scope } = $$props;

	function div_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(3, containerEl = $$value);
		});
	}

	$$self.$set = $$props => {
		if ("key" in $$props) $$invalidate(0, key = $$props.key);
		if ("addPlaceholder" in $$props) $$invalidate(1, addPlaceholder = $$props.addPlaceholder);
		if ("$$scope" in $$props) $$invalidate(6, $$scope = $$props.$$scope);
	};

	return [
		key,
		addPlaceholder,
		isCurrent,
		containerEl,
		$currentPhotoStatus,
		handleClick,
		$$scope,
		$$slots,
		div_binding
	];
}

class Thumbnail extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-i8gzlb-style")) add_css$1();
		init(this, options, instance$1, create_fragment$1, safe_not_equal, { key: 0, addPlaceholder: 1 });
	}
}

/* demo/Demo.svelte generated by Svelte v3.21.0 */

function add_css$2() {
	var style = element("style");
	style.id = "svelte-ny28sf-style";
	style.textContent = "img.svelte-ny28sf{max-height:100%;min-width:100%;display:block;object-fit:cover}ul.svelte-ny28sf{display:flex;flex-wrap:wrap;list-style:none;padding:0}li.svelte-ny28sf{flex-grow:1;position:relative;height:200px;display:flex;padding:2px}li.svelte-ny28sf:last-child{flex-grow:10}";
	append(document.head, style);
}

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[2] = list[i];
	return child_ctx;
}

// (54:12) <Thumbnail key={p.key}>
function create_default_slot(ctx) {
	let img;
	let img_src_value;
	let img_alt_value;

	return {
		c() {
			img = element("img");
			if (img.src !== (img_src_value = /*p*/ ctx[2].thumbnail)) attr(img, "src", img_src_value);
			attr(img, "alt", img_alt_value = /*p*/ ctx[2].key);
			attr(img, "class", "svelte-ny28sf");
		},
		m(target, anchor) {
			insert(target, img, anchor);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(img);
		}
	};
}

// (52:4) {#each photos as p}
function create_each_block(ctx) {
	let li;
	let current;

	const thumbnail = new Thumbnail({
			props: {
				key: /*p*/ ctx[2].key,
				$$slots: { default: [create_default_slot] },
				$$scope: { ctx }
			}
		});

	return {
		c() {
			li = element("li");
			create_component(thumbnail.$$.fragment);
			attr(li, "class", "svelte-ny28sf");
		},
		m(target, anchor) {
			insert(target, li, anchor);
			mount_component(thumbnail, li, null);
			current = true;
		},
		p(ctx, dirty) {
			const thumbnail_changes = {};

			if (dirty & /*$$scope*/ 32) {
				thumbnail_changes.$$scope = { dirty, ctx };
			}

			thumbnail.$set(thumbnail_changes);
		},
		i(local) {
			if (current) return;
			transition_in(thumbnail.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(thumbnail.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(li);
			destroy_component(thumbnail);
		}
	};
}

function create_fragment$2(ctx) {
	let t0;
	let ul;
	let t1;
	let li;
	let current;
	const fsphotoviewer = new FSPhotoViewer({ props: { photos: /*photos*/ ctx[0] } });
	let each_value = /*photos*/ ctx[0];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	return {
		c() {
			create_component(fsphotoviewer.$$.fragment);
			t0 = space();
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t1 = space();
			li = element("li");
			attr(li, "class", "svelte-ny28sf");
			attr(ul, "class", "svelte-ny28sf");
		},
		m(target, anchor) {
			mount_component(fsphotoviewer, target, anchor);
			insert(target, t0, anchor);
			insert(target, ul, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(ul, null);
			}

			append(ul, t1);
			append(ul, li);
			current = true;
		},
		p(ctx, [dirty]) {
			if (dirty & /*photos*/ 1) {
				each_value = /*photos*/ ctx[0];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(ul, t1);
					}
				}

				group_outros();

				for (i = each_value.length; i < each_blocks.length; i += 1) {
					out(i);
				}

				check_outros();
			}
		},
		i(local) {
			if (current) return;
			transition_in(fsphotoviewer.$$.fragment, local);

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o(local) {
			transition_out(fsphotoviewer.$$.fragment, local);
			each_blocks = each_blocks.filter(Boolean);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d(detaching) {
			destroy_component(fsphotoviewer, detaching);
			if (detaching) detach(t0);
			if (detaching) detach(ul);
			destroy_each(each_blocks, detaching);
		}
	};
}

function instance$2($$self) {
	let unsplash = [
		{ id: "8YdGi6rC6Z0", w: 2400, h: 3000 },
		{ id: "Jqa53u4Q2g4", w: 2400, h: 1600 },
		{ id: "c6M7AoevSXE", w: 2400, h: 1600 },
		{ id: "qCn0kU9M_uk", w: 2400, h: 1490 },
		{ id: "p3OzJuT_Dks", w: 2400, h: 1600 },
		{ id: "zv3ckJKftC4", w: 2400, h: 3200 }
	];

	let photos = unsplash.map(x => ({
		src: `https://source.unsplash.com/${x.id}/${x.w}x${x.h}`,
		thumbnail: `https://source.unsplash.com/${x.id}/${x.w / 5}x${x.h / 5}`,
		key: x.id,
		ratio: x.w / x.h
	}));

	return [photos];
}

class Demo extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-ny28sf-style")) add_css$2();
		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
	}
}

export default Demo;
//# sourceMappingURL=Demo.js.map
