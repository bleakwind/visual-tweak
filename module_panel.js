/* vim: set expandtab tabstop=4 softtabstop=4 shiftwidth=4: */
/**
 * +-------------------------------------------------------------------------+
 * | $Id: module_panel.js 2026-10-20 12:19:01 Bleakwind Exp $                |
 * +-------------------------------------------------------------------------+
 * | Copyright (c) 2008-2026 Bleakwind(Rick Wu).                             |
 * +-------------------------------------------------------------------------+
 * | This source file is module_panel.js.                                    |
 * | This source file is released under BSD license.                         |
 * +-------------------------------------------------------------------------+
 * | Author: Bleakwind(Rick Wu) <bleakwind@qq.com>                           |
 * +-------------------------------------------------------------------------+
 */

import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ModulePanel {

    /**
     * @brief Constructor, store settings and panel references
     * @param settings GSettings instance
     * @param panel Shell main panel
     */
    constructor(settings, panel) {
        this._settings = settings;
        this._panel = panel;

        this._childAddedIds = new Map();
        this._settingsChangedId = null;
        this._idleSourceIds = new Set();
    }

    /**
     * @brief Connect settings change signal and apply panel styles
     */
    enable() {
        this._settingsChangedId = this._settings.connect('changed', () => {
            this.apply();
        });

        this.apply();
        this._connectChild(this._panel);
    }

    /**
     * @brief Add a GLib idle source and track its id for removal in disable()
     * @param callback Function to run when the idle source fires
     */
    _addIdle(callback) {
        if (!this._idleSourceIds) {
            return;
        }
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._idleSourceIds?.delete(id);
            if (!this._idleSourceIds) {
                return GLib.SOURCE_REMOVE;
            }
            callback();
            return GLib.SOURCE_REMOVE;
        });
        this._idleSourceIds.add(id);
    }

    /**
     * @brief Clear panel styles when the overview is showing
     */
    onOverviewShowing() {
        this._clear();
    }

    /**
     * @brief Re-apply panel styles when the overview is hidden
     */
    onOverviewHidden() {
        this.apply();
    }

    /**
     * @brief Apply background, text and workspace dot styles based on settings
     */
    apply() {
        if (!this._settings) {
            return;
        }

        if (!this._settings.get_boolean('panel-global-enable')) {
            this._clear();
            return;
        }

        if (Main.overview.visible) {
            this._clear();
            return;
        }

        const background_opacity = this._settings.get_int('panel-background-opacity') / 100;
        const bgcolor_enable = this._settings.get_boolean('panel-bgcolor-enable');
        const bgcolor_color = bgcolor_enable ? this._settings.get_string('panel-bgcolor-color') : '#000000';
        const fgcolor_enable = this._settings.get_boolean('panel-fgcolor-enable');
        const fgcolor_color = fgcolor_enable ? this._settings.get_string('panel-fgcolor-color') : '#ffffff';

        if (fgcolor_enable) {
            this._applyText(fgcolor_color);
            this._applyWorkspace(fgcolor_color);
        } else {
            this._clearText();
            this._clearWorkspace();
        }

        this._applyBackground(bgcolor_color, background_opacity);
        this._connectChild(this._panel);
    }

    /**
     * @brief Clear all panel custom styles
     */
    _clear() {
        this._clearBackground();
        this._clearText();
        this._clearWorkspace();
    }

    /**
     * @brief Apply the rgba background style to the panel
     * @param colorHex Hex color string
     * @param opacity Opacity value between 0 and 1
     */
    _applyBackground(colorHex, opacity) {
        const { r, g, b } = this._hexToRgb(colorHex);
        const style = `background-color: rgba(${r}, ${g}, ${b}, ${opacity});`;
        this._panel.set_style(style);
    }

    /**
     * @brief Clear the panel background style
     */
    _clearBackground() {
        this._panel.set_style(null);
    }

    /**
     * @brief Apply the text color to all labels and icons in the panel
     * @param fgColor Hex color string
     */
    _applyText(fgColor) {
        const elements = this._findText();
        const style = `color: ${fgColor};`;
        for (const element of elements) {
            element.set_style(style);
        }
    }

    /**
     * @brief Clear the text color style of all labels and icons
     */
    _clearText() {
        const elements = this._findText();
        for (const element of elements) {
            element.set_style(null);
        }
    }

    /**
     * @brief Recursively collect all St.Label and St.Icon actors in the panel
     * @return Array of found actors
     */
    _findText() {
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
        visit(this._panel);
        return result;
    }

    /**
     * @brief Apply the color to all workspace dots
     * @param fgColor Hex color string
     */
    _applyWorkspace(fgColor) {
        const dots = this._findWorkspace();
        const style = `background-color: ${fgColor};`;
        for (const dot of dots) {
            dot.set_style(style);
        }
    }

    /**
     * @brief Clear the style of all workspace dots
     */
    _clearWorkspace() {
        const dots = this._findWorkspace();
        for (const dot of dots) {
            dot.set_style(null);
        }
    }

    /**
     * @brief Recursively collect all workspace-dot actors in the panel
     * @return Array of found actors
     */
    _findWorkspace() {
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
        visit(this._panel);
        return result;
    }

    /**
     * @brief Recursively connect the child-added signal so newly added children get styled
     * @param actor The actor to attach the signal to
     */
    _connectChild(actor) {
        if (!actor) {
            return;
        }

        if (this._childAddedIds.has(actor)) {
            return;
        }

        const id = actor.connect('child-added', () => {
            this._addIdle(() => {
                this.apply();
            });
        });
        this._childAddedIds.set(actor, id);

        const children = actor.get_children ? actor.get_children() : [];
        for (const child of children) {
            this._connectChild(child);
        }
    }

    /**
     * @brief Disconnect all recorded child-added signals
     */
    _disconnChild() {
        if (!this._childAddedIds) {
            return;
        }
        for (const [actor, id] of this._childAddedIds) {
            try {
                actor.disconnect(id);
            } catch (e) {
                logError(e, 'VisualTweak: disconnect child‑added signal');
            }
        }
        this._childAddedIds.clear();
        this._childAddedIds = null;
    }

    /**
     * @brief Convert a hex color string to an rgb object
     * @param hex Hex color string, e.g. #fff or #ffffff
     * @return Object with r, g, b byte values
     */
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

    /**
     * @brief Disconnect signals, clear styles and release resources
     */
    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._idleSourceIds) {
            for (const id of this._idleSourceIds) {
                GLib.Source.remove(id);
            }
            this._idleSourceIds.clear();
            this._idleSourceIds = null;
        }

        this._disconnChild();
        this._clear();

        this._settings = null;
        this._panel = null;
    }
}
