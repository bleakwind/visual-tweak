import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class VisualTweakExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._childAddedIds = new Map();
        this._clockTimeoutId = null;

        this._clockLabel = null;
        this._clockLabelNotifyId = null;
        this._clockFixing = false;

        this._settingsChangedId = this._settings.connect('changed', () => {
            this._applyPanel();
        });

        this._clockFormatChangedId = this._settings.connect('changed::clock-enable', () => {
            this._applyClock();
        });
        this._clockStringChangedId = this._settings.connect('changed::clock-format', () => {
            this._applyClock();
        });

        this._overviewShowingId = Main.overview.connect('showing', () => {
            this._clearPanel();
        });

        this._overviewHiddenId = Main.overview.connect('hidden', () => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._applyPanel();
                return GLib.SOURCE_REMOVE;
            });
        });

        this._applyPanel();
        this._applyClock();

        this._connectChild(Main.panel);
    }

    _connectChild(actor) {
        if (!actor) {
            return;
        }

        if (this._childAddedIds.has(actor)) {
            return;
        }

        const id = actor.connect('child-added', () => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._applyPanel();
                return GLib.SOURCE_REMOVE;
            });
        });
        this._childAddedIds.set(actor, id);

        const children = actor.get_children ? actor.get_children() : [];
        for (const child of children) {
            this._connectChild(child);
        }
    }

    _disconnChild() {
        if (!this._childAddedIds) {
            return;
        }
        for (const [actor, id] of this._childAddedIds) {
            if (actor.get_native && actor.get_native()) {
                actor.disconnect(id);
            }
        }
        this._childAddedIds.clear();
        this._childAddedIds = null;
    }

    _applyPanel() {
        if (!this._settings) {
            return;
        }

        if (!this._settings.get_boolean('panel-enable')) {
            this._clearPanel();
            return;
        }

        if (Main.overview.visible) {
            this._clearPanel();
            return;
        }

        const bgopacity = this._settings.get_int('panel-bgopacity') / 100;
        const bgcolor_enable = this._settings.get_boolean('panel-bgcolor-enable');
        const bgcolor_color = bgcolor_enable ? this._settings.get_string('panel-bgcolor-color') : '#000000';
        const fgcolor_enable = this._settings.get_boolean('panel-fgcolor-enable');
        const fgcolor_color = fgcolor_enable ? this._settings.get_string('panel-fgcolor-color') : '#ffffff';

        if (fgcolor_enable) {
            this._applyPanelText(fgcolor_color);
            this._applyPanelWorkspace(fgcolor_color);
        } else {
            this._clearPanelText();
            this._clearPanelWorkspace();
        }

        this._applyPanelBackground(bgcolor_color, bgopacity);
        this._connectChild(Main.panel);

        if (this._settings.get_boolean('clock-enable')) {
            this._connectClock();
        }
    }

    _clearPanel() {
        this._clearPanelBackground();
        this._clearPanelText();
        this._clearPanelWorkspace();
    }

    _applyPanelBackground(ColorHex, Opacity) {
        const { r, g, b } = this._hexToRgb(ColorHex);
        const style = `background-color: rgba(${r}, ${g}, ${b}, ${Opacity});`;
        Main.panel.set_style(style);
    }

    _clearPanelBackground() {
        Main.panel.set_style(null);
    }

    _applyPanelText(fgColor) {
        const elements = this._findPanelText();
        const style = `color: ${fgColor};`;
        for (const element of elements) {
            element.set_style(style);
        }
    }

    _clearPanelText() {
        const elements = this._findPanelText();
        for (const element of elements) {
            element.set_style(null);
        }
    }

    _findPanelText() {
        const result = [];
        const visit = (actor) => {
            if (!actor) {
                return;
            }
            if (actor instanceof St.Label || actor instanceof St.Icon) {
                result.push(actor);
            }
            const children = actor.get_children ? actor.get_children() : [];
            for (const child of children) {
                visit(child);
            }
        };
        visit(Main.panel);
        return result;
    }

    _applyPanelWorkspace(fgColor) {
        const dots = this._findPanelWorkspace();
        const style = `background-color: ${fgColor};`;
        for (const dot of dots) {
            dot.set_style(style);
        }
    }

    _clearPanelWorkspace() {
        const dots = this._findPanelWorkspace();
        for (const dot of dots) {
            dot.set_style(null);
        }
    }

    _findPanelWorkspace() {
        const result = [];
        const visit = (actor) => {
            if (!actor) {
                return;
            }
            if (actor.has_style_class_name &&
                actor.has_style_class_name('workspace-dot')) {
                result.push(actor);
            }
            const children = actor.get_children ? actor.get_children() : [];
            for (const child of children) {
                visit(child);
            }
        };
        visit(Main.panel);
        return result;
    }

    _applyClock() {
        if (!this._settings) {
            return;
        }

        if (!this._settings.get_boolean('clock-enable')) {
            this._clearClock();
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
            if (!this._settings || !this._settings.get_boolean('clock-enable')) {
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

        const fmt = this._settings.get_string('clock-format');
        const interval = fmt.includes('%S') ? 1 : 10;
        this._clockTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, tick);
    }

    _clearClock() {
        this._disconnClock();

        if (this._clockTimeoutId) {
            GLib.Source.remove(this._clockTimeoutId);
            this._clockTimeoutId = null;
        }

        const dateMenu = Main.panel.statusArea?.dateMenu;
        if (dateMenu && typeof dateMenu._updateClock === 'function') {
            dateMenu._updateClock();
        }
    }

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

    _disconnClock() {
        if (this._clockLabel && this._clockLabelNotifyId) {
            this._clockLabel.disconnect(this._clockLabelNotifyId);
        }
        this._clockLabel = null;
        this._clockLabelNotifyId = null;
    }

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

    _onClockText(label) {
        if (!this._settings || !this._settings.get_boolean('clock-enable')) {
            return;
        }
        if (this._clockFixing) {
            return;
        }
        let expected;
        try {
            const fmt = this._settings.get_string('clock-format');
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

    _hexToRgb(hex) {
        let value = hex.replace('#', '').trim();
        if (value.length === 3) {
            value = value.split('').map(c => c + c).join('');
        }
        const int = parseInt(value, 16);
        return {
            r: (int >> 16) & 0xff,
            g: (int >> 8) & 0xff,
            b: int & 0xff,
        };
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._clockFormatChangedId) {
            this._settings.disconnect(this._clockFormatChangedId);
            this._clockFormatChangedId = null;
        }
        if (this._clockStringChangedId) {
            this._settings.disconnect(this._clockStringChangedId);
            this._clockStringChangedId = null;
        }
        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = null;
        }
        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = null;
        }

        this._disconnChild();
        this._clearPanel();
        this._clearClock();
        this._settings = null;
    }
}

