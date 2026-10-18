/* vim: set expandtab tabstop=4 softtabstop=4 shiftwidth=4: */
/**
 * +-------------------------------------------------------------------------+
 * | $Id: module_window.js 2026-10-18 10:49:55 Bleakwind Exp $               |
 * +-------------------------------------------------------------------------+
 * | Copyright (c) 2008-2026 Bleakwind(Rick Wu).                             |
 * +-------------------------------------------------------------------------+
 * | This source file is module_window.js.                                   |
 * | This source file is released under BSD license.                         |
 * +-------------------------------------------------------------------------+
 * | Author: Bleakwind(Rick Wu) <bleakwind@qq.com>                           |
 * +-------------------------------------------------------------------------+
 */

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ModuleWindow {

    /**
     * @brief Constructor, init animation maps, pending sets and signal ids
     * @param settings GSettings instance
     */
    constructor(settings) {
        this._settings = settings;
        this._openAnimations = new Map();
        this._openPending = new Set();
        this._closeAnimations = new Map();
        this._closePending = new Set();
        this._minimizeAnimations = new Map();
        this._minimizePending = new Set();
        this._unminimizeAnimations = new Map();
        this._unminimizePending = new Set();
        this._settingsOpenEnableChangedId = null;
        this._settingsOpenTypeChangedId = null;
        this._settingsCloseEnableChangedId = null;
        this._settingsCloseTypeChangedId = null;
        this._settingsMinimizeEnableChangedId = null;
        this._settingsMinimizeTypeChangedId = null;
        this._settingsUnminimizeEnableChangedId = null;
        this._settingsUnminimizeTypeChangedId = null;
        this._hooked = false;

        this._origShouldAnimateActor = null;
        this._origCompletedMap = null;
        this._origCompletedDestroy = null;
        this._origDestroyWindow = null;
        this._origCompletedMinimize = null;
        this._origCompletedUnminimize = null;
        this._killEffectsId = null;
        this._minimizeSignalId = null;
        this._unminimizeSignalId = null;
    }

    /**
     * @brief Connect all window effect settings change signals and apply
     */
    enable() {
        this._settingsOpenEnableChangedId = this._settings.connect('changed::window-open-enable', () => {
            this.apply();
        });
        this._settingsOpenTypeChangedId = this._settings.connect('changed::window-open-type', () => {
            this.apply();
        });
        this._settingsCloseEnableChangedId = this._settings.connect('changed::window-close-enable', () => {
            this.apply();
        });
        this._settingsCloseTypeChangedId = this._settings.connect('changed::window-close-type', () => {
            this.apply();
        });
        this._settingsMinimizeEnableChangedId = this._settings.connect('changed::window-minimize-enable', () => {
            this.apply();
        });
        this._settingsMinimizeTypeChangedId = this._settings.connect('changed::window-minimize-type', () => {
            this.apply();
        });
        this._settingsUnminimizeEnableChangedId = this._settings.connect('changed::window-unminimize-enable', () => {
            this.apply();
        });
        this._settingsUnminimizeTypeChangedId = this._settings.connect('changed::window-unminimize-type', () => {
            this.apply();
        });

        this.apply();
    }

    /**
     * @brief Called when overview is showing, currently a no-op
     */
    onOverviewShowing() {
        // none
    }

    /**
     * @brief Called when overview is hidden, currently a no-op
     */
    onOverviewHidden() {
        // none
    }

    /**
     * @brief Install the WM hook and cancel animations for disabled effects
     */
    apply() {
        if (!this._settings) {
            return;
        }

        this._installHook();

        if (!this._getB('window-open-enable')) {
            for (const [, anim] of this._openAnimations) {
                try { anim.cancel(); } catch (e) {}
            }
            this._openAnimations.clear();
            this._openPending.clear();
        }

        if (!this._getB('window-close-enable')) {
            for (const [, anim] of this._closeAnimations) {
                try { anim.cancel(); } catch (e) {}
            }
            this._closeAnimations.clear();
            this._closePending.clear();
        }

        if (!this._getB('window-minimize-enable')) {
            for (const [, anim] of this._minimizeAnimations) {
                try { anim.cancel(); } catch (e) {}
            }
            this._minimizeAnimations.clear();
            this._minimizePending.clear();
        }

        if (!this._getB('window-unminimize-enable')) {
            for (const [, anim] of this._unminimizeAnimations) {
                try { anim.cancel(); } catch (e) {}
            }
            this._unminimizeAnimations.clear();
            this._unminimizePending.clear();
        }
    }

    /**
     * @brief Disconnect all signals, uninstall hooks and cancel all animations
     */
    disable() {
        if (this._settingsOpenEnableChangedId) {
            this._settings.disconnect(this._settingsOpenEnableChangedId);
            this._settingsOpenEnableChangedId = null;
        }
        if (this._settingsOpenTypeChangedId) {
            this._settings.disconnect(this._settingsOpenTypeChangedId);
            this._settingsOpenTypeChangedId = null;
        }
        if (this._settingsCloseEnableChangedId) {
            this._settings.disconnect(this._settingsCloseEnableChangedId);
            this._settingsCloseEnableChangedId = null;
        }
        if (this._settingsCloseTypeChangedId) {
            this._settings.disconnect(this._settingsCloseTypeChangedId);
            this._settingsCloseTypeChangedId = null;
        }
        if (this._settingsMinimizeEnableChangedId) {
            this._settings.disconnect(this._settingsMinimizeEnableChangedId);
            this._settingsMinimizeEnableChangedId = null;
        }
        if (this._settingsMinimizeTypeChangedId) {
            this._settings.disconnect(this._settingsMinimizeTypeChangedId);
            this._settingsMinimizeTypeChangedId = null;
        }
        if (this._settingsUnminimizeEnableChangedId) {
            this._settings.disconnect(this._settingsUnminimizeEnableChangedId);
            this._settingsUnminimizeEnableChangedId = null;
        }
        if (this._settingsUnminimizeTypeChangedId) {
            this._settings.disconnect(this._settingsUnminimizeTypeChangedId);
            this._settingsUnminimizeTypeChangedId = null;
        }
        this._uninstallHook();
        this._cancelAllAnimations();
        this._settings = null;
    }

    /**
     * @brief Patch ShellWM methods and connect window-manager signals to hook animations
     */
    _installHook() {
        if (this._hooked) {
            return;
        }

        const self = this;
        const shellwm = Main.wm._shellwm;
        if (!shellwm) {
            return;
        }

        try {
            if (!this._origShouldAnimateActor) {
                this._origShouldAnimateActor = Main.wm._shouldAnimateActor;
            }

            Main.wm._shouldAnimateActor = function (actor, forAnimation) {
                try {
                    const stack = new Error().stack || '';
                    if (stack.indexOf('_minimizeWindow') !== -1 ||
                        stack.indexOf('_unminimizeWindow') !== -1) {
                        return false;
                    }
                } catch (e) {
                }
                let result;
                try {
                    result = self._origShouldAnimateActor.call(this, actor, forAnimation);
                } catch (e) {
                    result = false;
                }
                const isOpen = Array.isArray(forAnimation)
                    ? forAnimation.includes(0)
                    : forAnimation === 0;
                const isClose = Array.isArray(forAnimation)
                    ? forAnimation.includes(4)
                    : forAnimation === 4;
                if (isOpen && self._getB('window-open-enable')) {
                    return true;
                }
                if (isClose && self._getB('window-close-enable')) {
                    return true;
                }
                return result;
            };
        } catch (e) {
        }

        try {
            if (typeof shellwm.completed_map === 'function' && !this._origCompletedMap) {
                this._origCompletedMap = shellwm.completed_map;

                shellwm.completed_map = function (actor) {
                    if (!self._getB('window-open-enable')) {
                        return self._origCompletedMap.call(this, actor);
                    }

                    const win = actor ? actor.meta_window : null;
                    const wtype = win ? win.get_window_type() : -1;
                    if (!win ||
                        (wtype !== Meta.WindowType.NORMAL &&
                         wtype !== Meta.WindowType.DIALOG &&
                         wtype !== Meta.WindowType.MODAL_DIALOG)) {
                        return self._origCompletedMap.call(this, actor);
                    }

                    if (self._openPending.has(actor)) {
                        return self._origCompletedMap.call(this, actor);
                    }

                    self._takeoverMap(this, actor);
                };
            }
        } catch (e) {
        }

        try {
            if (typeof shellwm.completed_destroy === 'function' && !this._origCompletedDestroy) {
                this._origCompletedDestroy = shellwm.completed_destroy;

                shellwm.completed_destroy = function (actor) {
                    if (!self._getB('window-close-enable')) {
                        return self._origCompletedDestroy.call(this, actor);
                    }

                    const win = actor ? actor.meta_window : null;
                    const wtype = win ? win.get_window_type() : -1;
                    if (!win ||
                        (wtype !== Meta.WindowType.NORMAL &&
                         wtype !== Meta.WindowType.DIALOG &&
                         wtype !== Meta.WindowType.MODAL_DIALOG)) {
                        return self._origCompletedDestroy.call(this, actor);
                    }

                    if (self._closePending.has(actor)) {
                        return self._origCompletedDestroy.call(this, actor);
                    }

                    self._takeoverDestroy(this, actor);
                };
            }
        } catch (e) {
        }

        try {
            if (typeof shellwm._destroyWindow === 'function' && !this._origDestroyWindow) {
                this._origDestroyWindow = shellwm._destroyWindow;
                const origDestroyWindow = this._origDestroyWindow;
                shellwm._destroyWindow = function (actor) {
                    return origDestroyWindow.call(this, actor);
                };
            }
        } catch (e) {
        }

        try {
            if (!this._origCompletedMinimize && typeof shellwm.completed_minimize === 'function') {
                this._origCompletedMinimize = shellwm.completed_minimize;
                shellwm.original_completed_minimize = this._origCompletedMinimize;
                shellwm.completed_minimize = function () { return; };
            }
        } catch (e) {
        }

        try {
            if (!this._origCompletedUnminimize && typeof shellwm.completed_unminimize === 'function') {
                this._origCompletedUnminimize = shellwm.completed_unminimize;
                shellwm.original_completed_unminimize = this._origCompletedUnminimize;
                shellwm.completed_unminimize = function () { return; };
            }
        } catch (e) {
        }

        try {
            this._minimizeSignalId = global.window_manager.connect('minimize', (wm, actor) => {
                if (Main.overview.visible || !self._getB('window-minimize-enable')) {
                    try { self._origCompletedMinimize.call(shellwm, actor); } catch (e) {}
                    return;
                }

                const type = self._getS('window-minimize-type');
                const iconGeom = self._getIconGeometry(actor);
                self._destroyActorEffect(actor);

                try {
                    if (type === 'scale') {
                        actor.add_effect_with_name(
                            'visual-tweak-window-minimize',
                            new WindowMinimizeScale(actor, iconGeom)
                        );
                    } else {
                        actor.add_effect_with_name(
                            'visual-tweak-window-minimize',
                            new WindowMinimizeGenie(actor, iconGeom)
                        );
                    }
                } catch (e) {
                }
            });
        } catch (e) {
        }

        try {
            this._unminimizeSignalId = global.window_manager.connect('unminimize', (wm, actor) => {
                try { actor.show(); } catch (e) {}

                if (Main.overview.visible || !self._getB('window-unminimize-enable')) {
                    try { self._origCompletedUnminimize.call(shellwm, actor); } catch (e) {}
                    return;
                }

                const type = self._getS('window-unminimize-type');
                const iconGeom = self._getIconGeometry(actor);
                self._destroyActorEffect(actor);

                try {
                    if (type === 'scale') {
                        actor.add_effect_with_name(
                            'visual-tweak-window-unminimize',
                            new WindowUnminimizeScale(actor, iconGeom)
                        );
                    } else {
                        actor.add_effect_with_name(
                            'visual-tweak-window-unminimize',
                            new WindowUnminimizeGenie(actor, iconGeom)
                        );
                    }
                } catch (e) {
                }
            });
        } catch (e) {
        }

        try {
            this._killEffectsId = shellwm.connect('kill-window-effects', () => {
            });
        } catch (e) {
        }

        this._hooked = true;
    }

    /**
     * @brief Restore patched ShellWM methods, disconnect signals and clear effects
     */
    _uninstallHook() {
        if (!this._hooked) {
            return;
        }
        const shellwm = Main.wm._shellwm;

        try {
            if (this._origShouldAnimateActor) {
                Main.wm._shouldAnimateActor = this._origShouldAnimateActor;
                this._origShouldAnimateActor = null;
            }
        } catch (e) {
        }

        try {
            if (shellwm && this._origCompletedMap) {
                shellwm.completed_map = this._origCompletedMap;
                this._origCompletedMap = null;
            }
        } catch (e) {
        }

        try {
            if (shellwm && this._origCompletedDestroy) {
                shellwm.completed_destroy = this._origCompletedDestroy;
                this._origCompletedDestroy = null;
            }
        } catch (e) {
        }

        try {
            if (shellwm && this._origDestroyWindow) {
                shellwm._destroyWindow = this._origDestroyWindow;
                this._origDestroyWindow = null;
            }
        } catch (e) {
        }

        try {
            if (shellwm && this._origCompletedMinimize) {
                shellwm.completed_minimize = this._origCompletedMinimize;
                this._origCompletedMinimize = null;
            }
        } catch (e) {}

        try {
            if (shellwm && this._origCompletedUnminimize) {
                shellwm.completed_unminimize = this._origCompletedUnminimize;
                this._origCompletedUnminimize = null;
            }
        } catch (e) {}

        try {
            if (this._minimizeSignalId) {
                global.window_manager.disconnect(this._minimizeSignalId);
                this._minimizeSignalId = null;
            }
        } catch (e) {}

        try {
            if (this._unminimizeSignalId) {
                global.window_manager.disconnect(this._unminimizeSignalId);
                this._unminimizeSignalId = null;
            }
        } catch (e) {}

        try {
            global.get_window_actors().forEach((actor) => {
                this._destroyActorEffect(actor);
            });
        } catch (e) {}

        try {
            if (shellwm && this._killEffectsId) {
                shellwm.disconnect(this._killEffectsId);
                this._killEffectsId = null;
            }
        } catch (e) {
        }

        this._hooked = false;
    }

    /**
     * @brief Take over window map completion and play the open animation
     * @param shellwm The ShellWM instance
     * @param actor The window actor
     */
    _takeoverMap(shellwm, actor) {
        this._openPending.add(actor);

        const type = this._getS('window-open-type');
        const effect = this._createOpenEffect(type, actor);
        if (!effect) {
            this._openPending.delete(actor);
            this._origCompletedMap.call(shellwm, actor);
            return;
        }

        const anim = this._runAnimation(actor, effect, 300, () => {
            this._openPending.delete(actor);
            this._openAnimations.delete(actor);
        });

        this._openAnimations.set(actor, anim);

        try {
            this._origCompletedMap.call(shellwm, actor);
        } catch (e) {
        }
    }

    /**
     * @brief Take over window destroy completion and play the close animation
     * @param shellwm The ShellWM instance
     * @param actor The window actor
     */
    _takeoverDestroy(shellwm, actor) {
        this._closePending.add(actor);

        const type = this._getS('window-close-type');
        const effect = this._createCloseEffect(type, actor);
        if (!effect) {
            this._closePending.delete(actor);
            this._origCompletedDestroy.call(shellwm, actor);
            return;
        }

        const anim = this._runAnimation(actor, effect, 300, () => {
            this._closePending.delete(actor);
            this._closeAnimations.delete(actor);
            try {
                this._origCompletedDestroy.call(shellwm, actor);
            } catch (e) {
            }
        });

        this._closeAnimations.set(actor, anim);
    }

    /**
     * @brief Run a custom animation driven by a GLib timeout
     * @param actor The window actor
     * @param effect The effect object with apply(p) and optional teardown()
     * @param durationMs Animation duration in milliseconds
     * @param onDone Optional callback fired when the animation finishes
     * @return Animation handle with a cancel() method
     */
    _runAnimation(actor, effect, durationMs, onDone) {
        const orig = this._saveActorState(actor);

        try {
            effect.apply(0);
        } catch (e) {
            logError(e, 'VisualTweak: effect.apply(0) failed');
        }

        const startTime = GLib.get_monotonic_time();
        let finished = false;
        let tickId = 0;

        const finish = () => {
            if (finished) {
                return;
            }
            finished = true;

            if (tickId) {
                GLib.Source.remove(tickId);
                tickId = 0;
            }

            try {
                if (typeof effect.teardown === 'function') {
                    effect.teardown();
                }
            } catch (e) {
            }

            try {
                this._restoreActorState(actor, orig);
            } catch (e) {
            }

            if (typeof onDone === 'function') {
                try {
                    onDone();
                } catch (e) {
                }
            }
        };

        tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            if (finished) {
                return GLib.SOURCE_REMOVE;
            }
            const elapsedMs = (GLib.get_monotonic_time() - startTime) / 1000;
            const p = Math.min(1, elapsedMs / durationMs);

            try {
                effect.apply(p);
            } catch (e) {
            }

            if (p >= 1) {
                finish();
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });

        return { cancel: finish };
    }

    /**
     * @brief Save the current transform state of an actor
     * @param actor The window actor
     * @return Object holding the scale, opacity, pivot and translation values
     */
    _saveActorState(actor) {
        return {
            sx: actor.scale_x,
            sy: actor.scale_y,
            op: actor.opacity,
            px: actor.pivot_point.x,
            py: actor.pivot_point.y,
            ty: actor.translation_y,
        };
    }

    /**
     * @brief Restore a previously saved actor transform state
     * @param actor The window actor
     * @param orig The state object returned by _saveActorState
     */
    _restoreActorState(actor, orig) {
        actor.scale_x = orig.sx;
        actor.scale_y = orig.sy;
        actor.opacity = orig.op;
        actor.pivot_point.x = orig.px;
        actor.pivot_point.y = orig.py;
        actor.translation_y = orig.ty;
    }

    /**
     * @brief Create the open effect object for the given type
     * @param type Effect type string ('tv' or 'blinds')
     * @param actor The window actor
     * @return Effect object or null if unknown
     */
    _createOpenEffect(type, actor) {
        if (type === 'tv') {
            return new WindowOpenTV(actor);
        }
        if (type === 'blinds') {
            return new WindowOpenBlinds(actor);
        }
        return null;
    }

    /**
     * @brief Create the close effect object for the given type
     * @param type Effect type string ('tv' or 'blinds')
     * @param actor The window actor
     * @return Effect object or null if unknown
     */
    _createCloseEffect(type, actor) {
        if (type === 'tv') {
            return new WindowCloseTV(actor);
        }
        if (type === 'blinds') {
            return new WindowCloseBlinds(actor);
        }
        return null;
    }

    /**
     * @brief Cancel all tracked animations and clear pending sets
     */
    _cancelAllAnimations() {
        const open = [...this._openAnimations.values()];
        this._openAnimations.clear();
        this._openPending.clear();
        for (const anim of open) {
            try { anim.cancel(); } catch (e) {}
        }

        const close = [...this._closeAnimations.values()];
        this._closeAnimations.clear();
        this._closePending.clear();
        for (const anim of close) {
            try { anim.cancel(); } catch (e) {}
        }

        const minimize = [...this._minimizeAnimations.values()];
        this._minimizeAnimations.clear();
        this._minimizePending.clear();
        for (const anim of minimize) {
            try { anim.cancel(); } catch (e) {}
        }

        const unminimize = [...this._unminimizeAnimations.values()];
        this._unminimizeAnimations.clear();
        this._unminimizePending.clear();
        for (const anim of unminimize) {
            try { anim.cancel(); } catch (e) {}
        }
    }

    /**
     * @brief Remove the custom minimize and unminimize effects from an actor
     * @param actor The window actor
     */
    _destroyActorEffect(actor) {
        if (!actor) {
            return;
        }
        try {
            const e1 = actor.get_effect('visual-tweak-window-minimize');
            if (e1) { e1.destroy(); }
        } catch (e) {}
        try {
            const e2 = actor.get_effect('visual-tweak-window-unminimize');
            if (e2) { e2.destroy(); }
        } catch (e) {}
    }

    /**
     * @brief Get the icon geometry of a window, falling back to the monitor bottom
     * @param actor The window actor
     * @return Object with x, y, width, height
     */
    _getIconGeometry(actor) {
        try {
            const win = actor ? actor.meta_window : null;
            if (win) {
                const icon = this._parseIconGeometry(win.get_icon_geometry());
                if (icon) {
                    return icon;
                }
            }
        } catch (e) {}
        try {
            const monitor = Main.layoutManager.monitors[0];
            if (monitor) {
                return {
                    x: monitor.x + monitor.width / 2,
                    y: monitor.y + monitor.height,
                    width: 0,
                    height: 0,
                };
            }
        } catch (e) {}
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    /**
     * @brief Normalize the various Meta icon geometry formats into an object
     * @param res Raw icon geometry value
     * @return Object with x, y, width, height, or null
     */
    _parseIconGeometry(res) {
        if (!res) {
            return null;
        }
        try {
            if (Array.isArray(res) && res.length === 2 && res[0] && res[1]) {
                const r = res[1];
                if (r && typeof r === 'object' && 'x' in r) {
                    return { x: r.x, y: r.y, width: r.width, height: r.height };
                }
            }
            if (Array.isArray(res) && res.length === 4) {
                return { x: res[0], y: res[1], width: res[2], height: res[3] };
            }
            if (res && typeof res === 'object' && 'x' in res) {
                return { x: res.x, y: res.y, width: res.width, height: res.height };
            }
        } catch (e) {
        }
        return null;
    }

    /**
     * @brief Safely read a boolean setting
     * @param key Settings key
     * @return Boolean value or false on error
     */
    _getB(key) {
        try {
            return this._settings.get_boolean(key);
        } catch (e) {
            return false;
        }
    }

    /**
     * @brief Safely read a string setting
     * @param key Settings key
     * @return String value or empty string on error
     */
    _getS(key) {
        try {
            return this._settings.get_string(key);
        } catch (e) {
            return '';
        }
    }
}

