/* vim: set expandtab tabstop=4 softtabstop=4 shiftwidth=4: */
/**
 * +-------------------------------------------------------------------------+
 * | $Id: module_clock.js 2026-10-20 12:18:57 Bleakwind Exp $                |
 * +-------------------------------------------------------------------------+
 * | Copyright (c) 2008-2026 Bleakwind(Rick Wu).                             |
 * +-------------------------------------------------------------------------+
 * | This source file is module_clock.js.                                    |
 * | This source file is released under BSD license.                         |
 * +-------------------------------------------------------------------------+
 * | Author: Bleakwind(Rick Wu) <bleakwind@qq.com>                           |
 * +-------------------------------------------------------------------------+
 */

import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ModuleClock {

    /**
     * @brief Constructor, store settings reference and init state
     * @param settings GSettings instance
     * @param panel Shell main panel
     */
    constructor(settings, panel) {
        this._settings = settings;
        this._panel = panel;

        this._clockTimeoutId = null;
        this._clockLabel = null;
        this._clockLabelNotifyId = null;
        this._clockFixing = false;

        this._clockFormatEnableChangedId = null;
        this._clockFormatStringChangedId = null;
    }

    /**
     * @brief Connect settings signals and apply clock format
     */
    enable() {
        this._clockFormatEnableChangedId = this._settings.connect('changed::clock-format-enable', () => {
            this.apply();
        });
        this._clockFormatStringChangedId = this._settings.connect('changed::clock-format-string', () => {
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
     * @brief Apply the custom clock format and start the refresh timer
     */
    apply() {
        if (!this._settings) {
            return;
        }

        if (!this._settings.get_boolean('clock-format-enable')) {
            this._clear();
            return;
        }

        this._connectClock();

        const label = this._findClock();
        if (label) {
            this._onClockText(label);
        }

        if (this._clockTimeoutId) {
            GLib.Source.remove(this._clockTimeoutId);
            this._clockTimeoutId = null;
        }

        const tick = () => {
            if (!this._settings || !this._settings.get_boolean('clock-format-enable')) {
                this._clockTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            }
            this._connectClock();
            const currentLabel = this._findClock();
            if (currentLabel) {
                this._onClockText(currentLabel);
            }
            return GLib.SOURCE_CONTINUE;
        };

        const fmt = this._settings.get_string('clock-format-string');
        const interval = fmt.includes('%S') ? 1 : 10;
        this._clockTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, tick);
    }

    /**
     * @brief Stop the timer, disconnect signals and restore the default clock
     */
    _clear() {
        this._disconnClock();

        if (this._clockTimeoutId) {
            GLib.Source.remove(this._clockTimeoutId);
            this._clockTimeoutId = null;
        }

        const dateMenu = Main.panel.statusArea?.dateMenu;
        if (dateMenu) {
            if (typeof dateMenu._updateClock === 'function') {
                dateMenu._updateClock();
            }
        }
    }

    /**
     * @brief Find the clock label and connect its notify::text signal
     */
    _connectClock() {
        const label = this._findClock();
        if (!label) {
            return;
        }
        if (this._clockLabel === label && this._clockLabelNotifyId) {
            return;
        }
        this._disconnClock();

        this._clockLabel = label;
        this._clockLabelNotifyId = label.connect('notify::text', () => {
            this._onClockText(label);
        });
    }

    /**
     * @brief Disconnect the clock label notify::text signal
     */
    _disconnClock() {
        if (this._clockLabel && this._clockLabelNotifyId) {
            this._clockLabel.disconnect(this._clockLabelNotifyId);
        }
        this._clockLabel = null;
        this._clockLabelNotifyId = null;
    }

    /**
     * @brief Recursively search the date menu for the St.Label with clock class
     * @return The clock label actor or null
     */
    _findClock() {
        const dateMenu = Main.panel.statusArea?.dateMenu;
        if (!dateMenu) {
            return null;
        }

        let found = null;
        const visit = (actor) => {
            if (found || !actor) {
                return;
            }
            if (actor instanceof St.Label &&
                actor.has_style_class_name &&
                actor.has_style_class_name('clock')) {
                found = actor;
                return;
            }
            const children = actor.get_children ? actor.get_children() : [];
            for (const c of children) {
                visit(c);
            }
        };
        visit(dateMenu);
        return found;
    }

    /**
     * @brief Overwrite the clock label text with the formatted current time
     * @param label The clock St.Label actor
     */
    _onClockText(label) {
        if (!this._settings || !this._settings.get_boolean('clock-format-enable')) {
            return;
        }
        if (this._clockFixing) {
            return;
        }
        let expected;
        try {
            const fmt = this._settings.get_string('clock-format-string');
            const now = GLib.DateTime.new_now_local();
            expected = now.format(fmt) ?? '';
        } catch (e) {
            logError(e, 'VisualTweak: clock format error');
            return;
        }
        if (label.text === expected) {
            return;
        }
        this._clockFixing = true;
        try {
            label.text = expected;
        } finally {
            this._clockFixing = false;
        }
    }

    /**
     * @brief Disconnect settings signals and release resources
     */
    disable() {
        if (this._clockFormatEnableChangedId) {
            this._settings.disconnect(this._clockFormatEnableChangedId);
            this._clockFormatEnableChangedId = null;
        }
        if (this._clockFormatStringChangedId) {
            this._settings.disconnect(this._clockFormatStringChangedId);
            this._clockFormatStringChangedId = null;
        }

        this._clear();
        this._settings = null;
    }
}