class WindowOpenTV {

    /**
     * @brief Constructor, store actor and read geometry
     * @param actor The window actor
     */
    constructor(actor) {
        this._actor = actor;
        this._geom = this._readGeometry(actor);
        this._beam = null;
        this._beamAdded = false;
    }

    /**
     * @brief Read window frame geometry, falling back to actor size and position
     * @param actor The window actor
     * @return Object with w, h, ax, ay
     */
    _readGeometry(actor) {
        let w = 100, h = 100, ax = 0, ay = 0;
        const win = actor ? actor.meta_window : null;
        if (win) {
            try {
                const rect = win.get_frame_rect();
                if (rect && rect.width > 0 && rect.height > 0) {
                    w = rect.width;
                    h = rect.height;
                    ax = rect.x;
                    ay = rect.y;
                    return { w, h, ax, ay };
                }
            } catch (e) {
            }
        }
        try {
            [w, h] = actor.get_transformed_size();
        } catch (e) {
            try {
                [w, h] = actor.get_size();
            } catch (e2) {
            }
        }
        try {
            [ax, ay] = actor.get_transformed_position();
        } catch (e) {
            try {
                [ax, ay] = actor.get_position();
            } catch (e2) {
            }
        }
        return { w, h, ax, ay };
    }

    /**
     * @brief Apply the TV open effect for the given animation progress
     * @param p Progress in the range 0..1
     */
    apply(p) {
        this._actor.pivot_point.x = 0.5;
        this._actor.pivot_point.y = 0.5;

        if (!this._beam) {
            this._ensureBeam();
        }

        const { w, h, ax, ay } = this._geom;
        const centerX = ax + w / 2;
        const centerY = ay + h / 2;

        let sx = 1.0;
        let sy = 1.0;

        if (p < 0.20) {
            const t = p / 0.20;
            const eased = 1.0 - Math.pow(1.0 - t, 2);

            sy = 0.001;
            sx = Math.max(0.001, eased);

            const lineW = Math.max(2, Math.min(w, w * eased));
            const lineH = 3;

            this._beam.set_position(
                Math.round(centerX - lineW / 2),
                Math.round(centerY - lineH / 2)
            );
            this._beam.set_size(Math.round(lineW), lineH);
            this._beam.opacity = 255;

            this._actor.opacity = 0;
        } else {
            const t = (p - 0.20) / 0.80;
            const eased = 1.0 - Math.pow(1.0 - t, 2);

            sy = Math.max(0.001, eased);
            sx = 1.0;

            const lineW = Math.min(w, w);
            const lineH = 3;

            this._beam.set_position(
                Math.round(centerX - lineW / 2),
                Math.round(centerY - lineH / 2)
            );
            this._beam.set_size(Math.round(lineW), lineH);

            let beamOpacity;
            if (t < 0.3) {
                beamOpacity = 255;
            } else {
                const fade = (t - 0.3) / 0.7;
                beamOpacity = Math.round(255 * (1.0 - fade));
            }
            this._beam.opacity = beamOpacity;

            let actorOpacity;
            if (t < 0.1) {
                actorOpacity = Math.round(255 * (t / 0.1));
            } else {
                actorOpacity = 255;
            }
            this._actor.opacity = actorOpacity;
        }

        this._actor.scale_x = sx;
        this._actor.scale_y = sy;
        this._actor.translation_y = h * (1.0 - sy) / 2.0;
    }

    /**
     * @brief Lazily create the white beam widget used by the TV effect
     */
    _ensureBeam() {
        if (this._beam) {
            return;
        }
        this._beam = new St.Widget({
            style: 'background-color: #ffffff;',
            x: 0,
            y: 0,
            width: 1,
            height: 3,
            opacity: 0,
        });
        global.window_group.add_child(this._beam);
        this._beamAdded = true;
    }

    /**
     * @brief Destroy the beam widget
     */
    teardown() {
        if (!this._beamAdded || !this._beam) {
            return;
        }
        try {
            this._beam.destroy();
        } catch (e) {
        }
        this._beam = null;
        this._beamAdded = false;
    }
}

class WindowOpenBlinds {

    /**
     * @brief Constructor, store actor and geometry and init blade state
     * @param actor The window actor
     */
    constructor(actor) {
        this._actor = actor;
        this._geom = this._readGeometry(actor);
        this._blades = null;
        this._bladeCount = 8;
        this._bladesAdded = false;
    }

    /**
     * @brief Read actor geometry, falling back from transformed values to plain values
     * @param actor The window actor
     * @return Object with w, h, ax, ay
     */
    _readGeometry(actor) {
        let w = 100, h = 100, ax = 0, ay = 0;
        try {
            [w, h] = actor.get_transformed_size();
        } catch (e) {
            try {
                [w, h] = actor.get_size();
            } catch (e2) {
            }
        }
        try {
            [ax, ay] = actor.get_transformed_position();
        } catch (e) {
            try {
                [ax, ay] = actor.get_position();
            } catch (e2) {
            }
        }
        return { w, h, ax, ay };
    }

    /**
     * @brief Apply the blinds open effect for the given animation progress
     * @param p Progress in the range 0..1
     */
    apply(p) {
        this._actor.pivot_point.x = 0.5;
        this._actor.pivot_point.y = 0.5;

        if (!this._blades) {
            this._ensureBlades();
        }

        const { w, h, ax, ay } = this._geom;
        const N = this._bladeCount;
        const bladeH = h / N;

        const t = p * p;

        const finalLineH = 2.0;

        for (let i = 0; i < N; i++) {
            const bladeTop = ay + i * bladeH;

            const visibleH = finalLineH + (bladeH - finalLineH) * t;
            const blackH = Math.max(0, (bladeH - visibleH) / 2);

            const topBar = this._blades[i * 2];
            const bottomBar = this._blades[i * 2 + 1];

            topBar.set_position(Math.round(ax), Math.round(bladeTop));
            topBar.set_size(Math.round(w), Math.round(blackH));

            bottomBar.set_position(
                Math.round(ax),
                Math.round(bladeTop + bladeH - blackH)
            );
            bottomBar.set_size(Math.round(w), Math.round(blackH));

            let barOpacity = 255;
            if (p < 0.15) {
                const fade = p / 0.15;
                barOpacity = Math.round(255 * fade);
            }
            topBar.opacity = barOpacity;
            bottomBar.opacity = barOpacity;
        }

        if (p < 0.15) {
            const fade = p / 0.15;
            this._actor.opacity = Math.round(255 * fade);
        } else {
            this._actor.opacity = 255;
        }
    }

    /**
     * @brief Lazily create all black bar widgets used by the blinds effect
     */
    _ensureBlades() {
        if (this._blades) {
            return;
        }
        const N = this._bladeCount;
        this._blades = [];
        for (let i = 0; i < N * 2; i++) {
            const bar = new St.Widget({
                style: 'background-color: #000000;',
                x: 0,
                y: 0,
                width: 1,
                height: 0,
                opacity: 0,
            });
            global.window_group.add_child(bar);
            this._blades.push(bar);
        }
        this._bladesAdded = true;
    }

    /**
     * @brief Destroy all blade widgets
     */
    teardown() {
        if (!this._bladesAdded || !this._blades) {
            return;
        }
        try {
            for (const bar of this._blades) {
                bar.destroy();
            }
        } catch (e) {
        }
        this._blades = null;
        this._bladesAdded = false;
    }
}

class WindowCloseTV {

    /**
     * @brief Constructor, store actor and geometry and init beam state
     * @param actor The window actor
     */
    constructor(actor) {
        this._actor = actor;
        this._geom = this._readGeometry(actor);
        this._beam = null;
        this._beamAdded = false;
    }

    /**
     * @brief Read actor geometry, falling back from transformed values to plain values
     * @param actor The window actor
     * @return Object with w, h, ax, ay
     */
    _readGeometry(actor) {
        let w = 100, h = 100, ax = 0, ay = 0;
        try {
            [w, h] = actor.get_transformed_size();
        } catch (e) {
            try {
                [w, h] = actor.get_size();
            } catch (e2) {
            }
        }
        try {
            [ax, ay] = actor.get_transformed_position();
        } catch (e) {
            try {
                [ax, ay] = actor.get_position();
            } catch (e2) {
            }
        }
        return { w, h, ax, ay };
    }

    /**
     * @brief Apply the TV close effect for the given animation progress
     * @param p Progress in the range 0..1
     */
    apply(p) {
        this._actor.pivot_point.x = 0.5;
        this._actor.pivot_point.y = 0.5;

        if (!this._beam) {
            this._ensureBeam();
        }

        const { w, h, ax, ay } = this._geom;
        const centerX = ax + w / 2;
        const centerY = ay + h / 2;

        let sx = 1.0;
        let sy = 1.0;

        if (p < 0.7) {
            const t = p / 0.7;
            const eased = t * t;
            sy = Math.max(0.001, 1.0 - eased);
            sx = 1.0;

            const lineH = Math.max(2, h * sy);
            this._beam.set_position(
                Math.round(ax),
                Math.round(centerY - lineH / 2)
            );
            this._beam.set_size(Math.max(1, Math.round(w)), Math.round(lineH));
            this._beam.opacity = Math.round(255 * Math.min(1, t * 3));

            this._actor.opacity = 255;
        } else {
            const t = (p - 0.7) / 0.3;
            const eased = 1.0 - Math.pow(1.0 - t, 2);

            sy = 0.001;
            sx = Math.max(0.001, 1.0 - eased);

            const lineW = Math.max(2, w * (1.0 - eased));
            const lineH = Math.max(2, 3 * (1.0 - eased * 0.5));

            this._beam.set_position(
                Math.round(centerX - lineW / 2),
                Math.round(centerY - lineH / 2)
            );
            this._beam.set_size(Math.round(lineW), Math.round(lineH));
            this._beam.opacity = Math.round(255 * (1.0 - t * t));

            this._actor.opacity = Math.round(255 * (1.0 - t));
        }

        this._actor.scale_x = sx;
        this._actor.scale_y = sy;
        this._actor.translation_y = 0;
    }

    /**
     * @brief Lazily create the white beam widget used by the TV effect
     */
    _ensureBeam() {
        if (this._beam) {
            return;
        }
        const { w } = this._geom;
        this._beam = new St.Widget({
            style: 'background-color: #ffffff;',
            x: 0,
            y: 0,
            width: Math.max(1, Math.round(w)),
            height: 0,
            opacity: 0,
        });
        global.window_group.add_child(this._beam);
        this._beamAdded = true;
    }

    /**
     * @brief Destroy the beam widget
     */
    teardown() {
        if (!this._beamAdded || !this._beam) {
            return;
        }
        try {
            this._beam.destroy();
        } catch (e) {
        }
        this._beam = null;
        this._beamAdded = false;
    }
}

class WindowCloseBlinds {

    /**
     * @brief Constructor, store actor and geometry and init blade state
     * @param actor The window actor
     */
    constructor(actor) {
        this._actor = actor;
        this._geom = this._readGeometry(actor);
        this._blades = null;
        this._bladeCount = 8;
        this._bladesAdded = false;
    }

    /**
     * @brief Read window frame geometry, falling back to actor size and position
     * @param actor The window actor
     * @return Object with w, h, ax, ay
     */
    _readGeometry(actor) {
        let w = 100, h = 100, ax = 0, ay = 0;
        const win = actor ? actor.meta_window : null;
        if (win) {
            try {
                const rect = win.get_frame_rect();
                if (rect && rect.width > 0 && rect.height > 0) {
                    w = rect.width;
                    h = rect.height;
                    ax = rect.x;
                    ay = rect.y;
                    return { w, h, ax, ay };
                }
            } catch (e) {
            }
        }
        try {
            [w, h] = actor.get_transformed_size();
        } catch (e) {
            try {
                [w, h] = actor.get_size();
            } catch (e2) {
            }
        }
        try {
            [ax, ay] = actor.get_transformed_position();
        } catch (e) {
            try {
                [ax, ay] = actor.get_position();
            } catch (e2) {
            }
        }
        return { w, h, ax, ay };
    }

    /**
     * @brief Apply the blinds close effect for the given animation progress
     * @param p Progress in the range 0..1
     */
    apply(p) {
        this._actor.pivot_point.x = 0.5;
        this._actor.pivot_point.y = 0.5;

        if (!this._blades) {
            this._ensureBlades();
        }

        const { w, h, ax, ay } = this._geom;
        const N = this._bladeCount;
        const bladeH = h / N;

        const t = 1.0 - Math.pow(1.0 - p, 2);
        const finalLineH = 2.0;

        for (let i = 0; i < N; i++) {
            const bladeTop = ay + i * bladeH;

            const visibleH = bladeH + (finalLineH - bladeH) * t;
            const blackH = Math.max(0, (bladeH - visibleH) / 2);

            const topBar = this._blades[i * 2];
            const bottomBar = this._blades[i * 2 + 1];

            topBar.set_position(Math.round(ax), Math.round(bladeTop));
            topBar.set_size(Math.round(w), Math.round(blackH));

            bottomBar.set_position(
                Math.round(ax),
                Math.round(bladeTop + bladeH - blackH)
            );
            bottomBar.set_size(Math.round(w), Math.round(blackH));

            let barOpacity = 255;
            if (p > 0.85) {
                const fade = (p - 0.85) / 0.15;
                barOpacity = Math.round(255 * (1.0 - fade));
            }
            topBar.opacity = barOpacity;
            bottomBar.opacity = barOpacity;
        }

        if (p > 0.85) {
            const fade = (p - 0.85) / 0.15;
            this._actor.opacity = Math.round(255 * (1.0 - fade));
        } else {
            this._actor.opacity = 255;
        }

        this._actor.scale_x = 1.0;
        this._actor.scale_y = 1.0;
        this._actor.translation_y = 0;
    }

    /**
     * @brief Lazily create all black bar widgets used by the blinds effect
     */
    _ensureBlades() {
        if (this._blades) {
            return;
        }
        const { w, h, ax, ay } = this._geom;
        const N = this._bladeCount;
        const bladeH = h / N;
        this._blades = [];
        for (let i = 0; i < N * 2; i++) {
            const bar = new St.Widget({
                style: 'background-color: #000000;',
                x: Math.round(ax),
                y: Math.round(ay + Math.floor(i / 2) * bladeH),
                width: Math.max(1, Math.round(w)),
                height: 0,
                opacity: 0,
            });
            global.window_group.add_child(bar);
            this._blades.push(bar);
        }
        this._bladesAdded = true;
    }

    /**
     * @brief Destroy all blade widgets
     */
    teardown() {
        if (!this._bladesAdded || !this._blades) {
            return;
        }
        try {
            for (const bar of this._blades) {
                bar.destroy();
            }
        } catch (e) {
        }
        this._blades = null;
        this._bladesAdded = false;
    }
}

const WindowMinimizeGenie = GObject.registerClass(
    {
        GTypeName: 'VisualTweakWindowMinimizeGenie',
    },
    class WindowMinimizeGenie extends Clutter.DeformEffect {

        /**
         * @brief Constructor, init the genie minimize deform effect
         * @param actor The window actor
         * @param icoGeom Optional icon geometry to shrink towards
         */
        _init(actor, icoGeom = null) {
            super._init();

            this._actor = actor;
            this._icoSrce = icoGeom;
            this._isReady = false;

            this._winRect = { x: 0, y: 0, w: 0, h: 0 };
            this._monRect = { x: 0, y: 0, w: 0, h: 0 };
            this._icoRect = { x: 0, y: 0, w: 0, h: 0 };
            this._dockSide = St.Side.BOTTOM;

            this._progress = 0;

            this._duration = 500;
            this._curvature = 0.45;
            this._rowStagger = 0.55;
            this._narrowBias = 0.25;
            this._edgeThres = 60;
            this._minSeparate = 2;

            this._timeline = null;
            this._frameSigId = null;
            this._compleSigId = null;

            this.set_n_tiles(32, 32);
        }

        /**
         * @brief Hook set_actor, compute geometry and start the animation timeline
         * @param actor The window actor
         */
        vfunc_set_actor(actor) {
            super.vfunc_set_actor(actor);

            if (!this._actor || this._isReady) {
                return;
            }
            this._isReady = true;

            const metaWin = this._actor.meta_window;
            if (!metaWin) {
                return;
            }

            try {
                const mon = Main.layoutManager.monitors[metaWin.get_monitor()];
                this._monRect = {
                    x: mon.x,
                    y: mon.y,
                    w: mon.width,
                    h: mon.height,
                };
            } catch (e) {
                this._monRect = { x: 0, y: 0, w: 1, h: 1 };
            }

            try {
                const frm = metaWin.get_frame_rect();
                this._winRect = {
                    x: frm.x,
                    y: frm.y,
                    w: frm.width,
                    h: frm.height,
                };
            } catch (e) {
                try {
                    const [actWid, actHei] = this._actor.get_size();
                    this._winRect = {
                        x: this._actor.get_x(),
                        y: this._actor.get_y(),
                        w: actWid,
                        h: actHei,
                    };
                } catch (fallbackError) {
                    return;
                }
            }

            if (this._icoSrce) {
                this._icoRect = {
                    x: this._icoSrce.x,
                    y: this._icoSrce.y,
                    w: this._icoSrce.width || 0,
                    h: this._icoSrce.height || 0,
                };
            } else {
                this._icoRect = {
                    x: this._monRect.x + this._monRect.w / 2,
                    y: this._monRect.y + this._monRect.h,
                    w: 0,
                    h: 0,
                };
            }

            this._winRect.x -= this._monRect.x;
            this._winRect.y -= this._monRect.y;
            this._icoRect.x -= this._monRect.x;
            this._icoRect.y -= this._monRect.y;

            const monWid = this._monRect.w;
            const monHei = this._monRect.h;

            if (this._icoRect.y + this._icoRect.h >= monHei - this._edgeThres) {
                this._dockSide = St.Side.BOTTOM;
                this._icoRect.y = monHei;
                this._icoRect.h = 0;
            } else if (this._icoRect.x <= this._edgeThres) {
                this._dockSide = St.Side.LEFT;
                this._icoRect.x = 0;
                this._icoRect.w = 0;
            } else if (this._icoRect.x + this._icoRect.w >= monWid - this._edgeThres) {
                this._dockSide = St.Side.RIGHT;
                this._icoRect.x = monWid;
                this._icoRect.w = 0;
            } else {
                this._dockSide = St.Side.TOP;
                this._icoRect.y = 0;
                this._icoRect.h = 0;
            }

            this._timeline = new Clutter.Timeline({
                actor: this._actor,
                duration: this._duration,
            });
            this._frameSigId = this._timeline.connect('new-frame', () => this._onTick());
            this._compleSigId = this._timeline.connect('completed', () => this.destroy());
            this._timeline.start();
        }

        /**
         * @brief Update the progress on each timeline frame and repaint
         */
        _onTick() {
            if (!this._timeline) {
                return;
            }
            this._progress = this._timeline.get_progress();

            try {
                this._actor.get_parent().queue_redraw();
            } catch (e) {
            }
            this.invalidate();
        }

        /**
         * @brief Stop the timeline, remove the effect and notify the minimize completion
         */
        destroy() {
            if (this._timeline) {
                if (this._frameSigId) {
                    try {
                        this._timeline.disconnect(this._frameSigId);
                    } catch (e) {
                    }
                    this._frameSigId = null;
                }
                if (this._compleSigId) {
                    try {
                        this._timeline.disconnect(this._compleSigId);
                    } catch (e) {
                    }
                    this._compleSigId = null;
                }
                this._timeline = null;
            }

            const act = this.get_actor();
            if (act) {
                try {
                    act.remove_effect(this);
                } catch (e) {
                }
                try {
                    act.hide();
                } catch (e) {
                }
            }

            try {
                const shellWm = Main.wm?._shellwm;
                if (shellWm?.original_completed_minimize) {
                    shellWm.original_completed_minimize(act);
                }
            } catch (e) {
            }

            this._actor = null;
        }

        /**
         * @brief Do not expand the paint volume for the deform effect
         * @param paintVolume The paint volume to modify
         * @return Always false
         */
        vfunc_modify_paint_volume(paintVolume) {
            return false;
        }

        /**
         * @brief Deform each vertex according to the genie minimize curve
         * @param actWid Actor width
         * @param actHei Actor height
         * @param vertex The vertex to deform in place
         */
        vfunc_deform_vertex(actWid, actHei, vertex) {
            if (!this._isReady) {
                return;
            }

            const winWid = this._winRect.w;
            const winHei = this._winRect.h;
            const icoWid = this._icoRect.w;
            const icoHei = this._icoRect.h;

            const isVertical = (this._dockSide === St.Side.BOTTOM || this._dockSide === St.Side.TOP);

            if (isVertical) {
                const along = vertex.ty;
                const across = vertex.tx;
                const towardIco = (this._dockSide === St.Side.BOTTOM);
                const proxToIco = towardIco ? along : 1 - along;

                const staggerSpan = Math.max(this._rowStagger, 1e-6);
                const rawRowProg = Math.min(1, Math.max(0, (this._progress - (1 - proxToIco) * staggerSpan) / staggerSpan));
                const rowProg = rawRowProg * rawRowProg * (3 - 2 * rawRowProg);

                const icoAnchorY = this._icoRect.y - this._winRect.y;
                const localY = vertex.ty * actHei;
                const finalY = localY + (icoAnchorY - localY) * rowProg;

                const winLeftX = 0;
                const winRightX = winWid;
                let icoLeftX = this._icoRect.x - this._winRect.x;
                let icoRightX = (this._icoRect.x + icoWid) - this._winRect.x;
                const icoCenterX = (icoLeftX + icoRightX) / 2;

                if (icoRightX - icoLeftX < this._minSeparate) {
                    icoLeftX = icoCenterX - this._minSeparate / 2;
                    icoRightX = icoCenterX + this._minSeparate / 2;
                }

                const narrowFactor = this._narrowBias * proxToIco;
                icoLeftX += (icoCenterX - icoLeftX) * narrowFactor;
                icoRightX += (icoCenterX - icoRightX) * narrowFactor;

                const ctlLeftMidX = (winLeftX + icoLeftX) / 2;
                const ctlRightMidX = (winRightX + icoRightX) / 2;
                const ctlLeftX = ctlLeftMidX + Math.abs(icoLeftX - winLeftX) * this._curvature;
                const ctlRightX = ctlRightMidX - Math.abs(icoRightX - winRightX) * this._curvature;

                const oneMinusT = 1 - rowProg;
                const leftEdgeX = oneMinusT * oneMinusT * winLeftX + 2 * oneMinusT * rowProg * ctlLeftX + rowProg * rowProg * icoLeftX;
                const rightEdgeX = oneMinusT * oneMinusT * winRightX + 2 * oneMinusT * rowProg * ctlRightX + rowProg * rowProg * icoRightX;

                const finalX = leftEdgeX + (rightEdgeX - leftEdgeX) * across;

                vertex.x = finalX * (actWid / winWid);
                vertex.y = finalY * (actHei / winHei);
            } else {
                const along = vertex.tx;
                const across = vertex.ty;
                const towardIco = (this._dockSide === St.Side.RIGHT);
                const proxToIco = towardIco ? along : 1 - along;

                const staggerSpan = Math.max(this._rowStagger, 1e-6);
                const rawRowProg = Math.min(1, Math.max(0, (this._progress - (1 - proxToIco) * staggerSpan) / staggerSpan));
                const rowProg = rawRowProg * rawRowProg * (3 - 2 * rawRowProg);

                const icoAnchorX = this._icoRect.x - this._winRect.x;
                const localX = vertex.tx * actWid;
                const finalX = localX + (icoAnchorX - localX) * rowProg;

                const winTopY = 0;
                const winBottomY = winHei;
                let icoTopY = this._icoRect.y - this._winRect.y;
                let icoBottomY = (this._icoRect.y + icoHei) - this._winRect.y;
                const icoCenterY = (icoTopY + icoBottomY) / 2;

                if (icoBottomY - icoTopY < this._minSeparate) {
                    icoTopY = icoCenterY - this._minSeparate / 2;
                    icoBottomY = icoCenterY + this._minSeparate / 2;
                }

                const narrowFactor = this._narrowBias * proxToIco;
                icoTopY += (icoCenterY - icoTopY) * narrowFactor;
                icoBottomY += (icoCenterY - icoBottomY) * narrowFactor;

                const ctlTopMidY = (winTopY + icoTopY) / 2;
                const ctlBottomMidY = (winBottomY + icoBottomY) / 2;
                const ctlTopY = ctlTopMidY + Math.abs(icoTopY - winTopY) * this._curvature;
                const ctlBottomY = ctlBottomMidY - Math.abs(icoBottomY - winBottomY) * this._curvature;

                const oneMinusT = 1 - rowProg;
                const topEdgeY = oneMinusT * oneMinusT * winTopY + 2 * oneMinusT * rowProg * ctlTopY + rowProg * rowProg * icoTopY;
                const bottomEdgeY = oneMinusT * oneMinusT * winBottomY + 2 * oneMinusT * rowProg * ctlBottomY + rowProg * rowProg * icoBottomY;

                const finalY = topEdgeY + (bottomEdgeY - topEdgeY) * across;

                vertex.x = finalX * (actWid / winWid);
                vertex.y = finalY * (actHei / winHei);
            }
        }
    }
);

const WindowMinimizeScale = GObject.registerClass(
    {
        GTypeName: 'VisualTweakWindowMinimizeScale',
    },
    class WindowMinimizeScale extends Clutter.DeformEffect {

        /**
         * @brief Constructor, init the scale minimize deform effect
         * @param actor The window actor
         * @param icoGeom Optional icon geometry to scale towards
         */
        _init(actor, icoGeom = null) {
            super._init();
            this._actor = actor;
            this._icon = icoGeom;
            this._initialized = false;

            this._px = 0;
            this._py = 0;
            this._actorW = 1;
            this._actorH = 1;

            this._progress = 0;

            this._timerId = null;
            this._newFrameEvent = null;
            this._completedEvent = null;

            this.set_n_tiles(2, 2);
        }

        /**
         * @brief Hook set_actor, compute the scale pivot and start the timeline
         * @param actor The window actor
         */
        vfunc_set_actor(actor) {
            super.vfunc_set_actor(actor);
            if (!this._actor || this._initialized) {
                return;
            }
            this._initialized = true;

            const win = this._actor.meta_window;
            if (!win) {
                return;
            }

            let ax = 0, ay = 0, aw = 1, ah = 1;
            try {
                const rect = win.get_frame_rect();
                ax = rect.x;
                ay = rect.y;
                aw = rect.width;
                ah = rect.height;
            } catch (e) {
                try {
                    const [w, h] = this._actor.get_size();
                    aw = w;
                    ah = h;
                    [ax, ay] = this._actor.get_transformed_position();
                } catch (e2) {
                    return;
                }
            }
            if (aw <= 0 || ah <= 0) {
                return;
            }

            let iconCx, iconCy;
            if (this._icon) {
                iconCx = this._icon.x + (this._icon.width || 0) / 2;
                iconCy = this._icon.y + (this._icon.height || 0) / 2;
            } else {
                let monitor = { x: 0, y: 0, width: 1, height: 1 };
                try {
                    monitor = Main.layoutManager.monitors[win.get_monitor()];
                } catch (e) {}
                iconCx = monitor.x + monitor.width / 2;
                iconCy = monitor.y + monitor.height;
            }

            this._actorW = aw;
            this._actorH = ah;
            this._px = iconCx - ax;
            this._py = iconCy - ay;

            this._timerId = new Clutter.Timeline({ actor: this._actor, duration: 300 });
            this._newFrameEvent = this._timerId.connect('new-frame', () => this._onTick());
            this._completedEvent = this._timerId.connect('completed', () => this._onCompleted());
            this._timerId.start();
        }

        /**
         * @brief Update the progress on each timeline frame and repaint
         */
        _onTick() {
            if (!this._timerId) {
                return;
            }
            this._progress = this._timerId.get_progress();
            try {
                this._actor.get_parent().queue_redraw();
            } catch (e) {}
            this.invalidate();
        }

        /**
         * @brief Destroy the effect when the timeline completes
         */
        _onCompleted() {
            this.destroy();
        }

        /**
         * @brief Stop the timeline, remove the effect and notify the minimize completion
         */
        destroy() {
            if (this._timerId) {
                try {
                    if (this._newFrameEvent) {
                        this._timerId.disconnect(this._newFrameEvent);
                    }
                } catch (e) {}
                try {
                    if (this._completedEvent) {
                        this._timerId.disconnect(this._completedEvent);
                    }
                } catch (e) {}
                this._timerId = null;
                this._newFrameEvent = null;
                this._completedEvent = null;
            }

            const actor = this.get_actor();
            if (actor) {
                try {
                    actor.remove_effect(this);
                } catch (e) {}
            }

            try {
                if (actor) {
                    actor.hide();
                }
            } catch (e) {}

            try {
                const wm = Main.wm;
                if (wm && wm._shellwm && wm._shellwm.original_completed_minimize) {
                    wm._shellwm.original_completed_minimize(actor);
                }
            } catch (e) {}

            this._actor = null;
        }

        /**
         * @brief Do not expand the paint volume for the deform effect
         * @param pv The paint volume to modify
         * @return Always false
         */
        vfunc_modify_paint_volume(pv) {
            return false;
        }

        /**
         * @brief Deform each vertex to scale toward the pivot point
         * @param w Actor width
         * @param h Actor height
         * @param v The vertex to deform in place
         */
        vfunc_deform_vertex(w, h, v) {
            if (!this._initialized) {
                return;
            }

            const eased = 1 - Math.pow(1 - this._progress, 3);
            const s = Math.max(0.001, 1.0 - eased);

            const px = this._px * (w / this._actorW);
            const py = this._py * (h / this._actorH);

            v.x = px + (v.tx * w - px) * s;
            v.y = py + (v.ty * h - py) * s;
        }
    }
);

const WindowUnminimizeGenie = GObject.registerClass(
    {
        GTypeName: 'VisualTweakWindowUnminimizeGenie',
    },
    class WindowUnminimizeGenie extends Clutter.DeformEffect {

        /**
         * @brief Constructor, init the genie unminimize deform effect
         * @param actor The window actor
         * @param icoGeom Optional icon geometry to expand from
         */
        _init(actor, icoGeom = null) {
            super._init();

            this._actor = actor;
            this._icoSrce = icoGeom;
            this._isReady = false;

            this._winRect = { x: 0, y: 0, w: 0, h: 0 };
            this._monRect = { x: 0, y: 0, w: 0, h: 0 };
            this._icoRect = { x: 0, y: 0, w: 0, h: 0 };
            this._dockSide = St.Side.BOTTOM;

            this._progress = 0;

            this._duration = 500;
            this._curvature = 0.45;
            this._rowStagger = 0.55;
            this._narrowBias = 0.25;
            this._edgeThres = 60;
            this._minSeparate = 2;

            this._timeline = null;
            this._frameSigId = null;
            this._compleSigId = null;

            this.set_n_tiles(32, 32);
        }

        /**
         * @brief Hook set_actor, compute geometry and start the animation timeline
         * @param actor The window actor
         */
        vfunc_set_actor(actor) {
            super.vfunc_set_actor(actor);

            if (!this._actor || this._isReady) {
                return;
            }
            this._isReady = true;

            const metaWin = this._actor.meta_window;
            if (!metaWin) {
                return;
            }

            try {
                const mon = Main.layoutManager.monitors[metaWin.get_monitor()];
                this._monRect = {
                    x: mon.x,
                    y: mon.y,
                    w: mon.width,
                    h: mon.height,
                };
            } catch (e) {
                this._monRect = { x: 0, y: 0, w: 1, h: 1 };
            }

            try {
                const frm = metaWin.get_frame_rect();
                this._winRect = {
                    x: frm.x,
                    y: frm.y,
                    w: frm.width,
                    h: frm.height,
                };
            } catch (e) {
                try {
                    const [actWid, actHei] = this._actor.get_size();
                    this._winRect = {
                        x: this._actor.get_x(),
                        y: this._actor.get_y(),
                        w: actWid,
                        h: actHei,
                    };
                } catch (fallbackError) {
                    return;
                }
            }

            if (this._icoSrce) {
                this._icoRect = {
                    x: this._icoSrce.x,
                    y: this._icoSrce.y,
                    w: this._icoSrce.width || 0,
                    h: this._icoSrce.height || 0,
                };
            } else {
                this._icoRect = {
                    x: this._monRect.x + this._monRect.w / 2,
                    y: this._monRect.y + this._monRect.h,
                    w: 0,
                    h: 0,
                };
            }

            this._winRect.x -= this._monRect.x;
            this._winRect.y -= this._monRect.y;
            this._icoRect.x -= this._monRect.x;
            this._icoRect.y -= this._monRect.y;

            const monWid = this._monRect.w;
            const monHei = this._monRect.h;

            if (this._icoRect.y + this._icoRect.h >= monHei - this._edgeThres) {
                this._dockSide = St.Side.BOTTOM;
                this._icoRect.y = monHei;
                this._icoRect.h = 0;
            } else if (this._icoRect.x <= this._edgeThres) {
                this._dockSide = St.Side.LEFT;
                this._icoRect.x = 0;
                this._icoRect.w = 0;
            } else if (this._icoRect.x + this._icoRect.w >= monWid - this._edgeThres) {
                this._dockSide = St.Side.RIGHT;
                this._icoRect.x = monWid;
                this._icoRect.w = 0;
            } else {
                this._dockSide = St.Side.TOP;
                this._icoRect.y = 0;
                this._icoRect.h = 0;
            }

            this._timeline = new Clutter.Timeline({
                actor: this._actor,
                duration: this._duration,
            });
            this._frameSigId = this._timeline.connect('new-frame', () => this._onTick());
            this._compleSigId = this._timeline.connect('completed', () => this.destroy());
            this._timeline.start();
        }

        /**
         * @brief Update the reversed progress on each timeline frame and repaint
         */
        _onTick() {
            if (!this._timeline) {
                return;
            }
            const timelineProg = this._timeline.get_progress();
            this._progress = 1 - timelineProg;

            try {
                this._actor.get_parent().queue_redraw();
            } catch (e) {
            }
            this.invalidate();
        }

        /**
         * @brief Stop the timeline, remove the effect and notify the unminimize completion
         */
        destroy() {
            if (this._timeline) {
                if (this._frameSigId) {
                    try {
                        this._timeline.disconnect(this._frameSigId);
                    } catch (e) {
                    }
                    this._frameSigId = null;
                }
                if (this._compleSigId) {
                    try {
                        this._timeline.disconnect(this._compleSigId);
                    } catch (e) {
                    }
                    this._compleSigId = null;
                }
                this._timeline = null;
            }

            const act = this.get_actor();
            if (act) {
                try {
                    act.remove_effect(this);
                } catch (e) {
                }
                try {
                    act.show();
                    act.opacity = 255;
                } catch (e) {
                }
            }

            try {
                const shellWm = Main.wm?._shellwm;
                if (shellWm?.original_completed_unminimize) {
                    shellWm.original_completed_unminimize(act);
                }
            } catch (e) {
            }

            this._actor = null;
        }

        /**
         * @brief Do not expand the paint volume for the deform effect
         * @param paintVolume The paint volume to modify
         * @return Always false
         */
        vfunc_modify_paint_volume(paintVolume) {
            return false;
        }

        /**
         * @brief Deform each vertex according to the genie unminimize curve
         * @param actWid Actor width
         * @param actHei Actor height
         * @param vertex The vertex to deform in place
         */
        vfunc_deform_vertex(actWid, actHei, vertex) {
            if (!this._isReady) {
                return;
            }

            const winWid = this._winRect.w;
            const winHei = this._winRect.h;
            const icoWid = this._icoRect.w;
            const icoHei = this._icoRect.h;

            const isVertical = (this._dockSide === St.Side.BOTTOM || this._dockSide === St.Side.TOP);

            if (isVertical) {
                const along = vertex.ty;
                const across = vertex.tx;
                const towardIco = (this._dockSide === St.Side.BOTTOM);
                const proxToIco = towardIco ? along : 1 - along;

                const staggerSpan = Math.max(this._rowStagger, 1e-6);
                const rawRowProg = Math.min(1, Math.max(0, (this._progress - (1 - proxToIco) * staggerSpan) / staggerSpan));
                const rowProg = rawRowProg * rawRowProg * (3 - 2 * rawRowProg);

                const icoAnchorY = this._icoRect.y - this._winRect.y;
                const localY = vertex.ty * actHei;
                const finalY = localY + (icoAnchorY - localY) * rowProg;

                const winLeftX = 0;
                const winRightX = winWid;
                let icoLeftX = this._icoRect.x - this._winRect.x;
                let icoRightX = (this._icoRect.x + icoWid) - this._winRect.x;
                const icoCenterX = (icoLeftX + icoRightX) / 2;

                if (icoRightX - icoLeftX < this._minSeparate) {
                    icoLeftX = icoCenterX - this._minSeparate / 2;
                    icoRightX = icoCenterX + this._minSeparate / 2;
                }

                const narrowFactor = this._narrowBias * proxToIco;
                icoLeftX += (icoCenterX - icoLeftX) * narrowFactor;
                icoRightX += (icoCenterX - icoRightX) * narrowFactor;

                const ctlLeftMidX = (winLeftX + icoLeftX) / 2;
                const ctlRightMidX = (winRightX + icoRightX) / 2;
                const ctlLeftX = ctlLeftMidX + Math.abs(icoLeftX - winLeftX) * this._curvature;
                const ctlRightX = ctlRightMidX - Math.abs(icoRightX - winRightX) * this._curvature;

                const oneMinusT = 1 - rowProg;
                const leftEdgeX = oneMinusT * oneMinusT * winLeftX + 2 * oneMinusT * rowProg * ctlLeftX + rowProg * rowProg * icoLeftX;
                const rightEdgeX = oneMinusT * oneMinusT * winRightX + 2 * oneMinusT * rowProg * ctlRightX + rowProg * rowProg * icoRightX;

                const finalX = leftEdgeX + (rightEdgeX - leftEdgeX) * across;

                vertex.x = finalX * (actWid / winWid);
                vertex.y = finalY * (actHei / winHei);
            } else {
                const along = vertex.tx;
                const across = vertex.ty;
                const towardIco = (this._dockSide === St.Side.RIGHT);
                const proxToIco = towardIco ? along : 1 - along;

                const staggerSpan = Math.max(this._rowStagger, 1e-6);
                const rawRowProg = Math.min(1, Math.max(0, (this._progress - (1 - proxToIco) * staggerSpan) / staggerSpan));
                const rowProg = rawRowProg * rawRowProg * (3 - 2 * rawRowProg);

                const icoAnchorX = this._icoRect.x - this._winRect.x;
                const localX = vertex.tx * actWid;
                const finalX = localX + (icoAnchorX - localX) * rowProg;

                const winTopY = 0;
                const winBottomY = winHei;
                let icoTopY = this._icoRect.y - this._winRect.y;
                let icoBottomY = (this._icoRect.y + icoHei) - this._winRect.y;
                const icoCenterY = (icoTopY + icoBottomY) / 2;

                if (icoBottomY - icoTopY < this._minSeparate) {
                    icoTopY = icoCenterY - this._minSeparate / 2;
                    icoBottomY = icoCenterY + this._minSeparate / 2;
                }

                const narrowFactor = this._narrowBias * proxToIco;
                icoTopY += (icoCenterY - icoTopY) * narrowFactor;
                icoBottomY += (icoCenterY - icoBottomY) * narrowFactor;

                const ctlTopMidY = (winTopY + icoTopY) / 2;
                const ctlBottomMidY = (winBottomY + icoBottomY) / 2;
                const ctlTopY = ctlTopMidY + Math.abs(icoTopY - winTopY) * this._curvature;
                const ctlBottomY = ctlBottomMidY - Math.abs(icoBottomY - winBottomY) * this._curvature;

                const oneMinusT = 1 - rowProg;
                const topEdgeY = oneMinusT * oneMinusT * winTopY + 2 * oneMinusT * rowProg * ctlTopY + rowProg * rowProg * icoTopY;
                const bottomEdgeY = oneMinusT * oneMinusT * winBottomY + 2 * oneMinusT * rowProg * ctlBottomY + rowProg * rowProg * icoBottomY;

                const finalY = topEdgeY + (bottomEdgeY - topEdgeY) * across;

                vertex.x = finalX * (actWid / winWid);
                vertex.y = finalY * (actHei / winHei);
            }
        }
    }
);

const WindowUnminimizeScale = GObject.registerClass(
    {
        GTypeName: 'VisualTweakWindowUnminimizeScale',
    },
    class WindowUnminimizeScale extends Clutter.DeformEffect {

        /**
         * @brief Constructor, init the scale unminimize deform effect
         * @param actor The window actor
         * @param icoGeom Optional icon geometry to scale from
         */
        _init(actor, icoGeom = null) {
            super._init();
            this._actor = actor;
            this._icon = icoGeom;
            this._initialized = false;

            this._px = 0;
            this._py = 0;
            this._actorW = 1;
            this._actorH = 1;

            this._progress = 0;

            this._timerId = null;
            this._newFrameEvent = null;
            this._completedEvent = null;

            this.set_n_tiles(2, 2);
        }

        /**
         * @brief Hook set_actor, compute the scale pivot and start the timeline
         * @param actor The window actor
         */
        vfunc_set_actor(actor) {
            super.vfunc_set_actor(actor);
            if (!this._actor || this._initialized) {
                return;
            }
            this._initialized = true;

            const win = this._actor.meta_window;
            if (!win) {
                return;
            }

            let ax = 0, ay = 0, aw = 1, ah = 1;
            try {
                const rect = win.get_frame_rect();
                ax = rect.x;
                ay = rect.y;
                aw = rect.width;
                ah = rect.height;
            } catch (e) {
                try {
                    const [w, h] = this._actor.get_size();
                    aw = w;
                    ah = h;
                    [ax, ay] = this._actor.get_transformed_position();
                } catch (e2) {
                    return;
                }
            }
            if (aw <= 0 || ah <= 0) {
                return;
            }

            let iconCx, iconCy;
            if (this._icon) {
                iconCx = this._icon.x + (this._icon.width || 0) / 2;
                iconCy = this._icon.y + (this._icon.height || 0) / 2;
            } else {
                let monitor = { x: 0, y: 0, width: 1, height: 1 };
                try {
                    monitor = Main.layoutManager.monitors[win.get_monitor()];
                } catch (e) {}
                iconCx = monitor.x + monitor.width / 2;
                iconCy = monitor.y + monitor.height;
            }

            this._actorW = aw;
            this._actorH = ah;
            this._px = iconCx - ax;
            this._py = iconCy - ay;

            this._timerId = new Clutter.Timeline({ actor: this._actor, duration: 300 });
            this._newFrameEvent = this._timerId.connect('new-frame', () => this._onTick());
            this._completedEvent = this._timerId.connect('completed', () => this._onCompleted());
            this._timerId.start();
        }

        /**
         * @brief Update the progress on each timeline frame and repaint
         */
        _onTick() {
            if (!this._timerId) {
                return;
            }
            this._progress = this._timerId.get_progress();
            try {
                this._actor.get_parent().queue_redraw();
            } catch (e) {}
            this.invalidate();
        }

        /**
         * @brief Destroy the effect when the timeline completes
         */
        _onCompleted() {
            this.destroy();
        }

        /**
         * @brief Stop the timeline, remove the effect and notify the unminimize completion
         */
        destroy() {
            if (this._timerId) {
                try {
                    if (this._newFrameEvent) {
                        this._timerId.disconnect(this._newFrameEvent);
                    }
                } catch (e) {}
                try {
                    if (this._completedEvent) {
                        this._timerId.disconnect(this._completedEvent);
                    }
                } catch (e) {}
                this._timerId = null;
                this._newFrameEvent = null;
                this._completedEvent = null;
            }

            const actor = this.get_actor();
            if (actor) {
                try {
                    actor.remove_effect(this);
                } catch (e) {}
            }

            try {
                if (actor) {
                    actor.show();
                    actor.opacity = 255;
                }
            } catch (e) {}

            try {
                const wm = Main.wm;
                if (wm && wm._shellwm && wm._shellwm.original_completed_unminimize) {
                    wm._shellwm.original_completed_unminimize(actor);
                }
            } catch (e) {}

            this._actor = null;
        }

        /**
         * @brief Do not expand the paint volume for the deform effect
         * @param pv The paint volume to modify
         * @return Always false
         */
        vfunc_modify_paint_volume(pv) {
            return false;
        }

        /**
         * @brief Deform each vertex to scale outward from the pivot point
         * @param w Actor width
         * @param h Actor height
         * @param v The vertex to deform in place
         */
        vfunc_deform_vertex(w, h, v) {
            if (!this._initialized) {
                return;
            }

            const eased = 1 - Math.pow(1 - this._progress, 3);
            const s = Math.max(0.001, eased);

            const px = this._px * (w / this._actorW);
            const py = this._py * (h / this._actorH);

            v.x = px + (v.tx * w - px) * s;
            v.y = py + (v.ty * h - py) * s;
        }
    }
);

